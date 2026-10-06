/**
 * Centreline sampling + rotation-minimising frames.
 *
 * RibbonCurve turns N control points into a centripetal Catmull-Rom spline,
 * resamples it UNIFORMLY BY ARC LENGTH to M rings (exact curve points, with
 * analytic tangents), and carries per-point twist / width scale along it with
 * a smooth scalar Catmull-Rom.
 *
 * computeFrames then propagates a frame along the rings with the
 * double-reflection method (Wang et al. 2008), so frames never flip, and
 * applies the interpolated twist about the tangent.
 *
 * Everything is preallocated; nothing allocates per call.
 */

/** how the centreline follows its control points (see RibbonCurve) */
export type SplineKind = "catmull" | "bspline";

/** Euclidean length (Math.hypot is an order of magnitude slower in V8 and runs per ring per iteration) */
export function hyp3(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

const DENSE = 24; // dense arc-length table samples per segment
const EPS = 1e-4;

export class RibbonCurve {
  private n = 0;
  private maxN: number;
  // per segment: 4 cubic coefficients (c0..c3) x 3 axes
  private readonly coef: Float64Array;
  private readonly cum: Float64Array;
  private readonly ctrlPos: Float32Array;
  private readonly ctrlTwist: Float32Array;
  private readonly ctrlWidth: Float32Array;
  /** `catmull`: centripetal Catmull-Rom through the points; `bspline`: C2 uniform cubic B-spline (approximating) */
  private spline: SplineKind = "catmull";
  totalLength = 0;

  constructor(maxControlPoints = 128) {
    this.maxN = maxControlPoints;
    this.coef = new Float64Array(maxControlPoints * 12);
    this.cum = new Float64Array(maxControlPoints * DENSE + 2);
    this.ctrlPos = new Float32Array(maxControlPoints * 3);
    this.ctrlTwist = new Float32Array(maxControlPoints);
    this.ctrlWidth = new Float32Array(maxControlPoints);
  }

  /** (Re)build the spline + arc-length table from control data. */
  setControl(
    pos: Float32Array,
    twist: Float32Array,
    width: Float32Array,
    n: number,
    spline: SplineKind = "catmull",
  ): void {
    if (n > this.maxN) throw new Error("RibbonCurve: too many control points");
    this.n = n;
    this.spline = spline;
    this.ctrlPos.set(pos.subarray(0, n * 3));
    this.ctrlTwist.set(twist.subarray(0, n));
    this.ctrlWidth.set(width.subarray(0, n));
    this.buildCoefficients();
    this.buildTable();
  }

  /** arc-length fraction (0..1) at control point `k` (for a B-spline: at its knot, the curve point nearest the control point) */
  arcFractionAtControl(k: number): number {
    const t = this.totalLength || 1;
    const idx = Math.min(Math.max(k, 0), this.n - 1) * DENSE;
    return this.cum[idx] / t;
  }

  private px(i: number, a: number): number {
    const n = this.n;
    if (i < 0) {
      // reflect: 2 p0 - p1
      return 2 * this.ctrlPos[a] - this.ctrlPos[3 + a];
    }
    if (i >= n) {
      return (
        2 * this.ctrlPos[(n - 1) * 3 + a] - this.ctrlPos[(n - 2) * 3 + a]
      );
    }
    return this.ctrlPos[i * 3 + a];
  }

  private buildCoefficients(): void {
    const n = this.n;
    const c = this.coef;
    if (this.spline === "bspline") {
      // uniform cubic B-spline: C2 (continuous curvature at every knot). Segment s runs between the knots
      // (p[s-1] + 4 p[s] + p[s+1]) / 6 and (p[s] + 4 p[s+1] + p[s+2]) / 6; the ends are reflected (2 p0 - p1), so the
      // curve starts at p0 and ends at p[n-1]. The control points APPROXIMATE the curve: it is pulled inside every bend.
      for (let s = 0; s < n - 1; s++) {
        for (let a = 0; a < 3; a++) {
          const p0 = this.px(s - 1, a);
          const p1 = this.px(s, a);
          const p2 = this.px(s + 1, a);
          const p3 = this.px(s + 2, a);
          const o = s * 12 + a;
          c[o] = (p0 + 4 * p1 + p2) / 6;
          c[o + 3] = (p2 - p0) / 2;
          c[o + 6] = (p0 - 2 * p1 + p2) / 2;
          c[o + 9] = (-p0 + 3 * p1 - 3 * p2 + p3) / 6;
        }
      }
      return;
    }
    for (let s = 0; s < n - 1; s++) {
      const dx01 = this.px(s, 0) - this.px(s - 1, 0);
      const dy01 = this.px(s, 1) - this.px(s - 1, 1);
      const dz01 = this.px(s, 2) - this.px(s - 1, 2);
      const dx12 = this.px(s + 1, 0) - this.px(s, 0);
      const dy12 = this.px(s + 1, 1) - this.px(s, 1);
      const dz12 = this.px(s + 1, 2) - this.px(s, 2);
      const dx23 = this.px(s + 2, 0) - this.px(s + 1, 0);
      const dy23 = this.px(s + 2, 1) - this.px(s + 1, 1);
      const dz23 = this.px(s + 2, 2) - this.px(s + 1, 2);
      // centripetal knot intervals
      const dt0 = Math.max(Math.sqrt(hyp3(dx01, dy01, dz01)), EPS);
      const dt1 = Math.max(Math.sqrt(hyp3(dx12, dy12, dz12)), EPS);
      const dt2 = Math.max(Math.sqrt(hyp3(dx23, dy23, dz23)), EPS);

      for (let a = 0; a < 3; a++) {
        const x0 = this.px(s - 1, a);
        const x1 = this.px(s, a);
        const x2 = this.px(s + 1, a);
        const x3 = this.px(s + 2, a);
        // non-uniform Catmull-Rom tangents (as in three.js CatmullRomCurve3)
        let t1 =
          (x1 - x0) / dt0 - (x2 - x0) / (dt0 + dt1) + (x2 - x1) / dt1;
        let t2 =
          (x2 - x1) / dt1 - (x3 - x1) / (dt1 + dt2) + (x3 - x2) / dt2;
        t1 *= dt1;
        t2 *= dt1;
        const o = s * 12 + a;
        c[o] = x1; // c0
        c[o + 3] = t1; // c1
        c[o + 6] = -3 * x1 + 3 * x2 - 2 * t1 - t2; // c2
        c[o + 9] = 2 * x1 - 2 * x2 + t1 + t2; // c3
      }
    }
  }

  private evalPos(seg: number, t: number, a: number): number {
    const o = seg * 12 + a;
    const c = this.coef;
    return c[o] + t * (c[o + 3] + t * (c[o + 6] + t * c[o + 9]));
  }

  private buildTable(): void {
    const n = this.n;
    const segs = n - 1;
    const cum = this.cum;
    cum[0] = 0;
    let px = this.evalPos(0, 0, 0);
    let py = this.evalPos(0, 0, 1);
    let pz = this.evalPos(0, 0, 2);
    let idx = 0;
    for (let s = 0; s < segs; s++) {
      for (let j = 1; j <= DENSE; j++) {
        const t = j / DENSE;
        const x = this.evalPos(s, t, 0);
        const y = this.evalPos(s, t, 1);
        const z = this.evalPos(s, t, 2);
        cum[idx + 1] = cum[idx] + hyp3(x - px, y - py, z - pz);
        px = x;
        py = y;
        pz = z;
        idx++;
      }
    }
    this.totalLength = cum[idx];
  }

  private scalar(arr: Float32Array, seg: number, t: number): number {
    const n = this.n;
    const i0 = Math.max(seg - 1, 0);
    const i1 = seg;
    const i2 = Math.min(seg + 1, n - 1);
    const i3 = Math.min(seg + 2, n - 1);
    const p0 = arr[i0];
    const p1 = arr[i1];
    const p2 = arr[i2];
    const p3 = arr[i3];
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      0.5 *
      (2 * p1 +
        (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
    );
  }

  /**
   * Write `count` ring samples, uniformly spaced by arc length, into the
   * given arrays starting at ring index `offset`.
   */
  sampleRings(
    count: number,
    offset: number,
    outPos: Float32Array,
    outTan: Float32Array,
    outTwist: Float32Array,
    outWidth: Float32Array,
  ): void {
    const segs = this.n - 1;
    const cum = this.cum;
    const total = this.totalLength;
    const bins = segs * DENSE;
    let d = 0;
    for (let r = 0; r < count; r++) {
      const s = count > 1 ? (r / (count - 1)) * total : 0;
      while (d < bins - 1 && cum[d + 1] < s) d++;
      const span = cum[d + 1] - cum[d];
      const f = span > 1e-9 ? Math.min(Math.max((s - cum[d]) / span, 0), 1) : 0;
      const g = (d + f) / DENSE;
      let seg = Math.floor(g);
      if (seg > segs - 1) seg = segs - 1;
      const t = g - seg;

      const o = (offset + r) * 3;
      let tx = 0;
      let ty = 0;
      let tz = 0;
      for (let a = 0; a < 3; a++) {
        const so = seg * 12 + a;
        const c = this.coef;
        const c1 = c[so + 3];
        const c2 = c[so + 6];
        const c3 = c[so + 9];
        outPos[o + a] = c[so] + t * (c1 + t * (c2 + t * c3));
        const dv = c1 + t * (2 * c2 + t * 3 * c3);
        if (a === 0) tx = dv;
        else if (a === 1) ty = dv;
        else tz = dv;
      }
      const len = hyp3(tx, ty, tz) || 1;
      outTan[o] = tx / len;
      outTan[o + 1] = ty / len;
      outTan[o + 2] = tz / len;
      outTwist[offset + r] = this.scalar(this.ctrlTwist, seg, t);
      outWidth[offset + r] = this.scalar(this.ctrlWidth, seg, t);
    }
  }
}

/**
 * Double-reflection rotation-minimising frames along `count` rings starting at
 * `offset` (Wang et al. 2008): writes the untwisted transported normal into
 * `outN0`. `seed` is the initial normal hint (e.g. towards the camera).
 *
 * `from` > 0 resumes the propagation at ring `from`, assuming `outN0` is valid
 * for ring `from - 1` and positions / tangents before `from` did not change
 * (used by the path relaxation, which only edits a window of rings).
 */
export function transportFrames(
  count: number,
  offset: number,
  pos: Float32Array,
  tan: Float32Array,
  outN0: Float32Array,
  seedX: number,
  seedY: number,
  seedZ: number,
  from = 0,
): void {
  let o = offset * 3;
  let tx = tan[o];
  let ty = tan[o + 1];
  let tz = tan[o + 2];
  let nx: number;
  let ny: number;
  let nz: number;
  if (from > 0) {
    const po = (offset + from - 1) * 3;
    nx = outN0[po];
    ny = outN0[po + 1];
    nz = outN0[po + 2];
  } else {
    // initial normal: seed projected perpendicular to T0
    let d = seedX * tx + seedY * ty + seedZ * tz;
    nx = seedX - tx * d;
    ny = seedY - ty * d;
    nz = seedZ - tz * d;
    let nl = hyp3(nx, ny, nz);
    if (nl < 1e-3) {
      // seed parallel to tangent: pick another axis
      d = ty;
      nx = -tx * d;
      ny = 1 - ty * d;
      nz = -tz * d;
      nl = hyp3(nx, ny, nz);
    }
    nx /= nl;
    ny /= nl;
    nz /= nl;
  }

  for (let i = from; i < count; i++) {
    o = (offset + i) * 3;
    tx = tan[o];
    ty = tan[o + 1];
    tz = tan[o + 2];

    if (i > 0) {
      // double reflection: carry (n) from ring i-1 to ring i
      const po = o - 3;
      const vx = pos[o] - pos[po];
      const vy = pos[o + 1] - pos[po + 1];
      const vz = pos[o + 2] - pos[po + 2];
      const c1 = vx * vx + vy * vy + vz * vz;
      if (c1 > 1e-12) {
        const ptx = tan[po];
        const pty = tan[po + 1];
        const ptz = tan[po + 2];
        const k1 = (2 / c1) * (vx * nx + vy * ny + vz * nz);
        const rlx = nx - k1 * vx;
        const rly = ny - k1 * vy;
        const rlz = nz - k1 * vz;
        const k2 = (2 / c1) * (vx * ptx + vy * pty + vz * ptz);
        const tlx = ptx - k2 * vx;
        const tly = pty - k2 * vy;
        const tlz = ptz - k2 * vz;
        const v2x = tx - tlx;
        const v2y = ty - tly;
        const v2z = tz - tlz;
        const c2 = v2x * v2x + v2y * v2y + v2z * v2z;
        if (c2 > 1e-14) {
          const k3 = (2 / c2) * (v2x * rlx + v2y * rly + v2z * rlz);
          nx = rlx - k3 * v2x;
          ny = rly - k3 * v2y;
          nz = rlz - k3 * v2z;
        } else {
          nx = rlx;
          ny = rly;
          nz = rlz;
        }
        // re-orthonormalise against T to kill numeric drift
        const dd = nx * tx + ny * ty + nz * tz;
        nx -= tx * dd;
        ny -= ty * dd;
        nz -= tz * dd;
        const l = hyp3(nx, ny, nz) || 1;
        nx /= l;
        ny /= l;
        nz /= l;
      }
    }
    outN0[o] = nx;
    outN0[o + 1] = ny;
    outN0[o + 2] = nz;
  }
}

/**
 * Apply the twist about the tangent to the transported normals: writes the face
 * normal N and the width direction B (= T x N) for rings `from..count-1`.
 * `cosT` / `sinT` are the per-ring twist cos / sin (indexed like the rings).
 */
export function twistFrames(
  from: number,
  count: number,
  offset: number,
  tan: Float32Array,
  n0: Float32Array,
  cosT: Float32Array,
  sinT: Float32Array,
  outN: Float32Array,
  outB: Float32Array,
): void {
  for (let i = from; i < count; i++) {
    const o = (offset + i) * 3;
    const tx = tan[o];
    const ty = tan[o + 1];
    const tz = tan[o + 2];
    const nx = n0[o];
    const ny = n0[o + 1];
    const nz = n0[o + 2];
    // B0 = T x N0
    const bx = ty * nz - tz * ny;
    const by = tz * nx - tx * nz;
    const bz = tx * ny - ty * nx;
    const cs = cosT[offset + i];
    const sn = sinT[offset + i];
    outN[o] = nx * cs + bx * sn;
    outN[o + 1] = ny * cs + by * sn;
    outN[o + 2] = nz * cs + bz * sn;
    outB[o] = -nx * sn + bx * cs;
    outB[o + 1] = -ny * sn + by * cs;
    outB[o + 2] = -nz * sn + bz * cs;
  }
}

/** how the band is oriented along the curve before the per-point roll (`twist`) is applied */
export type FrameMode = "rmf" | "curvature";

export interface CurvatureFrameOptions {
  /** ribbon width, world px (all the other lengths are relative to it) */
  width: number;
  /** arc length over which the curvature vector is smoothed, in widths */
  smooth: number;
  /** radius of curvature (in widths) below which the band follows the curvature fully ... */
  radiusFull: number;
  /** ... and above which it stops following (it then keeps its roll: a rotation-minimising frame) */
  radiusNone: number;
  /** fastest roll of the frame relative to the rotation-minimising one, radians per width of arc length */
  maxRate: number;
  /** fastest change of the authored per-point roll (`twist`), radians per width of arc length (see `limitTwistRate`) */
  twistRate: number;
  /**
   * arc length (in widths) over which the finished roll is low-passed (a zero-phase triangular filter: half
   * width on either side). The roll follows its target at a limited rate and REVERSES where its nearest
   * branch flips; either leaves a corner in theta(s) that shows as a notch on the band edge. The low-pass
   * rounds those corners without changing which way (which face) the band rolls.
   */
  rollSmooth: number;
}

export const DEFAULT_CURVATURE_FRAME: CurvatureFrameOptions = {
  width: 110,
  smooth: 1.2,
  radiusFull: 4,
  radiusNone: 16,
  maxRate: 0.8,
  twistRate: 1.5,
  rollSmooth: 0.5,
};

const wrapHalfPi = (a: number): number => {
  // reduce to (-pi/2, pi/2]: the band is the same with N or -N, we pick the branch nearest the previous ring
  const r = a - Math.PI * Math.round(a / Math.PI);
  return r;
};

/**
 * Curvature-following frames. The face normal N points to the centre of curvature,
 * so a loop wraps like a bracelet (the width runs along the loop's axis) and the
 * dark inner face shows inside it.
 *
 * Built on top of the rotation-minimising frame (RMF): the result is the RMF rolled
 * about the tangent by an angle theta(s). theta follows the angle of the (smoothed)
 * principal normal where the curve is clearly bent, and is held where it is nearly
 * straight (weight -> 0: a plain RMF, which is continuous by construction). The
 * principal normal is only defined up to sign at inflections, so the branch (N or -N)
 * nearest the previous ring is taken: the frame never flips. theta changes at most
 * `maxRate` per width of arc length, so the band can never pinch or whip.
 *
 * Writes the UNTWISTED normals into `outN0` (same contract as `transportFrames`):
 * `twistFrames` then applies the per-point roll as an offset on top of it.
 */
export class CurvatureFramer {
  private cap = 0;
  private kv = new Float32Array(0);
  private tmp = new Float32Array(0);
  private pre = new Float64Array(0);
  private th = new Float32Array(0);
  private th2 = new Float32Array(0);

  private ensure(m: number): void {
    if (this.cap >= m) return;
    this.cap = m;
    this.th = new Float32Array(m);
    this.th2 = new Float32Array(m);
    this.kv = new Float32Array(m * 3);
    this.tmp = new Float32Array(m * 3);
    this.pre = new Float64Array((m + 1) * 3);
  }

  /** box blur of a 3-vector per ring (clamped window +-h) */
  private blur(src: Float32Array, dst: Float32Array, m: number, h: number): void {
    const p = this.pre;
    p[0] = p[1] = p[2] = 0;
    for (let i = 0; i < m; i++) {
      p[(i + 1) * 3] = p[i * 3] + src[i * 3];
      p[(i + 1) * 3 + 1] = p[i * 3 + 1] + src[i * 3 + 1];
      p[(i + 1) * 3 + 2] = p[i * 3 + 2] + src[i * 3 + 2];
    }
    for (let i = 0; i < m; i++) {
      const lo = Math.max(0, i - h);
      const hi = Math.min(m - 1, i + h);
      const c = hi - lo + 1;
      dst[i * 3] = (p[(hi + 1) * 3] - p[lo * 3]) / c;
      dst[i * 3 + 1] = (p[(hi + 1) * 3 + 1] - p[lo * 3 + 1]) / c;
      dst[i * 3 + 2] = (p[(hi + 1) * 3 + 2] - p[lo * 3 + 2]) / c;
    }
  }

  compute(
    count: number,
    offset: number,
    pos: Float32Array,
    tan: Float32Array,
    outN0: Float32Array,
    seed: [number, number, number],
    opts: CurvatureFrameOptions,
    /**
     * Where a fold takes over the frame: per body ring a 0..1 weight and the band normal wanted there
     * (xyz triples; only its direction up to sign matters). The roll is steered to that normal instead of
     * following the curvature (a fold lies IN the plane of its turn, a bracelet bend stands across it).
     */
    ov?: { w: ArrayLike<number>; n: ArrayLike<number> } | null,
  ): void {
    // 1. the rotation-minimising frame (also the fallback where the curve is straight)
    transportFrames(count, offset, pos, tan, outN0, seed[0], seed[1], seed[2]);
    if (count < 4) return;
    this.ensure(count);
    const kv = this.kv;
    const tmp = this.tmp;

    // 2. curvature vector dT/ds (central differences), mean ring spacing
    let total = 0;
    for (let i = 1; i < count; i++) {
      const a = (offset + i - 1) * 3;
      const b = (offset + i) * 3;
      total += hyp3(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]);
    }
    const ds = Math.max(total / (count - 1), 1e-6);
    for (let i = 0; i < count; i++) {
      const a = (offset + Math.max(i - 1, 0)) * 3;
      const b = (offset + Math.min(i + 1, count - 1)) * 3;
      const span = Math.max(Math.min(i + 1, count - 1) - Math.max(i - 1, 0), 1) * ds;
      kv[i * 3] = (tan[b] - tan[a]) / span;
      kv[i * 3 + 1] = (tan[b + 1] - tan[a + 1]) / span;
      kv[i * 3 + 2] = (tan[b + 2] - tan[a + 2]) / span;
    }
    // 3. smooth the VECTOR (not the direction): through an inflection it passes
    // through zero, which is exactly where the weight below drops out
    const h = Math.max(1, Math.round((opts.smooth * opts.width) / (2 * ds)));
    this.blur(kv, tmp, count, h);
    this.blur(tmp, kv, count, h);

    // 4. roll theta relative to the RMF
    const W = opts.width;
    const r0 = opts.radiusFull * W;
    const r1 = Math.max(opts.radiusNone * W, r0 + 1);
    const maxStep = (opts.maxRate * ds) / W;
    let theta = 0;
    const thArr = this.th;
    for (let i = 0; i < count; i++) {
      const o = (offset + i) * 3;
      const tx = tan[o];
      const ty = tan[o + 1];
      const tz = tan[o + 2];
      let kx = kv[i * 3];
      let ky = kv[i * 3 + 1];
      let kz = kv[i * 3 + 2];
      const kd = kx * tx + ky * ty + kz * tz;
      kx -= kd * tx;
      ky -= kd * ty;
      kz -= kd * tz;
      const m = hyp3(kx, ky, kz);
      const ow = ov ? ov.w[i] : 0;
      let wC = 0;
      let aC = 0;
      const nrx = outN0[o];
      const nry = outN0[o + 1];
      const nrz = outN0[o + 2];
      // B_r = T x N_r
      const bx = ty * nrz - tz * nry;
      const by = tz * nrx - tx * nrz;
      const bz = tx * nry - ty * nrx;
      if (m > 1e-9) {
        const R = 1 / m;
        const f = Math.min(Math.max((R - r0) / (r1 - r0), 0), 1);
        wC = 1 - f * f * (3 - 2 * f);
        aC = Math.atan2((kx * bx + ky * by + kz * bz) / m, (kx * nrx + ky * nry + kz * nrz) / m);
      }
      if (ow > 1e-3 && ov) {
        const q = i * 3;
        const a0 = Math.atan2(
          ov.n[q] * bx + ov.n[q + 1] * by + ov.n[q + 2] * bz,
          ov.n[q] * nrx + ov.n[q + 1] * nry + ov.n[q + 2] * nrz,
        );
        // blend the two target angles (shortest way, modulo pi)
        const aT = wC > 1e-3 ? aC + ow * wrapHalfPi(a0 - aC) : a0;
        const wE = wC * (1 - ow) + ow;
        let d = wrapHalfPi(aT - theta) * wE;
        if (d > maxStep) d = maxStep;
        else if (d < -maxStep) d = -maxStep;
        theta += d;
      } else if (wC > 1e-3) {
        let d = wrapHalfPi(aC - theta) * wC;
        if (d > maxStep) d = maxStep;
        else if (d < -maxStep) d = -maxStep;
        theta += d;
      }
      thArr[i] = theta;
    }

    // 5. low-pass the roll along the arc (zero phase: two box passes = a triangular kernel), then apply it
    const hs = Math.round((opts.rollSmooth * opts.width) / (2 * ds));
    if (hs >= 1) {
      this.boxSmooth(thArr, this.th2, count, hs);
      this.boxSmooth(this.th2, thArr, count, hs);
    }
    for (let i = 0; i < count; i++) {
      const th = thArr[i];
      if (th === 0) continue;
      const o = (offset + i) * 3;
      const tx = tan[o];
      const ty = tan[o + 1];
      const tz = tan[o + 2];
      const nx = outN0[o];
      const ny = outN0[o + 1];
      const nz = outN0[o + 2];
      const bx = ty * nz - tz * ny;
      const by = tz * nx - tx * nz;
      const bz = tx * ny - ty * nx;
      const c = Math.cos(th);
      const s = Math.sin(th);
      outN0[o] = nx * c + bx * s;
      outN0[o + 1] = ny * c + by * s;
      outN0[o + 2] = nz * c + bz * s;
    }
  }

  /** box blur of a scalar per ring (prefix sums); the window shrinks symmetrically at the ends, so an end keeps its value */
  private boxSmooth(src: Float32Array, dst: Float32Array, m: number, h: number): void {
    const p = this.pre;
    p[0] = 0;
    for (let i = 0; i < m; i++) p[i + 1] = p[i] + src[i];
    for (let i = 0; i < m; i++) {
      const k = Math.min(h, i, m - 1 - i);
      dst[i] = (p[i + k + 1] - p[i - k]) / (2 * k + 1);
    }
  }
}

/**
 * Bound the rate of change of the per-ring twist (radians per px of arc length) so a roll
 * authored over a short stretch becomes a gentle half-twist instead of a pinch. A forward and
 * a backward slew-limited pass are averaged (transitions are centred on where they were
 * authored and never overshoot). `ds` is the ring spacing in px.
 */
export function limitTwistRate(
  tw: Float32Array,
  count: number,
  offset: number,
  ds: number,
  maxPerPx: number,
  scratch: Float32Array,
): void {
  const step = maxPerPx * ds;
  if (!(step > 0) || count < 2) return;
  // forward
  let f = tw[offset];
  scratch[0] = f;
  for (let i = 1; i < count; i++) {
    const t = tw[offset + i];
    f = f + Math.min(Math.max(t - f, -step), step);
    scratch[i] = f;
  }
  // backward
  let b = tw[offset + count - 1];
  for (let i = count - 2; i >= 0; i--) {
    const t = tw[offset + i];
    b = b + Math.min(Math.max(t - b, -step), step);
    tw[offset + i] = 0.5 * (scratch[i] + b);
  }
}
