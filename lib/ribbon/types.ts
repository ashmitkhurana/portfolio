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

export interface RibbonPose {
  /** xyz triples, world px (1 unit = 1 css px at z = 0, +y up) */
  points: ArrayLike<number>;
  twists?: ArrayLike<number>;
  widths?: ArrayLike<number>;
}
