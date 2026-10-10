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
import { buildPortraitSpiral, type JourneyPath, type SpiralPath } from "@/lib/ribbon/journeyPath";
import { buildJourneyPathDesktop, type JourneyPathDesktop } from "@/lib/ribbon/journeyPathDesktop";

/** world px beyond the last covering ring before the name counts as clear (about one band width) */
const CLEAR_MARGIN = 60;
/** the head keeps this far down the screen (fraction of the height) while it follows the user */
const FOLLOW_Y = 0.72;
/** desktop: world px the ribbon flows during the free scroll from the hero to section 2, per px of viewport height */
const DESKTOP_TRANSITION_PER_H = 0.6;
/** portrait: where the tail turns down (fraction of the width) and the spiral's radius (fraction of the width) */
const SPIRAL_BOX_X = 0.4;
const SPIRAL_R = 0.15;
/** portrait: how far (in viewport heights) the head draws on down across section 2's pin */
const PORTRAIT_PIN_FOLLOW = 0.4;

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
  let path: JourneyPath | null = null;
  let spiral: SpiralPath | null = null;
  let spiralJ = 0;
  let tailM = -1;
  let pathD: JourneyPathDesktop | null = null;
  let ymax = new Float32Array(0);
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
    let sigma = ease(hero.p) * clear;
    let lead = 0;
    if (unravel && clear > 0) {
      const portrait = !(W >= 768 && W > H);
      const textA = unravel.pin.querySelector<HTMLElement>(".unravel__line--a");
      const textB = unravel.pin.querySelector<HTMLElement>(".unravel__line--b");
      const pk = `${key}|${unravel.vTop.toFixed(0)}|${portrait}|${textA?.offsetTop}|${textB?.offsetTop}|${textA?.offsetWidth}`;
      if (pk !== pathKey && textA && textB) {
        // the wave goes between the two text blocks (rest coordinates: virtual = section top + offset in the pin)
        const pinTop = unravel.pin.getBoundingClientRect().top;
        const ra = textA.getBoundingClientRect(), rb = textB.getBoundingClientRect();
        const hwS = sl.end1().hw;
        let wave: { c: number; amp: number; top: number; lambda?: number; crestY?: number };
        if (!portrait) {
          // DESKTOP: the approved v335 choreography (off the left edge, back in from the left drawing the wave),
          // the wave centred between the two text lines
          const aBottom = unravel.vTop + ra.bottom - pinTop, bTop = unravel.vTop + rb.top - pinTop;
          pathD = buildJourneyPathDesktop({
            W,
            H,
            end: sl.end1(),
            ds: sl.spacing,
            y2: unravel.vTop,
            sClear: clear,
            transition: DESKTOP_TRANSITION_PER_H * H,
            portrait: false,
            camZ: sl.cameraZ,
            ribbonLen: sl.length,
            waveC: (aBottom + bTop) / 2,
            waveAmp: Math.max(20, Math.min(0.17 * H, (bTop - aBottom) / 2 - 1.2 * hwS - 16)),
          });
          path = null;
          if (spiral) {
            spiral = null;
            tailM = -1;
            sl.setTailOverride(null, null);
          }
          sl.setHeadPath(pathD.pos, pathD.ruled, pathD.k);
          pathKey = pk;
          wave = { c: 0, amp: 0, top: 0 };
        } else {
          // a regular wave straight down the exact centre (owner), the two text blocks either side of it
          wave = { c: W / 2, amp: Math.max(16, Math.min(0.1 * W, (rb.left - ra.right) / 2 - hwS - 8)), top: 0, lambda: 0.3 * H };
        }
        if (portrait) {
          pathD = null;
          // the "box": where the hero's diagonal tail crosses ~40% of the width (owner's sketch); there it turns
          // straight down and spirals down the screen round an invisible pole
          const D = sl.cameraZ;
          let j = 3;
          for (; j < 60; j++) {
            const q = sl.poseRing(j);
            if (W / 2 + q.p[0] * (D / Math.max(1, D - q.p[2])) >= SPIRAL_BOX_X * W) break;
          }
          spiral = buildPortraitSpiral({ W, H, box: sl.poseRing(j), j, ds: sl.spacing, y2: unravel.vTop, camZ: D, r: SPIRAL_R * W });
          path = spiral;
          spiralJ = j;
          sl.setHeadPath(spiral.pos, spiral.ruled, spiral.k);
        // running max of each ring's screen height: the head may advance while its path stays above the follow line
        ymax = new Float32Array(path.k);
        let m = -Infinity;
        for (let j = 0; j < path.k; j++) ymax[j] = m = Math.max(m, path.yv[j]);
        pathKey = pk;
        }
      }
      if (pathD && !portrait && hero.p >= 1) {
        // DESKTOP (v335): a rigid window (head = tail - length): the hero's remaining strand flows down-left off the
        // edge during the free scroll, the head enters from the left as section 2 pins and draws the wave
        if (unravel.p <= 0) sigma = clear + clamp01(V / Math.max(1, unravel.vTop)) * (pathD.sEntry - clear);
        else {
          const lead0 = clamp01(unravel.p / 0.05);
          const draw = ease(clamp01((unravel.p - 0.05) / 0.95));
          sigma = pathD.sEntry + lead0 * (pathD.sVisible - pathD.sEntry) + draw * (pathD.sWaveEnd - pathD.sVisible);
        }
      }
      if (spiral && portrait) {
        // the tail below the box swings into the spiral over the first part of the hero exit
        const m = Math.round(clamp01(hero.p / 0.3) * 60) / 60;
        const swing = m * m * (3 - 2 * m);
        if (Math.abs(swing - tailM) > 1e-4) {
          sl.setTailOverride(spiral.tailPos, spiral.tailRuled, spiralJ, swing);
          tailM = swing;
        }
      }
      if (path && portrait && hero.p >= 1) {
        // the head waits below the hero until the user reaches it, then keeps FOLLOW_Y down the screen as they scroll;
        // during section 2's pin it keeps drawing (landscape: across the wave by pin progress; portrait: on down)
        const followArc = (v: number) => {
          const yLine = v + FOLLOW_Y * H;
          let lo = 0, hi = path!.k - 1;
          if (ymax[0] > yLine) return 0;
          while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (ymax[mid] <= yLine) lo = mid;
            else hi = mid;
          }
          return (lo + 1) * sl.spacing;
        };
        if (!portrait) {
          lead = Math.min(followArc(V), path.sWave);
          if (unravel.p > 0) lead = path.sWave + ease(unravel.p) * (path.sWaveEnd - path.sWave);
        } else {
          lead = Math.min(followArc(V + unravel.p * PORTRAIT_PIN_FOLLOW * H), path.sWaveEnd);
        }
        // the ribbon never gets longer than the pose: the tail follows once the head has drawn that much
        sigma = Math.max(clear, lead);
      }
    }
    sl.driveTarget = sigma;
    // desktop: rigid (the head moves with the tail); portrait: the head has its own position
    sl.driveLead = pathD ? sigma : lead;
    if (window.__journeyDebug !== undefined) window.__journeyDebug = { V, clear, hero: hero.p, unravel: unravel?.p, sigma, lead, sWave: path?.sWave, sWaveEnd: path?.sWaveEnd };
  };
}
