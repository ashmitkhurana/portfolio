"use client";

import { useEffect } from "react";

/**
 * Types the hero name out letter by letter in step with the ribbon's intro: the reveal follows the slide's own
 * progress (1 + sigma / length: 0 = still hidden at its end, 1 = settled in the pose), so the last letter lands as
 * the ribbon settles. Reduced motion, no WebGL, or no intro within 3 s: the name is shown at once.
 */
export function HeroTypeIn({ targetId }: { targetId: string }) {
  useEffect(() => {
    const h = document.getElementById(targetId);
    if (!h) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const glyphs = Array.from(h.querySelectorAll<HTMLElement>(".glyph"));
    if (!glyphs.length) return;
    h.dataset.typing = "on";
    let shown = 0;
    let raf = 0;
    const t0 = performance.now();
    const showUpTo = (n: number) => {
      for (; shown < Math.min(n, glyphs.length); shown++) glyphs[shown].classList.add("is-typed");
    };
    const finish = () => {
      showUpTo(glyphs.length);
      cancelAnimationFrame(raf);
    };
    const tick = () => {
      const st = window.__ribbonState;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const slide = (st?.engine as any)?.sim?.slide;
      if (st?.introSettled) return finish();
      if (slide?.ready && slide.length > 0) {
        const p = Math.min(Math.max(1 + slide.sigma / slide.length, 0), 1);
        // the last glyph appears at p = 0.985 (just before the spring settles)
        showUpTo(Math.floor((p / 0.985) * glyphs.length));
        if (shown >= glyphs.length) return finish();
      } else if (performance.now() - t0 > 3000) {
        return finish();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onSettled = () => finish();
    window.addEventListener("ribbon:intro-settled", onSettled);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("ribbon:intro-settled", onSettled);
    };
  }, [targetId]);
  return null;
}
