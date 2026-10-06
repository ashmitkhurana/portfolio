/** Plain data shared between the DOM adapter and the DOM-free render core. */

export const MAX_PROXIES = 16;

/**
 * Depth proxies measured by the DOM adapter, in viewport CSS px (y down):
 * rect i = (x, y, w, h), world depth z of the proxy plane, corner radius px.
 */
export interface ProxyData {
  count: number;
  /** MAX_PROXIES * 4 */
  rects: Float32Array;
  /** MAX_PROXIES */
  depth: Float32Array;
  /** MAX_PROXIES */
  radius: Float32Array;
  /** smallest proxy depth (Infinity when none) */
  minDepth: number;
}

import type { FoldSpec } from "./fold";
import type { RuledData } from "./ruled";

export interface RibbonPose {
  /** xyz triples, world px (1 unit = 1 css px at z = 0, +y up) */
  points: ArrayLike<number>;
  /** roll about the tangent, radians; an OFFSET relative to the frame chosen by `orientation` */
  twists?: ArrayLike<number>;
  widths?: ArrayLike<number>;
  /**
   * `rmf`: rotation-minimising frame (default; the lab poses).
   * `curvature`: the band's face normal follows the curve's principal normal (loops wrap like bracelets).
   */
  orientation?: "rmf" | "curvature";
  /** soft folds (the strip rolls over itself), positions as arc fractions of the body */
  folds?: FoldSpec[];
  /** rolled hairpins (bracelet-like U-turns the curvature frames do), positions as arc fractions; reports only */
  hairpins?: HairpinSpec[];
  /** ruled pose: per-control-point ruling direction and half width (the geometry bypasses frames, folds and relaxation) */
  ruled?: RuledData;
}

export interface HairpinSpec {
  at: number;
  name: string;
  /** design radius of the centreline, in ribbon widths */
  radius: number;
}
