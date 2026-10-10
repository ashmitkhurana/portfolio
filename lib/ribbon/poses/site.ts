/**
 * Glue for the live site: which pose a route shows, and resolving a named pose
 * against the real layout (measured anchor + the engine's size and camera).
 */
import type { RibbonPose } from "../types";
import { findAnchor, measureAnchor } from "./anchors";
import { loadPose, parsePoseFile } from "./index";
import { fitRuled, resolvePose, resolveRuled, screenClassFor, steerTail, variantFor } from "./resolve";
import type { AnchorRect, PoseFile, PoseVariant, RuledRing } from "./types";
import type { ResolveContext } from "./resolve";

/**
 * QA only (scripts/render-pose.mjs): a build with NEXT_PUBLIC_POSE_OVERRIDE set reads the pose from
 * `window.__poseOverride` (a pose JSON injected before load) instead of the bundled file. Unset: dead code.
 */
const POSE_OVERRIDE = !!process.env.NEXT_PUBLIC_POSE_OVERRIDE;

/** route -> authored pose; everything else keeps the interim lab sweep */
export function poseNameForRoute(pathname: string): string {
  return pathname === "/" ? "ak-hero" : "sweep";
}

export interface PoseTarget {
  width: number;
  height: number;
  sim: { count: number };
  settings: { camera: { fov: number } };
}

export interface ResolvedNamedPose {
  pose: RibbonPose;
  anchor: AnchorRect;
  /** cheap change detector: view size + anchor rect */
  signature: string;
}

/** ruled rings for this layout: fitted from another variant (FitSpec) and/or with a responsive tail (TailSpec) */
function placeRuled(file: PoseFile, variant: PoseVariant, ctx: ResolveContext): RuledRing[] {
  let rings: RuledRing[] = variant.ruled ?? [];
  const src = variant.fit ? file.variants[variant.fit.from]?.ruled : undefined;
  if (variant.fit && src && src.length >= 2) rings = fitRuled(src, ctx, variant.fit);
  return variant.tail ? steerTail(rings, ctx, variant.tail) : rings;
}

/** Resolve an authored pose for the current layout, or null when it cannot be (no anchor on this page). */
export function resolveNamedPose(name: string, e: PoseTarget): ResolvedNamedPose | null {
  let file;
  try {
    const ov = POSE_OVERRIDE ? (window as unknown as { __poseOverride?: unknown }).__poseOverride : undefined;
    file = ov ? parsePoseFile(ov) : loadPose(name);
  } catch {
    return null;
  }
  const el = findAnchor(file.anchor);
  const anchor = el ? measureAnchor(el) : null;
  if (!anchor) return null;
  const cls = screenClassFor(e.width);
  const { variant } = variantFor(file, cls, e.height > e.width);
  if (!variant) return null;
  const ctx = { viewW: e.width, viewH: e.height, anchor, fov: e.settings.camera.fov };
  const pose = variant.ruled
    ? resolveRuled(placeRuled(file, variant, ctx), ctx, e.sim.count, variant.faceSign ?? 1)
    : resolvePose(variant.points, ctx, e.sim.count, file.orientation ?? "curvature", variant.spline ?? "catmull", variant.spans);
  const r = (v: number) => Math.round(v * 2) / 2;
  const signature = [e.width, e.height, r(anchor.left), r(anchor.top), r(anchor.width), r(anchor.height)].join(",");
  return { pose, anchor, signature };
}
