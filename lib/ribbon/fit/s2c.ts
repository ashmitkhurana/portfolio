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
  viol: number;
  smooth: { curvature: number; roll: number; rollRate: number; curvatureAt: number; rollAt: number; rateAt: number };
  hairpins: { name: string; turnDeg: number; radiusW: number }[];
  folds: { ring0: number; ring1: number; a: number[]; b: number[]; theta: number; gap: number; mismatch: number; liftError: number; built: boolean; issues: string[] }[];
  driftRms: number;
  driftMax: number;
  /** where the largest drift is (mockup px) and the five worst spots */
  driftSpots: [number, number, number][];
  driftAll: [number, number, number][];
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
  /** weight of the dark-face term in the local silhouette costs */
  darkW = 0.25;
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

  build(state: S2cState, twist?: number[], lite = false): Rings {
    const pts = this.pose(state);
    if (twist) pts.forEach((p, i) => (p.twist = twist[i]));
    return this.rend.buildPose(pts, this.input.fov, this.input.anchor, this.input.W, lite);
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

  /** the pose-check limits over ALL site layouts (worst case): violation, kink, and where the worst kink is (arc fraction) */
  layoutPen(twist: number[]): { viol: number; kink: number; frac: number } {
    const pts = this.pose(zeroState(this.input)).map((p, i) => ({ ...p, twist: twist[i] }));
    const pr = this.probes.kinkPose(pts, this.input.fov);
    return { viol: pr.viol, kink: pr.kink, frac: pr.kinkFrac };
  }

  /** crossing order: the front strand must clear the back one by MARGIN_H cap heights */
  crossPenalty(R: Rings): { pen: number; list: S2cTerms["crossings"] } {
    const inp = this.input;
    const margin = MARGIN_H * inp.hcap;
    let pen = 0;
    const list: S2cTerms["crossings"] = [];
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
      pen += Math.max(0, (margin - dz) / margin) ** 2;
      list.push({ name: c.name, margin: dz / inp.hcap, ok: dz >= margin });
    }
    return { pen, list };
  }

  /** self intersection: non-adjacent strands closer than 3 x thickness */
  selfPenalty(R: Rings): number {
    const inp = this.input;
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
    return pairs ? selfPen / 5 : 0;
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

    const cs = this.crossPenalty(R);
    const cross = cs.pen;
    const crossings = cs.list;
    const self = this.selfPenalty(R);
    const M = R.M;

    // ---- centreline drift ----------------------------------------------------
    let dsum = 0;
    let dn = 0;
    let dmax = 0;
    let dpen = 0;
    const spots: [number, number, number][] = [];
    const all: [number, number, number][] = [];
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
      all.push([Math.round(sx), Math.round(sy), Math.round(d * 10) / 10]);
      if (d > 3) spots.push([Math.round(sx), Math.round(sy), Math.round(d * 10) / 10]);
      dn++;
    }
    const driftRms = dn ? Math.sqrt(dsum / dn) : 0;
    const drift = dn ? dpen / dn : 0;

    const probe = this.probes.kinkPose(this.pose(state).map((p, i) => (twist ? { ...p, twist: twist[i] } : p)), inp.fov);
    const kink = Math.max(R.kink, probe.kink);
    const kinkPen = (Math.max(0, kink - 10) / 3) ** 2;
    let reg = 0;
    state.zOff.forEach((v) => (reg += (v / Z_OFF_MAX) ** 2));
    state.rollOff.forEach((v) => (reg += (v / ROLL_OFF_MAX) ** 2));
    reg /= state.zOff.length * 2;

    // text planes: where the ribbon is hidden by text, is it behind the right plane? (informational)
    const total =
      (1 - iou) + 0.25 * (1 - darkIoU) + 2 * cross + 0.5 * self + 0.15 * kinkPen + 0.4 * probe.viol ** 2 + 0.3 * drift + 0.01 * reg;
    return {
      total,
      iou,
      darkIoU,
      cross,
      self,
      kink,
      kinkAtPx: [Math.round(R.sx[R.kinkAt]), Math.round(R.sy[R.kinkAt])],
      crinkle: probe.crinkle,
      viol: probe.viol,
      smooth: (() => {
        const sm = this.rend.geometry.smoothnessReport();
        return { curvature: sm.curvature, roll: sm.roll, rollRate: sm.rollRate, curvatureAt: sm.curvatureAt, rollAt: sm.rollAt, rateAt: sm.rateAt };
      })(),
      hairpins: this.rend.geometry.hairpinReports.map((h) => ({ name: h.name, turnDeg: (h.turn * 180) / Math.PI, radiusW: h.radiusW })),
      folds: this.rend.geometry.foldReports.map((f) => ({ ring0: f.ring0, ring1: f.ring1, a: [Math.round(R.sx[f.ring0]), Math.round(R.sy[f.ring0])], b: [Math.round(R.sx[f.ring1]), Math.round(R.sy[f.ring1])], theta: f.theta, gap: f.gap, mismatch: f.mismatch, liftError: f.liftError, built: f.built, issues: f.issues.map((i) => `${i.level}: ${i.text}`) })),
      driftRms,
      driftMax: dmax,
      driftAll: all,
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
  calibrate(passes = 8): { meanErr: number; faceAgree: number; rotSign: number; signA: number; verifyErr: number; verifyFace: number; detail: string } {
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
    const cr = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const NA = 180;
    // twist 0 = the curvature frames' own roll: the apex fold must arrive face-on to its turn plane (twist ~ 0) and a rolled hairpin
    // is a bracelet at its tip (twist ~ 0): pin the roll there (soft, spreading over the neighbouring control points)
    const pin = new Array<number>(k).fill(0);
    // the fold REPLACES the roll after its zone (the strip leaves with the fold's exit normal; later rings only keep
    // their roll RELATIVE to the first ring after the zone), so the roll baseline after the apex cannot be set by twist:
    // twist differences after the fold are free to jump there and the first control point after the zone is held
    const foldIdx = inp.points.findIndex((p) => p.fold);
    const anchorIdx = foldIdx >= 0 ? Math.min(k - 1, foldIdx + 3) : -1;
    inp.points.forEach((p, j) => {
      const strength = p.fold ? 6 : p.hairpin ? 2 : 0;
      if (!strength) return;
      for (let i = 0; i < k; i++) pin[i] = Math.max(pin[i], strength * Math.exp(-(((i - j) / 1.6) ** 2)));
    });
    for (let pass = 0; pass < passes; pass++) {
      const R = this.build(st, tw);
      // per control point: candidate absolute twists (all roll angles whose f is near the target) with a node cost
      const cands: { th: number; cost: number; f: number; ok: boolean }[][] = [];
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
        let n2 = cr(v, T);
        const nl = Math.hypot(n2[0], n2[1], n2[2]) || 1;
        n2 = n2.map((x) => x / nl);
        const e2 = cr(T, B);
        const e2n = cr(T, N);
        const list: { th: number; cost: number; f: number; ok: boolean }[] = [];
        for (let a = 0; a < NA; a++) {
          const d = (a / NA) * 2 * Math.PI - Math.PI;
          const c = Math.cos(d);
          const sn = Math.sin(d);
          const Bp = [B[0] * c + e2[0] * sn, B[1] * c + e2[1] * sn, B[2] * c + e2[2] * sn];
          const Np = [N[0] * c + e2n[0] * sn, N[1] * c + e2n[1] * sn, N[2] * c + e2n[2] * sn];
          const f = Math.abs(dot(Bp, n2));
          const faceB = signA * dot(Np, v) < 0;
          const ok = faceB === (t.faceB === 1);
          // the face is soft near edge-on (where it is ambiguous anyway)
          const faceW = 0.5 * Math.min(1, 0.4 + t.f + f);
          const cost = 3 * Math.abs(f - t.f) + (ok ? 0 : faceW);
          const base = tw[i] + rotSign * d;
          for (let m = -3; m <= 3; m++) {
            const th = base + m * 2 * Math.PI;
            list.push({ th, cost: cost + pin[i] * Math.sin(th) ** 2 * 1.0, f, ok });
          }
        }
        // keep the cheap ones
        const mn = Math.min(...list.map((c) => c.cost));
        cands.push(list.filter((c) => c.cost <= mn + 0.25));
      }
      // Viterbi over the control points: node cost + lambda * (change of roll)^2
      const lam = 2.0;
      let prevCost = cands[0].map((c) => c.cost);
      const back: Int32Array[] = [new Int32Array(cands[0].length)];
      for (let i = 1; i < k; i++) {
        const cc = cands[i];
        const pc = cands[i - 1];
        const cost = new Array<number>(cc.length);
        const bk = new Int32Array(cc.length);
        for (let j = 0; j < cc.length; j++) {
          let bv = Infinity;
          let bi = 0;
          for (let q = 0; q < pc.length; q++) {
            const dd = cc[j].th - pc[q].th;
            const free = anchorIdx > 0 && i > foldIdx && i <= anchorIdx; // across the fold zone the roll is rebuilt
            const v = prevCost[q] + (free ? 0 : lam * dd * dd);
            if (v < bv) {
              bv = v;
              bi = q;
            }
          }
          cost[j] = bv + cc[j].cost;
          bk[j] = bi;
        }
        prevCost = cost;
        back.push(bk);
      }
      let bj = 0;
      for (let j = 1; j < prevCost.length; j++) if (prevCost[j] < prevCost[bj]) bj = j;
      const next = new Array<number>(k);
      meanErr = 0;
      faceAgree = 0;
      for (let i = k - 1; i >= 0; i--) {
        const c = cands[i][bj];
        next[i] = c.th;
        meanErr += Math.abs(c.f - inp.targets[i].f);
        if (c.ok) faceAgree++;
        bj = back[i][bj];
      }
      meanErr /= k;
      faceAgree /= k;
      // anchor the absolute turn count: keep the first control point's roll in (-pi, pi]
      const off = Math.round(next[0] / (2 * Math.PI)) * 2 * Math.PI;
      if (anchorIdx > 0) {
        // twist after the fold only acts relative to the first ring after its zone: keep that one where it is
        const shift = next[anchorIdx] - off - tw[anchorIdx];
        for (let i = anchorIdx; i < k; i++) next[i] -= shift;
      }
      for (let i = 0; i < k; i++) tw[i] = next[i] - off;
    }
    this.twist0 = tw;
    // verify with the real build: achieved f and face at every control ring against the targets
    const Rv = this.build(st, tw);
    let vErr = 0;
    let vFace = 0;
    const detail: string[] = [];
    for (let i = 0; i < k; i++) {
      const r = Math.min(Rv.M - 1, Math.max(0, Math.round(Rv.frac[i] * (Rv.M - 1))));
      const P = [Rv.pos[r * 3], Rv.pos[r * 3 + 1], Rv.pos[r * 3 + 2]];
      const T = [Rv.tan[r * 3], Rv.tan[r * 3 + 1], Rv.tan[r * 3 + 2]];
      const B = [Rv.bv[r * 3], Rv.bv[r * 3 + 1], Rv.bv[r * 3 + 2]];
      const N = [Rv.nv[r * 3], Rv.nv[r * 3 + 1], Rv.nv[r * 3 + 2]];
      const v = [-P[0], -P[1], D - P[2]];
      const vl = Math.hypot(v[0], v[1], v[2]);
      const vn = v.map((x) => x / vl);
      let n2 = cr(vn, T);
      const nl = Math.hypot(n2[0], n2[1], n2[2]) || 1;
      n2 = n2.map((x) => x / nl);
      const f = Math.abs(dot(B, n2));
      vErr += Math.abs(f - inp.targets[i].f);
      const okF = (signA * dot(N, vn) < 0) === (inp.targets[i].faceB === 1);
      if (okF) vFace++;
      detail.push(`${i}:${f.toFixed(2)}/${inp.targets[i].f.toFixed(2)}${okF ? '' : 'X'}`);
    }
    return { meanErr, faceAgree, rotSign, signA, verifyErr: vErr / k, verifyFace: vFace / k, detail: detail.join(' ') };
  }

  /**
   * Roll calibration against the REAL engine (the fold overwrites the roll after its zone, so an analytic frame model
   * does not hold): control point by control point, scan the twist and keep the value whose achieved apparent width
   * fraction f = |B . n2| and visible face (sign N . v) best match the measurement, with a continuity prior.
   */
  calibrateReal(passes = 2, grid = 36, smoothSigma = 1.5, cont = 0.6): { passes: number; meanErr: number; faceAgree: number; detail: string } {
    const inp = this.input;
    const st = zeroState(inp);
    const k = inp.targets.length;
    const D = VIEW.h / 2 / Math.tan((inp.fov * Math.PI) / 360);
    const base = this.twist0.map(() => 0);
    // conventions (as in calibrate): which face normal is face A
    this.build(st, base);
    const { px, w, h } = this.rend.draw(1);
    const R0 = this.rend.rings;
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
      const nv = R0.nv[r * 3] * v[0] + R0.nv[r * 3 + 1] * v[1] + R0.nv[r * 3 + 2] * v[2];
      if (Math.abs(nv) / Math.hypot(v[0], v[1], v[2]) < 0.15) continue;
      if (nv > 0 === (c === 1)) agree++;
      else dis++;
    }
    const signA = agree >= dis ? 1 : -1;
    const foldIdx = inp.points.findIndex((p) => p.fold);
    const anchorIdx = foldIdx >= 0 ? Math.min(k - 1, foldIdx + 3) : -1;
    // (the pose runs tail -> T1, so the fold turns the lit face (A, right leg) into the dark one (B, left leg), as in the mockup)
    const tw = base.slice();
    const measure = (R: Rings, i: number): { f: number; faceB: boolean } => {
      const r = Math.min(R.M - 1, Math.max(0, Math.round(R.frac[i] * (R.M - 1))));
      const v = [-R.pos[r * 3], -R.pos[r * 3 + 1], D - R.pos[r * 3 + 2]];
      const vl = Math.hypot(v[0], v[1], v[2]);
      const vn = v.map((x) => x / vl);
      const T = [R.tan[r * 3], R.tan[r * 3 + 1], R.tan[r * 3 + 2]];
      let n2 = [vn[1] * T[2] - vn[2] * T[1], vn[2] * T[0] - vn[0] * T[2], vn[0] * T[1] - vn[1] * T[0]];
      const nl = Math.hypot(n2[0], n2[1], n2[2]) || 1;
      n2 = n2.map((x) => x / nl);
      const f = Math.abs(R.bv[r * 3] * n2[0] + R.bv[r * 3 + 1] * n2[1] + R.bv[r * 3 + 2] * n2[2]);
      const nd = R.nv[r * 3] * vn[0] + R.nv[r * 3 + 1] * vn[1] + R.nv[r * 3 + 2] * vn[2];
      return { f, faceB: signA * nd < 0 };
    };
    for (let pass = 0; pass < passes; pass++) {
      for (let i = 0; i < k; i++) {
        if (i === anchorIdx) continue; // its own twist has no effect (the fold sets the roll there): later rings are relative to it
        if (foldIdx >= 0 && i >= foldIdx - 5 && i <= foldIdx + 1) {
          tw[i] = 0; // the strip arrives at (and leaves) the fold level
          continue;
        }
        const t = inp.targets[i];
        const prev = i > 0 ? tw[i - 1] : 0;
        const nxt = i < k - 1 ? tw[i + 1] : tw[i];
        let best = Infinity;
        let bestTh = tw[i];
        const fixedFuture = pass === 0;
        const nearFold = foldIdx >= 0 && i >= foldIdx - 7 && i <= foldIdx + 2;
        for (let g = 0; g < grid; g++) {
          const th = prev + ((g / grid) * 2 - 1) * Math.PI; // within pi of the previous control point
          const saved = tw[i];
          tw[i] = th;
          if (fixedFuture) for (let q = i + 1; q < k; q++) if (q !== anchorIdx) tw[q] = th;
          const R = this.build(st, tw, true);
          const m = measure(R, i);
          const ok = t.faceB === 2 || m.faceB === (t.faceB === 1);
          const faceW = 0.5 * Math.min(1, 0.4 + t.f + m.f);
          let cost = 3 * Math.abs(m.f - t.f) + (ok ? 0 : faceW) + cont * (th - prev) ** 2 + (pass > 0 ? cont * (th - nxt) ** 2 : 0);
          if (nearFold) cost += 1.5 * Math.sin(th) ** 2;
          if (cost < best) {
            best = cost;
            bestTh = th;
          }
          tw[i] = saved;
        }
        tw[i] = bestTh;
        if (pass === 0) for (let q = i + 1; q < k; q++) if (q !== anchorIdx) tw[q] = bestTh;
      }
    }
    if (smoothSigma > 0) {
      // low-pass the roll along the control points (not across the fold zone, where the roll is rebuilt): fewer reversals
      const sm = tw.slice();
      const rad = Math.ceil(smoothSigma * 3);
      for (let i = 0; i < k; i++) {
        if (foldIdx >= 0 && i >= foldIdx - 1 && i <= anchorIdx) continue;
        let sw = 0;
        let sv = 0;
        for (let d = -rad; d <= rad; d++) {
          const j = i + d;
          if (j < 0 || j >= k) continue;
          if (foldIdx >= 0 && ((i < foldIdx - 1) !== (j < foldIdx - 1))) continue; // do not mix across the fold
          const wgt = Math.exp(-0.5 * (d / smoothSigma) ** 2);
          sw += wgt;
          sv += wgt * tw[j];
        }
        sm[i] = sv / sw;
      }
      for (let i = 0; i < k; i++) tw[i] = sm[i];
    }
    this.twist0 = tw;
    const Rv = this.build(st, tw, true);
    let err = 0;
    let fa = 0;
    const detail: string[] = [];
    for (let i = 0; i < k; i++) {
      const m = measure(Rv, i);
      err += Math.abs(m.f - inp.targets[i].f);
      const ok = inp.targets[i].faceB === 2 || m.faceB === (inp.targets[i].faceB === 1);
      if (ok) fa++;
      detail.push(`${i}:${m.f.toFixed(2)}/${inp.targets[i].f.toFixed(2)}${ok ? "" : "X"}`);
    }
    return { passes, meanErr: err / k, faceAgree: fa / k, detail: detail.join(" ") };
  }

  /**
   * Local silhouette refinement of the control points themselves (screen x, y and depth z): greedy, control point by control
   * point, small steps, scored on the local silhouette / dark-face agreement with the pose-check limits as global penalties and a
   * soft pull back to the measured centreline. Deviates from the locked-centreline spec on purpose (reported as drift).
   */
  refineLocal(passes = 2, stepPx = 7, stepZ = 0.06, maxOff = 16, lockW = 0.08, radius = 95, pinchW = 1.5): { before: number; after: number; driftMax: number } {
    const inp = this.input;
    const st = zeroState(inp);
    const k = inp.points.length;
    const scale = 0.5;
    const m = this.data.scaled(scale);
    const x0 = inp.points.map((p) => p.x);
    const y0 = inp.points.map((p) => p.y);
    const z0 = inp.points.map((p) => p.z);
    const local = (R: Rings, i: number): number => {
      const { px, w, h } = this.rend.draw(scale);
      const r = Math.min(R.M - 1, Math.max(0, Math.round(R.frac[i] * (R.M - 1))));
      const cx = R.sx[r] * scale;
      const cy = R.sy[r] * scale;
      const rr = radius * scale;
      const x0 = Math.max(0, Math.floor(cx - rr));
      const x1 = Math.min(w - 1, Math.ceil(cx + rr));
      const y0 = Math.max(0, Math.floor(cy - rr));
      const y1 = Math.min(h - 1, Math.ceil(cy + rr));
      let inter = 0;
      let uni = 0;
      let dI = 0;
      let dU = 0;
      for (let y = y0; y <= y1; y++) {
        const gy = h - 1 - y;
        for (let x = x0; x <= x1; x++) {
          if ((x - cx) ** 2 + (y - cy) ** 2 > rr * rr) continue;
          const gi = gy * w + x;
          if (m.excl[gi]) continue;
          const vis = this.visible(px, w, h, m, gi);
          const mk = m.ribbon[gi] === 1;
          if (vis && mk) inter++;
          if (vis || mk) uni++;
          const bVis = vis && ((px[gi * 4] + 32) >> 6) === 2;
          const mDark = m.cls[gi] === 3;
          if (bVis && mDark) {
            dI++;
            dU++;
          } else if (bVis || mDark) dU++;
        }
      }
      // edge-wise bending near this control point: where hw * kappa_B / 0.5 > 1 the engine relaxes (moves) the path and the edge kinks
      let pinch = 0;
      for (let q = Math.max(3, r - 24); q <= Math.min(R.M - 4, r + 24); q += 2) {
        const dx = R.tan[(q + 2) * 3] - R.tan[(q - 2) * 3];
        const dy = R.tan[(q + 2) * 3 + 1] - R.tan[(q - 2) * 3 + 1];
        const dz = R.tan[(q + 2) * 3 + 2] - R.tan[(q - 2) * 3 + 2];
        const ds = Math.hypot(R.pos[(q + 2) * 3] - R.pos[(q - 2) * 3], R.pos[(q + 2) * 3 + 1] - R.pos[(q - 2) * 3 + 1], R.pos[(q + 2) * 3 + 2] - R.pos[(q - 2) * 3 + 2]) || 1;
        const kb = Math.abs(dx * R.bv[q * 3] + dy * R.bv[q * 3 + 1] + dz * R.bv[q * 3 + 2]) / ds;
        const hw = R.hw[q];
        pinch = Math.max(pinch, (hw * kb) / 0.5);
      }
      return 1 - (uni ? inter / uni : 1) + this.darkW * (dU ? 1 - dI / dU : 0) + pinchW * Math.max(0, pinch - 0.85) ** 2;
    };
    const global = (): number => {
      this.build(st, this.twist0, true);
      const { px, w, h } = this.rend.draw(scale);
      let inter = 0;
      let uni = 0;
      for (let gi = 0; gi < w * h; gi++) {
        if (m.excl[gi]) continue;
        const vis = this.visible(px, w, h, m, gi);
        const mk = m.ribbon[gi] === 1;
        if (vis && mk) inter++;
        if (vis || mk) uni++;
      }
      return uni ? inter / uni : 0;
    };
    const before = global();
    const pxW = inp.anchor.width;
    const pxH = inp.anchor.height;
    const foldIdx = inp.points.findIndex((p) => p.fold);
    for (let pass = 0; pass < passes; pass++) {
      for (let i = 0; i < k; i++) {
        if (foldIdx >= 0 && Math.abs(i - foldIdx) <= 2) continue; // the fold point is the author's anchor of the roll
        const bx = inp.points[i].x;
        const by = inp.points[i].y;
        const bz = inp.points[i].z;
        let best = Infinity;
        let bestC: [number, number, number] = [bx, by, bz];
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dz = -1; dz <= 1; dz++) {
              const nx = bx + (dx * stepPx) / pxW;
              const ny = by + (dy * stepPx) / pxH;
              const nz = bz + (dz * stepZ * inp.hcap) / inp.anchor.height;
              const offx = (nx - x0[i]) * pxW;
              const offy = (ny - y0[i]) * pxH;
              if (Math.hypot(offx, offy) > maxOff || Math.abs(nz - z0[i]) * inp.anchor.height > 0.15 * inp.hcap) continue;
              inp.points[i].x = nx;
              inp.points[i].y = ny;
              inp.points[i].z = nz;
              const R = this.build(st, this.twist0, false);
              let c = local(R, i) + (lockW * (offx * offx + offy * offy)) / (maxOff * maxOff);
              const lp = this.layoutPen(this.twist0);
              c += 0.6 * Math.min(lp.viol, 6) + 1.0 * Math.min(Math.max(0, lp.kink - 10), 60) / 10;
              c += 2 * this.crossPenalty(R).pen + 1.5 * this.selfPenalty(R);
              const fr = this.rend.geometry.foldReports[0];
              if (foldIdx >= 0 && (!fr || !fr.built || fr.theta > 2.6 || fr.issues.some((q) => q.level === "error"))) c += 3; // the apex stays a flat fold, not a rolled U-turn
              if (c < best) {
                best = c;
                bestC = [nx, ny, nz];
              }
            }
          }
        }
        inp.points[i].x = bestC[0];
        inp.points[i].y = bestC[1];
        inp.points[i].z = bestC[2];
      }
    }
    let dm = 0;
    for (let i = 0; i < k; i++) dm = Math.max(dm, Math.hypot((inp.points[i].x - x0[i]) * pxW, (inp.points[i].y - y0[i]) * pxH));
    return { before, after: global(), driftMax: dm };
  }

  /**
   * Roll calibration against the measured SILHOUETTE: starting from the width-derived roll (`calibrateReal`), every control
   * point's twist is searched (+- `span` rad) for the best local silhouette / dark-face agreement in a window around it,
   * with a continuity prior. Greedy, control point by control point, a few passes.
   */
  calibrateSilhouette(passes = 2, span = 0.8, steps = 17, cont = 0.25, radius = 95, pinchW = 1.5, globalPen = false): { before: number; after: number; passes: number } {
    const inp = this.input;
    const st = zeroState(inp);
    const k = inp.targets.length;
    const scale = 0.5;
    const m = this.data.scaled(scale);
    const foldIdx = inp.points.findIndex((p) => p.fold);
    const anchorIdx = foldIdx >= 0 ? Math.min(k - 1, foldIdx + 3) : -1;
    const tw = this.twist0.slice();
    // the roll must change gently into and out of a rolled hairpin (the projected band edge kinks where it turns fast)
    const tipProx = new Array<number>(k).fill(0);
    inp.points.forEach((p, j) => {
      if (!p.hairpin) return;
      for (let i = 0; i < k; i++) tipProx[i] = Math.max(tipProx[i], Math.exp(-(((i - j) / 5) ** 2)));
    });
    const local = (R: Rings, i: number): number => {
      const { px, w, h } = this.rend.draw(scale);
      const r = Math.min(R.M - 1, Math.max(0, Math.round(R.frac[i] * (R.M - 1))));
      const cx = R.sx[r] * scale;
      const cy = R.sy[r] * scale;
      const rr = radius * scale;
      const x0 = Math.max(0, Math.floor(cx - rr));
      const x1 = Math.min(w - 1, Math.ceil(cx + rr));
      const y0 = Math.max(0, Math.floor(cy - rr));
      const y1 = Math.min(h - 1, Math.ceil(cy + rr));
      let inter = 0;
      let uni = 0;
      let dI = 0;
      let dU = 0;
      for (let y = y0; y <= y1; y++) {
        const gy = h - 1 - y;
        for (let x = x0; x <= x1; x++) {
          if ((x - cx) ** 2 + (y - cy) ** 2 > rr * rr) continue;
          const gi = gy * w + x;
          if (m.excl[gi]) continue;
          const vis = this.visible(px, w, h, m, gi);
          const mk = m.ribbon[gi] === 1;
          if (vis && mk) inter++;
          if (vis || mk) uni++;
          const bVis = vis && ((px[gi * 4] + 32) >> 6) === 2;
          const mDark = m.cls[gi] === 3;
          if (bVis && mDark) {
            dI++;
            dU++;
          } else if (bVis || mDark) dU++;
        }
      }
      // edge-wise bending near this control point: where hw * kappa_B / 0.5 > 1 the engine relaxes (moves) the path and the edge kinks
      let pinch = 0;
      for (let q = Math.max(3, r - 24); q <= Math.min(R.M - 4, r + 24); q += 2) {
        const dx = R.tan[(q + 2) * 3] - R.tan[(q - 2) * 3];
        const dy = R.tan[(q + 2) * 3 + 1] - R.tan[(q - 2) * 3 + 1];
        const dz = R.tan[(q + 2) * 3 + 2] - R.tan[(q - 2) * 3 + 2];
        const ds = Math.hypot(R.pos[(q + 2) * 3] - R.pos[(q - 2) * 3], R.pos[(q + 2) * 3 + 1] - R.pos[(q - 2) * 3 + 1], R.pos[(q + 2) * 3 + 2] - R.pos[(q - 2) * 3 + 2]) || 1;
        const kb = Math.abs(dx * R.bv[q * 3] + dy * R.bv[q * 3 + 1] + dz * R.bv[q * 3 + 2]) / ds;
        const hw = R.hw[q];
        pinch = Math.max(pinch, (hw * kb) / 0.5);
      }
      return 1 - (uni ? inter / uni : 1) + this.darkW * (dU ? 1 - dI / dU : 0) + pinchW * Math.max(0, pinch - 0.85) ** 2;
    };
    const total = (): number => {
      const R = this.build(st, tw, true);
      void R;
      return 0;
    };
    void total;
    const global = (): number => {
      this.build(st, tw, true);
      const { px, w, h } = this.rend.draw(scale);
      let inter = 0;
      let uni = 0;
      for (let gi = 0; gi < w * h; gi++) {
        if (m.excl[gi]) continue;
        const vis = this.visible(px, w, h, m, gi);
        const mk = m.ribbon[gi] === 1;
        if (vis && mk) inter++;
        if (vis || mk) uni++;
      }
      return uni ? inter / uni : 0;
    };
    const before = global();
    for (let pass = 0; pass < passes; pass++) {
      for (let i = 0; i < k; i++) {
        if (i === anchorIdx) continue;
        if (foldIdx >= 0 && i >= foldIdx - 5 && i <= foldIdx + 1) continue; // stays level (set by calibrateReal)
        const prev = i > 0 ? tw[i - 1] : tw[i];
        const nxt = i < k - 1 ? tw[i + 1] : tw[i];
        const t0 = tw[i];
        let best = Infinity;
        let bestTh = t0;
        for (let g = 0; g < steps; g++) {
          const th = t0 + ((g / (steps - 1)) * 2 - 1) * span;
          tw[i] = th;
          const R = this.build(st, tw, true);
          let c = local(R, i) + cont * (1 + 5 * tipProx[i]) * ((th - prev) ** 2 + (th - nxt) ** 2);
          if (globalPen) {
            // the pose-check limits over every site layout (worst case)
            const lp = this.layoutPen(tw);
            c += 0.6 * Math.min(lp.viol, 6) + 1.0 * Math.min(Math.max(0, lp.kink - 10), 60) / 10;
          }
          if (foldIdx >= 0 && Math.abs(i - foldIdx) <= 2) c += 0.8 * Math.sin(th) ** 2;
          if (c < best) {
            best = c;
            bestTh = th;
          }
        }
        tw[i] = bestTh;
      }
    }
    this.twist0 = tw;
    const after = global();
    return { before, after, passes };
  }

  /**
   * Lock the 2D centreline: the engine moves the path where it relaxes tight edge-wise bends, builds the fold and the
   * hairpins, so the rendered ring centres drift from the measured path. Feed-forward correction: move every control
   * point (in screen space; z is untouched) by the residual at its ring, a few times.
   */
  lockCentreline(iters = 8, gain = 0.5): { rms: number; max: number }[] {
    const inp = this.input;
    const st = zeroState(inp);
    const hist: { rms: number; max: number }[] = [];
    for (let it = 0; it <= iters; it++) {
      const R = this.build(st, this.twist0, true);
      let s2 = 0;
      let mx = 0;
      let n = 0;
      const win = Math.round((1.2 * inp.W) / Math.max(R.ds, 1e-3));
      for (let i = 0; i < inp.points.length; i++) {
        const target = inp.path[inp.knots[i]];
        const r0 = Math.round(R.frac[i] * (R.M - 1));
        let best = Infinity;
        let bx = 0;
        let by = 0;
        for (let r = Math.max(0, r0 - win); r <= Math.min(R.M - 1, r0 + win); r++) {
          const d = (R.sx[r] - target[0]) ** 2 + (R.sy[r] - target[1]) ** 2;
          if (d < best) {
            best = d;
            bx = target[0] - R.sx[r];
            by = target[1] - R.sy[r];
          }
        }
        const e = Math.sqrt(best);
        s2 += best;
        mx = Math.max(mx, e);
        n++;
        if (it < iters) {
          const sc = e > 12 ? 12 / e : 1;
          inp.points[i].x += (gain * bx * sc) / inp.anchor.width;
          inp.points[i].y += (gain * by * sc) / inp.anchor.height;
        }
      }
      hist.push({ rms: Math.sqrt(s2 / Math.max(n, 1)), max: mx });
    }
    return hist;
  }

  /**
   * Target the worst edge kink directly: at the control points around its ring try small roll / depth / position changes
   * and keep the one that lowers the kink most for the least silhouette loss (kink units vs IoU: 1 IoU point = `iouW` kink units).
   */
  fixKink(maxIter = 40, target = 10.2, iouW = 150): { kink: number; iou: number; iters: number; viol: number } {
    const inp = this.input;
    const st = zeroState(inp);
    const k = inp.points.length;
    const scale = 0.5;
    const m = this.data.scaled(scale);
    const foldIdx = inp.points.findIndex((p) => p.fold);
    const iouNow = (): number => {
      this.build(st, this.twist0, true);
      const { px, w, h } = this.rend.draw(scale);
      let inter = 0;
      let uni = 0;
      for (let gi = 0; gi < w * h; gi++) {
        if (m.excl[gi]) continue;
        const vis = this.visible(px, w, h, m, gi);
        const mk = m.ribbon[gi] === 1;
        if (vis && mk) inter++;
        if (vis || mk) uni++;
      }
      return uni ? inter / uni : 0;
    };
    // hard constraints (fold built, crossings, no self intersection); the layout limits (viol) are traded in the score
    const violOf = (R: Rings): number => {
      let v = 0;
      const fr = this.rend.geometry.foldReports[0];
      if (foldIdx >= 0 && (!fr || !fr.built || fr.theta > 2.6 || fr.issues.some((q) => q.level === "error"))) v += 3;
      return v + 4 * this.crossPenalty(R).pen + 4 * this.selfPenalty(R);
    };
    let iters = 0;
    const worstKink = (): { kink: number; frac: number; viol: number } => {
      const R0 = this.build(st, this.twist0, false);
      const pr = this.layoutPen(this.twist0);
      return R0.kink >= pr.kink ? { kink: R0.kink, frac: R0.kinkAt / Math.max(R0.M - 1, 1), viol: pr.viol } : { kink: pr.kink, frac: pr.frac, viol: pr.viol };
    };
    let R = this.build(st, this.twist0, false);
    let wk = worstKink();
    let kink = wk.kink;
    let iou = iouNow();
    for (; iters < maxIter; iters++) {
      R = this.build(st, this.twist0, false);
      wk = worstKink();
      kink = wk.kink;
      if (kink <= target && wk.viol <= 0.01) break;
      const ring = wk.frac * (R.M - 1);
      let ci = 0;
      let bd = Infinity;
      for (let i = 0; i < k; i++) {
        const d = Math.abs(R.frac[i] * (R.M - 1) - ring);
        if (d < bd) {
          bd = d;
          ci = i;
        }
      }
      type Var = { i: number; kind: string; d: number };
      const vars: Var[] = [];
      for (let i = Math.max(0, ci - 3); i <= Math.min(k - 1, ci + 3); i++) {
        if (foldIdx >= 0 && Math.abs(i - foldIdx) <= 2) continue;
        for (const d of [-0.3, -0.12, 0.12, 0.3]) vars.push({ i, kind: "tw", d });
        for (const d of [-0.06, 0.06]) vars.push({ i, kind: "z", d });
        for (const d of [-7, 7]) {
          vars.push({ i, kind: "x", d });
          vars.push({ i, kind: "y", d });
        }
      }
      let bestScore = kink + 60 * wk.viol;
      let best: Var | null = null;
      const apply = (v: Var, sign: number): void => {
        const p = inp.points[v.i];
        if (v.kind === "tw") this.twist0[v.i] += sign * v.d;
        else if (v.kind === "z") p.z += (sign * v.d * inp.hcap) / inp.anchor.height;
        else if (v.kind === "x") p.x += (sign * v.d) / inp.anchor.width;
        else p.y += (sign * v.d) / inp.anchor.height;
      };
      for (const v of vars) {
        apply(v, 1);
        const R2 = this.build(st, this.twist0, false);
        if (violOf(R2) <= 0.01) {
          const i2 = iouNow();
          const w2 = worstKink();
          const sc = w2.kink + 60 * w2.viol + iouW * Math.max(0, iou - i2);
          if (sc < bestScore - 0.05) {
            bestScore = sc;
            best = v;
          }
        }
        apply(v, -1);
      }
      if (!best) break;
      apply(best, 1);
      iou = iouNow();
      kink = worstKink().kink;
    }
    return { kink, iou, iters, viol: wk.viol };
  }

  /**
   * Which face shows on each strand is a parity question: every half-turn of the roll (rolled hairpin, or a twist hidden behind
   * the type) flips it. Try every subset of the candidate spots (control indices); a half-turn is added as a smooth ramp over
   * ~4 control points (all later controls carry it), scored on silhouette + dark-face agreement. Keeps the best.
   */
  parityScan(spots: number[]): { best: number[]; score: number; scores: number[] } {
    const inp = this.input;
    const st = zeroState(inp);
    const k = inp.points.length;
    const scale = 0.5;
    const m = this.data.scaled(scale);
    const base = this.twist0.slice();
    const sorted = [...spots].sort((a, b) => a - b);
    const score = (tw: number[]): number => {
      this.build(st, tw, true);
      const { px, w, h } = this.rend.draw(scale);
      let inter = 0;
      let uni = 0;
      let dI = 0;
      let dU = 0;
      for (let gi = 0; gi < w * h; gi++) {
        if (m.excl[gi]) continue;
        const vis = this.visible(px, w, h, m, gi);
        const mk = m.ribbon[gi] === 1;
        if (vis && mk) inter++;
        if (vis || mk) uni++;
        const bVis = vis && ((px[gi * 4] + 32) >> 6) === 2;
        const mDark = m.cls[gi] === 3;
        if (bVis && mDark) {
          dI++;
          dU++;
        } else if (bVis || mDark) dU++;
      }
      return (uni ? inter / uni : 0) + 1.5 * (dU ? dI / dU : 0);
    };
    let best: number[] = [];
    let bestScore = -Infinity;
    const scores: number[] = [];
    for (let mask = 0; mask < 1 << sorted.length; mask++) {
      const tw = base.slice();
      for (let b = 0; b < sorted.length; b++) {
        if (!(mask & (1 << b))) continue;
        const j = sorted[b];
        for (let i = 0; i < k; i++) {
          const t = Math.min(Math.max((i - (j - 2)) / 4, 0), 1);
          tw[i] += Math.PI * t * t * (3 - 2 * t);
        }
      }
      const sc = score(tw);
      scores.push(sc);
      if (sc > bestScore) {
        bestScore = sc;
        best = sorted.filter((_, b) => mask & (1 << b));
        this.twist0 = tw;
      }
    }
    return { best, score: bestScore, scores };
  }

  /** low-pass the calibrated roll over neighbouring control points (not across the fold zone) */
  smoothTwist(sigma: number): void {
    const k = this.twist0.length;
    const foldIdx = this.input.points.findIndex((p) => p.fold);
    const tw = this.twist0.slice();
    const rad = Math.ceil(sigma * 3);
    for (let i = 0; i < k; i++) {
      if (foldIdx >= 0 && i >= foldIdx - 2 && i <= foldIdx + 4) continue;
      let sw = 0;
      let sv = 0;
      for (let d = -rad; d <= rad; d++) {
        const j = i + d;
        if (j < 0 || j >= k) continue;
        if (foldIdx >= 0 && j >= foldIdx - 2 && j <= foldIdx + 4) continue;
        if (foldIdx >= 0 && (i < foldIdx) !== (j < foldIdx)) continue;
        const w = Math.exp(-0.5 * (d / sigma) ** 2);
        sw += w;
        sv += w * this.twist0[j];
      }
      tw[i] = sv / sw;
    }
    this.twist0 = tw;
  }

  /** debug: how a uniform twist rotates the frames (angle of B about T, per sampled ring) */
  probeTwist(th: number): { r: number; ang: number; ndot: number }[] {
    const st = zeroState(this.input);
    const z = this.twist0.map(() => 0);
    const R0 = this.build(st, z);
    const B0 = new Float32Array(R0.bv);
    const N0 = new Float32Array(R0.nv);
    const T0 = new Float32Array(R0.tan);
    const R1 = this.build(st, z.map(() => th));
    const out: { r: number; ang: number; ndot: number }[] = [];
    for (let r = 20; r < R0.M - 20; r += 40) {
      const b0 = [B0[r * 3], B0[r * 3 + 1], B0[r * 3 + 2]];
      const b1 = [R1.bv[r * 3], R1.bv[r * 3 + 1], R1.bv[r * 3 + 2]];
      const t = [T0[r * 3], T0[r * 3 + 1], T0[r * 3 + 2]];
      const c = [b0[1] * b1[2] - b0[2] * b1[1], b0[2] * b1[0] - b0[0] * b1[2], b0[0] * b1[1] - b0[1] * b1[0]];
      const ang = Math.atan2(c[0] * t[0] + c[1] * t[1] + c[2] * t[2], b0[0] * b1[0] + b0[1] * b1[1] + b0[2] * b1[2]);
      const ndot = N0[r * 3] * R1.nv[r * 3] + N0[r * 3 + 1] * R1.nv[r * 3 + 1] + N0[r * 3 + 2] * R1.nv[r * 3 + 2];
      out.push({ r, ang: Math.round(ang * 100) / 100, ndot: Math.round(ndot * 100) / 100 });
    }
    return out;
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

  /** visible face class per pixel at full resolution, TOP-DOWN: 0 none, 1 face A, 2 face B, 3 edge */
  classMap(state: S2cState): Uint8Array {
    this.build(state ? state : zeroState(this.input), this.twist0);
    const { px, w, h } = this.rend.draw(1);
    const m = this.data.scaled(1);
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const gy = h - 1 - y;
      for (let x = 0; x < w; x++) {
        const gi = gy * w + x;
        out[y * w + x] = this.visible(px, w, h, m, gi) ? (px[gi * 4] + 32) >> 6 : 0;
      }
    }
    return out;
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
