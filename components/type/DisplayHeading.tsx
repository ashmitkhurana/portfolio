import type { CSSProperties } from "react";
import "./display.css";

/**
 * Mona Sans 900 advance widths in em (uppercase, no tracking), measured at the
 * two ends of the range we use: wdth 75 and wdth 100. The font's advances are
 * linear between those, so CSS interpolates at the current --display-wdth.
 * Order: [wdth 75, wdth 100].
 */
const ADV: Record<string, [number, number]> = {
  A: [0.497, 0.766], B: [0.466, 0.711], C: [0.481, 0.77], D: [0.49, 0.756],
  E: [0.38, 0.646], F: [0.375, 0.631], G: [0.505, 0.82], H: [0.495, 0.802],
  I: [0.245, 0.321], J: [0.294, 0.439], K: [0.499, 0.753], L: [0.359, 0.584],
  M: [0.646, 0.929], N: [0.487, 0.79], O: [0.494, 0.801], P: [0.473, 0.679],
  Q: [0.521, 0.848], R: [0.477, 0.738], S: [0.448, 0.678], T: [0.391, 0.651],
  U: [0.48, 0.747], V: [0.467, 0.78], W: [0.75, 1.041], X: [0.489, 0.806],
  Y: [0.497, 0.757], Z: [0.434, 0.642],
  "0": [0.492, 0.62], "1": [0.358, 0.458], "2": [0.461, 0.591], "3": [0.473, 0.603],
  "4": [0.516, 0.662], "5": [0.472, 0.614], "6": [0.489, 0.642], "7": [0.484, 0.604],
  "8": [0.464, 0.614], "9": [0.489, 0.642],
  " ": [0.15, 0.203], ".": [0.196, 0.232], "'": [0.179, 0.212], "\u2019": [0.207, 0.231],
  "-": [0.352, 0.43], "&": [0.64, 0.758], "!": [0.227, 0.288], "?": [0.445, 0.578],
  ",": [0.211, 0.241],
};
const FALLBACK: [number, number] = [0.5, 0.78];
/** keep in sync with --display-tracking (-0.04em) */
const TRACKING = 0.04;
/** last glyph's ink can sit slightly outside its tracked box */
const INK_SLACK = 0.03;

function widthEm(line: string, i: 0 | 1): number {
  let w = INK_SLACK;
  for (const ch of line.toUpperCase()) w += (ADV[ch] ?? FALLBACK)[i] - TRACKING;
  return w;
}

export type DisplaySize = "hero" | "xl" | "l" | "m";

export interface DisplayHeadingProps {
  /** one entry per visual line, e.g. ["ASHMIT", "KHURANA"] */
  lines: readonly string[];
  as?: "h1" | "h2" | "h3" | "p" | "div";
  id?: string;
  size?: DisplaySize;
  /** mark each line as a ribbon depth proxy (default true) */
  proxy?: boolean;
  /** ribbon depth (world z, px) for every line; default 0 */
  depth?: number;
  /**
   * Ribbon depth per line in CAP HEIGHTS (`data-ribbon-depth-cap`): the proxy measures the line's cap height and
   * multiplies, so the plane depths scale with the type at every viewport. Wins over `depth` for the lines it covers.
   */
  depthCap?: readonly number[];
  /** ribbon proxy corner radius in px */
  radius?: number;
  /**
   * Names this heading as a ribbon pose anchor (`data-ribbon-anchor`). Poses are
   * authored as fractions of the anchor's box, which is the union of the lines.
   */
  anchor?: string;
  className?: string;
}

/**
 * Giant display type (Mona Sans 900, see display.css). Every heading is fitted
 * to its container (`.container`, an inline-size container) so no line can ever
 * exceed the viewport. Each line is a block-level, shrink-wrapped span (so its
 * box hugs the text) that can be a `data-ribbon-proxy`; every letter sits in
 * its own `.glyph` span so glyph boxes can be measured later. The glyph
 * container is aria-hidden and the heading carries the accessible name.
 *
 * Glyph spans are plain inline on purpose: that keeps kerning/shaping intact.
 * Switch `.glyph` to `inline-block` when per-letter transforms are needed.
 */
export function DisplayHeading({
  lines,
  as: Tag = "h2",
  id,
  size = "l",
  proxy = true,
  depth = 0,
  depthCap,
  radius,
  anchor,
  className,
}: DisplayHeadingProps) {
  const em75 = Math.max(1, ...lines.map((l) => widthEm(l, 0)));
  const em100 = Math.max(1, ...lines.map((l) => widthEm(l, 1)));
  return (
    <Tag
      id={id}
      className={["display", className].filter(Boolean).join(" ")}
      data-size={size}
      data-ribbon-anchor={anchor}
      style={
        {
          "--em-w75": em75.toFixed(3),
          "--em-w100": em100.toFixed(3),
        } as CSSProperties
      }
      aria-label={lines.join(" ")}
    >
      {lines.map((line, i) => (
        <span
          key={`${line}-${i}`}
          className="display__line"
          aria-hidden="true"
          {...(proxy
            ? {
                "data-ribbon-proxy": "",
                "data-ribbon-depth": depth,
                ...(depthCap?.[i] !== undefined ? { "data-ribbon-depth-cap": depthCap[i] } : {}),
                ...(radius !== undefined ? { "data-ribbon-radius": radius } : {}),
              }
            : {})}
        >
          {Array.from(line).map((ch, j) =>
            ch === " " ? (
              " "
            ) : (
              <span key={j} className="glyph">
                {ch}
              </span>
            ),
          )}
        </span>
      ))}
    </Tag>
  );
}
