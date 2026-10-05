import type { CSSProperties } from "react";
import "./display.css";

/** Approximate Inter Black (900) advance widths in em, uppercase. Used only to size `fit` headings. */
const ADV: Record<string, number> = {
  A: 0.74, B: 0.74, C: 0.77, D: 0.79, E: 0.68, F: 0.64, G: 0.8, H: 0.82, I: 0.36,
  J: 0.62, K: 0.77, L: 0.64, M: 0.96, N: 0.82, O: 0.82, P: 0.73, Q: 0.82, R: 0.75,
  S: 0.72, T: 0.69, U: 0.8, V: 0.76, W: 1.1, X: 0.76, Y: 0.74, Z: 0.7,
  " ": 0.27, ".": 0.33, "\u2019": 0.33, "'": 0.33,
};
const TRACKING = 0.035; // keep in sync with --display-tracking

function widthEm(line: string): number {
  let w = 0;
  for (const ch of line.toUpperCase()) w += (ADV[ch] ?? 0.78) - TRACKING;
  return w;
}

export type DisplaySize = "hero" | "xl" | "l" | "m";

export interface DisplayHeadingProps {
  /** one entry per visual line, e.g. ["ASHMIT", "KHURANA"] */
  lines: readonly string[];
  as?: "h1" | "h2" | "h3" | "p" | "div";
  id?: string;
  size?: DisplaySize;
  /** shrink the type so the longest line always fits the viewport width (default on, except for the hero which is sized by its own token) */
  fit?: boolean;
  /** mark each line as a ribbon depth proxy (default true) */
  proxy?: boolean;
  /** ribbon depth (world z) for every line; default 0 */
  depth?: number;
  /** ribbon proxy corner radius in px */
  radius?: number;
  className?: string;
}

/**
 * Giant display type. Each line is a block-level, shrink-wrapped span (so its
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
  fit = size !== "hero",
  proxy = true,
  depth = 0,
  radius,
  className,
}: DisplayHeadingProps) {
  const widthInEm = Math.max(1, ...lines.map(widthEm)) * 1.03;
  return (
    <Tag
      id={id}
      className={["display", className].filter(Boolean).join(" ")}
      data-size={size}
      data-fit={fit || undefined}
      style={fit ? ({ "--em-w": widthInEm.toFixed(3) } as CSSProperties) : undefined}
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
