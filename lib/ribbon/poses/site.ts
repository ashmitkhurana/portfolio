/**
 * Glue for the live site: which pose a route shows, and resolving a named pose
 * against the real layout (measured anchor + the engine's size and camera).
 */
import type { RibbonPose } from "../types";
import { findAnchor, measureAnchor } from "./anchors";
import { restOffsetY } from "../pin";
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
  // /contact is a 1:1 copy of the home page's last screen: the same AK, at the hero's own screen spot
  return pathname === "/" || pathname === "/contact" ? "ak-hero" : "sweep";
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
function placeRuled(file: PoseFile, variant: PoseVariant, ctx: ResolveContext, el: HTMLElement | null = null): RuledRing[] {
  let rings: RuledRing[] = phoneFitScale(variant, ctx, el);
  const src = variant.fit ? file.variants[variant.fit.from]?.ruled : undefined;
  if (variant.fit && src && src.length >= 2) rings = fitRuled(src, ctx, variant.fit);
  return variant.tail ? steerTail(rings, ctx, variant.tail) : rings;
}

/**
 * Phones (portrait): the AK's body (its loops, rings from 200 on; the tail is rebuilt below the tagline anyway) must
 * end above the hero's tagline, as on a 390 x 844 iPhone. Where the screen is too short or narrow for that, the AK is
 * scaled down about its apex in the name's box, just enough (never below 66%): the apex keeps its place over KHURANA,
 * the loops pull up. Where it already clears (e.g. the iPhone the hero was approved on), the rings are untouched. The
 * responsive tail is rebuilt from the scaled rings afterwards. (Exposed as window.__akScale for QA.)
 */
function phoneFitScale(variant: PoseVariant, ctx: ResolveContext, el: HTMLElement | null): RuledRing[] {
  const rings: RuledRing[] = variant.ruled ?? [];
  const w = window as unknown as { __akScale?: number };
  w.__akScale = 1;
  if (variant.fit || ctx.viewW >= 768 || ctx.viewH <= ctx.viewW || rings.length < 400 || !el) return rings;
  const intro = el.closest(".hero__inner")?.querySelector<HTMLElement>(".hero__intro");
  if (!intro) return rings;
  // the tagline's text box (its lines' own extents), in the name box's units
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  const off = restOffsetY(intro);
  for (const t of intro.querySelectorAll<HTMLElement>("p")) {
    const rg = document.createRange();
    rg.selectNodeContents(t);
    for (const r of rg.getClientRects()) {
      x0 = Math.min(x0, r.left); x1 = Math.max(x1, r.right);
      y0 = Math.min(y0, r.top + off); y1 = Math.max(y1, r.bottom + off);
    }
  }
  if (!(x1 > x0)) return rings;
  const A = ctx.anchor;
  const bx0 = (x0 - 10 - A.left) / A.width, bx1 = (x1 + 10 - A.left) / A.width;
  const by0 = (y0 - 10 - A.top) / A.height, by1 = (y1 + 10 - A.top) / A.height;
  let ai = 0;
  for (let i = 1; i < rings.length; i++) if (rings[i].L[1] + rings[i].R[1] < rings[ai].L[1] + rings[ai].R[1]) ai = i;
  const ax = (rings[ai].L[0] + rings[ai].R[0]) / 2, ay = (rings[ai].L[1] + rings[ai].R[1]) / 2;
  // the largest scale (1, 0.99, ... 0.66) at which no point of the AK's loops (rings from 200 on: edges and centre)
  // falls on the tagline's text
  const hits = (k: number) => {
    for (let i = 200; i < rings.length; i++) {
      const r = rings[i];
      for (const f of [0, 0.5, 1]) {
        const x = ax + k * (r.L[0] + f * (r.R[0] - r.L[0]) - ax), y = ay + k * (r.L[1] + f * (r.R[1] - r.L[1]) - ay);
        if (x > bx0 && x < bx1 && y > by0 && y < by1) return true;
      }
    }
    return false;
  };
  let k = 1;
  while (k > 0.665 && hits(k)) k -= 0.01;
  if (k >= 1) return rings;
  w.__akScale = k;
  const sc = (v: readonly [number, number, number]): [number, number, number] => [ax + k * (v[0] - ax), ay + k * (v[1] - ay), k * v[2]];
  return rings.map((r) => ({ L: sc(r.L), R: sc(r.R) }));
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
    ? resolveRuled(placeRuled(file, variant, ctx, el), ctx, e.sim.count, variant.faceSign ?? 1)
    : resolvePose(variant.points, ctx, e.sim.count, file.orientation ?? "curvature", variant.spline ?? "catmull", variant.spans);
  const r = (v: number) => Math.round(v * 2) / 2;
  const signature = [e.width, e.height, r(anchor.left), r(anchor.top), r(anchor.width), r(anchor.height)].join(",");
  return { pose, anchor, signature };
}
