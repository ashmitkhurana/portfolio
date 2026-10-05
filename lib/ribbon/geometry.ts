/**
 * RibbonGeometry: sweeps a FLAT rectangular band profile (tiny corner bevels)
 * along the sampled centreline using rotation-minimising frames.
 *
 * - The profile is four strips with split vertices at the creases: face A
 *   (flat, +N), the left rim (bevel, flat side, bevel), face B (flat, -N) and
 *   the right rim. Normals are analytic (exact arc normals on the bevels, the
 *   flat normal on the faces) so the faces and the edge never share normals;
 *   along the length the true surface derivative is used (central difference
 *   of the swept positions), so twist/torsion is exact.
 * - Round caps (semicircular plan, domed section) close both ends.
 * - `aFace` is a HARD per-vertex value: +1 face A, -1 face B, 0 rim strip.
 * - Width is constant; a tight in-plane bend is relaxed by smoothing the
 *   centreline (never by narrowing the band).
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
  private rScale!: Float32Array; // cap plan scale (1 on the body)
  private rScaleT!: Float32Array; // cap thickness scale
  private rKb!: Float32Array; // in-plane curvature scratch (body rings)
  private rSm!: Float32Array; // smoothing weights scratch
  private rSm2!: Float32Array;
  private rPosTmp!: Float32Array;

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
    this.rScaleT = new Float32Array(R).fill(1);
    this.rKb = new Float32Array(M);
    this.rSm = new Float32Array(M);
    this.rSm2 = new Float32Array(M);
    this.rPosTmp = new Float32Array(M * 3);

    // aFace is static: a hard +1 / 0 / -1 per vertex (see buildProfile)
    for (let i = 0; i < R; i++) {
      for (let k = 0; k < K; k++) {
        this.face[i * K + k] = this.profile.face[k];
        this.tng[(i * K + k) * 4 + 3] = 1;
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

    const rScaleT = this.rScaleT;

    this.curve.setControl(ctrlPos, ctrlTwist, ctrlWidth, n);
    this.curve.sampleRings(M, E, rPos, rTan, rTwist, rWidth);
    computeFrames(M, E, rPos, rTan, rTwist, rN, rB, this.seed.x, this.seed.y, this.seed.z);

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
      const sT = rScaleT[i];
      const hw = Math.max(0.5 * P.width * rWidth[i], r + 1e-3);
      const base = i * K;
      for (let k = 0; k < K; k++) {
        const x = (prof.sx[k] * (hw - r) + prof.cx[k] * r) * sc;
        const y = (prof.sy[k] * (ht - r) + prof.cy[k] * r) * sT;
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
    for (let iter = 0; iter < 8; iter++) {
      let any = false;
      worst = 0;
      for (let i = 0; i < M; i++) {
        const a = (E + Math.max(i - 1, 0)) * 3;
        const b = (E + Math.min(i + 1, M - 1)) * 3;
        const o = (E + i) * 3;
        const ds =
          Math.hypot(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]) || 1;
        const kx = (tan[b] - tan[a]) / ds;
        const ky = (tan[b + 1] - tan[a + 1]) / ds;
        const kz = (tan[b + 2] - tan[a + 2]) / ds;
        kb[i] = Math.abs(kx * B[o] + ky * B[o + 1] + kz * B[o + 2]);
        const hw = 0.5 * P.width * rWidth[E + i];
        if (hw * kb[i] > worst) worst = hw * kb[i];
        const e = (hw * kb[i]) / SAFE - 1; // > 0 where the band would pinch
        const v = e <= 0 ? 0 : Math.min(e * 2, 1);
        w[i] = v;
        if (v > 0) any = true;
      }
      this.pinch = worst;
      if (!any) break;
      moved = true;
      // dilate then blur the weights so the relaxed region has soft shoulders
      const R = 8;
      for (let i = 0; i < M; i++) {
        let m = 0;
        const lo = Math.max(0, i - R);
        const hi = Math.min(M - 1, i + R);
        for (let j = lo; j <= hi; j++) if (w[j] > m) m = w[j];
        tmp[i] = m;
      }
      for (let i = 0; i < M; i++) {
        let sum = 0;
        let cnt = 0;
        const lo = Math.max(0, i - R);
        const hi = Math.min(M - 1, i + R);
        for (let j = lo; j <= hi; j++) {
          sum += tmp[j];
          cnt++;
        }
        w[i] = sum / cnt;
      }
      // move positions towards the local mean (box of +-W rings)
      const W = 6;
      const out = this.rPosTmp;
      for (let i = 0; i < M; i++) {
        const lo = Math.max(0, i - W);
        const hi = Math.min(M - 1, i + W);
        let mx = 0;
        let my = 0;
        let mz = 0;
        for (let j = lo; j <= hi; j++) {
          const q = (E + j) * 3;
          mx += pos[q];
          my += pos[q + 1];
          mz += pos[q + 2];
        }
        const c = hi - lo + 1;
        const q = (E + i) * 3;
        const t = w[i];
        out[i * 3] = pos[q] + (mx / c - pos[q]) * t;
        out[i * 3 + 1] = pos[q + 1] + (my / c - pos[q + 1]) * t;
        out[i * 3 + 2] = pos[q + 2] + (mz / c - pos[q + 2]) * t;
      }
      for (let i = 0; i < M; i++) {
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
        const l = Math.hypot(dx, dy, dz) || 1;
        dx /= l;
        dy /= l;
        dz /= l;
        const o = (E + i) * 3;
        let tx = tan[o] + (dx - tan[o]) * t;
        let ty = tan[o + 1] + (dy - tan[o + 1]) * t;
        let tz = tan[o + 2] + (dz - tan[o + 2]) * t;
        const tl = Math.hypot(tx, ty, tz) || 1;
        tx /= tl;
        ty /= tl;
        tz /= tl;
        tan[o] = tx;
        tan[o + 1] = ty;
        tan[o + 2] = tz;
      }
      // re-frame so the next iteration measures against the new B
      computeFrames(M, E, pos, tan, this.rTwist, this.rN, this.rB, this.seed.x, this.seed.y, this.seed.z);
    }
    return moved;
  }

  /** worst half-width * edge-wise curvature after relaxation (1 = inner edge reaches the centre of curvature) */
  pinch = 0;

  /** ring centre z range, handy for layering decisions */
  get maxZ(): number {
    return this.bounds.max.z;
  }

  dispose(): void {
    this.geometry.dispose();
  }
}
