/**
 * DOM measuring for pose anchors (no three import). Rects are returned in PAGE
 * coordinates (viewport rect + scroll), so a pose resolved from them describes
 * the composition at scroll 0 whatever the current scroll offset is.
 */
import type { AnchorRect, InkBox } from "./types";
import { restOffsetY } from "../pin";

export function findAnchor(name: string, root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-ribbon-anchor="${CSS.escape(name)}"]`);
}

/** page rect; inside a pinned block, at the pin's rest position (lib/ribbon/pin.ts) */
function pageRect(r: DOMRect, el?: Element): AnchorRect {
  return {
    left: r.left + window.scrollX,
    top: r.top + (el ? restOffsetY(el) : window.scrollY),
    width: r.width,
    height: r.height,
  };
}

/**
 * The anchor's box. A display heading's box is the union of its (shrink-wrapped)
 * lines, not the full-width h1, so the name's own proportions drive the pose.
 */
export function measureAnchor(el: HTMLElement): AnchorRect | null {
  const lines = el.querySelectorAll<HTMLElement>(".display__line");
  let r: AnchorRect | null = null;
  if (lines.length) {
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    lines.forEach((l) => {
      const b = l.getBoundingClientRect();
      x0 = Math.min(x0, b.left);
      y0 = Math.min(y0, b.top);
      x1 = Math.max(x1, b.right);
      y1 = Math.max(y1, b.bottom);
    });
    r = pageRect(new DOMRect(x0, y0, x1 - x0, y1 - y0), el);
  } else {
    r = pageRect(el.getBoundingClientRect(), el);
  }
  return r.width > 1 && r.height > 1 ? r : null;
}

/** Mona Sans 900 cap height / baseline, in em from the line's top (fallback when probing fails) */
const CAP_EM = 0.747;
const BASELINE_EM = 0.8;

/**
 * Per-glyph ink boxes of the `.glyph` spans: the glyph's advance box in x, its
 * cap-height band in y (found with a zero-size baseline probe and the font's
 * measured cap height). Conservative: counters and diagonals are ignored.
 */
export function measureInk(el: HTMLElement): InkBox[] {
  const out: InkBox[] = [];
  const lines = el.querySelectorAll<HTMLElement>(".display__line");
  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = document.createElement("canvas").getContext("2d");
  } catch {
    ctx = null;
  }
  const oy = restOffsetY(el);
  lines.forEach((line, li) => {
    const cs = getComputedStyle(line);
    const size = parseFloat(cs.fontSize) || 100;
    const lr = line.getBoundingClientRect();
    // baseline probe
    let baseline = lr.top + BASELINE_EM * size;
    const probe = document.createElement("span");
    probe.style.cssText =
      "display:inline-block;width:0;height:0;overflow:hidden;vertical-align:baseline;position:static";
    line.appendChild(probe);
    const pr = probe.getBoundingClientRect();
    line.removeChild(probe);
    if (pr.bottom > lr.top && pr.bottom < lr.bottom + size) baseline = pr.bottom;
    // cap height
    let cap = CAP_EM * size;
    if (ctx) {
      ctx.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
      const m = ctx.measureText("H");
      if (m.actualBoundingBoxAscent > size * 0.4 && m.actualBoundingBoxAscent < size * 1.1) {
        cap = m.actualBoundingBoxAscent;
      }
    }
    line.querySelectorAll<HTMLElement>(".glyph").forEach((g) => {
      const b = g.getBoundingClientRect();
      out.push({
        x0: b.left + window.scrollX,
        x1: b.right + window.scrollX,
        y0: baseline - cap + oy,
        y1: baseline + oy,
        line: li,
        ch: g.textContent ?? "",
      });
    });
  });
  return out;
}

/** union of ink boxes */
export function inkBounds(ink: readonly InkBox[]): AnchorRect | null {
  if (!ink.length) return null;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const b of ink) {
    x0 = Math.min(x0, b.x0);
    y0 = Math.min(y0, b.y0);
    x1 = Math.max(x1, b.x1);
    y1 = Math.max(y1, b.y1);
  }
  return { left: x0, top: y0, width: x1 - x0, height: y1 - y0 };
}
