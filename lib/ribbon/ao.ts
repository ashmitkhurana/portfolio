/**
 * Ambient occlusion of the ENVIRONMENT light on the ribbon (default OFF, `material.ao`).
 *
 * 1. Depth maps: `aoDirs` fixed directions w_k on a Fibonacci sphere. For each one the ribbon is rendered orthographically
 *    from the far side along -w_k into layer k of a float array render target; each texel holds the distance (along w_k)
 *    of the surface closest to a "light" at infinity in direction w_k. Stored value e = dot(p - C, w_k) + R, so the clear
 *    value 0 means "empty" (a float clear colour may be clamped to [0, 1] by the driver).
 * 2. Bake (surface space): a W x H texture, W = profile vertices per ring, H = rings, i.e. exactly the mesh's vertex order
 *    (vertex index = ring * W + k). Each texel computes the AO of its vertex (position + normal rebuilt on the GPU from the
 *    ring texture, same math as the colour pass): per direction in the normal's hemisphere, a bilinear 2x2 PCF of a SOFT
 *    visibility 1 - smoothstep(bias, bias + soft, occluderDepth - myDepth), cosine weighted.
 * 3. Blur: separable gaussian, along the rings (sigma `aoBlur` rings) and across the profile (sigma 1.5), never across a
 *    face / rim segment (face A, face B and the rims keep their own values).
 * 4. The ribbon vertex shader does ONE texelFetch from the blurred texture (gl_VertexID -> (k, ring)) and passes vAO; the
 *    fragment shader applies it to the environment's diffuse (vAO) and specular (vAO^aoSpec) light only. The direct light is
 *    untouched (the shadow map handles it).
 *
 * The maps and the bake only depend on the ribbon geometry: a frozen pose renders them once.
 */
import * as THREE from "three";
import { FullscreenPass } from "./passes";
import { SWEEP_CORE_GLSL, SWEEP_GLSL, type SweepUniforms } from "./sweep";

export const AO_MAX_DIRS = 64;

export interface AoUniforms {
  /** depth maps (array texture, one layer per direction): read by the bake only */
  uAoTex: { value: THREE.Texture | null };
  uAoDirs: { value: THREE.Vector3[] };
  uAoN: { value: number };
  /** bounding-sphere centre of the ribbon (world) */
  uAoC: { value: THREE.Vector3 };
  /** padded bounding-sphere radius = half extent of every depth map (world px) */
  uAoR: { value: number };
  /** depth map side (px) */
  uAoRes: { value: number };
  uAoBias: { value: number };
  /** width of the soft occlusion ramp, world px */
  uAoSoft: { value: number };
  /** strength 0..1 */
  uAoK: { value: number };
  uAoSpec: { value: number };
  /** the blurred, baked AO (W = profile vertices, H = rings) */
  uAoBake: { value: THREE.Texture | null };
  /** profile vertices per ring (W of the bake) */
  uAoProfN: { value: number };
}

export function createAoUniforms(): AoUniforms {
  return {
    uAoTex: { value: null },
    uAoDirs: { value: Array.from({ length: AO_MAX_DIRS }, () => new THREE.Vector3(0, 0, 1)) },
    uAoN: { value: 0 },
    uAoC: { value: new THREE.Vector3() },
    uAoR: { value: 1 },
    uAoRes: { value: 256 },
    uAoBias: { value: 3 },
    uAoSoft: { value: 12 },
    uAoK: { value: 0 },
    uAoSpec: { value: 1 },
    uAoBake: { value: null },
    uAoProfN: { value: 1 },
  };
}

/** same basis as THREE.Object3D.lookAt for a camera at +w looking at the centre with this up vector */
const BASIS_GLSL = /* glsl */ `
void ribAoBasis(vec3 w, out vec3 r, out vec3 u) {
  vec3 up0 = abs(w.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
  r = normalize(cross(up0, w));
  u = cross(w, r);
}
`;

export function aoBasis(w: THREE.Vector3, right: THREE.Vector3, up: THREE.Vector3): void {
  if (Math.abs(w.y) < 0.99) right.set(0, 1, 0).cross(w);
  else right.set(1, 0, 0).cross(w);
  right.normalize();
  up.copy(w).cross(right);
}

export const AO_VERT_DECL = /* glsl */ `
uniform highp sampler2D uAoBake;
uniform float uAoProfN;
uniform float uAoK;
varying float vAO;
`;

export const AO_FRAG_DECL = /* glsl */ `
varying float vAO;
uniform float uAoSpec;
`;

/** appended after the vertex shader's project_vertex: ONE fetch from the baked AO (vertex index = ring * W + k) */
export const AO_VERT_BODY = /* glsl */ `
  {
    int ribAoRing = int(position.z + 0.5);
    int ribAoK = gl_VertexID - ribAoRing * int(uAoProfN + 0.5);
    vAO = mix(1.0, texelFetch(uAoBake, ivec2(ribAoK, ribAoRing), 0).r, uAoK);
  }
`;

const FS_VERT = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const BAKE_FRAG = /* glsl */ `
${SWEEP_CORE_GLSL}
${BASIS_GLSL}
#define RIB_AO_MAX ${AO_MAX_DIRS}
uniform highp sampler2DArray uAoTex;
uniform sampler2D uProf; // row 0: sx, sy, cx, cy of profile vertex k; row 1: segment id
uniform vec3 uAoDirs[RIB_AO_MAX];
uniform int uAoN;
uniform vec3 uAoC;
uniform float uAoR;
uniform float uAoRes;
uniform float uAoBias;
uniform float uAoSoft;

void main() {
  ivec2 id = ivec2(gl_FragCoord.xy); // x = profile vertex, y = ring
  vec4 pr = texelFetch(uProf, ivec2(id.x, 0), 0);
  vec3 P; vec3 N; vec3 T;
  ribSweepAt(id.y, pr.xy, pr.zw, P, N, T);
  // the swept surface is drawn with its shading normal pointing at the FAR face of the (thin) sheet: lift the sample point
  // by the full thickness onto the face the normal looks away from (the depth maps hold the physical sheet, both faces)
  vec3 d = P + N * (2.0 * uRingProf.y) - uAoC;
  float texel = 2.0 * uAoR / uAoRes;
  int hi = int(uAoRes) - 1;
  float vis = 0.0;
  float wsum = 0.0;
  for (int k = 0; k < RIB_AO_MAX; k++) {
    if (k >= uAoN) break;
    vec3 w = uAoDirs[k];
    float c = dot(w, N);
    if (c <= 0.0) continue;
    vec3 r; vec3 u;
    ribAoBasis(w, r, u);
    vec2 f = (0.5 + 0.5 * vec2(dot(d, r), dot(d, u)) / uAoR) * uAoRes - 0.5;
    ivec2 b0 = ivec2(floor(f));
    vec2 fr = fract(f);
    float e = dot(d, w) + uAoR;
    // slope-scaled bias: the depth map is sampled up to a texel away, over which an inclined surface changes depth
    float tanT = sqrt(max(1.0 - c * c, 0.0)) / max(c, 0.05);
    float bias = uAoBias + 0.7 * texel * min(tanT, 4.0);
    float v = 0.0;
    for (int j = 0; j < 4; j++) {
      ivec2 o = ivec2(j & 1, j >> 1);
      float wt = (o.x == 1 ? fr.x : 1.0 - fr.x) * (o.y == 1 ? fr.y : 1.0 - fr.y);
      float stored = texelFetch(uAoTex, ivec3(clamp(b0 + o, ivec2(0), ivec2(hi)), k), 0).r;
      v += wt * (1.0 - smoothstep(bias, bias + max(uAoSoft, 1e-3), stored - e));
    }
    vis += c * v;
    wsum += c;
  }
  gl_FragColor = vec4(vis / max(wsum, 1e-4), 0.0, 0.0, 1.0);
}`;

const BLUR_FRAG = /* glsl */ `
uniform sampler2D tSrc;
uniform sampler2D uProf;
uniform ivec2 uAxis;   // (1,0): across the profile, within a segment; (0,1): along the rings
uniform float uSigma;
void main() {
  ivec2 id = ivec2(gl_FragCoord.xy);
  ivec2 sz = textureSize(tSrc, 0);
  float seg = texelFetch(uProf, ivec2(id.x, 1), 0).x;
  float rad = ceil(3.0 * uSigma);
  float acc = 0.0;
  float wt = 0.0;
  for (int i = -96; i <= 96; i++) {
    if (abs(float(i)) > rad) continue;
    ivec2 q = id + uAxis * i;
    if (q.x < 0 || q.y < 0 || q.x >= sz.x || q.y >= sz.y) continue;
    if (uAxis.x != 0 && texelFetch(uProf, ivec2(q.x, 1), 0).x != seg) continue;
    float g = exp(-0.5 * float(i * i) / (uSigma * uSigma));
    acc += g * texelFetch(tSrc, q, 0).r;
    wt += g;
  }
  gl_FragColor = vec4(acc / max(wt, 1e-6), 0.0, 0.0, 1.0);
}`;

/** Fibonacci sphere directions (full sphere), unit vectors */
export function fibonacciDirs(n: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const rr = Math.sqrt(Math.max(1 - y * y, 0));
    const phi = i * golden;
    out.push(new THREE.Vector3(Math.cos(phi) * rr, y, Math.sin(phi) * rr));
  }
  return out;
}

export type AoFormat = "float32" | "float16" | "none";

/** which colour format the depth maps can use on this renderer */
export function aoFormat(renderer: THREE.WebGLRenderer): AoFormat {
  if (renderer.extensions.has("EXT_color_buffer_float")) return "float32";
  if (renderer.extensions.has("EXT_color_buffer_half_float")) return "float16";
  return "none";
}

export interface AoBakeParams {
  dirs: number;
  res: number;
  /** gaussian sigma along the rings, in rings */
  blur: number;
  /** profile vertices per ring (W) and rings (H) of the bake */
  profileCount: number;
  rings: number;
}

export class AoPass {
  readonly format: AoFormat;
  private target: THREE.WebGLArrayRenderTarget | null = null;
  private key = "";
  private readonly scene = new THREE.Scene();
  private readonly mesh: THREE.Mesh;
  private readonly cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 10);
  private readonly mat: THREE.ShaderMaterial;
  private readonly wUniform = { value: new THREE.Vector3() };
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly basis = new THREE.Matrix4();
  private readonly clearColor = new THREE.Color();
  private readonly center = new THREE.Vector3();

  // bake + blur
  private profTex: THREE.DataTexture | null = null;
  private profKey = "";
  private bakeKey = "";
  private rtA: THREE.WebGLRenderTarget | null = null;
  private rtB: THREE.WebGLRenderTarget | null = null;
  private readonly bake: FullscreenPass;
  private readonly bakeU: Record<string, THREE.IUniform>;
  private readonly blurPass: FullscreenPass;
  private readonly blurU: { tSrc: THREE.IUniform; uProf: THREE.IUniform; uAxis: THREE.IUniform; uSigma: THREE.IUniform };

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    sweep: SweepUniforms,
    private geometry: THREE.BufferGeometry,
    private readonly u: AoUniforms,
  ) {
    this.format = aoFormat(renderer);
    this.mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: true,
      uniforms: { uRingTex: sweep.uRingTex, uRingProf: sweep.uRingProf, uAoW: this.wUniform, uAoC: u.uAoC, uAoR: u.uAoR },
      vertexShader: /* glsl */ `
        ${SWEEP_GLSL}
        uniform vec3 uAoW;
        uniform vec3 uAoC;
        uniform float uAoR;
        varying float vE;
        void main() {
          vec4 wp = modelMatrix * vec4(ribSweepPosition(), 1.0);
          vE = dot(wp.xyz - uAoC, uAoW) + uAoR;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        varying float vE;
        void main() { gl_FragColor = vec4(vE, 0.0, 0.0, 1.0); }`,
    });
    this.mesh = new THREE.Mesh(geometry, this.mat);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);

    this.bakeU = {
      uRingTex: sweep.uRingTex,
      uRingProf: sweep.uRingProf,
      uProf: { value: null },
      uAoTex: u.uAoTex,
      uAoDirs: u.uAoDirs,
      uAoN: u.uAoN,
      uAoC: u.uAoC,
      uAoR: u.uAoR,
      uAoRes: u.uAoRes,
      uAoBias: u.uAoBias,
      uAoSoft: u.uAoSoft,
    };
    this.bake = new FullscreenPass(
      new THREE.ShaderMaterial({
        uniforms: this.bakeU,
        depthTest: false,
        depthWrite: false,
        vertexShader: FS_VERT,
        fragmentShader: BAKE_FRAG,
      }),
    );
    this.blurU = {
      tSrc: { value: null },
      uProf: { value: null },
      uAxis: { value: new THREE.Vector2(1, 0) },
      uSigma: { value: 1.5 },
    };
    this.blurPass = new FullscreenPass(
      new THREE.ShaderMaterial({
        uniforms: this.blurU as unknown as Record<string, THREE.IUniform>,
        depthTest: false,
        depthWrite: false,
        vertexShader: FS_VERT,
        fragmentShader: BLUR_FRAG,
      }),
    );
  }

  setGeometry(g: THREE.BufferGeometry): void {
    this.geometry = g;
    this.mesh.geometry = g;
    this.profKey = "";
  }

  /** (re)allocate on a change of direction count / map size */
  private ensure(n: number, res: number): void {
    const key = `${n}x${res}`;
    if (this.target && key === this.key) return;
    this.target?.dispose();
    const t = new THREE.WebGLArrayRenderTarget(res, res, n, {
      format: THREE.RedFormat,
      type: this.format === "float32" ? THREE.FloatType : THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.target = t;
    this.key = key;
    this.u.uAoTex.value = t.texture;
    const dirs = fibonacciDirs(n);
    for (let k = 0; k < AO_MAX_DIRS; k++) this.u.uAoDirs.value[k].copy(dirs[k] ?? dirs[0]);
    this.u.uAoN.value = n;
    this.u.uAoRes.value = res;
  }

  /** profile table (static per mesh topology): row 0 = (sx, sy, cx, cy), row 1 = segment id (a run of equal face ids) */
  private ensureProfile(K: number): THREE.DataTexture {
    const key = `${K}`;
    if (this.profTex && this.profKey === key) return this.profTex;
    this.profTex?.dispose();
    const pos = this.geometry.getAttribute("position") as THREE.InterleavedBufferAttribute;
    const tan = this.geometry.getAttribute("tangent") as THREE.InterleavedBufferAttribute;
    const data = new Float32Array(K * 8);
    let seg = 0;
    let prevFace = NaN;
    for (let k = 0; k < K; k++) {
      const face = tan.getZ(k);
      if (k > 0 && face !== prevFace) seg++;
      prevFace = face;
      data[k * 4] = pos.getX(k);
      data[k * 4 + 1] = pos.getY(k);
      data[k * 4 + 2] = tan.getX(k);
      data[k * 4 + 3] = tan.getY(k);
      data[K * 4 + k * 4] = seg;
    }
    const t = new THREE.DataTexture(data, K, 2, THREE.RGBAFormat, THREE.FloatType);
    t.minFilter = THREE.NearestFilter;
    t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.flipY = false;
    t.needsUpdate = true;
    this.profTex = t;
    this.profKey = key;
    return t;
  }

  private ensureBake(W: number, H: number): void {
    const key = `${W}x${H}`;
    if (this.rtA && this.rtB && key === this.bakeKey) return;
    this.rtA?.dispose();
    this.rtB?.dispose();
    const opts = {
      format: THREE.RedFormat,
      type: this.format === "float32" ? THREE.FloatType : THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: false,
      stencilBuffer: false,
    };
    this.rtA = new THREE.WebGLRenderTarget(W, H, opts);
    this.rtB = new THREE.WebGLRenderTarget(W, H, opts);
    this.bakeKey = key;
    this.u.uAoBake.value = this.rtA.texture;
  }

  /** depth maps for every direction, then the surface-space bake and its blur */
  render(bounds: THREE.Box3, p: AoBakeParams): void {
    const n = Math.min(Math.max(Math.round(p.dirs), 1), AO_MAX_DIRS);
    const size = Math.min(Math.max(Math.round(p.res), 16), 2048);
    this.ensure(n, size);
    const target = this.target;
    if (!target) return;
    const W = p.profileCount;
    const H = p.rings;
    const prof = this.ensureProfile(W);
    this.ensureBake(W, H);
    const rtA = this.rtA;
    const rtB = this.rtB;
    if (!rtA || !rtB) return;
    const r = this.renderer;

    const c = bounds.getCenter(this.center);
    const diag = bounds.max.distanceTo(bounds.min);
    const Rb = Math.max(0.5 * diag * 1.1, 1);
    this.u.uAoC.value.copy(c);
    this.u.uAoR.value = Rb;
    this.u.uAoProfN.value = W;
    const cam = this.cam;
    cam.left = -Rb;
    cam.right = Rb;
    cam.top = Rb;
    cam.bottom = -Rb;
    cam.near = 1;
    cam.far = 2 * Rb + 100;
    cam.updateProjectionMatrix();

    const prevTarget = r.getRenderTarget();
    const prevFace = r.getActiveCubeFace();
    const prevMip = r.getActiveMipmapLevel();
    const prevAuto = r.autoClear;
    const prevAlpha = r.getClearAlpha();
    r.getClearColor(this.clearColor);
    r.autoClear = false;
    r.setClearColor(0x000000, 0);
    for (let k = 0; k < n; k++) {
      const w = this.u.uAoDirs.value[k];
      aoBasis(w, this.right, this.up);
      this.basis.makeBasis(this.right, this.up, w);
      cam.quaternion.setFromRotationMatrix(this.basis);
      cam.position.copy(c).addScaledVector(w, Rb + 50);
      cam.updateMatrixWorld();
      this.wUniform.value.copy(w);
      r.setRenderTarget(target, k);
      r.clear(true, true, false);
      r.render(this.scene, cam);
    }

    // bake: one texel per vertex -> A; blur across the profile (within a segment) A -> B; along the rings B -> A
    this.bakeU.uProf.value = prof;
    r.setRenderTarget(rtA);
    this.bake.render(r);
    this.blurU.uProf.value = prof;
    this.blurU.tSrc.value = rtA.texture;
    (this.blurU.uAxis.value as THREE.Vector2).set(1, 0);
    this.blurU.uSigma.value = 1.5;
    r.setRenderTarget(rtB);
    this.blurPass.render(r);
    this.blurU.tSrc.value = rtB.texture;
    (this.blurU.uAxis.value as THREE.Vector2).set(0, 1);
    this.blurU.uSigma.value = Math.max(p.blur, 0.01);
    r.setRenderTarget(rtA);
    this.blurPass.render(r);

    r.setRenderTarget(prevTarget, prevFace, prevMip);
    r.setClearColor(this.clearColor, prevAlpha);
    r.autoClear = prevAuto;
  }

  dispose(): void {
    this.target?.dispose();
    this.target = null;
    this.rtA?.dispose();
    this.rtB?.dispose();
    this.profTex?.dispose();
    this.mat.dispose();
    this.bake.material.dispose();
    this.blurPass.material.dispose();
  }
}
