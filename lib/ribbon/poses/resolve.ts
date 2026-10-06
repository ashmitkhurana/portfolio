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
import type { AnchorRect, PoseFile, PosePoint, PoseVariant, ScreenClass } from "./types";

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
    if (variant && variant.points.length >= 2) return { variant, source: c, derived: c !== cls };
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
  return {
    points: outPos,
    twists: outTw,
    widths: outWd,
    orientation,
    ...(folds.length ? { folds } : {}),
    ...(hairpins.length ? { hairpins } : {}),
  };
}
