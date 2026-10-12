"use client";

import { useEffect } from "react";

/**
 * /contact: the AK forms like the hero intro (the slide's intro replays when the page opens after another page; a
 * fresh load plays it anyway) and "LET'S BUILD SOMETHING." types in with it, the last letter as the ribbon lands.
 */
export function ContactIntro() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const h = document.getElementById("contact-title");
    const glyphs = h ? Array.from(h.querySelectorAll<HTMLElement>(".glyph")) : [];
    let raf = 0;
    let started = false;
    const t0 = performance.now();
    const show = (n: number) => glyphs.forEach((g, i) => g.classList.toggle("is-typed", i < n));
    const done = () => {
      if (h) delete h.dataset.typing;
      show(glyphs.length);
    };
    const tick = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sl = (window.__ribbonState?.engine as any)?.sim?.slide;
      const phase = window.__ribbonState?.phase;
      if (phase === "poster" || phase === "off") return done();
      if (!started) {
        if (sl?.ready && sl.length > 0) {
          // came from another page: the intro has settled there; replay it here
          if (sl.introSettled) sl.restart();
          started = true;
          if (h) h.dataset.typing = "on";
          show(0);
        } else if (performance.now() - t0 > 2500) return done();
      } else {
        const p = Math.min(Math.max(1 + sl.sigma / sl.length, 0), 1);
        show(Math.floor((p / 0.995) * glyphs.length));
        if (sl.introSettled || p >= 0.995) return done();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      done();
    };
  }, []);
  return null;
}
