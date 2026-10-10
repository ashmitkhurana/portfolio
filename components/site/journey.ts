/**
 * The home page's scroll journey: drives the ribbon's slide (lib/ribbon/slide.ts, `driven` mode) from the pinned
 * sections' scroll progress, every rendered frame (RibbonEngine.beforeFrame).
 *
 * VIRTUAL page: the page with every pin's scroll room removed (each pinned section is one screen, stacked). The
 * ribbon's whole track lives there (lib/ribbon/journeyPath.ts); V = the virtual y at the top of the viewport, applied
 * by the renderer as a lens shift (slide.offsetY), so a page scroll moves the picture rigidly.
 *
 *  1. hero pin: the ribbon slides toward its leading end until its trailing end has cleared the name (it leaves
 *     the AK at the base of the A's left leg); the head runs ahead off-screen;
 *  2. free scroll to section 2: the hero's remaining strand keeps flowing down-left while the head travels its
 *     hidden route;
 *  3. section 2 pin: the head enters (left edge on landscape, top edge on portrait) and draws the wave.
 * Scrolling up reverses everything. Nothing 3D is imported here (initial bundle).
 */
import type { RibbonEngine } from "@/lib/ribbon/engine";
import { measureInk } from "@/lib/ribbon/poses/anchors";
import { buildJourneyPath } from "@/lib/ribbon/journeyPath";

/** world px beyond the last covering ring before the name counts as clear (about one band width) */
const CLEAR_MARGIN = 60;
/** world px the ribbon flows during the free scroll from the hero to section 2, per px of viewport height */
const TRANSITION_PER_H = 0.5;
/** world px it keeps flowing across section 2's pin (while the line swells into the wave), per px of viewport height */
const WAVE_FLOW_PER_H = 0.35;

declare global {
  interface Window {
    /** set to {} in devtools / headless checks to receive the journey's numbers every frame */
    __journeyDebug?: Record<string, unknown>;
  }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
/** half linear, half smoothstep: connected to the finger, but a soft start and landing */
const ease = (p: number) => 0.5 * p + 0.5 * p * p * (3 - 2 * p);

interface Pin {
  name: string;
  section: HTMLElement;
  pin: HTMLElement;
  /** scroll room (css px) */
  room: number;
  /** virtual y of the pin's top */
  vTop: number;
  /** pin progress 0..1 */
  p: number;
  pinTop: number;
}

function readPins(): Pin[] {
  const out: Pin[] = [];
  let rooms = 0;
  for (const pin of document.querySelectorAll<HTMLElement>("main [data-pin]")) {
    const section = pin.parentElement as HTMLElement;
    const sr = section.getBoundingClientRect();
    const room = Math.max(0, section.offsetHeight - pin.offsetHeight);
    out.push({
      name: pin.dataset.pin ?? "",
      section,
      pin,
      room,
      vTop: sr.top + window.scrollY - rooms,
      p: room > 1 ? clamp01(-sr.top / room) : sr.top < 0 ? 1 : 0,
      pinTop: pin.getBoundingClientRect().top,
    });
    rooms += room;
  }
  return out;
}

export function createJourney(engine: RibbonEngine): () => void {
  let clear = 0;
  let clearKey = "";
  let pathKey = "";
  return () => {
    const sl = engine.sim.slide;
    const pins = readPins();
    const hero = pins.find((p) => p.name === "hero");
    if (!hero || !sl.ready) {
      sl.driveTarget = 0;
      sl.offsetY = 0;
      return;
    }
    // V: from the last pin that has reached the top (pinned now, or released and scrolling away)
    let ref = pins[0];
    for (const p of pins) if (p.pinTop <= 0.5) ref = p;
    const V = ref.vTop - ref.pinTop;
    sl.offsetY = V;

    // how far the ribbon must slide to clear the name: re-measured when the pose or the viewport changes
    const W = engine.width, H = engine.height;
    const key = `${sl.length.toFixed(1)}|${W}|${H}|${sl.cameraZ.toFixed(1)}`;
    if (key !== clearKey) {
      const title = document.getElementById("hero-title");
      const sectionTop = hero.section.getBoundingClientRect().top + window.scrollY;
      const boxes = title
        ? measureInk(title).map((b) => ({ x0: b.x0 - window.scrollX, x1: b.x1 - window.scrollX, y0: b.y0 - sectionTop, y1: b.y1 - sectionTop }))
        : [];
      clear = sl.sigmaToClear(boxes, W, H, CLEAR_MARGIN);
      // not measurable yet (camera / fonts not ready): try again next frame
      if (clear > 0) clearKey = key;
    }

    const unravel = pins.find((p) => p.name === "unravel");
    let sigma: number;
    if (unravel && clear > 0) {
      const portrait = !(W >= 768 && W > H);
      // section 2's pin: the line swells into the wave while the ribbon keeps flowing
      const morph = hero.p < 1 ? 0 : ease(unravel.p);
      const mq = Math.round(morph * 240) / 240;
      const pk = `${key}|${unravel.vTop.toFixed(0)}|${portrait}|${mq}`;
      if (pk !== pathKey) {
        const path = buildJourneyPath({
          W,
          H,
          end: sl.end1(),
          ds: sl.spacing,
          y2: unravel.vTop,
          portrait,
          camZ: sl.cameraZ,
          morph: mq,
        });
        sl.setHeadPath(path.pos, path.ruled, path.k);
        pathKey = pk;
      }
      const flow = TRANSITION_PER_H * H;
      if (hero.p < 1) sigma = ease(hero.p) * clear;
      else if (unravel.p <= 0) sigma = clear + clamp01(V / Math.max(1, unravel.vTop)) * flow;
      else sigma = clear + flow + ease(unravel.p) * WAVE_FLOW_PER_H * H;
    } else {
      sigma = ease(hero.p) * clear;
    }
    sl.driveTarget = sigma;
    if (window.__journeyDebug !== undefined) window.__journeyDebug = { V, clear, hero: hero.p, unravel: unravel?.p, sigma };
  };
}
