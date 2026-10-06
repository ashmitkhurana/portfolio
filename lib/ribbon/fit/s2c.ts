/**
 * S2c: direct reconstruction + local refinement.
 *
 * The pose is no longer found by a global fit: `scripts/s2c` measures the 2D centreline of the mockup, unprojects it at a
 * prescribed depth profile and hands the B-spline control points over (`S2cInput`). This module
 *   1. calibrates the roll (`twist`) of every control point so the engine's curvature frames show the face / apparent width
 *      measured in the mockup,
 *   2. scores a pose (silhouette IoU, dark-face IoU, crossing order, self intersection, edge kink, centreline drift), with
 *      the two name lines at their own depth planes (ASHMIT behind the crossbar plane, KHURANA in front of it),
 *   3. refines only z offsets, roll offsets and turn radii with CMA-ES (the 2D centreline is locked: control points keep
 *      their screen position, z never moves them, and any reprojection drift is penalised).
 */
import type { PosePoint } from "../poses/types";
import { CMAES } from "./cmaes";
import type { FitData } from "./data";
import { FitRenderer, KinkProbes, type Rings } from "./render";
import { VIEW } from "./params";

export interface S2cCrossing {
  name: string;
  /** path-sample spans of the strand that must be IN FRONT and of the one behind it */
  front: [number, number];
  back: [number, number];
  /** where they cross (mockup px) */
  at: [number, number];
}

export interface S2cInput {
  points: PosePoint[];
  /** path sample index of every control point */
  knots: number[];
  targets: { f: number; faceB: number; vis: boolean }[];
  path: [number, number][];
  anchor: { left: number; top: number; width: number; height: number };
  fov: number;
  /** band width at z = 0 (px) */
  W: number;
  /** cap height (px): the unit of the z profile */
  hcap: number;
  /** z / roll offset nodes (named path samples) */
  nodes: { name: string; arc: number }[];
  crossings: S2cCrossing[];
  /** screen row separating the two name lines, and the world z of each line's plane (px) */
  split: number;
  planeZ: [number, number];
}

export interface S2cState {
  /** z offsets at the nodes, in cap heights */
  zOff: number[];
  /** roll offsets at the nodes, radians */
  rollOff: number[];
  /** multiplier of the A apex fold radius */
  foldScale: number;
  /** multiplier of the design radius of the hairpins (k-upper, k-lower, s-turn) */
  hairScale: number[];
}

export interface S2cTerms {
  total: number;
  iou: number;
  darkIoU: number;
  cross: number;
  self: number;
  kink: number;
  /** screen position (mockup px) of the worst edge kink and its edge */
  kinkAtPx: [number, number];
  crinkle: number;
  driftRms: number;
  driftMax: number;
  /** where the largest drift is (mockup px) and the five worst spots */
  driftSpots: [number, number, number][];
  reg: number;
  inter: number;
  union: number;
  crossings: { name: string; margin: number; ok: boolean }[];
  textPlanes: { ashmitBehind: number; khuranaBehind: number };
}

const Z_OFF_MAX = 0.15;
const ROLL_OFF_MAX = (15 * Math.PI) / 180;
const MARGIN_H = 0.08;
const HAIR_NAMES = ["k-upper", "k-lower", "s-turn"];

export function zeroState(input: S2cInput): S2cState {
  return { zOff: input.nodes.map(() => 0), rollOff: input.nodes.map(() => 0), foldScale: 1, hairScale: [1, 1, 1] };
}

export function cloneS2c(s: S2cState): S2cState {
  return { zOff: [...s.zOff], rollOff: [...s.rollOff], foldScale: s.foldScale, hairScale: [...s.hairScale] };
}

function interp(nodes: { arc: number }[], vals: number[], arc: number): number {
  if (arc <= nodes[0].arc) return vals[0];
  const n = nodes.length;
  if (arc >= nodes[n - 1].arc) return vals[n - 1];
  let i = 0;
  while (i < n - 2 && arc > nodes[i + 1].arc) i++;
  const t = (arc - nodes[i].arc) / Math.max(nodes[i + 1].arc - nodes[i].arc, 1);
  const s = t * t * (3 - 2 * t);
  return vals[i] + (vals[i + 1] - vals[i]) * s;
}

export class S2c {
  readonly probes = new KinkProbes();
  input!: S2cInput;
  /** calibrated twist per control point (before the roll offsets) */
  twist0: number[] = [];
  private grid = new Map<number, number[]>();
  stop = false;
  log: (m: string) => void = (m) => console.log(m);

  constructor(
    readonly rend: FitRenderer,
    readonly data: FitData,
  ) {}

  load(input: S2cInput): void {
    this.input = input;
    this.twist0 = input.points.map((p) => p.twist);
    this.grid.clear();
    input.path.forEach((p, i) => {
      const key = Math.floor(p[0] / 8) * 1000 + Math.floor(p[1] / 8);
      const a = this.grid.get(key);
      if (a) a.push(i);
      else this.grid.set(key, [i]);
    });
  }

  /** the pose points for a state: z / roll offsets interpolated from the nodes, fold / hairpin radii scaled */
  pose(state: S2cState): PosePoint[] {
    const inp = this.input;
    return inp.points.map((p, i) => {
      const arc = inp.knots[i];
      const dz = (interp(inp.nodes, state.zOff, arc) * inp.hcap) / inp.anchor.height;
      const q: PosePoint = { ...p, z: p.z + dz, twist: this.twist0[i] + interp(inp.nodes, state.rollOff, arc) };
      if (p.fold) q.fold = { ...p.fold, radius: p.fold.radius * state.foldScale };
      if (p.hairpin) {
        const h = HAIR_NAMES.indexOf(p.hairpin.name);
        q.hairpin = { ...p.hairpin, radius: p.hairpin.radius * (h >= 0 ? state.hairScale[h] : 1) };
      }
      return q;
    });
  }

  build(state: S2cState, twist?: number[]): Rings {
    const pts = this.pose(state);
    if (twist) pts.forEach((p, i) => (p.twist = twist[i]));
    return this.rend.buildPose(pts, this.input.fov, this.input.anchor, this.input.W);
  }

  /** ring index at a path sample (arc fraction interpolated between the control points that bracket it) */
  private ringAt(R: Rings, pathIdx: number): number {
    const k = this.input.knots;
    let i = 0;
    while (i < k.length - 2 && pathIdx > k[i + 1]) i++;
    const t = (pathIdx - k[i]) / Math.max(k[i + 1] - k[i], 1);
    const f = R.frac[i] + (R.frac[i + 1] - R.frac[i]) * Math.min(Math.max(t, 0), 1);
    return Math.min(R.M - 1, Math.max(0, Math.round(f * (R.M - 1))));
  }

  // ---- visibility ----------------------------------------------------------

  /** GL-row-order class buffer -> visibility with per-line text planes */
  private visible(px: Uint8Array, w: number, h: number, m: { text: Uint8Array }, gi: number): boolean {
    const o = gi * 4;
    const c = (px[o] + 32) >> 6;
    if (c === 0) return false;
    if (m.text[gi] !== 1) return true;
    const yTop = h - 1 - ((gi / w) | 0); // scaled top-down row
    const scale = h / VIEW.h;
    const line = yTop / scale < this.input.split ? 0 : 1;
    const z = ((px[o + 2] * 256 + px[o + 3]) / 65535) * 2048 - 1024;
    return z >= this.input.planeZ[line];
  }

  evaluate(state: S2cState, scale: number, twist?: number[]): S2cTerms {
    const inp = this.input;
    const R = this.build(state, twist);
    const { px, w, h } = this.rend.draw(scale);
    const m = this.data.scaled(scale);
    let inter = 0;
    let uni = 0;
    let dInter = 0;
    let dUni = 0;
    const n = w * h;
    for (let i = 0; i < n; i++) {
      if (m.excl[i]) continue;
      const vis = this.visible(px, w, h, m, i);
      const mk = m.ribbon[i] === 1;
      if (vis && mk) inter++;
      if (vis || mk) uni++;
      const c = (px[i * 4] + 32) >> 6;
      const bVis = vis && c === 2;
      const mDark = m.cls[i] === 3;
      if (bVis && mDark) {
        dInter++;
        dUni++;
      } else if (bVis || mDark) dUni++;
    }
    const iou = uni ? inter / uni : 0;
    const darkIoU = dUni ? dInter / dUni : 0;

    // ---- crossing order (front must clear back by MARGIN_H cap heights) ----
    const margin = MARGIN_H * inp.hcap;
    let cross = 0;
    const crossings: S2cTerms["crossings"] = [];
    for (const c of inp.crossings) {
      const best = (span: [number, number]): number => {
        const a = this.ringAt(R, span[0]);
        const b = this.ringAt(R, span[1]);
        let bi = Math.min(a, b);
        let bd = Infinity;
        for (let i = Math.min(a, b); i <= Math.max(a, b); i++) {
          const d = (R.sx[i] - c.at[0]) ** 2 + (R.sy[i] - c.at[1]) ** 2;
          if (d < bd) {
            bd = d;
            bi = i;
          }
        }
        return bi;
      };
      const f = best(c.front);
      const b = best(c.back);
      const dz = R.pos[f * 3 + 2] - R.pos[b * 3 + 2];
      cross += Math.max(0, (margin - dz) / margin) ** 2;
      crossings.push({ name: c.name, margin: dz / inp.hcap, ok: dz >= margin });
    }

    // ---- self intersection (non-adjacent strands closer than 3 x thickness) ----
    const M = R.M;
    const thick = (inp.W / 11) * 3;
    const sub = 6;
    const minSep = Math.round((3 * inp.W) / Math.max(R.ds, 1e-3));
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
        if (d2 < thick * thick) selfPen += ((thick - Math.sqrt(d2)) / thick) ** 2;
        pairs++;
      }
    }
    const self = pairs ? selfPen / 5 : 0;

    // ---- centreline drift ----------------------------------------------------
    let dsum = 0;
    let dn = 0;
    let dmax = 0;
    let dpen = 0;
    const spots: [number, number, number][] = [];
    for (let i = 0; i < M; i += 3) {
      const sx = R.sx[i];
      const sy = R.sy[i];
      let bd = Infinity;
      const cx = Math.floor(sx / 8);
      const cy = Math.floor(sy / 8);
      for (let gx = cx - 2; gx <= cx + 2; gx++) {
        for (let gy = cy - 2; gy <= cy + 2; gy++) {
          const cell = this.grid.get(gx * 1000 + gy);
          if (!cell) continue;
          for (const pi of cell) {
            const d = (inp.path[pi][0] - sx) ** 2 + (inp.path[pi][1] - sy) ** 2;
            if (d < bd) bd = d;
          }
        }
      }
      if (!isFinite(bd)) continue; // beyond the path ends
      const d = Math.sqrt(bd);
      dsum += d * d;
      dpen += Math.max(0, d - 1) ** 2;
      dmax = Math.max(dmax, d);
      if (d > 3) spots.push([Math.round(sx), Math.round(sy), Math.round(d * 10) / 10]);
      dn++;
    }
    const driftRms = dn ? Math.sqrt(dsum / dn) : 0;
    const drift = dn ? dpen / dn : 0;

    const probe = this.probes.kinkPose(this.pose(state).map((p, i) => (twist ? { ...p, twist: twist[i] } : p)), inp.fov);
    const kink = Math.max(R.kink, probe.kink);
    const kinkPen = (Math.max(0, kink - 7.5) / 4.5) ** 2;
    let reg = 0;
    state.zOff.forEach((v) => (reg += (v / Z_OFF_MAX) ** 2));
    state.rollOff.forEach((v) => (reg += (v / ROLL_OFF_MAX) ** 2));
    reg /= state.zOff.length * 2;

    // text planes: where the ribbon is hidden by text, is it behind the right plane? (informational)
    const total =
      (1 - iou) + 0.25 * (1 - darkIoU) + 2 * cross + 0.5 * self + 0.04 * kinkPen + 0.1 * probe.crinkle ** 2 + 0.3 * drift + 0.01 * reg;
    return {
      total,
      iou,
      darkIoU,
      cross,
      self,
      kink,
      kinkAtPx: [Math.round(R.sx[R.kinkAt]), Math.round(R.sy[R.kinkAt])],
      crinkle: probe.crinkle,
      driftRms,
      driftMax: dmax,
      driftSpots: spots.sort((a, b) => b[2] - a[2]).slice(0, 8),
      reg,
      inter,
      union: uni,
      crossings,
      textPlanes: { ashmitBehind: inp.planeZ[0], khuranaBehind: inp.planeZ[1] },
    };
  }

  // ---- roll calibration ------------------------------------------------------

  /**
   * Choose the twist of every control point so the engine's frames show the measured face and apparent width fraction
   * (|cos phi| = w_app / W_local). Works from the real ring frames: rotating (B, N) about the tangent by delta gives
   * f(delta) = |B' . n2| (n2 = unit(v x T): the in-image direction across the band) and the visible face sign(N' . v).
   */
  calibrate(passes = 8): { meanErr: number; faceAgree: number; rotSign: number; signA: number } {
    const inp = this.input;
    const st = zeroState(inp);
    const D = VIEW.h / 2 / Math.tan((inp.fov * Math.PI) / 360);
    const base = this.twist0.map(() => 0);
    // conventions: which way positive twist rotates the band, and which face normal is face A
    const R0 = this.build(st, base);
    const nB0 = new Float32Array(R0.bv);
    const nT0 = new Float32Array(R0.tan);
    const R1 = this.build(st, base.map(() => 0.3));
    let rs = 0;
    for (let r = 10; r < R0.M - 10; r += 7) {
      const b0 = [nB0[r * 3], nB0[r * 3 + 1], nB0[r * 3 + 2]];
      const b1 = [R1.bv[r * 3], R1.bv[r * 3 + 1], R1.bv[r * 3 + 2]];
      const t = [nT0[r * 3], nT0[r * 3 + 1], nT0[r * 3 + 2]];
      const c = [b0[1] * b1[2] - b0[2] * b1[1], b0[2] * b1[0] - b0[0] * b1[2], b0[0] * b1[1] - b0[1] * b1[0]];
      rs += c[0] * t[0] + c[1] * t[1] + c[2] * t[2];
    }
    const rotSign = rs >= 0 ? 1 : -1;
    // face A <-> sign(N . v): vote with the rendered class buffer at the ring centres
    this.build(st, base);
    const { px, w, h } = this.rend.draw(1);
    let agree = 0;
    let dis = 0;
    for (let r = 0; r < R0.M; r += 3) {
      const sx = Math.round(R0.sx[r]);
      const sy = Math.round(R0.sy[r]);
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
      const gi = (h - 1 - sy) * w + sx;
      const c = (px[gi * 4] + 32) >> 6;
      if (c !== 1 && c !== 2) continue;
      const z = ((px[gi * 4 + 2] * 256 + px[gi * 4 + 3]) / 65535) * 2048 - 1024;
      if (Math.abs(z - R0.pos[r * 3 + 2]) > 6) continue;
      const v = [-R0.pos[r * 3], -R0.pos[r * 3 + 1], D - R0.pos[r * 3 + 2]];
      const vl = Math.hypot(v[0], v[1], v[2]);
      const nv = R0.nv[r * 3] * v[0] + R0.nv[r * 3 + 1] * v[1] + R0.nv[r * 3 + 2] * v[2];
      if (Math.abs(nv / vl) < 0.15) continue;
      if ((nv > 0) === (c === 1)) agree++;
      else dis++;
    }
    const signA = agree >= dis ? 1 : -1;

    const tw = this.twist0.map(() => 0);
    const k = inp.targets.length;
    let meanErr = 0;
    let faceAgree = 0;
    for (let pass = 0; pass < passes; pass++) {
      const R = this.build(st, tw);
      meanErr = 0;
      faceAgree = 0;
      let prev = 0;
      const next = tw.slice();
      for (let i = 0; i < k; i++) {
        const t = inp.targets[i];
        const r = Math.min(R.M - 1, Math.max(0, Math.round(R.frac[i] * (R.M - 1))));
        const P = [R.pos[r * 3], R.pos[r * 3 + 1], R.pos[r * 3 + 2]];
        const T = [R.tan[r * 3], R.tan[r * 3 + 1], R.tan[r * 3 + 2]];
        const B = [R.bv[r * 3], R.bv[r * 3 + 1], R.bv[r * 3 + 2]];
        const N = [R.nv[r * 3], R.nv[r * 3 + 1], R.nv[r * 3 + 2]];
        const v = [-P[0], -P[1], D - P[2]];
        const vl = Math.hypot(v[0], v[1], v[2]);
        v[0] /= vl;
        v[1] /= vl;
        v[2] /= vl;
        const cr = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
        const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
        let n2 = cr(v, T);
        const nl = Math.hypot(n2[0], n2[1], n2[2]) || 1;
        n2 = n2.map((x) => x / nl);
        const e2 = cr(T, B);
        const e2n = cr(T, N);
        let best = Infinity;
        let bestD = 0;
        let bestF = 0;
        let bestOk = false;
        const cand: { d: number; cost: number; f: number; ok: boolean }[] = [];
        for (let a = 0; a < 360; a++) {
          const d = (a / 360) * 2 * Math.PI - Math.PI;
          const c = Math.cos(d);
          const s = Math.sin(d);
          const Bp = [B[0] * c + e2[0] * s, B[1] * c + e2[1] * s, B[2] * c + e2[2] * s];
          const Np = [N[0] * c + e2n[0] * s, N[1] * c + e2n[1] * s, N[2] * c + e2n[2] * s];
          const f = Math.abs(dot(Bp, n2));
          const faceB = signA * dot(Np, v) < 0;
          const ok = faceB === (t.faceB === 1);
          const cost = Math.abs(f - t.f) + (ok ? 0 : 1);
          cand.push({ d, cost, f, ok });
          if (cost < best) best = cost;
        }
        // near-optimal candidates: take the one closest to the previous control point's roll (continuity)
        let bc = Infinity;
        for (const c of cand) {
          if (c.cost > best + 0.03) continue;
          let th = tw[i] + rotSign * c.d;
          th -= Math.round((th - prev) / (2 * Math.PI)) * 2 * Math.PI;
          const dd = Math.abs(th - prev);
          if (dd < bc) {
            bc = dd;
            bestD = c.d;
            bestF = c.f;
            bestOk = c.ok;
          }
        }
        let th = tw[i] + rotSign * bestD * 0.8;
        th -= Math.round((th - prev) / (2 * Math.PI)) * 2 * Math.PI;
        // the unwrap must not move the face: shift by whole turns only (a half turn flips the face)
        next[i] = th;
        prev = th;
        meanErr += Math.abs(bestF - t.f);
        if (bestOk) faceAgree++;
      }
      meanErr /= k;
      faceAgree /= k;
      for (let i = 0; i < k; i++) tw[i] = next[i];
    }
    this.twist0 = tw;
    return { meanErr, faceAgree, rotSign, signA };
  }

  // ---- refinement ------------------------------------------------------------

  private encode(state: S2cState, x: Float64Array): void {
    const n = state.zOff.length;
    for (let i = 0; i < n; i++) x[i] = state.zOff[i] / (Z_OFF_MAX / 2);
    for (let i = 0; i < n; i++) x[n + i] = state.rollOff[i] / (ROLL_OFF_MAX / 2);
    x[2 * n] = (state.foldScale - 1) / 0.1;
    for (let h = 0; h < 3; h++) x[2 * n + 1 + h] = (state.hairScale[h] - 1) / 0.1;
  }

  private decode(base: S2cState, x: ArrayLike<number>): S2cState {
    const n = base.zOff.length;
    const s = cloneS2c(base);
    for (let i = 0; i < n; i++) {
      s.zOff[i] = Math.min(Z_OFF_MAX, Math.max(-Z_OFF_MAX, base.zOff[i] + x[i] * (Z_OFF_MAX / 2)));
      s.rollOff[i] = Math.min(ROLL_OFF_MAX, Math.max(-ROLL_OFF_MAX, base.rollOff[i] + x[n + i] * (ROLL_OFF_MAX / 2)));
    }
    s.foldScale = Math.min(1.2, Math.max(0.8, base.foldScale + x[2 * n] * 0.1));
    for (let h = 0; h < 3; h++) s.hairScale[h] = Math.min(1.2, Math.max(0.8, base.hairScale[h] + x[2 * n + 1 + h] * 0.1));
    return s;
  }

  async refine(start: S2cState, cfg: { stages: { scale: number; gens: number; sigma: number }[]; seed?: number }): Promise<{ state: S2cState; terms: S2cTerms }> {
    this.stop = false;
    let best = cloneS2c(start);
    let bestTerms = this.evaluate(best, 0.25);
    const dim = start.zOff.length * 2 + 4;
    for (const st of cfg.stages) {
      const center = cloneS2c(best);
      const cma = new CMAES(new Float64Array(dim), st.sigma, { seed: (cfg.seed ?? 1) + Math.round(st.scale * 100) });
      bestTerms = this.evaluate(best, st.scale);
      let since = 0;
      for (let g = 0; g < st.gens && !this.stop; g++) {
        const xs = cma.ask();
        const fit = new Float64Array(xs.length);
        let gb = Infinity;
        let gs: S2cState | null = null;
        let gt: S2cTerms | null = null;
        const c0 = new Float64Array(dim);
        this.encode(center, c0);
        const tmp = new Float64Array(dim);
        for (let k = 0; k < xs.length; k++) {
          const s = this.decode(center, xs[k]);
          // write the repaired point back
          this.encode(s, tmp);
          for (let i = 0; i < dim; i++) xs[k][i] = tmp[i] - c0[i];
          const t = this.evaluate(s, st.scale);
          fit[k] = t.total;
          if (t.total < gb) {
            gb = t.total;
            gs = s;
            gt = t;
          }
        }
        cma.tell(xs, fit);
        if (gs && gt && gb < bestTerms.total - 1e-5) {
          best = gs;
          bestTerms = gt;
          since = 0;
        } else since++;
        if (g % 5 === 0) this.log(`[s2c ${st.scale}] g${g} iou ${bestTerms.iou.toFixed(4)} dark ${bestTerms.darkIoU.toFixed(3)} cross ${bestTerms.cross.toFixed(3)} self ${bestTerms.self.toFixed(3)} kink ${bestTerms.kink.toFixed(1)} total ${bestTerms.total.toFixed(4)}`);
        await new Promise((r) => setTimeout(r, 0));
        if (since > 40 || cma.maxAxis < 1e-3) break;
      }
    }
    return { state: best, terms: this.evaluate(best, 1) };
  }

  /** our visible silhouette at full resolution, TOP-DOWN (per-line text planes) */
  visibleMask(state: S2cState): Uint8Array {
    this.build(state);
    const { px, w, h } = this.rend.draw(1);
    const m = this.data.scaled(1);
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const gy = h - 1 - y;
      for (let x = 0; x < w; x++) out[y * w + x] = this.visible(px, w, h, m, gy * w + x) ? 1 : 0;
    }
    return out;
  }
}

export { HAIR_NAMES };
