/**
 * RibbonGeometry: sweeps a FLAT rectangular band profile (tiny corner bevels)
 * along the sampled centreline using rotation-minimising frames.
 *
 * THE SWEEP RUNS ON THE GPU (see sweep.ts). The mesh is static (built once, only
 * on topology changes); each frame the CPU computes just the per-ring data
 * (centre, frame B/N after twist, effective half width, cap scales, tangent) and
 * uploads it as a small float texture. The vertex shader reconstructs position,
 * normal and tangent from it; every pass shares the same GLSL.
 *
 * - The profile is four strips with split vertices at the creases: face A
 *   (flat, +N), the left rim (bevel, flat side, bevel), face B (flat, -N) and
 *   the right rim. Normals are analytic (exact arc normals on the bevels, the
 *   flat normal on the faces) so the faces and the edge never share normals;
 *   along the length the true surface derivative is used (central difference
 *   of the swept positions), so twist/torsion is exact.
 * - Round caps (semicircular plan, domed section) close both ends: they are just
 *   extra rings (their own plan / thickness scale in the ring texture).
 * - The face id is a HARD per-vertex value: +1 face A, -1 face B, 0 rim strip.
 * - Width is constant; a tight in-plane bend is relaxed by smoothing the
 *   centreline (never by narrowing the band).
 * - All buffers are preallocated; `update()` rewrites them in place.
 */
import * as THREE from "three";
import { NaturalSpline, type RuledData } from "./ruled";
import {
  CurvatureFramer,
  DEFAULT_CURVATURE_FRAME,
  limitTwistRate,
  RibbonCurve,
  hyp3,
  transportFrames,
  twistFrames,
  type CurvatureFrameOptions,
  type FrameMode,
} from "./frames";
import { HAIRPIN_TURN, applyFolds, foldMask, foldOverrides, type FoldReport, type FoldSpec } from "./fold";
import type { HairpinSpec } from "./types";
import { edgeSmoothness, smoothness, type EdgeSmoothnessReport, type SmoothnessReport } from "./smooth";
import type { RibbonSettings } from "./settings";
import type { SweepUniforms } from "./sweep";

export type GeometryParams = RibbonSettings["geometry"];

interface Profile {
  count: number;
  sx: Float32Array;
  sy: Float32Array;
  cx: Float32Array;
  cy: Float32Array;
  /** unit profile tangent (in the B,N plane) */
  tx: Float32Array;
  ty: Float32Array;
  /** +1 face A, -1 face B, 0 rim */
  face: Float32Array;
  /** vertex index pairs (k, k+1) that form quads along the length */
  pairs: Uint32Array;
  /** corner bevel radius, half thickness (px) */
  r: number;
  ht: number;
}

function buildProfile(p: GeometryParams): Profile {
  const T = p.width * p.thicknessRatio;
  const ht = T / 2;
  const hw0 = p.width / 2;
  const r = Math.max(Math.min(p.edgeBevel, ht, hw0), 1e-3);
  const n = Math.max(1, Math.floor(p.bevelSegments));

  const sx: number[] = [];
  const sy: number[] = [];
  const cx: number[] = [];
  const cy: number[] = [];
  const faceVal: number[] = [];
  const pairs: number[] = [];

  const ws = Math.max(1, Math.floor(p.widthSegments));
  const push = (qx: number, qy: number, deg: number, f: number): number => {
    const a = (deg * Math.PI) / 180;
    sx.push(qx);
    sy.push(qy);
    cx.push(Math.cos(a));
    cy.push(Math.sin(a));
    faceVal.push(f);
    return sx.length - 1;
  };
  const strip = (ids: number[]) => {
    for (let i = 0; i < ids.length - 1; i++) pairs.push(ids[i], ids[i + 1]);
  };
  const arc = (qx: number, qy: number, start: number): number[] => {
    const ids: number[] = [];
    for (let i = 0; i <= n; i++) ids.push(push(qx, qy, start + (i / n) * 90, 0));
    return ids;
  };

  // CCW around the section: top (face A) right->left, left rim, bottom
  // (face B) left->right, right rim. Vertices are split at every crease.
  const face = (qy: number, deg: number, f: number, from: number, to: number) => {
    const ids: number[] = [];
    for (let i = 0; i <= ws; i++) ids.push(push(from + ((to - from) * i) / ws, qy, deg, f));
    return ids;
  };
  strip(face(1, 90, 1, 1, -1));
  strip([...arc(-1, 1, 90), ...arc(-1, -1, 180)]);
  strip(face(-1, 270, -1, -1, 1));
  strip([...arc(1, -1, 270), ...arc(1, 1, 0)]);

  const count = sx.length;
  const prof: Profile = {
    count,
    sx: Float32Array.from(sx),
    sy: Float32Array.from(sy),
    cx: Float32Array.from(cx),
    cy: Float32Array.from(cy),
    tx: new Float32Array(count),
    ty: new Float32Array(count),
    face: Float32Array.from(faceVal),
    pairs: Uint32Array.from(pairs),
    r,
    ht,
  };
  for (let k = 0; k < count; k++) {
    // CCW arc tangent
    prof.tx[k] = -prof.cy[k];
    prof.ty[k] = prof.cx[k];
  }
  return prof;
}

/** what the last update built at a rolled hairpin (see PosePoint.hairpin) */
export interface HairpinReport {
  name: string;
  at: number;
  ring: number;
  /** turn between the tangents HAIRPIN_WINDOW_W widths before / after the tip, radians */
  turn: number;
  /** tightest centreline radius of curvature near the tip, in ribbon widths */
  radiusW: number;
  designRadiusW: number;
  /** turn >= HAIRPIN_TURN: left to the curvature frames (a flat fold is not built) */
  rolled: boolean;
}

/**
 * The turn of a rolled hairpin is measured between the tangents this many band widths before / after the tip. The band is
 * wide (~1.5 x the engine default on the AK desktop pose, ~117 px at 1672), so +-3 widths reaches past the neighbouring
 * bends; +-2 widths stays on the two legs.
 */
export const HAIRPIN_WINDOW_W = 2;

export class RibbonGeometry {
  geometry: THREE.BufferGeometry;
  readonly curve: RibbonCurve;
  params: GeometryParams;

  /** world-space AABB of the swept surface (updated each `update`) */
  readonly bounds = new THREE.Box3();
  /** body ring count and total ring count (body + caps) */
  bodyRings = 0;
  totalRings = 0;
  profileCount = 0;
  triangleCount = 0;

  private profile!: Profile;
  private caps = 0;

  /** packed per-ring data (4 rows x totalRings x RGBA), uploaded as `sweep.uRingTex` */
  private ringData!: Float32Array;
  /** per-ring signature (two section corners) for cheap motion detection */
  private sig!: Float32Array;
  /** shared uniforms of the GPU sweep; objects are stable, `.value`s are updated in place */
  readonly sweep: SweepUniforms = {
    uRingTex: { value: new THREE.DataTexture(new Float32Array(16), 1, 1) },
    uRingProf: { value: new THREE.Vector4(1, 1, 1, 0) },
  };

  // per-ring scratch (length totalRings)
  private rPos!: Float32Array;
  private rTan!: Float32Array;
  private rN!: Float32Array;
  private rB!: Float32Array;
  private rTwist!: Float32Array;
  private rTwC!: Float32Array; // cos / sin of the per-ring twist
  private rTwS!: Float32Array;
  private rN0!: Float32Array; // untwisted transported normals
  private rWidth!: Float32Array;
  private rScale!: Float32Array; // cap plan scale (1 on the body)
  private rScaleT!: Float32Array; // cap thickness scale
  private rKb!: Float32Array; // in-plane curvature scratch (body rings)
  private rSm!: Float32Array; // smoothing weights scratch
  private rSm2!: Float32Array;
  private rPosTmp!: Float32Array;
  private rPre!: Float64Array; // prefix sums (relaxPath)
  private rPre3!: Float64Array;

  /** seed for the initial frame normal (towards camera by default) */
  seed = new THREE.Vector3(0, 0, 1);
  /**
   * How the band is oriented before the per-point twist: `rmf` (rotation-minimising,
   * the lab poses) or `curvature` (the face normal follows the curve's principal
   * normal: loops wrap like bracelets). Set by the pose (`RibbonPose.orientation`).
   */
  frameMode: FrameMode = "rmf";
  /** tuning of the curvature frames (the width is filled in per update) */
  frameOpts: Omit<CurvatureFrameOptions, "width"> = {
    smooth: DEFAULT_CURVATURE_FRAME.smooth,
    radiusFull: DEFAULT_CURVATURE_FRAME.radiusFull,
    radiusNone: DEFAULT_CURVATURE_FRAME.radiusNone,
    maxRate: DEFAULT_CURVATURE_FRAME.maxRate,
    twistRate: DEFAULT_CURVATURE_FRAME.twistRate,
    rollSmooth: DEFAULT_CURVATURE_FRAME.rollSmooth,
  };
  private readonly framer = new CurvatureFramer();

  /** soft folds (see fold.ts), sorted by `at`; set from the pose */
  folds: FoldSpec[] = [];
  /** what the last update built (for the editor's diagnostics) */
  readonly foldReports: FoldReport[] = [];
  /** rolled hairpins of the pose (reports only: the curvature frames do the turn) */
  hairpins: HairpinSpec[] = [];
  readonly hairpinReports: HairpinReport[] = [];
  private rShear!: Float32Array; // per-ring half-width multiplier (folds shear the rulings)
  private rFoldMask!: Uint8Array; // rings inside a fold zone (body index)
  private rOvW!: Float32Array; // curvature frames: fold zone weight (0..1) and wanted normal
  private rOvN!: Float32Array;

  /** ring spacing of the last update (px) */
  private lastDs = 1;

  /** smoothness of the strip as built (crinkle check, see smooth.ts); fold zones are skipped */
  smoothnessReport(): SmoothnessReport {
    const M = this.bodyRings;
    const E = this.caps;
    const skip = new Uint8Array(M);
    // fold zones are built, not authored; skip them and 1.5 widths of their shoulders
    const pad = Math.round((1.5 * this.params.width) / Math.max(this.lastDs, 1e-3));
    for (const r of this.foldReports) if (r.built) for (let i = Math.max(0, r.ring0 - pad); i <= r.ring1 + pad && i < M; i++) skip[i] = 1;
    return smoothness({
      M,
      E,
      ds: this.lastDs,
      width: this.params.width,
      pos: this.rPos,
      tan: this.rTan,
      N: this.rN,
      skip,
    });
  }

  /**
   * Edge smoothness of the strip as built, seen through `camera` (the projected band edges, see smooth.ts):
   * the crinkle check that looks at what the eye sees. Fold zones are skipped.
   */
  edgeReport(camera: THREE.Camera, viewW: number, viewH: number): EdgeSmoothnessReport {
    const M = this.bodyRings;
    const skip = new Uint8Array(M);
    const pad = Math.round((1.5 * this.params.width) / Math.max(this.lastDs, 1e-3));
    for (const r of this.foldReports) if (r.built) for (let i = Math.max(0, r.ring0 - pad); i <= r.ring1 + pad && i < M; i++) skip[i] = 1;
    const vp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    return edgeSmoothness({
      M,
      E: this.caps,
      R: this.totalRings,
      ringData: this.ringData,
      width: this.params.width,
      viewProj: vp.elements,
      viewW,
      viewH,
      skip,
    });
  }

  setFolds(list: readonly FoldSpec[] | undefined): void {
    this.folds = list ? [...list].sort((a, b) => a.at - b.at) : [];
  }

  setHairpins(list: readonly HairpinSpec[] | undefined): void {
    this.hairpins = list ? [...list].sort((a, b) => a.at - b.at) : [];
  }

  /** measure each rolled hairpin on the strip as built: turn across +-HAIRPIN_WINDOW_W widths and the tightest centreline radius (in widths) */
  private measureHairpins(M: number, E: number, ds: number): void {
    const out = this.hairpinReports;
    out.length = 0;
    const pos = this.rPos;
    const tan = this.rTan;
    for (const h of this.hairpins) {
      const c = Math.round(Math.min(Math.max(h.at, 0), 1) * (M - 1));
      const W = this.params.width * this.rWidth[E + c]; // the band's width here (the pose scales it per point)
      const z = Math.max(2, Math.round((HAIRPIN_WINDOW_W * W) / Math.max(ds, 1e-3)));
      const a = E + Math.max(0, c - z);
      const b = E + Math.min(M - 1, c + z);
      const d = tan[a * 3] * tan[b * 3] + tan[a * 3 + 1] * tan[b * 3 + 1] + tan[a * 3 + 2] * tan[b * 3 + 2];
      const turn = Math.acos(Math.min(Math.max(d, -1), 1));
      const hs = Math.max(2, Math.round((0.12 * W) / Math.max(ds, 1e-3)));
      let minR = Infinity;
      for (let i = Math.max(hs, c - z); i <= Math.min(M - 1 - hs, c + z); i++) {
        const p = (E + i - hs) * 3;
        const q = (E + i + hs) * 3;
        const dx = tan[q] - tan[p];
        const dy = tan[q + 1] - tan[p + 1];
        const dz = tan[q + 2] - tan[p + 2];
        const ex = pos[q] - pos[p];
        const ey = pos[q + 1] - pos[p + 1];
        const ez = pos[q + 2] - pos[p + 2];
        const kap = Math.sqrt(dx * dx + dy * dy + dz * dz) / Math.max(Math.sqrt(ex * ex + ey * ey + ez * ez), 1e-6);
        if (kap > 1e-9) minR = Math.min(minR, 1 / kap);
      }
      out.push({ name: h.name, at: h.at, ring: c, turn, radiusW: minR / Math.max(W, 1e-6), designRadiusW: h.radius, rolled: turn >= HAIRPIN_TURN });
    }
  }
  private readonly seedArr: [number, number, number] = [0, 0, 1];

  /** untwisted frame normals of the body rings, from ring `from` (rmf can resume, curvature recomputes) */
  private frameN0(M: number, E: number, from: number): void {
    if (this.frameMode === "curvature") {
      this.seedArr[0] = this.seed.x;
      this.seedArr[1] = this.seed.y;
      this.seedArr[2] = this.seed.z;
      this.framer.compute(
        M,
        E,
        this.rPos,
        this.rTan,
        this.rN0,
        this.seedArr,
        { ...this.frameOpts, width: this.params.width },
        this.folds.length ? { w: this.rOvW, n: this.rOvN } : null,
      );
    } else {
      transportFrames(M, E, this.rPos, this.rTan, this.rN0, this.seed.x, this.seed.y, this.seed.z, from);
    }
  }

  constructor(params: GeometryParams, maxControlPoints = 128) {
    this.params = { ...params };
    this.curve = new RibbonCurve(maxControlPoints);
    this.geometry = new THREE.BufferGeometry();
    this.build();
  }

  /** Returns true when buffers were reallocated (geometry object replaced). */
  setParams(params: GeometryParams): boolean {
    const old = this.params;
    this.params = { ...params };
    const topo =
      old.bevelSegments !== params.bevelSegments ||
      old.widthSegments !== params.widthSegments ||
      old.edgeBevel !== params.edgeBevel ||
      old.thicknessRatio !== params.thicknessRatio ||
      old.width !== params.width;
    if (
      old.rings !== params.rings ||
      old.bevelSegments !== params.bevelSegments ||
      old.widthSegments !== params.widthSegments ||
      old.capRings !== params.capRings
    ) {
      const prev = this.geometry;
      this.build();
      prev.dispose();
      return true;
    }
    if (topo) {
      this.profile = buildProfile(this.params);
      this.sweep.uRingProf.value.set(this.profile.r, this.profile.ht, this.totalRings, 0);
    }
    return false;
  }

  private build(): void {
    const p = this.params;
    this.profile = buildProfile(p);
    const K = this.profile.count;
    const M = Math.max(8, Math.floor(p.rings));
    const E = Math.max(2, Math.floor(p.capRings));
    const R = M + 2 * E;
    this.bodyRings = M;
    this.caps = E;
    this.totalRings = R;
    this.profileCount = K;

    const V = R * K;
    this.ringData = new Float32Array(R * 4 * 4);
    this.sig = new Float32Array(R * 6);
    this.rPos = new Float32Array(R * 3);
    this.rTan = new Float32Array(R * 3);
    this.rN = new Float32Array(R * 3);
    this.rB = new Float32Array(R * 3);
    this.rTwist = new Float32Array(R);
    this.rTwC = new Float32Array(R);
    this.rTwS = new Float32Array(R);
    this.rN0 = new Float32Array(R * 3);
    this.rWidth = new Float32Array(R);
    this.rScale = new Float32Array(R).fill(1);
    this.rScaleT = new Float32Array(R).fill(1);
    this.rKb = new Float32Array(M);
    this.rSm = new Float32Array(M);
    this.rSm2 = new Float32Array(M);
    this.rPosTmp = new Float32Array(M * 3);
    this.rPre = new Float64Array(M + 1);
    this.rPre3 = new Float64Array((M + 1) * 3);
    this.rShear = new Float32Array(R).fill(1);
    this.rFoldMask = new Uint8Array(M);
    this.rOvW = new Float32Array(M);
    this.rOvN = new Float32Array(M * 3);

    // ring texture: (re)created whenever the ring count changes
    const old = this.sweep.uRingTex.value;
    const tex = new THREE.DataTexture(this.ringData, R, 4, THREE.RGBAFormat, THREE.FloatType);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.flipY = false;
    tex.needsUpdate = true;
    this.sweep.uRingTex.value = tex;
    old.dispose();
    this.sweep.uRingProf.value.set(this.profile.r, this.profile.ht, R, 0);

    // static per-vertex data, one interleaved buffer (stride 7):
    //   position = (profile sx, sy, ring)   tangent = (cx, cy, face, 1)
    // `normal` aliases (cx, cy, face): three switches to flat shading (and drops
    // USE_TANGENT) when a standard material has no `normal` attribute, so the
    // attribute must exist even though the shader never reads it.
    const ib = new THREE.InterleavedBuffer(new Float32Array(V * 7), 7);
    const ab = ib.array as Float32Array;
    for (let i = 0; i < R; i++) {
      for (let k = 0; k < K; k++) {
        const o = (i * K + k) * 7;
        ab[o] = this.profile.sx[k];
        ab[o + 1] = this.profile.sy[k];
        ab[o + 2] = i;
        ab[o + 3] = this.profile.cx[k];
        ab[o + 4] = this.profile.cy[k];
        ab[o + 5] = this.profile.face[k];
        ab[o + 6] = 1;
      }
    }

    // index buffer, built once. Outward winding (see README).
    const pairs = this.profile.pairs;
    const nPairs = pairs.length / 2;
    const quads = (R - 1) * nPairs;
    const index = new Uint32Array(quads * 6);
    let w = 0;
    for (let i = 0; i < R - 1; i++) {
      for (let q = 0; q < nPairs; q++) {
        const k = pairs[q * 2];
        const k1 = pairs[q * 2 + 1];
        const a = i * K + k;
        const b = i * K + k1;
        const c = (i + 1) * K + k;
        const d = (i + 1) * K + k1;
        index[w++] = a;
        index[w++] = c;
        index[w++] = b;
        index[w++] = b;
        index[w++] = c;
        index[w++] = d;
      }
    }
    this.triangleCount = quads * 2;

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.InterleavedBufferAttribute(ib, 3, 0));
    g.setAttribute("tangent", new THREE.InterleavedBufferAttribute(ib, 4, 3));
    g.setAttribute("normal", new THREE.InterleavedBufferAttribute(ib, 3, 3));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    // we manage bounds ourselves and disable frustum culling on the meshes
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    g.boundingBox = new THREE.Box3(
      new THREE.Vector3(-1e5, -1e5, -1e5),
      new THREE.Vector3(1e5, 1e5, 1e5),
    );
    this.geometry = g;
  }

  private readonly ruledX = new Float64Array(512);
  private readonly ruledSp = new NaturalSpline(512);
  private readonly ruledRaw = new Float32Array(256 * 4);

  /**
   * Ruled pose: rings take their ruling direction B and half width from the pose (natural cubic spline
   * over the centreline's arc fraction), N = sign * unit(T x B); no frames, twist, taper, relaxation or folds.
   */
  private applyRuled(ruled: RuledData, n: number, M: number, E: number): void {
    const fk = this.ruledX;
    for (let k = 0; k < n; k++) {
      fk[k] = this.curve.arcFractionAtControl(k);
      if (k > 0 && fk[k] <= fk[k - 1] + 1e-6) fk[k] = fk[k - 1] + 1e-6;
    }
    const sp = this.ruledSp;
    const chan: Float32Array[] = [];
    for (let c = 0; c < 4; c++) {
      sp.set(fk, ruled.data, n, 4, c);
      const out = new Float32Array(M);
      const hint = { i: 0 };
      for (let i = 0; i < M; i++) out[i] = sp.eval(M > 1 ? i / (M - 1) : 0, hint);
      chan.push(out);
    }
    const rN = this.rN;
    const rB = this.rB;
    const rTan = this.rTan;
    const sign = ruled.sign < 0 ? -1 : 1;
    let px = 0,
      py = 0,
      pz = 1;
    for (let i = 0; i < M; i++) {
      const o = (E + i) * 3;
      let bx = chan[0][i];
      let by = chan[1][i];
      let bz = chan[2][i];
      const bl = Math.hypot(bx, by, bz) || 1;
      bx /= bl;
      by /= bl;
      bz /= bl;
      const tx = rTan[o];
      const ty = rTan[o + 1];
      const tz = rTan[o + 2];
      let nx = ty * bz - tz * by;
      let ny = tz * bx - tx * bz;
      let nz = tx * by - ty * bx;
      const nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-3) {
        nx = px;
        ny = py;
        nz = pz;
      } else {
        nx = (sign * nx) / nl;
        ny = (sign * ny) / nl;
        nz = (sign * nz) / nl;
      }
      px = nx;
      py = ny;
      pz = nz;
      rB[o] = bx;
      rB[o + 1] = by;
      rB[o + 2] = bz;
      rN[o] = nx;
      rN[o + 1] = ny;
      rN[o + 2] = nz;
      this.rWidth[E + i] = (2 * chan[3][i]) / Math.max(this.params.width, 1e-6);
      this.rScale[E + i] = 1;
      this.rScaleT[E + i] = 1;
      this.rTwist[E + i] = 0;
    }
  }

  /**
   * Rebuild all vertex data from the sim's control pose.
   * `n` is the number of control points.
   */
  update(
    ctrlPos: Float32Array,
    ctrlTwist: Float32Array,
    ctrlWidth: Float32Array,
    n: number,
    ruled: RuledData | null = null,
  ): void {
    const P = this.params;
    const M = this.bodyRings;
    const E = this.caps;
    const R = this.totalRings;
    const prof = this.profile;
    const rPos = this.rPos;
    const rTan = this.rTan;
    const rN = this.rN;
    const rB = this.rB;
    const rTwist = this.rTwist;
    const rWidth = this.rWidth;
    const rScale = this.rScale;

    const rScaleT = this.rScaleT;

    this.curve.setControl(ctrlPos, ctrlTwist, ctrlWidth, n);
    this.curve.sampleRings(M, E, rPos, rTan, rTwist, rWidth);
    this.rShear.fill(1);
    const ringDs = this.curve.totalLength / Math.max(M - 1, 1);
    this.lastDs = ringDs;
    if (ruled) {
      this.foldReports.length = 0;
      this.hairpinReports.length = 0;
      this.rFoldMask.fill(0);
      this.applyRuled(ruled, n, M, E);
    } else {
    if (this.folds.length) {
      // keep the relaxation and the curvature frames out of the fold zones (the fold builds those rings)
      foldMask(this.rFoldMask, M, this.folds, P.width, ringDs);
      foldOverrides(this.rOvW, this.rOvN, { M, E, width: P.width, ds: ringDs, rWidth, pos: rPos, tan: rTan }, this.folds);
    } else {
      this.rFoldMask.fill(0);
    }
    if (this.frameMode === "curvature") {
      // curvature frames: an authored roll may change over a short stretch; bound its rate
      const ds = this.curve.totalLength / Math.max(M - 1, 1);
      limitTwistRate(rTwist, M, E, ds, this.frameOpts.twistRate / Math.max(this.params.width, 1), this.rSm);
    }
    for (let i = E; i < E + M; i++) {
      this.rTwC[i] = Math.cos(rTwist[i]);
      this.rTwS[i] = Math.sin(rTwist[i]);
    }
    this.frameN0(M, E, 0);
    twistFrames(0, M, E, rTan, this.rN0, this.rTwC, this.rTwS, rN, rB);

    // taper (along body arc length)
    const tl = Math.max(P.taperLength, 1e-3);
    for (let i = 0; i < M; i++) {
      const s = M > 1 ? i / (M - 1) : 0;
      const f = Math.min(Math.min(s, 1 - s) / tl, 1);
      const sm = f * f * (3 - 2 * f);
      rWidth[E + i] *= 1 - P.taperAmount * (1 - sm);
      rScale[E + i] = 1;
      rScaleT[E + i] = 1;
    }

    // keep the width constant; relax the PATH where a tight in-plane bend
    // would make the inner edge pinch (needs the frames, so re-frame after)
    this.relaxPath(M, E);

    // soft folds: replace the rings of each fold zone and carry the face flip along the rest
    this.foldReports.length = 0;
    if (this.folds.length) {
      applyFolds(
        {
          M,
          E,
          width: P.width,
          ht: prof.ht,
          ds: ringDs,
          rWidth,
          pos: rPos,
          tan: rTan,
          N: rN,
          B: rB,
          hwScale: this.rShear,
        },
        this.folds,
        this.foldReports,
      );
    }

    this.measureHairpins(M, E, ringDs);
    }

    // round caps: semicircular plan (radius = half width) and a domed section,
    // built by extrapolating the end rings along their tangents
    const head = E; // first body ring
    const tail = E + M - 1; // last body ring
    for (let j = 1; j <= E; j++) {
      const q = j / E;
      const phi = q * Math.PI * 0.5;
      const sc = Math.max(Math.cos(phi), 0);
      const ih = E - j; // head cap ring index
      const it = tail + j; // tail cap ring index
      const hwH = 0.5 * P.width * rWidth[head];
      const hwT = 0.5 * P.width * rWidth[tail];
      const offH = 2 * P.capLengthRatio * hwH * Math.sin(phi);
      const offT = 2 * P.capLengthRatio * hwT * Math.sin(phi);
      for (let a = 0; a < 3; a++) {
        rPos[ih * 3 + a] = rPos[head * 3 + a] - rTan[head * 3 + a] * offH;
        rPos[it * 3 + a] = rPos[tail * 3 + a] + rTan[tail * 3 + a] * offT;
        rTan[ih * 3 + a] = rTan[head * 3 + a];
        rTan[it * 3 + a] = rTan[tail * 3 + a];
        rN[ih * 3 + a] = rN[head * 3 + a];
        rN[it * 3 + a] = rN[tail * 3 + a];
        rB[ih * 3 + a] = rB[head * 3 + a];
        rB[it * 3 + a] = rB[tail * 3 + a];
      }
      rWidth[ih] = rWidth[head];
      rWidth[it] = rWidth[tail];
      rScale[ih] = sc;
      rScale[it] = sc;
      // the section stays thick until the tip, then closes like a dome
      const dome = Math.sqrt(sc);
      rScaleT[ih] = dome;
      rScaleT[it] = dome;
    }

    // pack the per-ring data for the GPU sweep + a conservative AABB / signature
    const rd = this.ringData;
    const sig = this.sig;
    const r = prof.r;
    const ht = prof.ht;
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity,
      maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    const row = R * 4;
    const invM = M > 1 ? 1 / (M - 1) : 0;
    for (let i = 0; i < R; i++) {
      const o3 = i * 3;
      const cxp = rPos[o3];
      const cyp = rPos[o3 + 1];
      const czp = rPos[o3 + 2];
      const bx = rB[o3];
      const by = rB[o3 + 1];
      const bz = rB[o3 + 2];
      const nx = rN[o3];
      const ny = rN[o3 + 1];
      const nz = rN[o3 + 2];
      const sc = rScale[i];
      const sT = rScaleT[i];
      const hw = Math.max(0.5 * P.width * rWidth[i] * this.rShear[i], r + 1e-3);
      const o = i * 4;
      rd[o] = cxp;
      rd[o + 1] = cyp;
      rd[o + 2] = czp;
      rd[o + 3] = hw;
      rd[row + o] = bx;
      rd[row + o + 1] = by;
      rd[row + o + 2] = bz;
      rd[row + o + 3] = sc;
      rd[2 * row + o] = nx;
      rd[2 * row + o + 1] = ny;
      rd[2 * row + o + 2] = nz;
      rd[2 * row + o + 3] = sT;
      rd[3 * row + o] = rTan[o3];
      rd[3 * row + o + 1] = rTan[o3 + 1];
      rd[3 * row + o + 2] = rTan[o3 + 2];
      rd[3 * row + o + 3] = (i - E) * invM;
      // the section is the rectangle [-hw*sc, hw*sc] x [-ht*sT, ht*sT] in (B, N):
      // its AABB is exact (bevels stay inside it)
      const wx = hw * sc;
      const wy = ht * sT;
      const ex = Math.abs(bx) * wx + Math.abs(nx) * wy;
      const ey = Math.abs(by) * wx + Math.abs(ny) * wy;
      const ez = Math.abs(bz) * wx + Math.abs(nz) * wy;
      if (cxp - ex < minX) minX = cxp - ex;
      if (cxp + ex > maxX) maxX = cxp + ex;
      if (cyp - ey < minY) minY = cyp - ey;
      if (cyp + ey > maxY) maxY = cyp + ey;
      if (czp - ez < minZ) minZ = czp - ez;
      if (czp + ez > maxZ) maxZ = czp + ez;
      // two opposite section corners
      const s6 = i * 6;
      sig[s6] = cxp + bx * wx + nx * wy;
      sig[s6 + 1] = cyp + by * wx + ny * wy;
      sig[s6 + 2] = czp + bz * wx + nz * wy;
      sig[s6 + 3] = cxp - bx * wx - nx * wy;
      sig[s6 + 4] = cyp - by * wx - ny * wy;
      sig[s6 + 5] = czp - bz * wx - nz * wy;
    }
    this.bounds.min.set(minX, minY, minZ);
    this.bounds.max.set(maxX, maxY, maxZ);
    this.sweep.uRingTex.value.needsUpdate = true;
  }

  /** copy the current motion signature into `out` (allocates on first use) */
  snapshotSignature(out: Float32Array | null): Float32Array {
    if (!out || out.length !== this.sig.length) return this.sig.slice();
    out.set(this.sig);
    return out;
  }

  /** largest displacement (world px, per axis) of the ribbon since `ref` was taken */
  signatureDelta(ref: Float32Array | null): number {
    if (!ref || ref.length !== this.sig.length) return Infinity;
    const s = this.sig;
    let m = 0;
    for (let i = 0; i < s.length; i++) {
      const d = Math.abs(s[i] - ref[i]);
      if (d > m) m = d;
    }
    return m;
  }

  /**
   * Path relaxation. A band of half-width h bent edge-wise with curvature k
   * pinches once h*k approaches 1 (the inner edge reaches the centre of
   * curvature). Instead of narrowing the band, smooth the centreline where
   * that would happen: weights follow the excess curvature (dilated + blurred
   * so they are continuous in time and space), positions move towards the
   * local mean, tangents are recomputed. Returns true when anything moved.
   */
  private relaxPath(M: number, E: number): boolean {
    const P = this.params;
    const kb = this.rKb;
    const w = this.rSm;
    const tmp = this.rSm2;
    const tan = this.rTan;
    const pos = this.rPos;
    const B = this.rB;
    const rWidth = this.rWidth;
    const SAFE = 0.5;
    let moved = false;
    let worst = 0;
    this.relaxIters = 0;
    for (let iter = 0; iter < 8; iter++) {
      let any = false;
      worst = 0;
      for (let i = 0; i < M; i++) {
        const a = (E + Math.max(i - 1, 0)) * 3;
        const b = (E + Math.min(i + 1, M - 1)) * 3;
        const o = (E + i) * 3;
        const ds =
          hyp3(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]) || 1;
        const kx = (tan[b] - tan[a]) / ds;
        const ky = (tan[b + 1] - tan[a + 1]) / ds;
        const kz = (tan[b + 2] - tan[a + 2]) / ds;
        kb[i] = Math.abs(kx * B[o] + ky * B[o + 1] + kz * B[o + 2]);
        const hw = 0.5 * P.width * rWidth[E + i];
        if (hw * kb[i] > worst) worst = hw * kb[i];
        const e = (hw * kb[i]) / SAFE - 1 - RibbonGeometry.relaxTol; // > 0 where the band would pinch
        const v = e <= 0 || this.rFoldMask[i] ? 0 : Math.min(e * 2, 1);
        w[i] = v;
        if (v > 0) any = true;
      }
      this.pinch = worst;
      if (!any) break;
      moved = true;
      this.relaxIters = iter + 1;
      // dilate then blur the weights so the relaxed region has soft shoulders.
      // (sparse scatter-max + prefix-sum box blur: same result as the plain
      // windowed loops, O(M) instead of O(M * R))
      const R = 8;
      tmp.fill(0);
      let lo0 = M;
      let hi0 = -1;
      for (let i = 0; i < M; i++) {
        const v = w[i];
        if (v <= 0) continue;
        if (i < lo0) lo0 = i;
        hi0 = i;
        const lo = Math.max(0, i - R);
        const hi = Math.min(M - 1, i + R);
        for (let j = lo; j <= hi; j++) if (v > tmp[j]) tmp[j] = v;
      }
      const ps = this.rPre;
      ps[0] = 0;
      for (let i = 0; i < M; i++) ps[i + 1] = ps[i] + tmp[i];
      for (let i = 0; i < M; i++) {
        const lo = Math.max(0, i - R);
        const hi = Math.min(M - 1, i + R);
        w[i] = (ps[hi + 1] - ps[lo]) / (hi - lo + 1);
      }
      // move positions towards the local mean (box of +-W rings), only where the
      // weight is non-zero (the blurred weights are zero beyond R from the dilated set)
      const W = 6;
      const out = this.rPosTmp;
      const pp = this.rPre3;
      pp[0] = pp[1] = pp[2] = 0;
      for (let i = 0; i < M; i++) {
        const q = (E + i) * 3;
        pp[(i + 1) * 3] = pp[i * 3] + pos[q];
        pp[(i + 1) * 3 + 1] = pp[i * 3 + 1] + pos[q + 1];
        pp[(i + 1) * 3 + 2] = pp[i * 3 + 2] + pos[q + 2];
      }
      const iLo = Math.max(0, lo0 - 2 * R);
      const iHi = Math.min(M - 1, hi0 + 2 * R);
      for (let i = iLo; i <= iHi; i++) {
        const lo = Math.max(0, i - W);
        const hi = Math.min(M - 1, i + W);
        const c = hi - lo + 1;
        const q = (E + i) * 3;
        const t = w[i];
        out[i * 3] = pos[q] + ((pp[(hi + 1) * 3] - pp[lo * 3]) / c - pos[q]) * t;
        out[i * 3 + 1] = pos[q + 1] + ((pp[(hi + 1) * 3 + 1] - pp[lo * 3 + 1]) / c - pos[q + 1]) * t;
        out[i * 3 + 2] = pos[q + 2] + ((pp[(hi + 1) * 3 + 2] - pp[lo * 3 + 2]) / c - pos[q + 2]) * t;
      }
      for (let i = iLo; i <= iHi; i++) {
        const q = (E + i) * 3;
        pos[q] = out[i * 3];
        pos[q + 1] = out[i * 3 + 1];
        pos[q + 2] = out[i * 3 + 2];
      }
      // tangents from the new positions where the path moved (blend elsewhere)
      for (let i = 0; i < M; i++) {
        const t = Math.min(w[i] * 4, 1);
        if (t <= 0) continue;
        const a = (E + Math.max(i - 1, 0)) * 3;
        const b = (E + Math.min(i + 1, M - 1)) * 3;
        let dx = pos[b] - pos[a];
        let dy = pos[b + 1] - pos[a + 1];
        let dz = pos[b + 2] - pos[a + 2];
        const l = hyp3(dx, dy, dz) || 1;
        dx /= l;
        dy /= l;
        dz /= l;
        const o = (E + i) * 3;
        let tx = tan[o] + (dx - tan[o]) * t;
        let ty = tan[o + 1] + (dy - tan[o + 1]) * t;
        let tz = tan[o + 2] + (dz - tan[o + 2]) * t;
        const tl = hyp3(tx, ty, tz) || 1;
        tx /= tl;
        ty /= tl;
        tz /= tl;
        tan[o] = tx;
        tan[o + 1] = ty;
        tan[o + 2] = tz;
      }
      // re-frame so the next iteration measures against the new B
      // (only rings from the first edited one onwards can change)
      const from = Math.max(0, iLo - 1);
      this.frameN0(M, E, this.frameMode === "curvature" ? 0 : from);
      twistFrames(this.frameMode === "curvature" ? 0 : from, M, E, tan, this.rN0, this.rTwC, this.rTwS, this.rN, this.rB);
    }
    return moved;
  }

  /** worst half-width * edge-wise curvature after relaxation (1 = inner edge reaches the centre of curvature) */
  pinch = 0;
  /** relative curvature slack before the path relaxation engages / keeps iterating */
  static relaxTol = 0;
  /** relaxation iterations used by the last update (diagnostic) */
  relaxIters = 0;

  /** ring centre z range, handy for layering decisions */
  get maxZ(): number {
    return this.bounds.max.z;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}
