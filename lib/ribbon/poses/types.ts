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

import type { PaperRoll } from "../paper";

export type ScreenClass = "phone" | "tablet" | "desktop" | "ultrawide";

export const SCREEN_CLASSES: readonly ScreenClass[] = ["phone", "tablet", "desktop", "ultrawide"];

export interface PosePoint {
  x: number;
  y: number;
  z: number;
  /** roll about the tangent (radians), an offset relative to the frame mode; cumulative */
  twist: number;
  width: number;
  /**
   * Marks this point as a soft FOLD: the strip rolls over itself here (face A before, face B after)
   * instead of bending in its own plane. `angle` is the dihedral angle in radians (pi = lies back
   * over itself, the sign picks the side it rolls towards), `radius` the radius of the roll in
   * ribbon widths (0.5 - 1 reads as satin; below ~0.45 it starts to look like a crease).
   */
  fold?: { angle: number; radius: number; name?: string };
  /**
   * Marks this point as the tip of a ROLLED HAIRPIN: a bracelet-like U-turn (> 150 degrees) the curvature frames roll,
   * so the face normal points to the loop's centre and the inner face shows inside. NOT a fold (no construction); the
   * control points around the tip already encode the loop, this is the label and the design radius (in ribbon widths,
   * 0.4 - 2) the engine reports and pose-check verifies.
   */
  hairpin?: { name: string; radius: number };
}

/** one ring of a ruled pose: both ends of the ruling, anchor space (x, y = where it appears, z = depth in anchor heights) */
export interface RuledRing {
  L: [number, number, number];
  R: [number, number, number];
}

/**
 * Responsive leading end of a ruled pose: rings 0..fromRing are replaced, per viewport, by a smooth face-on
 * band from an exit point just below the bottom edge to ring `fromRing` (tangent-continuous there).
 */
export interface TailSpec {
  /** last replaced ring; the authored pose is kept from here on */
  fromRing: number;
  /** where the band's RIGHT edge crosses the bottom edge, as a fraction of the view width (0.5 = dead centre) */
  rightEdgeX: number;
  /** screen direction of the tail where it leaves the screen, degrees from straight down (+ = towards the right) */
  exitAngleDeg: number;
  /** handle length of the curve as a fraction of the exit->fromRing distance (bigger = wider swing) */
  swing: number;
  /** handle length at the join (fromRing), same units; default = swing (short = leaves the pose sooner) */
  joinSwing?: number;
  /** depth of the exit point, world px (+ = towards the camera) */
  zExit: number;
}

/**
 * Placement of another variant's sculpture (`from`) for THIS screen class, recomputed per viewport: the source rings
 * are lifted to 3D with the source context, scaled, placed so the body's screen bbox fits `box` (anchor units
 * [left, top, right, bottom]) inside the viewport's safe area, and turned so this camera sees the body from the
 * same direction as the source camera.
 */
export interface FitSpec {
  from: ScreenClass;
  /** the source variant's layout: view size, anchor rect, fov */
  ctx: { viewW: number; viewH: number; fov: number; anchor: AnchorRect };
  box: [number, number, number, number];
  /** first ring of the body (rings before it, the tail, do not drive the fit) */
  bodyFrom: number;
  /** safe area, css px: [left, top, right margin, bottom fraction of the view height] */
  safe?: [number, number, number, number];
}

export interface PoseVariant {
  points: PosePoint[];
  /**
   * RULED variant (rotoscoped): the ribbon as its rulings L -> R. `points` is ignored. The engine lifts each
   * end onto its camera ray, so the projection equals the authored screen positions by construction.
   */
  ruled?: RuledRing[];
  /** ruled: +1 / -1, which side of the band is face A */
  faceSign?: 1 | -1;
  /** ruled: rebuild the leading end per viewport so it leaves the screen at the bottom (see resolve.ts steerTail) */
  tail?: TailSpec;
  /** responsive placement of another variant's sculpture (see FitSpec) */
  fit?: FitSpec;
  /** centreline through the points: `catmull` (default, interpolating) or `bspline` (C2, approximating) */
  spline?: "catmull" | "bspline";
  /**
   * PAPER SPANS: the stretch between control points `from` and `to` (indices into `points`) is replaced by an
   * exact paper-folded strip (see ../paper.ts); `rolls` are in the span's flat frame (u in px along the strip).
   */
  spans?: { from: number; to: number; rolls: PaperRoll[]; name?: string; /** flat length of the span (px); default: the authored arc length */ length?: number }[];
}

export interface PoseFile {
  version: 1;
  name: string;
  /** name of the anchor element the points are relative to */
  anchor: string;
  notes?: string;
  /**
   * How the band is oriented along the curve (`twist` is a roll relative to it). `curvature` (the default):
   * the face normal follows the curve's principal normal, so loops wrap like bracelets. `rmf`: rotation-minimising.
   */
  orientation?: "curvature" | "rmf";
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
