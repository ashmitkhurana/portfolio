/**
 * Pose data model.
 *
 * A pose is a list of control points authored in ANCHOR SPACE, so the same pose
 * follows the layout (real fonts, any viewport) instead of fixed pixels:
 *
 *   x, y   where the point APPEARS on screen, as a fraction of the anchor's box
 *          (0,0 = top-left of the anchor, 1,1 = bottom-right; may lie outside).
 *          Depth never moves it: the resolver unprojects with the engine camera.
 *   z      depth in units of the anchor's HEIGHT; + is towards the camera, the
 *          text plane (proxy depth 0) is z = 0.
 *   twist  radians about the tangent (the face flips every pi); cumulative.
 *   width  multiplier of the engine's ribbon width (1 = default).
 *
 * The anchor is an element with `data-ribbon-anchor="<name>"` (the hero h1 is
 * "hero-name"; its box is the union of its display lines).
 */

export type ScreenClass = "phone" | "tablet" | "desktop" | "ultrawide";

export const SCREEN_CLASSES: readonly ScreenClass[] = ["phone", "tablet", "desktop", "ultrawide"];

export interface PosePoint {
  x: number;
  y: number;
  z: number;
  twist: number;
  width: number;
}

export interface PoseVariant {
  points: PosePoint[];
}

export interface PoseFile {
  version: 1;
  name: string;
  /** name of the anchor element the points are relative to */
  anchor: string;
  notes?: string;
  /**
   * Per screen class. `tablet` and `ultrawide` may be omitted: a missing tablet
   * is derived (portrait: the phone variant, landscape: the desktop variant),
   * a missing ultrawide reuses desktop. Adding one is the override.
   */
  variants: Partial<Record<ScreenClass, PoseVariant>>;
}

/** A rectangle in viewport CSS px at scroll 0 (page coordinates), y down. */
export interface AnchorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The ink box of one glyph (CSS px, page coordinates): advance width x cap height. */
export interface InkBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** display line index */
  line: number;
  ch: string;
}

/**
 * Whether a point inside a glyph's ink box is really on ink. Boxes over-report for
 * letters with big empty corners: `A` is a narrow apex widening to the feet, `T` a
 * top bar over a centred stem. Other letters use the whole box.
 */
export function onInk(b: InkBox, x: number, y: number, pad = 0): boolean {
  if (x < b.x0 - pad || x > b.x1 + pad || y < b.y0 - pad || y > b.y1 + pad) return false;
  const w = b.x1 - b.x0;
  const h = b.y1 - b.y0;
  const u = (x - b.x0) / w;
  const f = (y - b.y0) / h;
  const ch = b.ch.toUpperCase();
  const slack = pad / w;
  if (ch === "A") return Math.abs(u - 0.5) <= 0.15 + 0.35 * f + slack;
  if (ch === "T") return f <= 0.24 + pad / h || Math.abs(u - 0.5) <= 0.2 + slack;
  return true;
}
