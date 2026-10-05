/**
 * RibbonGeometry: sweeps a thin rounded-rectangle profile along the sampled
 * centreline using rotation-minimising frames.
 *
 * - Normals are analytic in the profile direction (exact rounded-rect arc
 *   normals) and use the true surface derivative along the length (central
 *   difference of the actual swept positions), so twist/torsion is handled
 *   exactly and there is zero faceting at any bend.
 * - Soft elliptical end caps close both ends (no open hole).
 * - `aFace` runs +1 on face A -> 0 at the rim -> -1 on face B.
 * - All buffers are preallocated; `update()` rewrites them in place.
 */
import * as THREE from "three";
import { RibbonCurve, computeFrames } from "./frames";
import type { RibbonSettings } from "./settings";

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
  /** corner radius, thickness (px) */
  r: number;
  ht: number;
}

function buildProfile(p: GeometryParams): Profile {
  const T = p.width * p.thicknessRatio;
  const ht = T / 2;
  const r = Math.max(Math.min(p.edgeRadiusRatio * T, ht), 1e-3);
  const n = Math.max(2, Math.round(p.profileVerts / 4) - 1);

  const corners: Array<[number, number, number]> = [
    [-1, 1, 90], // top-left: 90 -> 180
    [-1, -1, 180], // bottom-left: 180 -> 270
    [1, -1, 270], // bottom-right: 270 -> 360
    [1, 1, 0], // top-right: 0 -> 90
  ];
  const sx: number[] = [];
  const sy: number[] = [];
  const cx: number[] = [];
  const cy: number[] = [];
  for (let c = 0; c < 4; c++) {
    const [qx, qy, start] = corners[c];
    for (let i = 0; i <= n; i++) {
      // skip the duplicated point at the left/right seams when the straight
      // vertical edge has zero length (full round edge)
      if (i === 0 && (c === 1 || c === 3) && ht - r < 1e-4) continue;
      const a = ((start + (i / n) * 90) * Math.PI) / 180;
      sx.push(qx);
      sy.push(qy);
      cx.push(Math.cos(a));
      cy.push(Math.sin(a));
    }
  }
  const count = sx.length;
  const prof: Profile = {
    count,
    sx: Float32Array.from(sx),
    sy: Float32Array.from(sy),
    cx: Float32Array.from(cx),
    cy: Float32Array.from(cy),
    tx: new Float32Array(count),
    ty: new Float32Array(count),
    r,
    ht,
  };
  for (let k = 0; k < count; k++) {
    // CCW arc tangent
    prof.tx[k] = -cy[k];
    prof.ty[k] = cx[k];
  }
  return prof;
}

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

  private pos!: Float32Array;
  private nrm!: Float32Array;
  private tng!: Float32Array;
  private face!: Float32Array;

  // per-ring scratch (length totalRings)
  private rPos!: Float32Array;
  private rTan!: Float32Array;
  private rN!: Float32Array;
  private rB!: Float32Array;
  private rTwist!: Float32Array;
  private rWidth!: Float32Array;
  private rScale!: Float32Array; // cap scale (1 on the body)
  private rLim!: Float32Array; // curvature width limiter scratch
  private rLim2!: Float32Array;

  /** seed for the initial frame normal (towards camera by default) */
  seed = new THREE.Vector3(0, 0, 1);

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
      old.rings !== params.rings ||
      old.profileVerts !== params.profileVerts ||
      old.capRings !== params.capRings ||
      old.edgeRadiusRatio !== params.edgeRadiusRatio ||
      old.thicknessRatio !== params.thicknessRatio ||
      old.width !== params.width;
    if (
      old.rings !== params.rings ||
      old.profileVerts !== params.profileVerts ||
      old.capRings !== params.capRings
    ) {
      const prev = this.geometry;
      this.build();
      prev.dispose();
      return true;
    }
    if (topo) this.profile = buildProfile(this.params);
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
    this.pos = new Float32Array(V * 3);
    this.nrm = new Float32Array(V * 3);
    this.tng = new Float32Array(V * 4);
    this.face = new Float32Array(V);
    this.rPos = new Float32Array(R * 3);
    this.rTan = new Float32Array(R * 3);
    this.rN = new Float32Array(R * 3);
    this.rB = new Float32Array(R * 3);
    this.rTwist = new Float32Array(R);
    this.rWidth = new Float32Array(R);
    this.rScale = new Float32Array(R).fill(1);
    this.rLim = new Float32Array(M);
    this.rLim2 = new Float32Array(M);

    // aFace is static: the profile normal's vertical component
    for (let i = 0; i < R; i++) {
      for (let k = 0; k < K; k++) {
        this.face[i * K + k] = this.profile.cy[k];
        this.tng[(i * K + k) * 4 + 3] = 1;
      }
    }

    // index buffer, built once. Outward winding (see README).
    const quads = (R - 1) * K;
    const index = new Uint32Array(quads * 6);
    let w = 0;
    for (let i = 0; i < R - 1; i++) {
      for (let k = 0; k < K; k++) {
        const k1 = (k + 1) % K;
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
    const posA = new THREE.BufferAttribute(this.pos, 3).setUsage(
      THREE.DynamicDrawUsage,
    );
    const nrmA = new THREE.BufferAttribute(this.nrm, 3).setUsage(
      THREE.DynamicDrawUsage,
    );
    const tngA = new THREE.BufferAttribute(this.tng, 4).setUsage(
      THREE.DynamicDrawUsage,
    );
    const faceA = new THREE.BufferAttribute(this.face, 1);
    g.setAttribute("position", posA);
    g.setAttribute("normal", nrmA);
    g.setAttribute("tangent", tngA);
    g.setAttribute("aFace", faceA);
    g.setIndex(new THREE.BufferAttribute(index, 1));
    // we manage bounds ourselves and disable frustum culling on the meshes
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    g.boundingBox = new THREE.Box3(
      new THREE.Vector3(-1e5, -1e5, -1e5),
      new THREE.Vector3(1e5, 1e5, 1e5),
    );
    this.geometry = g;
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
  ): void {
    const P = this.params;
    const M = this.bodyRings;
    const E = this.caps;
    const R = this.totalRings;
    const K = this.profileCount;
    const prof = this.profile;
    const rPos = this.rPos;
    const rTan = this.rTan;
    const rN = this.rN;
    const rB = this.rB;
    const rTwist = this.rTwist;
    const rWidth = this.rWidth;
    const rScale = this.rScale;

    this.curve.setControl(ctrlPos, ctrlTwist, ctrlWidth, n);
    this.curve.sampleRings(M, E, rPos, rTan, rTwist, rWidth);
    computeFrames(
      M,
      E,
      rPos,
      rTan,
      rTwist,
      rN,
      rB,
      this.seed.x,
      this.seed.y,
      this.seed.z,
    );

    // taper (along body arc length)
    const tl = Math.max(P.taperLength, 1e-3);
    for (let i = 0; i < M; i++) {
      const s = M > 1 ? i / (M - 1) : 0;
      const f = Math.min(Math.min(s, 1 - s) / tl, 1);
      const sm = f * f * (3 - 2 * f);
      rWidth[E + i] *= 1 - P.taperAmount * (1 - sm);
      rScale[E + i] = 1;
    }

    this.limitWidthByCurvature(M, E);

    // caps: elliptical plan + elliptical section, built by extrapolating the
    // end rings along their tangents with shrinking scale
    const capLen = P.width * P.capLengthRatio;
    const head = E; // first body ring
    const tail = E + M - 1; // last body ring
    for (let j = 1; j <= E; j++) {
      const q = j / E;
      const phi = q * Math.PI * 0.5;
      const off = capLen * Math.sin(phi);
      const sc = Math.cos(phi);
      const ih = E - j; // head cap ring index
      const it = tail + j; // tail cap ring index
      for (let a = 0; a < 3; a++) {
        rPos[ih * 3 + a] = rPos[head * 3 + a] - rTan[head * 3 + a] * off;
        rPos[it * 3 + a] = rPos[tail * 3 + a] + rTan[tail * 3 + a] * off;
        rTan[ih * 3 + a] = rTan[head * 3 + a];
        rTan[it * 3 + a] = rTan[tail * 3 + a];
        rN[ih * 3 + a] = rN[head * 3 + a];
        rN[it * 3 + a] = rN[tail * 3 + a];
        rB[ih * 3 + a] = rB[head * 3 + a];
        rB[it * 3 + a] = rB[tail * 3 + a];
      }
      rWidth[ih] = rWidth[head];
      rWidth[it] = rWidth[tail];
      rScale[ih] = Math.max(sc, 0);
      rScale[it] = Math.max(sc, 0);
    }

    // positions
    const pos = this.pos;
    const r = prof.r;
    const ht = prof.ht;
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity,
      maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    for (let i = 0; i < R; i++) {
      const o3 = i * 3;
      const cxp = rPos[o3];
      const cyp = rPos[o3 + 1];
      const czp = rPos[o3 + 2];
      const nx = rN[o3];
      const ny = rN[o3 + 1];
      const nz = rN[o3 + 2];
      const bx = rB[o3];
      const by = rB[o3 + 1];
      const bz = rB[o3 + 2];
      const sc = rScale[i];
      const hw = Math.max(0.5 * P.width * rWidth[i], r + 1e-3);
      const base = i * K;
      for (let k = 0; k < K; k++) {
        const x = (prof.sx[k] * (hw - r) + prof.cx[k] * r) * sc;
        const y = (prof.sy[k] * (ht - r) + prof.cy[k] * r) * sc;
        const px = cxp + bx * x + nx * y;
        const py = cyp + by * x + ny * y;
        const pz = czp + bz * x + nz * y;
        const v = (base + k) * 3;
        pos[v] = px;
        pos[v + 1] = py;
        pos[v + 2] = pz;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        if (pz < minZ) minZ = pz;
        if (pz > maxZ) maxZ = pz;
      }
    }
    this.bounds.min.set(minX, minY, minZ);
    this.bounds.max.set(maxX, maxY, maxZ);

    // normals + tangents
    const nrm = this.nrm;
    const tng = this.tng;
    for (let i = 0; i < R; i++) {
      const o3 = i * 3;
      const bx = rB[o3];
      const by = rB[o3 + 1];
      const bz = rB[o3 + 2];
      const nx = rN[o3];
      const ny = rN[o3 + 1];
      const nz = rN[o3 + 2];
      const iPrev = i > 0 ? i - 1 : i;
      const iNext = i < R - 1 ? i + 1 : i;
      const base = i * K;
      const bPrev = iPrev * K;
      const bNext = iNext * K;
      for (let k = 0; k < K; k++) {
        const v = (base + k) * 3;
        let sx = pos[(bNext + k) * 3] - pos[(bPrev + k) * 3];
        let sy = pos[(bNext + k) * 3 + 1] - pos[(bPrev + k) * 3 + 1];
        let sz = pos[(bNext + k) * 3 + 2] - pos[(bPrev + k) * 3 + 2];
        let sl = Math.hypot(sx, sy, sz);
        if (sl < 1e-9) {
          // degenerate (cap tip): use the ring axis
          sx = rTan[o3];
          sy = rTan[o3 + 1];
          sz = rTan[o3 + 2];
          sl = 1;
        }
        sx /= sl;
        sy /= sl;
        sz /= sl;
        // profile tangent in 3D
        const ux = bx * prof.tx[k] + nx * prof.ty[k];
        const uy = by * prof.tx[k] + ny * prof.ty[k];
        const uz = bz * prof.tx[k] + nz * prof.ty[k];
        // outward normal = dP/ds x dP/du
        let ox = sy * uz - sz * uy;
        let oy = sz * ux - sx * uz;
        let oz = sx * uy - sy * ux;
        const ol = Math.hypot(ox, oy, oz) || 1;
        ox /= ol;
        oy /= ol;
        oz /= ol;
        nrm[v] = ox;
        nrm[v + 1] = oy;
        nrm[v + 2] = oz;
        const t4 = (base + k) * 4;
        tng[t4] = sx;
        tng[t4 + 1] = sy;
        tng[t4 + 2] = sz;
      }
    }

    const g = this.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    g.attributes.tangent.needsUpdate = true;
  }


  /**
   * Hairpin guard. A sheet of half-width h bent edge-wise with curvature k
   * self-intersects once h*k >= 1 (the inner edge crosses the centre of
   * curvature). Narrow the ribbon where that would happen, with a min-filter
   * then box blur so the narrowing is smooth and never exceeds the limit.
   */
  private limitWidthByCurvature(M: number, E: number): void {
    const P = this.params;
    const lim = this.rLim;
    const tmp = this.rLim2;
    const tan = this.rTan;
    const pos = this.rPos;
    const B = this.rB;
    const rWidth = this.rWidth;
    const SAFE = 0.78;
    for (let i = 0; i < M; i++) {
      const a = (E + Math.max(i - 1, 0)) * 3;
      const b = (E + Math.min(i + 1, M - 1)) * 3;
      const o = (E + i) * 3;
      const ds =
        Math.hypot(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]) || 1;
      const kx = (tan[b] - tan[a]) / ds;
      const ky = (tan[b + 1] - tan[a + 1]) / ds;
      const kz = (tan[b + 2] - tan[a + 2]) / ds;
      const kB = Math.abs(kx * B[o] + ky * B[o + 1] + kz * B[o + 2]);
      const hwMax = kB > 1e-6 ? SAFE / kB : 1e9;
      const hw = 0.5 * P.width * rWidth[E + i];
      lim[i] = hw > hwMax ? hwMax / hw : 1;
    }
    // min filter (dilate the narrowing), then box blur (smooth)
    const R = 10;
    for (let i = 0; i < M; i++) {
      let m = 1;
      const lo = Math.max(0, i - R);
      const hi = Math.min(M - 1, i + R);
      for (let j = lo; j < hi + 1; j++) if (lim[j] < m) m = lim[j];
      tmp[i] = m;
    }
    for (let i = 0; i < M; i++) {
      let sum = 0;
      let cnt = 0;
      const lo = Math.max(0, i - R);
      const hi = Math.min(M - 1, i + R);
      for (let j = lo; j < hi + 1; j++) {
        sum += tmp[j];
        cnt++;
      }
      rWidth[E + i] *= Math.min(sum / cnt, 1);
    }
  }

  /** ring centre z range, handy for layering decisions */
  get maxZ(): number {
    return this.bounds.max.z;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}
