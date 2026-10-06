/**
 * The fit loss.
 *
 *   (1 - IoU)                                  w 1.0   (outside the exclusion rects)
 *   chamfer  rendered centreline -> skeleton    w 0.3 (stage 1) / 0.1 (later), / band width
 *   smoothness (bending + twist rate + hard r < 0.6 w outside folds)   w 0.05 (hard part stiff)
 *   self-intersection (non-adjacent strands closer than 3 x thickness)
 *   crossing order (4 constraints, quadratic penalties)
 *   dark-face hint                              w 0.1
 *   bounds violation
 */
import { FitData, type ScaledMasks } from "./data";
import { FitRenderer, type Rings } from "./render";
import { ANCHOR, IDX, N_PTS, VIEW, clampState, type FitState } from "./params";

export interface LossWeights {
  iou: number;
  chamfer: number;
  smooth: number;
  self: number;
  cross: number;
  dark: number;
}

export const WEIGHTS_S1: LossWeights = { iou: 1, chamfer: 0.3, smooth: 0.05, self: 0.5, cross: 1, dark: 0.1 };
export const WEIGHTS: LossWeights = { iou: 1, chamfer: 0.1, smooth: 0.05, self: 0.5, cross: 1, dark: 0.1 };

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
  dark: number;
  bounds: number;
  inter: number;
  union: number;
  crossing: CrossingStatus;
}

const Z_MARGIN = 12; // px of z separation the crossing constraints ask for
const K_HARD = 1 / 0.6; // curvature * width above which a bend outside a fold is "too tight"

export class Evaluator {
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
    const R = this.rend.build(state);
    const { px, w: pw, h: ph } = this.rend.draw(scale);
    const m = this.data.scaled(scale);
    const bw = state.width; // band width at z = 0 (px)

    // ---- IoU + dark hint (one pass) ------------------------------------
    let inter = 0;
    let uni = 0;
    let darkBad = 0;
    let darkTot = 0;
    const n = pw * ph;
    for (let i = 0; i < n; i++) {
      if (m.excl[i]) continue;
      const o = i * 4;
      const c = (px[o] + 32) >> 6; // 0..3
      const vis = c > 0 && !(m.text[i] === 1 && px[o + 1] === 0);
      const mk = m.ribbon[i];
      if (vis) {
        if (mk) {
          inter++;
          uni++;
          const mc = m.cls[i];
          if (mc === 1) {
            darkTot++;
            if (c === 2) darkBad++;
          } else if (mc === 3 && m.kzone[i]) {
            darkTot++;
            if (c === 1) darkBad++;
          }
        } else uni++;
      } else if (mk) uni++;
    }
    const iou = uni > 0 ? inter / uni : 0;
    const dark = darkTot > 0 ? darkBad / darkTot : 0;

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

    // ---- smoothness -------------------------------------------------------
    const M = R.M;
    const skip = new Uint8Array(M);
    const pad = Math.round((1.5 * bw) / Math.max(R.ds, 1e-3));
    for (const [a, b] of R.foldRings) for (let i = Math.max(0, a - pad); i <= Math.min(M - 1, b + pad); i++) skip[i] = 1;
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

    const total =
      w.iou * (1 - iou) +
      w.chamfer * chamfer +
      w.smooth * smooth +
      w.self * self +
      w.cross * cross +
      w.dark * dark +
      0.05 * bounds;
    return { total, iou, chamfer, smooth, bend, hardBend, twistRate, self, cross, dark, bounds, inter, union: uni, crossing };
  }
}

export type { ScaledMasks };
export { ANCHOR };
