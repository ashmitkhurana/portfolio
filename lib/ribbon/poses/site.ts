/**
 * Glue for the live site: which pose a route shows, and resolving a named pose
 * against the real layout (measured anchor + the engine's size and camera).
 */
import type { RibbonPose } from "../types";
import { findAnchor, measureAnchor } from "./anchors";
import { loadPose } from "./index";
import { resolvePose, resolveRuled, screenClassFor, variantFor } from "./resolve";
import type { AnchorRect } from "./types";

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

/** Resolve an authored pose for the current layout, or null when it cannot be (no anchor on this page). */
export function resolveNamedPose(name: string, e: PoseTarget): ResolvedNamedPose | null {
  let file;
  try {
    file = loadPose(name);
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
    ? resolveRuled(variant.ruled, ctx, e.sim.count, variant.faceSign ?? 1)
    : resolvePose(variant.points, ctx, e.sim.count, file.orientation ?? "curvature", variant.spline ?? "catmull");
  const r = (v: number) => Math.round(v * 2) / 2;
  const signature = [e.width, e.height, r(anchor.left), r(anchor.top), r(anchor.width), r(anchor.height)].join(",");
  return { pose, anchor, signature };
}
