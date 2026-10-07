/**
 * Slide motion: the resolved ruled pose is a FIXED PATH; the ribbon is a window of constant arc length that
 * slides along it. Nothing deforms: the output rings are the path's own rings, only re-picked.
 *
 * Path: the pose's control rings (L/R edge points, world px) plus a straight extension of 1.5 x the strip
 * length beyond End 1 (ring 0) and beyond End 2 (ring n-1), along the end tangents (the ruling and half
 * width are carried, so the frame continues smoothly). Parametrised by the arc length `a` of the centreline
 * (L+R)/2 with a = 0 at ring 0, a = Ltot at ring n-1; End 1 side is a < 0. L and R are Catmull-Rom
 * interpolated separately, baked once into a fine uniform-arc table.
 *
 * Window: offset `sigma` (world px). Ring k sits at path arc  a = -sigma + Ltot * (k / (n-1))  in the
 * control-weight metric (see below). sigma = 0 is exactly the pose; sigma > 0 slides toward and past End 1
 * (End 1 leads); sigma < 0 is the ribbon sitting on the End 2 extension. The ring count stays n.
 *
 * Ring placement is uniform in a weight (arc + turning x width), not in pure arc length, so hairpins keep
 * their control density wherever they are in the window (the pose resolver places its rings the same way).
 *
 * Framework-agnostic: no DOM. The sim feeds `scrollY` in.
 */

export interface SlideParams {
  /** the intro: the ribbon enters from the hidden end (End 2 extension) and slides into the pose */
  intro: boolean;
  /** after the intro, sigma follows scrollState.y x scrollK */
  scroll: boolean;
  /** intro spring stiffness (1/s^2) */
  introStiffness: number;
  /** intro damping ratio (1 = critical; 0.63 is about 8% overshoot) */
  introDamping: number;
  /** hard cap (s): not settled by then -> snap to the pose */
  introMaxSeconds: number;
  /** world px of slide per css px of scroll */
  scrollK: number;
  scrollStiffness: number;
  scrollDamping: number;
  /** rigid idle sway: peak rotation about z in degrees (0 = off); period swayPeriod seconds */
  swayDeg: number;
  swayPeriod: number;
}

export const DEFAULT_SLIDE_PARAMS: SlideParams = {
  intro: true,
  scroll: true,
  introStiffness: 32,
  introDamping: 0.63,
  introMaxSeconds: 4,
  scrollK: 1,
  scrollStiffness: 40,
  scrollDamping: 0.6,
  swayDeg: 0.3,
  swayPeriod: 7,
};

const EXT_FACTOR = 1.5;
const FINE_PER_RING = 6;
const SUBSTEPS = 4;
const TURN_WEIGHT = 6; // matches the resolver: 3 * turn * (2 * halfWidth)

export class SlideMotion {
  readonly count: number;
  params: SlideParams = { ...DEFAULT_SLIDE_PARAMS };

  /** window offset along the path, world px (see header) */
  sigma = 0;
  velocity = 0;
  /** strip length (world px) = arc length of the pose's centreline */
  length = 0;
  introSettled = false;
  /** the sway angle (radians) applied last frame, for debugging */
  swayAngle = 0;
  /** true while sigma still moves (the engine keeps rendering at full rate) */
  get animating(): boolean {
    return this.ready && (!this.introSettled || Math.abs(this.velocity) > 0.05 || Math.abs(this.sigma - this.target) > 0.05);
  }

  readonly outPos: Float32Array;
  /** per ring: bx, by, bz, half width */
  readonly outRuled: Float32Array;
  ready = false;

  private target = 0;
  private introT = 0;
  private time = 0;
  private settledAt = -1;
  private listeners = new Set<() => void>();

  // the fine path table
  private fn = 0;
  private fL = new Float32Array(0);
  private fR = new Float32Array(0);
  private fW = new Float64Array(0);
  private fa0 = 0; // arc of fine sample 0 (negative)
  private fds = 1;
  private pivotX = 0;
  private pivotY = 0;
  // the pose itself (for sigma = 0 pass-through)
  private poseCtr: Float32Array;
  private poseRuled: Float32Array;

  constructor(count: number) {
    this.count = count;
    this.outPos = new Float32Array(count * 3);
    this.outRuled = new Float32Array(count * 4);
    this.poseCtr = new Float32Array(count * 3);
    this.poseRuled = new Float32Array(count * 4);
  }

  /** `onIntroSettled`: fires once (immediately if it already has); returns an unsubscribe. */
  onIntroSettled(cb: () => void): () => void {
    if (this.introSettled) {
      cb();
      return () => {};
    }
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** a promise that resolves when the intro has settled (or was skipped) */
  whenIntroSettled(): Promise<void> {
    return new Promise((res) => this.onIntroSettled(res));
  }

  /** (re)build the path from the pose's control points (centres) and ruling data. Restarts the intro. */
  setPath(pos: Float32Array, ruledData: Float32Array, n = this.count): boolean {
    if (n !== this.count || n < 3 || ruledData.length < n * 4) {
      this.ready = false;
      return false;
    }
    this.poseCtr.set(pos.subarray(0, n * 3));
    this.poseRuled.set(ruledData.subarray(0, n * 4));
    // L/R of the pose rings
    const m = Math.ceil(EXT_FACTOR * (n - 1)) + 1; // extension rings per side
    const D = m + n + m;
    const L = new Float64Array(D * 3);
    const R = new Float64Array(D * 3);
    for (let i = 0; i < n; i++) {
      const bx = ruledData[i * 4], by = ruledData[i * 4 + 1], bz = ruledData[i * 4 + 2], hw = ruledData[i * 4 + 3];
      const o = (m + i) * 3;
      L[o] = pos[i * 3] - bx * hw;
      L[o + 1] = pos[i * 3 + 1] - by * hw;
      L[o + 2] = pos[i * 3 + 2] - bz * hw;
      R[o] = pos[i * 3] + bx * hw;
      R[o + 1] = pos[i * 3 + 1] + by * hw;
      R[o + 2] = pos[i * 3 + 2] + bz * hw;
    }
    // pose arc length (chords) and mean ring spacing
    let Ltot = 0;
    for (let i = 1; i < n; i++) {
      Ltot += Math.hypot(pos[i * 3] - pos[i * 3 - 3], pos[i * 3 + 1] - pos[i * 3 - 2], pos[i * 3 + 2] - pos[i * 3 - 1]);
    }
    if (!(Ltot > 1e-3)) {
      this.ready = false;
      return false;
    }
    this.length = Ltot;
    const dsExt = Ltot / (n - 1);
    // end tangents (outward)
    const tan = (a: number, b: number, out: number[]) => {
      let x = pos[a * 3] - pos[b * 3], y = pos[a * 3 + 1] - pos[b * 3 + 1], z = pos[a * 3 + 2] - pos[b * 3 + 2];
      const l = Math.hypot(x, y, z) || 1;
      x /= l; y /= l; z /= l;
      out[0] = x; out[1] = y; out[2] = z;
    };
    const t1 = [0, 0, 0];
    const t2 = [0, 0, 0];
    tan(0, 2, t1);
    tan(n - 1, n - 3, t2);
    for (let j = 1; j <= m; j++) {
      const oa = (m - j) * 3; // before ring 0
      const ob = (m + n - 1 + j) * 3; // after ring n-1
      for (let a = 0; a < 3; a++) {
        L[oa + a] = L[m * 3 + a] + t1[a] * dsExt * j;
        R[oa + a] = R[m * 3 + a] + t1[a] * dsExt * j;
        L[ob + a] = L[(m + n - 1) * 3 + a] + t2[a] * dsExt * j;
        R[ob + a] = R[(m + n - 1) * 3 + a] + t2[a] * dsExt * j;
      }
    }
    // cumulative centreline chord arc over the whole list
    const cum = new Float64Array(D);
    for (let i = 1; i < D; i++) {
      cum[i] =
        cum[i - 1] +
        Math.hypot(
          (L[i * 3] + R[i * 3] - L[i * 3 - 3] - R[i * 3 - 3]) / 2,
          (L[i * 3 + 1] + R[i * 3 + 1] - L[i * 3 - 2] - R[i * 3 - 2]) / 2,
          (L[i * 3 + 2] + R[i * 3 + 2] - L[i * 3 - 1] - R[i * 3 - 1]) / 2,
        );
    }
    const aPose0 = cum[m];
    // fine table over arcs [aMin, aMax] (relative to ring 0)
    const aStart = -aPose0; // arc of dense ring 0 relative to pose ring 0
    const aEnd = cum[D - 1] - aPose0;
    const fds = (Ltot / (n - 1)) / FINE_PER_RING;
    const fn = Math.floor((aEnd - aStart) / fds) + 1;
    this.fn = fn;
    this.fds = fds;
    this.fa0 = aStart;
    this.fL = new Float32Array(fn * 3);
    this.fR = new Float32Array(fn * 3);
    this.fW = new Float64Array(fn);
    let seg = 0;
    for (let j = 0; j < fn; j++) {
      const arc = Math.min(j * fds, aEnd - aStart); // relative to dense ring 0
      while (seg < D - 2 && cum[seg + 1] < arc) seg++;
      const span = cum[seg + 1] - cum[seg] || 1;
      const f = Math.min(Math.max((arc - cum[seg]) / span, 0), 1);
      const i0 = Math.max(seg - 1, 0), i1 = seg, i2 = seg + 1, i3 = Math.min(seg + 2, D - 1);
      for (let a = 0; a < 3; a++) {
        this.fL[j * 3 + a] = catmull(L[i0 * 3 + a], L[i1 * 3 + a], L[i2 * 3 + a], L[i3 * 3 + a], f);
        this.fR[j * 3 + a] = catmull(R[i0 * 3 + a], R[i1 * 3 + a], R[i2 * 3 + a], R[i3 * 3 + a], f);
      }
    }
    // weight: arc + turning x width
    let px = 0, py = 0, pz = 0;
    let pdx = 0, pdy = 0, pdz = 0;
    for (let j = 0; j < fn; j++) {
      const cx = (this.fL[j * 3] + this.fR[j * 3]) / 2;
      const cy = (this.fL[j * 3 + 1] + this.fR[j * 3 + 1]) / 2;
      const cz = (this.fL[j * 3 + 2] + this.fR[j * 3 + 2]) / 2;
      if (j === 0) {
        this.fW[0] = 0;
      } else {
        const dx = cx - px, dy = cy - py, dz = cz - pz;
        const d = Math.hypot(dx, dy, dz);
        let turn = 0;
        if (j >= 2 && d > 1e-9) {
          const pl = Math.hypot(pdx, pdy, pdz) || 1;
          const dot = (pdx * dx + pdy * dy + pdz * dz) / (pl * d);
          turn = Math.acos(Math.min(Math.max(dot, -1), 1));
        }
        const hw = Math.hypot(
          this.fR[j * 3] - this.fL[j * 3],
          this.fR[j * 3 + 1] - this.fL[j * 3 + 1],
          this.fR[j * 3 + 2] - this.fL[j * 3 + 2],
        ) / 2;
        this.fW[j] = this.fW[j - 1] + d + TURN_WEIGHT * turn * hw;
        pdx = dx; pdy = dy; pdz = dz;
      }
      px = cx; py = cy; pz = cz;
    }
    // rigid sway pivot: the pose centroid (xy)
    let sx = 0, sy = 0;
    for (let i = 0; i < n; i++) {
      sx += pos[i * 3];
      sy += pos[i * 3 + 1];
    }
    this.pivotX = sx / n;
    this.pivotY = sy / n;
    // a rebuild for a changed layout (resize, font load) keeps the motion state; only the first build starts the intro
    const first = !this.ready;
    this.ready = true;
    if (first) this.restart();
    else this.sigma = Math.min(Math.max(this.sigma, -EXT_FACTOR * Ltot), EXT_FACTOR * Ltot);
    return true;
  }

  /** restart the clock and the intro (a new pose, a mode switch) */
  restart(): void {
    this.time = 0;
    this.introT = 0;
    this.velocity = 0;
    this.settledAt = -1;
    this.swayAngle = 0;
    this.introSettled = false;
    this.sigma = this.params.intro ? -this.length : 0;
    this.target = 0;
  }

  private settle(): void {
    if (this.introSettled) return;
    this.introSettled = true;
    this.settledAt = this.time;
    for (const cb of [...this.listeners]) {
      try {
        cb();
      } catch {
        /* a listener must never break the sim */
      }
    }
    this.listeners.clear();
  }

  /**
   * Advance by dt (s). `scrollY` css px; `reduced`: reduced motion (sigma = 0, no intro, no sway).
   * Writes outPos / outRuled.
   */
  step(dtRaw: number, scrollY: number, reduced: boolean): void {
    if (!this.ready) return;
    const p = this.params;
    const dt = Math.min(Math.max(dtRaw, 0), 0.1); // wall-clock-true even at low frame rates (the spring is sub-stepped)
    this.time += dt;
    if (reduced) {
      this.sigma = 0;
      this.velocity = 0;
      this.target = 0;
      this.settle();
      this.compose(0);
      return;
    }
    if (!this.introSettled) {
      if (!p.intro) {
        this.settle();
      } else {
        this.introT += dt;
        this.target = 0;
        this.integrate(dt, p.introStiffness, p.introDamping);
        const eps = Math.max(1, this.length * 0.0006);
        if (Math.abs(this.sigma) < eps && Math.abs(this.velocity) < eps * 4) {
          this.sigma = 0;
          this.velocity = 0;
          this.settle();
        } else if (this.introT >= p.introMaxSeconds) {
          this.sigma = 0;
          this.velocity = 0;
          this.settle();
        }
      }
    }
    if (this.introSettled) {
      this.target = p.scroll ? scrollY * p.scrollK : 0;
      this.integrate(dt, p.scrollStiffness, p.scrollDamping);
    }
    let sway = 0;
    if (this.introSettled && p.swayDeg > 0) {
      const ramp = Math.min(1, (this.time - this.settledAt) / 1.5);
      sway = ((p.swayDeg * Math.PI) / 180) * ramp * ramp * (3 - 2 * ramp) * Math.sin((2 * Math.PI * this.time) / p.swayPeriod);
    }
    this.compose(sway);
  }

  private integrate(dt: number, stiffness: number, ratio: number): void {
    const k = stiffness;
    const c = 2 * Math.sqrt(k) * ratio;
    const steps = Math.max(SUBSTEPS, Math.ceil(dt / 0.008));
    const h = dt / steps;
    for (let s = 0; s < steps; s++) {
      this.velocity += (k * (this.target - this.sigma) - c * this.velocity) * h;
      this.sigma += this.velocity * h;
    }
    const lim = EXT_FACTOR * this.length;
    if (this.sigma > lim) {
      this.sigma = lim;
      this.velocity = Math.min(this.velocity, 0);
    } else if (this.sigma < -lim) {
      this.sigma = -lim;
      this.velocity = Math.max(this.velocity, 0);
    }
  }

  /** window sigma -> rings (+ optional rigid rotation about z through the pose centroid) */
  private compose(sway: number): void {
    const n = this.count;
    this.swayAngle = sway;
    if (this.sigma === 0) {
      // exactly the pose
      this.outPos.set(this.poseCtr);
      this.outRuled.set(this.poseRuled);
    } else {
      const aS = -this.sigma; // arc of ring 0
      const wAt = (a: number) => this.weightAt((a - this.fa0) / this.fds);
      const w0 = wAt(aS);
      const w1 = wAt(aS + this.length);
      let lo = 0;
      for (let k = 0; k < n; k++) {
        const w = w0 + ((w1 - w0) * k) / (n - 1);
        const fi = this.invWeight(w, lo);
        lo = Math.floor(fi);
        const i0 = Math.min(Math.max(Math.floor(fi), 0), this.fn - 2);
        const f = Math.min(Math.max(fi - i0, 0), 1);
        let lx = 0, ly = 0, lz = 0, rx = 0, ry = 0, rz = 0;
        {
          const a = i0 * 3, b = a + 3;
          lx = this.fL[a] + (this.fL[b] - this.fL[a]) * f;
          ly = this.fL[a + 1] + (this.fL[b + 1] - this.fL[a + 1]) * f;
          lz = this.fL[a + 2] + (this.fL[b + 2] - this.fL[a + 2]) * f;
          rx = this.fR[a] + (this.fR[b] - this.fR[a]) * f;
          ry = this.fR[a + 1] + (this.fR[b + 1] - this.fR[a + 1]) * f;
          rz = this.fR[a + 2] + (this.fR[b + 2] - this.fR[a + 2]) * f;
        }
        const dx = rx - lx, dy = ry - ly, dz = rz - lz;
        const len = Math.hypot(dx, dy, dz) || 1;
        this.outPos[k * 3] = (lx + rx) / 2;
        this.outPos[k * 3 + 1] = (ly + ry) / 2;
        this.outPos[k * 3 + 2] = (lz + rz) / 2;
        this.outRuled[k * 4] = dx / len;
        this.outRuled[k * 4 + 1] = dy / len;
        this.outRuled[k * 4 + 2] = dz / len;
        this.outRuled[k * 4 + 3] = len / 2;
      }
    }
    if (sway !== 0) {
      // a global rigid transform: rotates positions about the pivot and the rulings with them
      const c = Math.cos(sway), s = Math.sin(sway);
      for (let k = 0; k < n; k++) {
        const x = this.outPos[k * 3] - this.pivotX, y = this.outPos[k * 3 + 1] - this.pivotY;
        this.outPos[k * 3] = this.pivotX + x * c - y * s;
        this.outPos[k * 3 + 1] = this.pivotY + x * s + y * c;
        const bx = this.outRuled[k * 4], by = this.outRuled[k * 4 + 1];
        this.outRuled[k * 4] = bx * c - by * s;
        this.outRuled[k * 4 + 1] = bx * s + by * c;
      }
    }
  }

  private weightAt(fi: number): number {
    const i = Math.min(Math.max(Math.floor(fi), 0), this.fn - 2);
    const f = fi - i;
    return this.fW[i] + (this.fW[i + 1] - this.fW[i]) * f;
  }

  /** fractional fine index whose weight is w (monotone table; `from` is a lower bound hint) */
  private invWeight(w: number, from: number): number {
    const W = this.fW;
    let lo = Math.max(0, Math.min(from, this.fn - 2));
    // the hint is valid only when the table at `lo` is <= w
    if (W[lo] > w) lo = 0;
    let hi = this.fn - 1;
    if (w >= W[hi]) return hi;
    if (w <= W[lo]) return lo;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (W[mid] <= w) lo = mid;
      else hi = mid;
    }
    const span = W[hi] - W[lo] || 1;
    return lo + (w - W[lo]) / span;
  }
}

/** uniform Catmull-Rom (tension 0.5) */
function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
