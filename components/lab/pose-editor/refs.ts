import type { AnchorRect } from "@/lib/ribbon/poses/types";

/**
 * Where the name's INK sits inside the anchor box (fractions of the anchor's
 * width / height), measured for Mona Sans 900 at the hero's line height. The
 * reference mockups are aligned by this ink box, not by pixels, because the
 * mockup font differs from the site's.
 */
export const ANCHOR_INK = { x0: 0.003, w: 1.002, y0: 0.032, h: 0.955 };

export interface RefSpec {
  src: string;
  w: number;
  h: number;
  /** ink box of the name in the mockup, px */
  ink: { x0: number; y0: number; x1: number; y1: number };
}

export const REFS: Record<"desktop" | "phone", RefSpec> = {
  desktop: {
    src: "/lab/ref/hero-desktop.webp",
    w: 1672,
    h: 941,
    ink: { x0: 70, y0: 204, x1: 1268, y1: 592 },
  },
  phone: {
    src: "/lab/ref/hero-mobile.webp",
    w: 852,
    h: 1846,
    ink: { x0: 39, y0: 256, x1: 820, y1: 592 },
  },
};

/** the mockup placed so its name ink box lands on the live name's ink box */
export function refPlacement(spec: RefSpec, anchor: AnchorRect) {
  const inkW = anchor.width * ANCHOR_INK.w;
  const inkL = anchor.left + anchor.width * ANCHOR_INK.x0;
  const inkT = anchor.top + anchor.height * ANCHOR_INK.y0;
  const s = inkW / (spec.ink.x1 - spec.ink.x0);
  return {
    left: inkL - spec.ink.x0 * s,
    top: inkT - spec.ink.y0 * s,
    width: spec.w * s,
    height: spec.h * s,
  };
}
