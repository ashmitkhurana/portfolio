/**
 * Silhouette renderer for the fit. It runs the SAME geometry pipeline as the
 * site (`resolvePose` -> centripetal spline -> curvature frames -> soft folds ->
 * path relaxation -> ring texture -> the sweep GLSL of `sweep.ts`) and replaces
 * only the shading: a flat, unlit ShaderMaterial writes
 *
 *   R  class id * 64   (1 face A, 2 face B, 3 edge / rim, 0 nothing)
 *   G  255 when the fragment is in front of the text plane (world z >= 0)
 *   B, A  world z, 16 bit over [-1024, 1024)
 *
 * The depth test keeps the nearest fragment, so the visibility rule
 * "a ribbon pixel is hidden iff the text is there AND the ribbon fragment is
 * behind the text plane" needs nothing else.
 */
import * as THREE from "three";
import { RibbonCurve } from "../frames";
import { RibbonGeometry } from "../geometry";
import { resolveControlPoints, resolvePose } from "../poses/resolve";
import { DEFAULT_SETTINGS, cloneSettings } from "../settings";
import { SWEEP_GLSL } from "../sweep";
import { ANCHOR, VIEW, engineWidth, toPosePoints, type FitState } from "./params";

/** sim control points the site resolves a pose to (SiteRibbon / pose editor use 96) */
export const POSE_COUNT = 96;
const DEG = Math.PI / 180;

const VERT = /* glsl */ `
${SWEEP_GLSL}
varying float vFace;
varying float vZ;
void main() {
  vec3 P = ribSweepPosition();
  vFace = tangent.z;
  vZ = P.z;
  gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
}
`;

const FRAG = /* glsl */ `
varying float vFace;
varying float vZ;
void main() {
  float cls = vFace > 0.5 ? 1.0 : (vFace < -0.5 ? 2.0 : 3.0);
  float zn = clamp((vZ + 1024.0) / 2048.0, 0.0, 1.0) * 65535.0;
  float hi = floor(zn / 256.0);
  float lo = zn - hi * 256.0;
  gl_FragColor = vec4(cls * 64.0 / 255.0, vZ >= 0.0 ? 1.0 : 0.0, hi / 255.0, lo / 255.0);
}
`;

/** the body rings of the last built strip, world px */
export interface Rings {
  M: number;
  E: number;
  /** body ring centres, xyz */
  pos: Float32Array;
  tan: Float32Array;
  /** half width (world px) per body ring */
  hw: Float32Array;
  /** arc fraction of each authored control point along the strip */
  frac: Float64Array;
  /** ring spacing (px) */
  ds: number;
  /** body ring index ranges [ring0, ring1] of the built folds */
  foldRings: [number, number][];
  /** projection of each body ring centre, image px (y down) */
  sx: Float32Array;
  sy: Float32Array;
  /** perspective scale at each ring (1 at z = 0) */
  k: Float32Array;
  /** projected band edges (centre -/+ half width x ruling), image px, one entry per body ring: [edge 0 | edge 1] */
  ex: [Float32Array, Float32Array];
  ey: [Float32Array, Float32Array];
  /** body ring index ranges [ring0, ring1] around each rolled hairpin tip (+-1.5 band widths) */
  hairpinRings: [number, number][];
  /** the engine's edge-kink metric of the strip as built (smooth.ts, limit 12) */
  kink: number;
}

export class FitRenderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly geometry: RibbonGeometry;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(28, VIEW.w / VIEW.h, 10, 12000);
  private readonly mesh: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private rt: THREE.WebGLRenderTarget | null = null;
  private pixels = new Uint8Array(0);
  private readonly authored = new RibbonCurve(128);
  rings: Rings;
  readonly engineW = engineWidth();

  constructor(opts: { canvas?: HTMLCanvasElement; rings?: number } = {}) {
    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: false,
      alpha: true,
      depth: true,
      powerPreference: "high-performance",
    });
    this.renderer.autoClear = false;
    this.renderer.setClearColor(0x000000, 0);
    const g = cloneSettings(DEFAULT_SETTINGS).geometry;
    const k = Math.min(Math.max(VIEW.w / 1440, 0.5), 1.4);
    const eff = { ...g, width: g.width * k, edgeBevel: g.edgeBevel * k, rings: opts.rings ?? g.rings };
    this.geometry = new RibbonGeometry(eff, 128);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uRingTex: this.geometry.sweep.uRingTex, uRingProf: this.geometry.sweep.uRingProf },
      side: THREE.FrontSide,
      blending: THREE.NoBlending,
      depthTest: true,
      depthWrite: true,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(this.geometry.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    const M = this.geometry.bodyRings;
    this.rings = {
      M,
      E: (this.geometry.totalRings - M) >> 1,
      pos: new Float32Array(M * 3),
      tan: new Float32Array(M * 3),
      hw: new Float32Array(M),
      frac: new Float64Array(26),
      ds: 1,
      foldRings: [],
      sx: new Float32Array(M),
      sy: new Float32Array(M),
      k: new Float32Array(M),
      ex: [new Float32Array(M), new Float32Array(M)],
      ey: [new Float32Array(M), new Float32Array(M)],
      hairpinRings: [],
      kink: 0,
    };
  }

  private setCamera(fov: number): void {
    const cam = this.camera;
    cam.fov = fov;
    cam.aspect = VIEW.w / VIEW.h;
    const dist = VIEW.h / 2 / Math.tan((fov * DEG) / 2);
    cam.position.set(0, 0, dist);
    cam.near = Math.max(10, dist * 0.05);
    cam.far = dist + 8000;
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
  }

  /** state -> geometry (CPU) + ring projections; the same call chain as the site (resolvePose -> RibbonGeometry.update) */
  build(s: FitState): Rings {
    const pts = toPosePoints(s);
    const ctx = { viewW: VIEW.w, viewH: VIEW.h, anchor: { ...ANCHOR }, fov: s.fov };
    const pose = resolvePose(pts, ctx, POSE_COUNT, "curvature", "bspline");
    const geo = this.geometry;
    geo.frameMode = "curvature";
    geo.setFolds(pose.folds);
    geo.setHairpins(pose.hairpins);
    geo.update(
      pose.points as Float32Array,
      (pose.twists as Float32Array) ?? new Float32Array(POSE_COUNT),
      (pose.widths as Float32Array) ?? new Float32Array(POSE_COUNT).fill(1),
      POSE_COUNT,
    );
    // arc fraction of the authored points
    const src = resolveControlPoints(pts, ctx);
    this.authored.setControl(src.pos, src.twist, src.width, pts.length, "bspline");
    const R = this.rings;
    for (let i = 0; i < pts.length; i++) R.frac[i] = this.authored.arcFractionAtControl(i);
    // ring data from the texture the GPU will read
    const tot = geo.totalRings;
    const M = geo.bodyRings;
    const E = (tot - M) >> 1;
    const data = (geo.sweep.uRingTex.value.image as unknown as { data: Float32Array }).data;
    const row = tot * 4;
    const D = VIEW.h / 2 / Math.tan((s.fov * DEG) / 2);
    for (let i = 0; i < M; i++) {
      const o = (E + i) * 4;
      const x = data[o];
      const y = data[o + 1];
      const z = data[o + 2];
      R.pos[i * 3] = x;
      R.pos[i * 3 + 1] = y;
      R.pos[i * 3 + 2] = z;
      R.hw[i] = data[o + 3];
      R.tan[i * 3] = data[3 * row + o];
      R.tan[i * 3 + 1] = data[3 * row + o + 1];
      R.tan[i * 3 + 2] = data[3 * row + o + 2];
      const k = D / Math.max(D - z, 1);
      R.k[i] = k;
      R.sx[i] = VIEW.w / 2 + x * k;
      R.sy[i] = VIEW.h / 2 - y * k;
      // the two band edges: centre -/+ half width x ruling (row 1; sheared in fold zones)
      const hw = data[o + 3];
      for (let e = 0; e < 2; e++) {
        const sg = e === 0 ? -1 : 1;
        const bx = x + sg * data[row + o] * hw;
        const by = y + sg * data[row + o + 1] * hw;
        const bz = z + sg * data[row + o + 2] * hw;
        const kk = D / Math.max(D - bz, 1);
        R.ex[e][i] = VIEW.w / 2 + bx * kk;
        R.ey[e][i] = VIEW.h / 2 - by * kk;
      }
    }
    R.M = M;
    R.E = E;
    R.ds = geo.curve.totalLength / Math.max(M - 1, 1);
    R.foldRings = geo.foldReports.filter((r) => r.built).map((r) => [r.ring0, r.ring1] as [number, number]);
    const zr = Math.round((1.5 * s.width) / Math.max(R.ds, 1e-3));
    R.hairpinRings = geo.hairpinReports.map((h) => [Math.max(0, h.ring - zr), Math.min(M - 1, h.ring + zr)] as [number, number]);
    this.setCamera(s.fov);
    R.kink = geo.edgeReport(this.camera, VIEW.w, VIEW.h).kink;
    return R;
  }

  /** render the built strip at `scale` x the fit frame and read the class buffer back (GL row order) */
  draw(scale: number): { px: Uint8Array; w: number; h: number } {
    const w = Math.round(VIEW.w * scale);
    const h = Math.round(VIEW.h * scale);
    if (!this.rt || this.rt.width !== w || this.rt.height !== h) {
      this.rt?.dispose();
      this.rt = new THREE.WebGLRenderTarget(w, h, {
        type: THREE.UnsignedByteType,
        format: THREE.RGBAFormat,
        depthBuffer: true,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        generateMipmaps: false,
      });
      this.pixels = new Uint8Array(w * h * 4);
    }
    const r = this.renderer;
    // the rebuilt geometry object (ring count change) is picked up here
    if (this.mesh.geometry !== this.geometry.geometry) this.mesh.geometry = this.geometry.geometry;
    r.setRenderTarget(this.rt);
    r.setViewport(0, 0, w, h);
    r.clear(true, true, true);
    r.render(this.scene, this.camera);
    r.readRenderTargetPixels(this.rt, 0, 0, w, h, this.pixels);
    r.setRenderTarget(null);
    return { px: this.pixels, w, h };
  }

  dispose(): void {
    this.rt?.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.renderer.dispose();
  }
}

/** the desktop layouts the site actually has (viewport, measured hero-name anchor: the union of the .display__line boxes): the pose must be clean at each, not only at the mockup's */
export const PROBES: { w: number; h: number; anchor: { left: number; top: number; width: number; height: number } }[] = [
  { w: 1280, h: 800, anchor: { left: 48, top: 160, width: 882.5, height: 303.1875 } },
  { w: 1512, h: 982, anchor: { left: 64, top: 196.390625, width: 1031.5625, height: 354.40625 } },
  { w: 1920, h: 1080, anchor: { left: 64, top: 216, width: 1335.65625, height: 458.875 } },
  { w: 2560, h: 1080, anchor: { left: 320, top: 216, width: 1431.609375, height: 461.9375 } },
];

/** builds the pose in a site layout (own geometry, no drawing) and returns the engine's edge-kink metric there */
export class KinkProbes {
  private readonly geos: RibbonGeometry[];
  private readonly cam = new THREE.PerspectiveCamera(28, 1, 10, 12000);
  constructor() {
    this.geos = PROBES.map((p) => {
      const g = cloneSettings(DEFAULT_SETTINGS).geometry;
      const k = Math.min(Math.max(p.w / 1440, 0.5), 1.4);
      return new RibbonGeometry({ ...g, width: g.width * k, edgeBevel: g.edgeBevel * k }, 128);
    });
  }
  /** worst edge kink and worst smoothness-check violation (curvature / roll reversals over their limits, roll-rate over) over the layouts */
  kink(s: FitState): { kink: number; crinkle: number } {
    const pts = toPosePoints(s);
    let worst = 0;
    let crinkle = 0;
    PROBES.forEach((p, i) => {
      const pose = resolvePose(pts, { viewW: p.w, viewH: p.h, anchor: p.anchor, fov: s.fov }, POSE_COUNT, "curvature", "bspline");
      const geo = this.geos[i];
      geo.frameMode = "curvature";
      geo.setFolds(pose.folds);
      geo.setHairpins(pose.hairpins);
      geo.update(pose.points as Float32Array, pose.twists as Float32Array, pose.widths as Float32Array, POSE_COUNT);
      const cam = this.cam;
      cam.fov = s.fov;
      cam.aspect = p.w / p.h;
      const dist = p.h / 2 / Math.tan((s.fov * DEG) / 2);
      cam.position.set(0, 0, dist);
      cam.near = Math.max(10, dist * 0.05);
      cam.far = dist + 8000;
      cam.lookAt(0, 0, 0);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      worst = Math.max(worst, geo.edgeReport(cam, p.w, p.h).kink);
      const sm = geo.smoothnessReport();
      // every hairpin must stay a hairpin (turn > 150, pose-check) with a centreline radius inside 0.3 - 2.5 widths, with margin
      let hp = 0;
      for (const h of geo.hairpinReports) hp += Math.max(0, 158 - (h.turn * 180) / Math.PI) / 4 + Math.max(0, 0.42 - h.radiusW) / 0.08;
      crinkle = Math.max(crinkle, hp +  Math.max(0, sm.curvature - 3.5) + Math.max(0, sm.roll - 1.5) + Math.max(0, sm.rollRate - 1.4));
    });
    return { kink: worst, crinkle };
  }
}
