/**
 * The home page's scroll journey: drives the ribbon's slide (lib/ribbon/slide.ts, `driven` mode) from the
 * pinned sections' scroll progress, every rendered frame (RibbonEngine.beforeFrame).
 *
 * Stage 1, the hero exit: the hero is pinned (.hero__pin, sticky) for its scroll room; across it the ribbon
 * slides toward its leading end until its trailing end has passed every ring that covers a letter of the name
 * (it leaves the AK at the base of the A's left leg). The pin then releases, and the ribbon moves up with the
 * hero (`offsetY` = how far the pin has moved off its rest position). Scrolling up reverses everything.
 *
 * Nothing 3D is imported here (initial bundle).
 */
import type { RibbonEngine } from "@/lib/ribbon/engine";
import { measureInk } from "@/lib/ribbon/poses/anchors";

/** world px beyond the last covering ring before the name counts as clear (about one band width) */
const CLEAR_MARGIN = 60;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** half linear, half smoothstep: connected to the finger, but a soft start and landing */
const ease = (p: number) => 0.5 * p + 0.5 * p * p * (3 - 2 * p);

export function createJourney(engine: RibbonEngine): () => void {
  let clear = 0;
  let clearKey = "";
  return () => {
    const sl = engine.sim.slide;
    const hero = document.querySelector<HTMLElement>('[data-section="hero"]');
    const pin = hero?.querySelector<HTMLElement>("[data-pin]");
    if (!hero || !pin || !sl.ready) {
      sl.driveTarget = 0;
      sl.offsetY = 0;
      return;
    }
    const hr = hero.getBoundingClientRect();
    const pr = pin.getBoundingClientRect();
    const room = hr.height - pr.height;
    const p = room > 1 ? clamp01(-hr.top / room) : 0;
    // the pin sits at 0 while pinned and moves up (negative) once it releases; world y is up
    sl.offsetY = -pr.top;

    // how far the ribbon must slide to clear the name: re-measured when the pose or the viewport changes
    const key = `${sl.length.toFixed(1)}|${engine.width}|${engine.height}|${sl.cameraZ.toFixed(1)}`;
    if (key !== clearKey) {
      const title = document.getElementById("hero-title");
      const sectionTop = hr.top + window.scrollY; // rest coordinates are page coordinates: viewport = page - sectionTop
      const boxes = title
        ? measureInk(title).map((b) => ({ x0: b.x0 - window.scrollX, x1: b.x1 - window.scrollX, y0: b.y0 - sectionTop, y1: b.y1 - sectionTop }))
        : [];
      clear = sl.sigmaToClear(boxes, engine.width, engine.height, CLEAR_MARGIN);
      // not measurable yet (camera / fonts not ready): try again next frame
      if (clear > 0) clearKey = key;
    }
    sl.driveTarget = ease(p) * clear;
  };
}
