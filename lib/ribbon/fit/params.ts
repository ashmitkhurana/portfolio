/**
 * Parameterisation of the AK fit.
 *
 * Fit frame: the 1672 x 941 mockup in px, site camera (1 unit = 1 px at z = 0,
 * origin at the viewport centre, +y up). The pose anchor is the mockup's name
 * bounding box; pose points are stored in anchor space exactly like
 * `lib/ribbon/poses` (x, y = fraction of the anchor box where the point APPEARS,
 * z in anchor heights), so the optimised pose drops into ak-hero.json as is.
 */
import type { PosePoint } from "../poses/types";

export const VIEW = { w: 1672, h: 941 } as const;

/** the mockup's name bounding box (x 68 -> 1265, y 205 -> 590), image px, y down */
export const ANCHOR = { left: 68, top: 205, width: 1265 - 68, height: 590 - 205 } as const;

/** engine ribbon width at the fit viewport: geometry.width (68) * clamp(w / 1440, 0.5, 1.4) */
export const ENGINE_WIDTH_BASE = 68;
export function engineWidth(viewW: number = VIEW.w): number {
  return ENGINE_WIDTH_BASE * Math.min(Math.max(viewW / 1440, 0.5), 1.4);
}

export const N_PTS = 26;

/** control point -> topology group (index 0 = T1 ... 8 = T9) */
export const GROUP_RANGES: Record<string, [number, number]> = {
  T1: [0, 2],
  T2: [3, 4],
  T3: [5, 7],
  T4: [8, 11],
  T5: [12, 14],
  T6: [15, 18],
  T7: [19, 20],
  T8: [21, 23],
  T9: [24, 25],
};
/** the 4 fold points: A apex, K lower tip, K upper tip, S U-turn */
export const FOLD_IDX = [4, 9, 13, 23] as const;
export const FOLD_NAMES = ["A apex", "K lower tip", "K upper tip", "S U-turn"] as const;

/** the K junction / crossing control point indices used by the constraints */
export const IDX = {
  legStart: 5, // T3 first point (A right leg)
  legEnd: 7, // T3 last point (K junction)
  lowerTip: 9,
  upperTip: 13,
  crossbarStart: 15,
  crossbarEnd: 18,
  leftLegStart: 0,
  leftLegEnd: 3,
} as const;

export interface FitState {
  /** screen px of where each control point appears (image px, y down) */
  x: number[];
  y: number[];
  /** world depth px (+ towards the camera, text plane = 0) */
  z: number[];
  /** roll offset (radians) relative to the curvature frames */
  twist: number[];
  /** ribbon band width at z = 0 (px) */
  width: number;
  /** camera fov (degrees) */
  fov: number;
  /** fold radius in ribbon widths (of the band) */
  foldR: number;
  /** +1 / -1 per fold (the sign of the dihedral angle: which side it rolls to) */
  foldSign: number[];
}

/** hand-ordered initial waypoints (x, y, z) of the 26 control points; see scripts/fit/init.mjs */
export const INIT_WAYPOINTS: [number, number, number][] = [
  // T1: hidden end behind KHURANA, up the A left leg (behind the T)
  [800, 450, -110],
  [862, 350, -110],
  [895, 215, -85],
  // T2: the A apex (fold)
  [945, 125, -20],
  [995, 105, 40],
  // T3: right leg down, over the crossbar, on to the K junction
  [1053, 184, 60],
  [1118, 365, 85],
  [1254, 395, 60],
  // T4: lower K loop, tip (fold), back to the junction
  [1338, 497, 90],
  [1580, 735, 50],
  [1400, 775, 40],
  [1245, 650, 20],
  // T5: upper K loop, tip (fold), back down-left
  [1470, 330, 30],
  [1580, 222, 40],
  [1400, 310, 10],
  // T6: the crossbar (in front of ASHMIT, behind KHURANA)
  [1230, 395, -70],
  [1104, 414, -60],
  [940, 376, 50],
  [800, 395, 30],
  // T7: down behind the R
  [745, 470, -110],
  [690, 590, -110],
  // T8: the S, U-turn (fold)
  [655, 650, -50],
  [880, 722, 50],
  [1125, 782, 80],
  // T9: the tail, out of the bottom edge
  [880, 850, 200],
  [480, 990, 400],
];

export function initialState(snap?: { x: number; y: number }[] | null): FitState {
  const x: number[] = [];
  const y: number[] = [];
  const z: number[] = [];
  for (let i = 0; i < N_PTS; i++) {
    const [wx, wy, wz] = INIT_WAYPOINTS[i];
    let px = wx;
    let py = wy;
    const s = snap?.[i];
    if (s) {
      px = s.x;
      py = s.y;
    }
    x.push(px);
    y.push(py);
    z.push(wz);
  }
  return {
    x,
    y,
    z,
    twist: new Array(N_PTS).fill(0),
    width: 62,
    fov: 28,
    foldR: 0.8,
    foldSign: [1, 1, 1, 1],
  };
}

export function cloneState(s: FitState): FitState {
  return {
    x: [...s.x],
    y: [...s.y],
    z: [...s.z],
    twist: [...s.twist],
    width: s.width,
    fov: s.fov,
    foldR: s.foldR,
    foldSign: [...s.foldSign],
  };
}

// ---- vector layout --------------------------------------------------------

export type DimKind = "x" | "y" | "z" | "twist" | "width" | "fov" | "foldR";
export interface Dim {
  kind: DimKind;
  idx: number;
  /** characteristic step (the CMA works in units of this) */
  scale: number;
  lo: number;
  hi: number;
}

export const DIMS: Dim[] = (() => {
  const d: Dim[] = [];
  for (let i = 0; i < N_PTS; i++) d.push({ kind: "x", idx: i, scale: 30, lo: -250, hi: 1950 });
  for (let i = 0; i < N_PTS; i++) d.push({ kind: "y", idx: i, scale: 30, lo: -350, hi: 1300 });
  for (let i = 0; i < N_PTS; i++) d.push({ kind: "z", idx: i, scale: 60, lo: -350, hi: 900 });
  for (let i = 0; i < N_PTS; i++) d.push({ kind: "twist", idx: i, scale: 0.45, lo: -6.5, hi: 6.5 });
  d.push({ kind: "width", idx: 0, scale: 8, lo: 40, hi: 130 });
  d.push({ kind: "fov", idx: 0, scale: 3, lo: 18, hi: 45 });
  d.push({ kind: "foldR", idx: 0, scale: 0.15, lo: 0.55, hi: 1.6 });
  return d;
})();

export function getDim(s: FitState, d: Dim): number {
  switch (d.kind) {
    case "x":
      return s.x[d.idx];
    case "y":
      return s.y[d.idx];
    case "z":
      return s.z[d.idx];
    case "twist":
      return s.twist[d.idx];
    case "width":
      return s.width;
    case "fov":
      return s.fov;
    case "foldR":
      return s.foldR;
  }
}

export function setDim(s: FitState, d: Dim, v: number): void {
  switch (d.kind) {
    case "x":
      s.x[d.idx] = v;
      break;
    case "y":
      s.y[d.idx] = v;
      break;
    case "z":
      s.z[d.idx] = v;
      break;
    case "twist":
      s.twist[d.idx] = v;
      break;
    case "width":
      s.width = v;
      break;
    case "fov":
      s.fov = v;
      break;
    case "foldR":
      s.foldR = v;
      break;
  }
}

export type StageDims = "xy" | "xyz-tw-fov" | "all";

/** when set, the camera fov is fixed to this value (not optimised, not bounded by the 18-45 range) */
let fovLock: number | null = null;
export function setFovLock(v: number | null): void {
  fovLock = v;
}
export function getFovLock(): number | null {
  return fovLock;
}

export function activeDims(stage: StageDims): number[] {
  const out: number[] = [];
  DIMS.forEach((d, i) => {
    if (d.kind === "fov" && fovLock !== null) return;
    if (d.kind === "x" || d.kind === "y") out.push(i);
    else if (stage !== "xy" && (d.kind === "z" || d.kind === "twist" || d.kind === "fov")) out.push(i);
    else if (stage === "all" && (d.kind === "width" || d.kind === "foldR")) out.push(i);
  });
  return out;
}

/** clamp the state into the bounds; returns the total normalised violation (for the bounds penalty) */
export function clampState(s: FitState): number {
  let v = 0;
  if (fovLock !== null) s.fov = fovLock;
  for (const d of DIMS) {
    const x = getDim(s, d);
    if (x < d.lo) {
      v += ((d.lo - x) / d.scale) ** 2;
      setDim(s, d, d.lo);
    } else if (x > d.hi) {
      v += ((x - d.hi) / d.scale) ** 2;
      setDim(s, d, d.hi);
    }
  }
  // the fold roll radius (in engine widths) must stay >= the engine's soft floor
  const m = s.width / engineWidth();
  const rMin = Math.max(0.55, 0.46 / m);
  if (s.foldR < rMin) {
    v += ((rMin - s.foldR) / 0.15) ** 2;
    s.foldR = rMin;
  }
  return v;
}

// ---- pose conversion -------------------------------------------------------

/** the pose points exactly as they go into ak-hero.json (anchor space) */
export function toPosePoints(s: FitState): PosePoint[] {
  const m = s.width / engineWidth();
  const pts: PosePoint[] = [];
  for (let i = 0; i < N_PTS; i++) {
    const p: PosePoint = {
      x: (s.x[i] - ANCHOR.left) / ANCHOR.width,
      y: (s.y[i] - ANCHOR.top) / ANCHOR.height,
      z: s.z[i] / ANCHOR.height,
      twist: s.twist[i],
      width: m,
    };
    const f = (FOLD_IDX as readonly number[]).indexOf(i);
    if (f >= 0) p.fold = { angle: s.foldSign[f] * Math.PI, radius: s.foldR * m };
    pts.push(p);
  }
  return pts;
}

/** inverse of toPosePoints (for --resume / re-evaluating a pose file) */
export function fromPosePoints(pts: PosePoint[], fov: number): FitState {
  const m = pts[0].width;
  const s = initialState();
  for (let i = 0; i < N_PTS; i++) {
    s.x[i] = ANCHOR.left + pts[i].x * ANCHOR.width;
    s.y[i] = ANCHOR.top + pts[i].y * ANCHOR.height;
    s.z[i] = pts[i].z * ANCHOR.height;
    s.twist[i] = pts[i].twist;
  }
  s.width = m * engineWidth();
  s.fov = fov;
  FOLD_IDX.forEach((idx, f) => {
    const fo = pts[idx].fold;
    if (fo) {
      s.foldSign[f] = fo.angle >= 0 ? 1 : -1;
      s.foldR = fo.radius / m;
    }
  });
  return s;
}
