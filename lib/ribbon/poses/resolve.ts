/**
 * Pose resolver: anchor-space control points + a measured anchor rect -> the
 * world-space RibbonPose the sim springs towards.
 *
 * DOM-free (the anchor rect and view size are passed in), so it is shared by
 * the site mount and the pose editor. Re-run it on resize and when fonts load.
 */
import { RibbonCurve, type SplineKind } from "../frames";
import type { FoldSpec } from "../fold";
import type { HairpinSpec, RibbonPose } from "../types";
import { DEFAULT_FOV, cameraDistance } from "./camera";
import type { AnchorRect, PoseFile, PosePoint, PoseVariant, RuledRing, ScreenClass } from "./types";

/** phone < 768, tablet 768-1099, desktop 1100-2199, ultrawide >= 2200 (the CSS screen classes) */
export function screenClassFor(viewW: number): ScreenClass {
  if (viewW < 768) return "phone";
  if (viewW < 1100) return "tablet";
  if (viewW >= 2200) return "ultrawide";
  return "desktop";
}

export interface VariantPick {
  variant: PoseVariant | null;
  /** the class whose data is used */
  source: ScreenClass;
  /** true when `source` differs from the requested class (no override stored) */
  derived: boolean;
}

/**
 * Pick the variant to use for a screen class. Tablet falls back to the phone
 * variant in portrait and to the desktop variant in landscape (the hero
 * composition switches there); ultrawide reuses desktop; everything else falls
 * back to whatever exists.
 */
export function variantFor(file: PoseFile, cls: ScreenClass, portrait: boolean): VariantPick {
  const v = file.variants;
  const order: ScreenClass[] =
    cls === "tablet"
      ? portrait
        ? ["tablet", "phone", "desktop", "ultrawide"]
        : ["tablet", "desktop", "ultrawide", "phone"]
      : cls === "ultrawide"
        ? ["ultrawide", "desktop", "tablet", "phone"]
        : cls === "phone"
          ? ["phone", "tablet", "desktop", "ultrawide"]
          : ["desktop", "ultrawide", "tablet", "phone"];
  for (const c of order) {
    const variant = v[c];
    if (variant && (variant.points.length >= 2 || (variant.ruled?.length ?? 0) >= 2)) return { variant, source: c, derived: c !== cls };
  }
  return { variant: null, source: cls, derived: true };
}

export interface ResolveContext {
  /** the drawing surface (the engine's size), CSS px */
  viewW: number;
  viewH: number;
  anchor: AnchorRect;
  fov?: number;
}

/** anchor space -> where the point appears, viewport CSS px (y down) */
export function anchorToScreen(
  p: Pick<PosePoint, "x" | "y">,
  anchor: AnchorRect,
): { x: number; y: number } {
  return { x: anchor.left + p.x * anchor.width, y: anchor.top + p.y * anchor.height };
}

/** viewport CSS px -> anchor-space x / y */
export function screenToAnchor(
  sx: number,
  sy: number,
  anchor: AnchorRect,
): { x: number; y: number } {
  return { x: (sx - anchor.left) / anchor.width, y: (sy - anchor.top) / anchor.height };
}

/** one control point -> world px (x, y up, z) */
export function pointToWorld(
  p: PosePoint,
  ctx: ResolveContext,
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const s = anchorToScreen(p, ctx.anchor);
  const z = p.z * ctx.anchor.height;
  const D = cameraDistance(ctx.viewH, ctx.fov ?? DEFAULT_FOV);
  const k = (D - z) / D; // the point must appear at (sx, sy): undo the perspective
  out[0] = (s.x - ctx.viewW / 2) * k;
  out[1] = (ctx.viewH / 2 - s.y) * k;
  out[2] = z;
  return out;
}

/** world px -> anchor-space point (inverse of pointToWorld, twist / width untouched) */
export function worldToPoint(
  x: number,
  y: number,
  z: number,
  ctx: ResolveContext,
): { x: number; y: number; z: number } {
  const D = cameraDistance(ctx.viewH, ctx.fov ?? DEFAULT_FOV);
  const k = D / Math.max(D - z, 1);
  const sx = ctx.viewW / 2 + x * k;
  const sy = ctx.viewH / 2 - y * k;
  const a = screenToAnchor(sx, sy, ctx.anchor);
  return { x: a.x, y: a.y, z: z / ctx.anchor.height };
}

/** authored control points -> world xyz triples + twist + width arrays (same count) */
export function resolveControlPoints(
  points: readonly PosePoint[],
  ctx: ResolveContext,
): { pos: Float32Array; twist: Float32Array; width: Float32Array } {
  const n = points.length;
  const pos = new Float32Array(n * 3);
  const twist = new Float32Array(n);
  const width = new Float32Array(n);
  const tmp: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    pointToWorld(points[i], ctx, tmp);
    pos[i * 3] = tmp[0];
    pos[i * 3 + 1] = tmp[1];
    pos[i * 3 + 2] = tmp[2];
    twist[i] = points[i].twist;
    width[i] = points[i].width;
  }
  return { pos, twist, width };
}

/** the engine's max control points (RibbonGeometry is built for 128) */
export const MAX_POSE_POINTS = 120;

const curve = new RibbonCurve(128);

/**
 * Resolve to exactly `count` world-space control points for `RibbonSim.setTargetPose`:
 * the authored points are run through the same centripetal spline the geometry
 * uses and resampled by arc length, so the sim's control polygon follows the
 * authored curve (no smoothing: tight bends stay tight).
 */
export function resolvePose(
  points: readonly PosePoint[],
  ctx: ResolveContext,
  count: number,
  orientation: "curvature" | "rmf" = "curvature",
  spline: SplineKind = "catmull",
  spans?: PoseVariant["spans"],
): RibbonPose {
  const src = resolveControlPoints(points.slice(0, MAX_POSE_POINTS), ctx);
  const n = Math.min(points.length, MAX_POSE_POINTS);
  const outPos = new Float32Array(count * 3);
  const outTan = new Float32Array(count * 3);
  const outTw = new Float32Array(count);
  const outWd = new Float32Array(count);
  if (n < 2) return { points: outPos, twists: outTw, widths: outWd.fill(1), orientation };
  curve.setControl(src.pos, src.twist, src.width, n, spline);
  curve.sampleRings(count, 0, outPos, outTan, outTw, outWd);
  // folds: arc fraction of each marked control point along the authored curve
  const folds: FoldSpec[] = [];
  const hairpins: HairpinSpec[] = [];
  for (let i = 0; i < n; i++) {
    const f = points[i].fold;
    if (f) folds.push({ at: curve.arcFractionAtControl(i), angle: f.angle, radius: f.radius, ...(f.name ? { name: f.name } : {}) });
    const h = points[i].hairpin;
    if (h) hairpins.push({ at: curve.arcFractionAtControl(i), name: h.name, radius: h.radius });
  }
  const outSpans = (spans ?? [])
    .filter((s) => s.from >= 0 && s.to > s.from && s.to < n)
    .map((s) => ({
      at0: curve.arcFractionAtControl(s.from),
      at1: curve.arcFractionAtControl(s.to),
      rolls: s.rolls,
      ...(s.name ? { name: s.name } : {}),
    }));
  return {
    points: outPos,
    twists: outTw,
    widths: outWd,
    orientation,
    ...(outSpans.length ? { spans: outSpans } : {}),
    ...(folds.length ? { folds } : {}),
    ...(hairpins.length ? { hairpins } : {}),
  };
}

/**
 * Resolve a RULED variant: each ring's two ends are unprojected with the engine camera (so the projection
 * equals the authored screen positions), centre = midpoint, B = unit(R - L), half width = |R - L| / 2.
 * `count` control points are chosen along the centreline with density rising with turning x width (the
 * hairpins keep their shape), each carrying B and half width; the geometry interpolates those to its rings.
 */
export function resolveRuled(
  rings: readonly RuledRing[],
  ctx: ResolveContext,
  count: number,
  faceSign: 1 | -1 = 1,
): RibbonPose {
  const n = rings.length;
  const C = new Float64Array(n * 3);
  const Bv = new Float64Array(n * 3);
  const H = new Float64Array(n);
  const l: [number, number, number] = [0, 0, 0];
  const r: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    pointToWorld({ x: rings[i].L[0], y: rings[i].L[1], z: rings[i].L[2] } as PosePoint, ctx, l);
    pointToWorld({ x: rings[i].R[0], y: rings[i].R[1], z: rings[i].R[2] } as PosePoint, ctx, r);
    const dx = r[0] - l[0], dy = r[1] - l[1], dz = r[2] - l[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    C[i * 3] = (l[0] + r[0]) / 2;
    C[i * 3 + 1] = (l[1] + r[1]) / 2;
    C[i * 3 + 2] = (l[2] + r[2]) / 2;
    Bv[i * 3] = dx / len;
    Bv[i * 3 + 1] = dy / len;
    Bv[i * 3 + 2] = dz / len;
    H[i] = len / 2;
  }
  // sampling weight: arc length + turning angle x width (turns keep more control points)
  const w = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const ds = Math.hypot(C[i * 3] - C[i * 3 - 3], C[i * 3 + 1] - C[i * 3 - 2], C[i * 3 + 2] - C[i * 3 - 1]);
    let turn = 0;
    if (i >= 2) {
      const ax = C[i * 3 - 3] - C[i * 3 - 6], ay = C[i * 3 - 2] - C[i * 3 - 5], az = C[i * 3 - 1] - C[i * 3 - 4];
      const bx = C[i * 3] - C[i * 3 - 3], by = C[i * 3 + 1] - C[i * 3 - 2], bz = C[i * 3 + 2] - C[i * 3 - 1];
      const d = (ax * bx + ay * by + az * bz) / ((Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz)) || 1);
      turn = Math.acos(Math.min(Math.max(d, -1), 1));
    }
    w[i] = w[i - 1] + ds + 3 * turn * H[i] * 2;
  }
  const outPos = new Float32Array(count * 3);
  const data = new Float32Array(count * 4);
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = count > 1 ? (k / (count - 1)) * w[n - 1] : 0;
    while (j < n - 2 && w[j + 1] < target) j++;
    const span = w[j + 1] - w[j];
    const f = span > 1e-9 ? Math.min(Math.max((target - w[j]) / span, 0), 1) : 0;
    for (let a = 0; a < 3; a++) {
      outPos[k * 3 + a] = C[j * 3 + a] + (C[(j + 1) * 3 + a] - C[j * 3 + a]) * f;
      data[k * 4 + a] = Bv[j * 3 + a] + (Bv[(j + 1) * 3 + a] - Bv[j * 3 + a]) * f;
    }
    const bl = Math.hypot(data[k * 4], data[k * 4 + 1], data[k * 4 + 2]) || 1;
    data[k * 4] /= bl;
    data[k * 4 + 1] /= bl;
    data[k * 4 + 2] /= bl;
    data[k * 4 + 3] = H[j] + (H[j + 1] - H[j]) * f;
  }
  return {
    points: outPos,
    twists: new Float32Array(count),
    widths: new Float32Array(count).fill(1),
    orientation: "curvature",
    ruled: { data, sign: faceSign },
  };
}
