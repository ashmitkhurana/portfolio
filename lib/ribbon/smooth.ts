/**
 * Smoothness check of a swept strip: no crinkles. The mockup is made of long, calm curves, so any
 * high-frequency oscillation of the centreline's curvature or of the strip's roll (torsion) along
 * the arc is a bug (or a pose with too many wobbly control points).
 *
 *   curvature  kappa_i  = |T(i+1) - T(i-1)| / |P(i+1) - P(i-1)|
 *   roll       phi_i    = angle of the strip normal about the tangent, relative to a rotation-minimising frame
 *
 * A crinkle is an OSCILLATION: the signal reverses direction again and again within a couple of widths.
 * A single tight bend is a calm peak and fine. So the metric counts reversals (zig-zag filtered, so noise
 * below the hysteresis does not count) inside any window of `windowWidths` widths: a clean strip has at most
 * two or three (the peak of one bend and its shoulders), a crumpled one has many.
 * Fold zones are skipped (they are built, not authored).
 */

export interface SmoothnessInput {
  /** body ring count, offset of the first body ring in the arrays */
  M: number;
  E: number;
  /** mean ring spacing (px) and the ribbon width (px) */
  ds: number;
  width: number;
  pos: ArrayLike<number>;
  tan: ArrayLike<number>;
  N: ArrayLike<number>;
  /** 1 inside a fold zone (skipped), indexed by body ring */
  skip?: ArrayLike<number> | null;
}

export interface SmoothnessReport {
  /** most curvature reversals (swings larger than 0.3 / width) inside any 3-width window */
  curvature: number;
  /** most roll reversals (swings larger than 0.3 rad) inside any 3-width window */
  roll: number;
  /** largest roll rate (radians per ribbon width of arc) */
  rollRate: number;
  /** body ring indices where those peak */
  curvatureAt: number;
  rollAt: number;
  rateAt: number;
  ok: boolean;
}

/** limits used by the editor and the QA script */
export const SMOOTH_LIMITS = { curvature: 4, roll: 2, rollRate: 1.6 };

/** number of zig-zag extrema (reversals >= h) of `sig` inside the busiest window of `win` rings; also where */
function busiestWindow(sig: Float32Array, M: number, h: number, win: number, skip: ArrayLike<number> | null | undefined): { n: number; at: number } {
  const ext: number[] = [];
  let dir = 0;
  let last = sig[0];
  let lastIdx = 0;
  for (let i = 1; i < M; i++) {
    const v = sig[i];
    if (dir >= 0 && v < last - h) {
      if (dir > 0) ext.push(lastIdx);
      dir = -1;
      last = v;
      lastIdx = i;
    } else if (dir <= 0 && v > last + h) {
      if (dir < 0) ext.push(lastIdx);
      dir = 1;
      last = v;
      lastIdx = i;
    } else if ((dir >= 0 && v > last) || (dir <= 0 && v < last) || dir === 0) {
      if (dir === 0) dir = v > last ? 1 : v < last ? -1 : 0;
      last = v;
      lastIdx = i;
    }
  }
  let best = 0;
  let at = 0;
  let j = 0;
  const e = ext.filter((i) => !(skip && skip[i]));
  for (let i = 0; i < e.length; i++) {
    while (e[i] - e[j] > win) j++;
    const n = i - j + 1;
    if (n > best) {
      best = n;
      at = e[i];
    }
  }
  return { n: best, at };
}

export function smoothness(g: SmoothnessInput, windowWidths = 3): SmoothnessReport {
  const { M, E, pos, tan, N } = g;
  const ds = Math.max(g.ds, 1e-6);
  const w = Math.max(2, Math.round((1.2 * g.width) / ds));
  const kappa = new Float32Array(M);
  for (let i = 1; i < M - 1; i++) {
    const a = (E + i - 1) * 3;
    const b = (E + i + 1) * 3;
    const dx = pos[b] - pos[a];
    const dy = pos[b + 1] - pos[a + 1];
    const dz = pos[b + 2] - pos[a + 2];
    const dl = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const tx = tan[b] - tan[a];
    const ty = tan[b + 1] - tan[a + 1];
    const tz = tan[b + 2] - tan[a + 2];
    kappa[i] = Math.sqrt(tx * tx + ty * ty + tz * tz) / dl;
  }
  // roll relative to a rotation-minimising transport of the frame (so a plain turn is not a "roll")
  const phi = new Float32Array(M);
  {
    // reference normal transported by the double reflection (inline, minimal)
    let nx = N[E * 3];
    let ny = N[E * 3 + 1];
    let nz = N[E * 3 + 2];
    for (let i = 1; i < M; i++) {
      const o = (E + i) * 3;
      const p = o - 3;
      const vx = pos[o] - pos[p];
      const vy = pos[o + 1] - pos[p + 1];
      const vz = pos[o + 2] - pos[p + 2];
      const c1 = vx * vx + vy * vy + vz * vz;
      if (c1 > 1e-12) {
        const k1 = (2 / c1) * (vx * nx + vy * ny + vz * nz);
        const rlx = nx - k1 * vx;
        const rly = ny - k1 * vy;
        const rlz = nz - k1 * vz;
        const k2 = (2 / c1) * (vx * tan[p] + vy * tan[p + 1] + vz * tan[p + 2]);
        const tlx = tan[p] - k2 * vx;
        const tly = tan[p + 1] - k2 * vy;
        const tlz = tan[p + 2] - k2 * vz;
        const v2x = tan[o] - tlx;
        const v2y = tan[o + 1] - tly;
        const v2z = tan[o + 2] - tlz;
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
        const d = nx * tan[o] + ny * tan[o + 1] + nz * tan[o + 2];
        nx -= tan[o] * d;
        ny -= tan[o + 1] * d;
        nz -= tan[o + 2] * d;
        const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        nx /= l;
        ny /= l;
        nz /= l;
      }
      // angle of the actual normal relative to the transported one, about T
      const ax = N[o];
      const ay = N[o + 1];
      const az = N[o + 2];
      const c = ax * nx + ay * ny + az * nz;
      const cx = ny * az - nz * ay;
      const cy = nz * ax - nx * az;
      const cz = nx * ay - ny * ax;
      const s = cx * tan[o] + cy * tan[o + 1] + cz * tan[o + 2];
      phi[i] = Math.atan2(s, c);
    }
    // unwrap
    for (let i = 1; i < M; i++) {
      let d = phi[i] - phi[i - 1];
      d -= 2 * Math.PI * Math.round(d / (2 * Math.PI));
      phi[i] = phi[i - 1] + d;
    }
  }
  // light smoothing (+-0.15 width) so ring-level numerical noise is not counted
  const lp = (src: Float32Array, half: number): Float32Array => {
    const out = new Float32Array(M);
    const ps = new Float64Array(M + 1);
    for (let i = 0; i < M; i++) ps[i + 1] = ps[i] + src[i];
    for (let i = 0; i < M; i++) {
      const lo = Math.max(0, i - half);
      const hi = Math.min(M - 1, i + half);
      out[i] = (ps[hi + 1] - ps[lo]) / (hi - lo + 1);
    }
    return out;
  };
  const half = Math.max(1, Math.round((0.15 * g.width) / ds));
  const kw = lp(kappa, half);
  for (let i = 0; i < M; i++) kw[i] *= g.width;
  const pw = lp(phi, half);
  const win = Math.round((windowWidths * g.width) / ds);
  const kb = busiestWindow(kw, M, 0.3, win, g.skip);
  const pb = busiestWindow(pw, M, 0.3, win, g.skip);
  let rate = 0;
  let rateAt = 0;
  const edge = w + 2;
  for (let i = edge; i < M - edge; i++) {
    if (g.skip && g.skip[i]) continue;
    const r = (Math.abs(phi[i + 1] - phi[i - 1]) / (2 * ds)) * g.width;
    if (r > rate) {
      rate = r;
      rateAt = i;
    }
  }
  const kMax = kb.n;
  const kAt = kb.at;
  const pMax = pb.n;
  const pAt = pb.at;
  return {
    curvature: kMax,
    roll: pMax,
    rollRate: rate,
    curvatureAt: kAt,
    rollAt: pAt,
    rateAt,
    ok: kMax <= SMOOTH_LIMITS.curvature && pMax <= SMOOTH_LIMITS.roll && rate <= SMOOTH_LIMITS.rollRate,
  };
}
