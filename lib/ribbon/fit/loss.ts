/**
 * The fit loss.
 *
 *   (1 - IoU)                                  w 1.0   (outside the exclusion rects)
 *   chamfer  rendered centreline -> skeleton    w 0.3 (stage 1) / 0.1 (later), / band width
 *   smoothness (bending + twist rate + hard r < 0.6 w outside folds)   w 0.05 (hard part stiff)
 *   self-intersection (non-adjacent strands closer than 3 x thickness)
 *   crossing order (4 constraints, quadratic penalties)
 *   face-B IoU vs the mockup's dark class       w 0.25 x (1 - IoU)
 *   silhouette corners: XOR area within 12 px of our sharp contour points the mockup does not have (+ their arc length)
 *   edge kink (smooth.ts EDGE_KINK_LIMIT 12) as a penalty above ~7.5
 *   bounds violation
 */
import { FitData, type ScaledMasks } from "./data";
import { FitRenderer, KinkProbes, type Rings } from "./render";
import { ANCHOR, IDX, N_PTS, VIEW, clampState, type FitState } from "./params";

export interface LossWeights {
  iou: number;
  chamfer: number;
  smooth: number;
  self: number;
  cross: number;
  /** face-B vs mockup dark class: weight of (1 - IoU) */
  dark: number;
  /** silhouette corner XOR (fraction of the mockup ribbon area) */
  cornerXor: number;
  /** sharp contour arc length (band widths x severity) */
  cornerArc: number;
  kink: number;
}

export const WEIGHTS_S1: LossWeights = { iou: 1, chamfer: 0.3, smooth: 0.05, self: 0.5, cross: 1, dark: 0.25, cornerXor: 1, cornerArc: 0.05, kink: 0.04 };
export const WEIGHTS: LossWeights = { iou: 1, chamfer: 0.1, smooth: 0.05, self: 0.5, cross: 1, dark: 0.25, cornerXor: 1, cornerArc: 0.05, kink: 0.04 };

/** a projected contour point is "sharp" when its radius of curvature is below this x the band width */
const CORNER_RADIUS_W = 0.3;
/** radius (px) around a sharp point inside which the silhouette XOR is charged */
const CORNER_XOR_R = 12;
/** the mockup counts as having a corner at a point when >= this many of its sharp-contour pixels lie within +-CORNER_WIN px */
const CORNER_EXCUSE = 40;
const CORNER_WIN = 22;
/** edge kink (smooth.ts) above which the penalty starts / its span */
const KINK_FREE = 7.5;
const KINK_SPAN = 4.5

export interface CrossingStatus {
  legOverCrossbar: boolean;
  kJunctionOrder: boolean;
  crossbarVsText: boolean;
  leftLegBehindT: boolean;
  /** signed z margins (px) where meaningful */
  detail: Record<string, number>;
}

export interface Terms {
  total: number;
  iou: number;
  chamfer: number;
  smooth: number;
  bend: number;
  hardBend: number;
  twistRate: number;
  self: number;
  cross: number;
  /** 1 - face-B IoU vs the mockup dark class */
  dark: number;
  darkIoU: number;
  /** silhouette corner XOR fraction, sharp arc (widths x severity) */
  cornerXor: number;
  cornerArc: number;
  /** engine edge kink metric (limit 12) */
  kink: number;
  bounds: number;
  inter: number;
  union: number;
  crossing: CrossingStatus;
}

const Z_MARGIN = 12; // px of z separation the crossing constraints ask for
const K_HARD = 1 / 0.6; // curvature * width above which a bend outside a fold is "too tight"

export class Evaluator {
  private readonly probes = new KinkProbes();
  private seen = new Int32Array(0);
  private stamp = 0;
  /** per-evaluation visited marks for the corner XOR (a generation counter instead of clearing) */
  private seenFor(n: number): Int32Array {
    if (this.seen.length < n) {
      this.seen = new Int32Array(n);
      this.stamp = 0;
    }
    this.stamp++;
    return this.seen;
  }

  constructor(
    readonly data: FitData,
    readonly rend: FitRenderer,
  ) {}

  /** ring index range [a, b] (inclusive) between authored points i and j */
  private span(R: Rings, i: number, j: number): [number, number] {
    const a = Math.max(0, Math.round(R.frac[i] * (R.M - 1)));
    const b = Math.min(R.M - 1, Math.round(R.frac[j] * (R.M - 1)));
    return [Math.min(a, b), Math.max(a, b)];
  }

  /** ring in [a, b] whose projection is nearest to (px, py) */
  private nearest(R: Rings, a: number, b: number, px: number, py: number): number {
    let best = a;
    let bd = Infinity;
    for (let i = a; i <= b; i++) {
      const d = (R.sx[i] - px) ** 2 + (R.sy[i] - py) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  evaluate(state: FitState, scale: number, w: LossWeights): Terms {
    const bounds = clampState(state);
    // the site layouts first (they build in their own geometries), then the fit frame (its ring texture is what draw() reads)
    const site = this.probes.kink(state);
    const siteKink = site.kink;
    const R = this.rend.build(state);
    const { px, w: pw, h: ph } = this.rend.draw(scale);
    const m = this.data.scaled(scale);
    const bw = state.width; // band width at z = 0 (px)

    // ---- IoU + dark hint (one pass) ------------------------------------
    let inter = 0;
    let uni = 0;
    let dInter = 0;
    let dUni = 0;
    let mockArea = 0;
    const n = pw * ph;
    for (let i = 0; i < n; i++) {
      if (m.excl[i]) continue;
      const o = i * 4;
      const c = (px[o] + 32) >> 6; // 0..3
      const vis = c > 0 && !(m.text[i] === 1 && px[o + 1] === 0);
      const mk = m.ribbon[i];
      const bVis = vis && c === 2;
      const mDark = m.cls[i] === 3;
      if (bVis && mDark) {
        dInter++;
        dUni++;
      } else if (bVis || mDark) dUni++;
      if (mk) mockArea++;
      if (vis) {
        if (mk) {
          inter++;
          uni++;
        } else uni++;
      } else if (mk) uni++;
    }
    const iou = uni > 0 ? inter / uni : 0;
    const darkIoU = dUni > 0 ? dInter / dUni : 0;
    const dark = 1 - darkIoU;

    // ---- chamfer (visible rings only) ------------------------------------
    const full = this.data;
    let chSum = 0;
    let chN = 0;
    for (let i = 2; i < R.M - 2; i += 3) {
      const sx = R.sx[i];
      const sy = R.sy[i];
      if (sx < 0 || sx >= VIEW.w || sy < 0 || sy >= VIEW.h) continue;
      const ix = Math.floor(sx);
      const iy = Math.floor(sy);
      const pi = iy * VIEW.w + ix;
      if (full.excl[pi]) continue;
      if (full.text[pi] && R.pos[i * 3 + 2] < 0) continue;
      const wpx = Math.max(bw * R.k[i], 8);
      chSum += Math.min(full.dtAt(sx, sy) / wpx, 2);
      chN++;
    }
    const chamfer = chN > 0 ? chSum / chN : 2;

    // ---- silhouette corners ----------------------------------------------------
    let cornerArc = 0;
    let xorPx = 0;
    {
      const inv = 1 / Math.max(scale, 1e-6);
      const wr = Math.max(1, Math.round(3 * scale)); // boundary test window (scaled px)
      const rr = Math.max(2, Math.round(CORNER_XOR_R * scale));
      const visAt = (ix: number, iy: number): number => {
        // ix, iy: top-down scaled px -> GL row order
        if (ix < 0 || iy < 0 || ix >= pw || iy >= ph) return 0;
        const gi = (ph - 1 - iy) * pw + ix;
        const c = (px[gi * 4] + 32) >> 6;
        return c > 0 && !(m.text[gi] === 1 && px[gi * 4 + 1] === 0) ? 1 : 0;
      };
      const seen = this.seenFor(pw * ph);
      const stamp = this.stamp;
      const st = 2;
      for (let e = 0; e < 2; e++) {
        const ex = R.ex[e];
        const ey = R.ey[e];
        for (let i = st + 1; i < R.M - st - 1; i += st) {
          const ax = ex[i] - ex[i - st];
          const ay = ey[i] - ey[i - st];
          const bx = ex[i + st] - ex[i];
          const by = ey[i + st] - ey[i];
          const la = Math.sqrt(ax * ax + ay * ay);
          const lb = Math.sqrt(bx * bx + by * by);
          const len = (la + lb) / 2;
          if (len < 1e-3) continue;
          const kap = Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by)) / len;
          const wpx = Math.max(bw * R.k[i], 8);
          const rad = 1 / Math.max(kap, 1e-9);
          if (rad >= CORNER_RADIUS_W * wpx) continue;
          const sx = ex[i];
          const sy = ey[i];
          if (sx < 25 || sy < 25 || sx > VIEW.w - 25 || sy > VIEW.h - 25) continue;
          if (full.excl[Math.floor(sy) * VIEW.w + Math.floor(sx)]) continue;
          // on OUR visible silhouette boundary?
          const cx = Math.round(sx * scale);
          const cy = Math.round(sy * scale);
          let any = 0;
          let all = 1;
          for (let yy = -wr; yy <= wr; yy += wr) {
            for (let xx = -wr; xx <= wr; xx += wr) {
              const v = visAt(cx + xx, cy + yy);
              any |= v;
              all &= v;
            }
          }
          if (!any || all) continue;
          // the mockup has a corner here too?
          if (full.cornerCount(sx - CORNER_WIN, sy - CORNER_WIN, sx + CORNER_WIN, sy + CORNER_WIN) >= CORNER_EXCUSE) continue;
          cornerArc += Math.min(CORNER_RADIUS_W * wpx / rad - 1, 3) * (len * st / wpx);
          // silhouette XOR within CORNER_XOR_R px
          for (let yy = Math.max(0, cy - rr); yy <= Math.min(ph - 1, cy + rr); yy++) {
            for (let xx = Math.max(0, cx - rr); xx <= Math.min(pw - 1, cx + rr); xx++) {
              if ((xx - cx) * (xx - cx) + (yy - cy) * (yy - cy) > rr * rr) continue;
              const gi = (ph - 1 - yy) * pw + xx;
              if (m.excl[gi] || seen[gi] === stamp) continue;
              if (visAt(xx, yy) !== m.ribbon[gi]) {
                seen[gi] = stamp;
                xorPx++;
              }
            }
          }
        }
      }
      void inv;
    }
    const cornerXor = mockArea > 0 ? xorPx / mockArea : 0;

    // ---- smoothness -------------------------------------------------------
    const M = R.M;
    const skip = new Uint8Array(M);
    const pad = Math.round((1.5 * bw) / Math.max(R.ds, 1e-3));
    for (const [a, b] of R.foldRings) for (let i = Math.max(0, a - pad); i <= Math.min(M - 1, b + pad); i++) skip[i] = 1;
    // a rolled hairpin may be as tight as 0.4 band widths: only the curvature frames' business
    for (const [a, b] of R.hairpinRings) for (let i = Math.max(0, a); i <= Math.min(M - 1, b); i++) skip[i] = 1;
    let bend = 0;
    let hard = 0;
    let bn = 0;
    const stride = 2;
    for (let i = stride; i < M - stride; i += stride) {
      if (skip[i]) continue;
      const a = (i - stride) * 3;
      const b = (i + stride) * 3;
      const dx = R.tan[b] - R.tan[a];
      const dy = R.tan[b + 1] - R.tan[a + 1];
      const dz = R.tan[b + 2] - R.tan[a + 2];
      const ex = R.pos[b] - R.pos[a];
      const ey = R.pos[b + 1] - R.pos[a + 1];
      const ez = R.pos[b + 2] - R.pos[a + 2];
      const kap = Math.sqrt(dx * dx + dy * dy + dz * dz) / Math.max(Math.sqrt(ex * ex + ey * ey + ez * ez), 1e-6);
      const kw = kap * bw;
      bend += kw * kw;
      if (kw > K_HARD) hard += (kw / K_HARD - 1) ** 2;
      bn++;
    }
    bend = bn ? bend / bn : 0;
    const hardBend = bn ? hard / bn : 0;
    let tw = 0;
    for (let i = 1; i < N_PTS; i++) tw += (state.twist[i] - state.twist[i - 1]) ** 2;
    const twistRate = tw / (N_PTS - 1);
    const smooth = bend * 0.25 + twistRate + 40 * hardBend; // weighted below by w.smooth

    // ---- self intersection --------------------------------------------------
    const thick = (bw / 11) * 3; // 3 x thickness (px)
    const sub = 6;
    const minSep = Math.round((3 * bw) / Math.max(R.ds, 1e-3));
    let selfPen = 0;
    let pairs = 0;
    for (let i = 0; i < M; i += sub) {
      const xi = R.pos[i * 3];
      const yi = R.pos[i * 3 + 1];
      const zi = R.pos[i * 3 + 2];
      for (let j = i + minSep; j < M; j += sub) {
        const dx = R.pos[j * 3] - xi;
        const dy = R.pos[j * 3 + 1] - yi;
        const dz = R.pos[j * 3 + 2] - zi;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < thick * thick) {
          const d = Math.sqrt(d2);
          selfPen += ((thick - d) / thick) ** 2;
        }
        pairs++;
      }
    }
    const self = pairs ? selfPen / 5 : 0;

    // ---- crossing order -----------------------------------------------------
    const detail: Record<string, number> = {};
    // 1. A right leg in front of the crossbar at ~(1090, 400)
    const leg = this.span(R, IDX.legStart, IDX.legEnd);
    const bar = this.span(R, IDX.crossbarStart, IDX.crossbarEnd);
    const iLeg = this.nearest(R, leg[0], leg[1], 1090, 400);
    const iBar = this.nearest(R, bar[0], bar[1], 1090, 400);
    const m1 = R.pos[iLeg * 3 + 2] - R.pos[iBar * 3 + 2];
    detail.legOverCrossbar = m1;
    // 2. K junction: the strand going down-right to the lower loop in front of the strand returning from the upper loop
    const outb = this.span(R, IDX.legEnd - 1, IDX.lowerTip);
    const retn = this.span(R, IDX.upperTip, IDX.crossbarStart);
    let bd = Infinity;
    let ia = outb[0];
    let ib = retn[0];
    for (let i = outb[0]; i <= outb[1]; i += 3) {
      for (let j = retn[0]; j <= retn[1]; j += 3) {
        const d = (R.sx[i] - R.sx[j]) ** 2 + (R.sy[i] - R.sy[j]) ** 2;
        if (d < bd) {
          bd = d;
          ia = i;
          ib = j;
        }
      }
    }
    const m2 = R.pos[ia * 3 + 2] - R.pos[ib * 3 + 2];
    detail.kJunction = m2;
    detail.kJunctionDist = Math.sqrt(bd);
    // 3. the crossbar: z > 0 over ASHMIT's rows (y 205..390), z < 0 over KHURANA's (405..590), where text is
    let v3 = 0;
    let n3 = 0;
    let worst3 = 0;
    const T = this.data;
    for (let i = bar[0]; i <= bar[1]; i += 2) {
      const sx = R.sx[i];
      const sy = R.sy[i];
      if (sx < 0 || sx >= VIEW.w || sy < 0 || sy >= VIEW.h) continue;
      if (!T.text[Math.floor(sy) * VIEW.w + Math.floor(sx)]) continue;
      const z = R.pos[i * 3 + 2];
      if (sy >= 205 && sy <= 390) {
        v3 += Math.max(0, (Z_MARGIN - z) / Z_MARGIN) ** 2;
        worst3 = Math.min(worst3, z);
        n3++;
      } else if (sy >= 405 && sy <= 590) {
        v3 += Math.max(0, (z + Z_MARGIN) / Z_MARGIN) ** 2;
        worst3 = Math.min(worst3, -z);
        n3++;
      }
    }
    detail.crossbarWorst = worst3;
    // 4. the A left leg behind the T (x 835..1015, y 205..390)
    const left = this.span(R, IDX.leftLegStart, IDX.leftLegEnd);
    let v4 = 0;
    let n4 = 0;
    let worst4 = 0;
    for (let i = left[0]; i <= left[1]; i += 2) {
      const sx = R.sx[i];
      const sy = R.sy[i];
      if (sx < 835 || sx > 1015 || sy < 205 || sy > 390) continue;
      const z = R.pos[i * 3 + 2];
      v4 += Math.max(0, (z + Z_MARGIN) / Z_MARGIN) ** 2;
      worst4 = Math.min(worst4, -z);
      n4++;
    }
    detail.leftLegBehindT = worst4;
    const c1 = Math.max(0, (Z_MARGIN - m1) / Z_MARGIN) ** 2;
    // the strands must really cross at the junction (otherwise there is nothing to order): ask them to come within a band width
    const c2 = bd < (bw * 0.9) ** 2 ? Math.max(0, (Z_MARGIN - m2) / Z_MARGIN) ** 2 : Math.max(0, (Z_MARGIN - m2) / Z_MARGIN) ** 2 * 0.25;
    const c3 = n3 ? v3 / n3 : 0;
    const c4 = n4 ? v4 / n4 : 0;
    const cross = c1 + c2 + c3 + c4;
    const crossing: CrossingStatus = {
      legOverCrossbar: m1 >= 0,
      kJunctionOrder: m2 >= 0,
      crossbarVsText: worst3 >= 0,
      leftLegBehindT: worst4 >= 0,
      detail,
    };

    const kink = Math.max(R.kink, siteKink);
    const kinkPen = ((Math.max(0, kink - KINK_FREE)) / KINK_SPAN) ** 2;
    const total =
      w.iou * (1 - iou) +
      w.chamfer * chamfer +
      w.smooth * smooth +
      w.self * self +
      w.cross * cross +
      w.dark * dark +
      w.cornerXor * cornerXor +
      w.cornerArc * cornerArc +
      w.kink * kinkPen +
      0.1 * site.crinkle ** 2 +
      0.05 * bounds;
    return { total, iou, chamfer, smooth, bend, hardBend, twistRate, self, cross, dark, darkIoU, cornerXor, cornerArc, kink, bounds, inter, union: uni, crossing };
  }
}

export type { ScaledMasks };
export { ANCHOR };
