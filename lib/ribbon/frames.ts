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
  ): void {
    if (n > this.maxN) throw new Error("RibbonCurve: too many control points");
    this.n = n;
    this.ctrlPos.set(pos.subarray(0, n * 3));
    this.ctrlTwist.set(twist.subarray(0, n));
    this.ctrlWidth.set(width.subarray(0, n));
    this.buildCoefficients();
    this.buildTable();
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
      const dt0 = Math.max(Math.sqrt(Math.hypot(dx01, dy01, dz01)), EPS);
      const dt1 = Math.max(Math.sqrt(Math.hypot(dx12, dy12, dz12)), EPS);
      const dt2 = Math.max(Math.sqrt(Math.hypot(dx23, dy23, dz23)), EPS);

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
        cum[idx + 1] = cum[idx] + Math.hypot(x - px, y - py, z - pz);
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
      const len = Math.hypot(tx, ty, tz) || 1;
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
 * `offset`, then twist about the tangent. Writes the face normal N and the
 * width direction B (= T x N) into outN / outB.
 *
 * `seed` is the initial normal hint (e.g. towards the camera).
 */
export function computeFrames(
  count: number,
  offset: number,
  pos: Float32Array,
  tan: Float32Array,
  twist: Float32Array,
  outN: Float32Array,
  outB: Float32Array,
  seedX: number,
  seedY: number,
  seedZ: number,
): void {
  // initial normal: seed projected perpendicular to T0
  let o = offset * 3;
  let tx = tan[o];
  let ty = tan[o + 1];
  let tz = tan[o + 2];
  let d = seedX * tx + seedY * ty + seedZ * tz;
  let nx = seedX - tx * d;
  let ny = seedY - ty * d;
  let nz = seedZ - tz * d;
  let nl = Math.hypot(nx, ny, nz);
  if (nl < 1e-3) {
    // seed parallel to tangent: pick another axis
    d = ty;
    nx = -tx * d;
    ny = 1 - ty * d;
    nz = -tz * d;
    nl = Math.hypot(nx, ny, nz);
  }
  nx /= nl;
  ny /= nl;
  nz /= nl;

  for (let i = 0; i < count; i++) {
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
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l;
        ny /= l;
        nz /= l;
      }
    }

    // B = T x N
    const bx = ty * nz - tz * ny;
    const by = tz * nx - tx * nz;
    const bz = tx * ny - ty * nx;

    const th = twist[offset + i];
    const cs = Math.cos(th);
    const sn = Math.sin(th);
    outN[o] = nx * cs + bx * sn;
    outN[o + 1] = ny * cs + by * sn;
    outN[o + 2] = nz * cs + bz * sn;
    outB[o] = -nx * sn + bx * cs;
    outB[o + 1] = -ny * sn + by * cs;
    outB[o + 2] = -nz * sn + bz * cs;
  }
}
