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
import { buildPortraitFlow, type JourneyPath, type SpiralPath } from "@/lib/ribbon/journeyPath";
import { buildJourneyPathDesktop, type JourneyPathDesktop, type JourneyPathDesktopInput } from "@/lib/ribbon/journeyPathDesktop";
import { getLenis } from "@/components/scroll/SmoothScroll";

/** world px beyond the last covering ring before the name counts as clear (about one band width) */
const CLEAR_MARGIN = 60;
/** the head keeps this far down the screen (fraction of the height) while it follows the user */
const FOLLOW_Y = 0.72;
/** desktop: world px the ribbon flows during the free scroll from the hero to section 2, per px of viewport height */
const DESKTOP_TRANSITION_PER_H = 0.6;
/** phone: world px the rigid ribbon flows on during the free scroll / across section 2's pin (per px of height) */
const PHONE_FLOW_TRANSITION = 0.45;
const PHONE_FLOW_PIN = 0.5;
/** portrait: where the tail turns down (fraction of the width) and the spiral's radius (fraction of the width) */
const SPIRAL_BOX_X = 0.4;
const SPIRAL_R = 0.15;
/** portrait: how far (in viewport heights) the head draws on down across section 2's pin */
const PORTRAIT_PIN_FOLLOW = 0.4;
/** Selected Work (landscape) pin progress: the head comes into view by WORK_IN, has threaded the cards and left by
 *  WORK_OUT; then the rest of the ribbon follows through, faster, and is clear of the cards at 1 */
const WORK_IN = 0.03;
const WORK_OUT = 0.6;
/** Selected Work (phones, not pinned): a crossing draws while its gap moves from STACK_FROM to STACK_TO down the screen */
const STACK_FROM = 0.88;
const STACK_TO = 0.45;
/** How I Build (landscape) pin progress: the ribbon comes in at the bottom of the box and coils up to the top of
 *  "HOW" by BUILD_COIL (scroll-driven); then it holds. One deliberate scroll down from there (past BUILD_TRIG) runs
 *  the rest on its own: the coil compresses into the box, jumps, the ribbon flies out over the top and down the
 *  diagonal, and the page scrolls smoothly on to the next section with it. One scroll up from the next section runs
 *  the same timeline backwards and brings the page back to the complete coil (BUILD_COIL). */
const BUILD_COIL = 0.8;
const BUILD_TRIG = 0.84;
/** the release timeline (s): compress, then the jump + flight; the page scroll starts at REL_SCROLL_AT and takes
 *  REL_SCROLL; the whole timeline is REL_T (run backwards for the way back) */
const REL_COMPRESS = 0.6;
const REL_RIB = 1.1;
const REL_SCROLL_AT = 0.8;
const REL_SCROLL = 1.6;
const REL_T = REL_SCROLL_AT + REL_SCROLL;
/** Experience + Terminal (landscape) pin progress: the head waits until EX_IN, underlines the entries by EX_UNDER,
 *  reaches the terminal by EX_END; the progress bar shows from EX_BAR; at EX_GATE the page holds while the scroll
 *  fills the bar (FILL_PX of wheel per bar; it drains at FILL_DRAIN per s once the scrolling stops) */
const EX_IN = 0.05;
const EX_UNDER = 0.42;
const EX_END = 0.86;
const EX_BAR = 0.9;
const EX_GATE = 0.985;
const FILL_PX = 1600;
const FILL_DRAIN = 0.35;
/** the footer's timeline (s), from the bar filling up: the page scrolls to the footer while the ribbon runs off out of
 *  sight (FOOT_RUN); the close fly-through (FOOT_FLY); a pause with the screen empty (FOOT_GAP); back in from the
 *  bottom left into the AK's hidden end and the AK forming like the hero intro (FOOT_FORM). The content fades in from
 *  FOOT_CONTENT; the heading types in with the AK. Scrolling up runs it backwards FOOT_REV times faster. */
const FOOT_RUN = 1.6;
const FOOT_FLY = 2.6;
const FOOT_GAP = 0;
const FOOT_FORM = 3.6;
const FOOT_T = FOOT_RUN + FOOT_FLY + FOOT_GAP + FOOT_FORM;
const FOOT_CONTENT = FOOT_RUN + 0.3;
const FOOT_REV = 1.8;
/** the fly-through's measured exit is a little late (the far, thin end is lost before it): it leaves the picture at
 *  this fraction of the measured stretch */
const FLY_OUT = 0.8;
/** the footer's pre -> post (sheared) arc table lookup */
const postOf = (pr: { table: number[]; t0: number; dt: number }, a: number) => {
  const f = (a - pr.t0) / pr.dt;
  const i = Math.max(0, Math.min(pr.table.length - 2, Math.floor(f)));
  const u = Math.max(0, Math.min(1, f - i));
  return pr.table[i] + (pr.table[i + 1] - pr.table[i]) * u;
};
/** phone Experience: the head draws in from the right over the first EXP_RAMP screens of scroll, then keeps FOLLOW_EX
 *  down the screen; the ribbon's length there (screens) */
const EXP_RAMP = 0.3;
const FOLLOW_EX = 0.75;
const EXP_LEN = 0.6;
/** phone terminal: the wrap's time (s), and the whole timeline from the bar filling up (wrap + the footer's) */
const WRAP_T = 2.4;
const TOTAL_P = WRAP_T + 1.6 + 2.6 + 3.6;
/** phones: px of finger travel that fill the bar */
const FILL_TOUCH = 700;
const easeOut3 = (t: number) => 1 - (1 - clamp01(t)) ** 3;

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
  let flowK = 0;
  let spiral: SpiralPath | null = null;
  const spiralJ = 0;
  let tailM = -1;
  let pathD: JourneyPathDesktop | null = null;
  let ymax = new Float32Array(0);
  /** How I Build: when the spring was released (performance.now, -1 = armed) and whether the page was sent on */
  /** How I Build release: 0 = scroll-driven, 1 = the ribbon's run (timed, page held), 2 = the page's scroll on; armed
   *  again once the user is back above the fire point */
  let relState = 0; // 0 idle, 1 forward, -1 backward
  let relT0 = 0;
  /** the auto-scroll: started / finished */
  let relScrolling = false;
  let relScrolled = false;
  let relPrevY = -1;
  /** idle side: true once released (the ribbon waits in the next section), false at / above the coil */
  let relBelow = false;
  /** Experience: the progress bar and its gate */
  let fill = 0;
  let fillLast = 0;
  let fillAt = performance.now();
  let gateOn = false;
  let gateArmed = true;
  let footFired = false;
  let footT0 = 0;
  /** the footer: 0 not reached, 1 running forward, 2 formed (done), -1 running backward */
  let footState = 0;
  let footRevT0 = 0;
  let footRevScroll = false;
  let footRectsKey = "";
  let footRectsVal: { dx: number; dy: number; yF: number } | null = null;
  let footTyped = -1;
  let footIntro = "";
  /** phones: the camera's height while the footer's own path is in use (null: Experience's rule), and whether it was */
  let camPhone: number | null = null;
  let camWasFoot = false;
  /** the heading's type-in and the content's fade-in (attributes the CSS keys on) */
  const setFootIntro = (v: string) => {
    if (v === footIntro) return;
    footIntro = v;
    if (v) document.documentElement.dataset.footIntro = v;
    else delete document.documentElement.dataset.footIntro;
  };
  const typeFoot = (frac: number) => {
    const h = document.getElementById("contact-title");
    if (!h) return;
    const glyphs = h.querySelectorAll<HTMLElement>(".glyph");
    const nT = frac >= 1 ? -1 : Math.floor(frac * glyphs.length);
    if (nT === footTyped) return;
    footTyped = nT;
    if (nT < 0) {
      delete h.dataset.typing;
      glyphs.forEach((g) => g.classList.add("is-typed"));
      return;
    }
    h.dataset.typing = "on";
    glyphs.forEach((g, i) => g.classList.toggle("is-typed", i < nT));
  };
  let exRectsKey = "";
  let exRectsVal: { strip: { x0: number; y0: number; x1: number; y1: number }; term: { x0: number; y0: number; x1: number; y1: number } } | null = null;
  const onWheel = (e: WheelEvent) => {
    if (!gateOn) return;
    if (e.deltaY > 0) {
      fill = Math.min(1, fill + e.deltaY / FILL_PX);
      fillLast = performance.now();
    } else if (e.deltaY < -2) {
      // scrolling back up: let go
      gateOn = false;
      getLenis()?.start();
    }
  };
  window.addEventListener("wheel", onWheel, { passive: true, capture: true });
  // phones: a swipe up fills the bar while the page is held; a swipe down lets go
  let touchY = -1;
  const onTouchStart = (e: TouchEvent) => {
    touchY = e.touches[0]?.clientY ?? -1;
  };
  const onTouchMove = (e: TouchEvent) => {
    const y = e.touches[0]?.clientY ?? -1;
    if (gateOn && touchY >= 0 && y >= 0) {
      const dy = touchY - y;
      if (e.cancelable) e.preventDefault();
      if (dy > 0) {
        fill = Math.min(1, fill + dy / FILL_TOUCH);
        fillLast = performance.now();
      } else if (dy < -12) {
        gateOn = false;
        getLenis()?.start();
      }
    }
    touchY = y;
  };
  window.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
  window.addEventListener("touchmove", onTouchMove, { passive: false, capture: true });
  let lastInput: JourneyPathDesktopInput | null = null;
  /** How I Build's measured rects, per layout (measuring the ink is too costly for every frame) */
  let buildRectsKey = "";
  let buildRectsVal: { box: { x0: number; y0: number; x1: number; y1: number }; gap: { x: number; y: number }; top: number } | null = null;
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
    const workPin = pins.find((p) => p.name === "work" && p.room > 1);
    // phones: Selected Work is not pinned (its pin block has no scroll room); the cards stack
    const workAny = pins.find((p) => p.name === "work");
    const buildPin = pins.find((p) => p.name === "build" && p.room > 1);
    const exPin = pins.find((p) => p.name === "exterm" && p.room > 1);
    // How I Build: the release timeline (forward or backward) gives the coil's compression and the ribbon's flight; the
    // page's own progress between the complete coil and the next section moves the ribbon on down the diagonal
    let buildC = 0;
    let relT = 0; // timeline time (s)
    let relS = 0; // the page's progress from the complete coil's scroll position to the next section
    let yHold = 0, yTrig = 0, yNext = 0;
    const jump = (q: number) => (q < 0.25 ? 1 - 1.15 * easeOut3(q / 0.25) : -0.15 + 0.15 * ease(clamp01((q - 0.25) / 0.25)));
    if (buildPin) {
      const secTop = buildPin.section.getBoundingClientRect().top + window.scrollY;
      yHold = secTop + BUILD_COIL * buildPin.room;
      yTrig = secTop + BUILD_TRIG * buildPin.room;
      const next = document.querySelector<HTMLElement>(".exterm");
      yNext = next ? next.getBoundingClientRect().top + window.scrollY : secTop + buildPin.room + window.innerHeight;
      relS = clamp01((window.scrollY - yHold) / Math.max(1, yNext - yHold));
      if (relState !== 0) {
        const e = (performance.now() - relT0) / 1000;
        relT = relState > 0 ? Math.min(e, REL_T) : Math.max(REL_T - e, 0);
      } else {
        // idle: released (below) or at / above the coil. A page loaded (or jumped) beyond the hold counts as released
        if (window.scrollY >= yNext - 4) relBelow = true;
        else if (window.scrollY <= yHold + 2) relBelow = false;
        relT = relBelow ? REL_T : 0;
      }
      const flightU = clamp01((relT - REL_COMPRESS) / REL_RIB);
      buildC = relT < REL_COMPRESS ? ease(relT / REL_COMPRESS) : jump(flightU);
      // (no rounding: the squash is applied per frame, the path is not rebuilt)
    }
    // in screen order (desktop: left to right, the grid places them out of DOM order; phones: top to bottom)
    const cards = workAny
      ? [...workAny.pin.querySelectorAll<HTMLElement>(".project-card")].sort((a, b) => {
          const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
          return workPin ? ra.left - rb.left : ra.top - rb.top;
        })
      : [];
    let sigma = ease(hero.p) * clear;
    let lead = 0;
    // desktop: the head's own position (rigid unless a section sets it: How I Build shortens the ribbon)
    let leadD = Number.NaN;
    if (unravel && clear > 0) {
      const portrait = !(W >= 768 && W > H);
      const textA = unravel.pin.querySelector<HTMLElement>(".unravel__line--a");
      const textB = unravel.pin.querySelector<HTMLElement>(".unravel__line--b");
      // Selected Work's cards at rest (css px in its pinned screen)
      const workRects =
        !portrait && workPin && cards.length === 3
          ? cards.map((c) => {
              const r = c.getBoundingClientRect(), t = workPin.pin.getBoundingClientRect().top;
              return { x0: r.left, y0: r.top - t, x1: r.right, y1: r.bottom - t };
            })
          : null;
      // phones: the stacked cards in VIRTUAL page coordinates, and where the section ends
      const stackRects =
        portrait && workAny && !workPin && cards.length === 3
          ? (() => {
              const t = workAny.section.getBoundingClientRect().top;
              return {
                cards: cards.map((c) => {
                  const r = c.getBoundingClientRect();
                  return { x0: r.left, y0: workAny.vTop + r.top - t, x1: r.right, y1: workAny.vTop + r.bottom - t };
                }),
                endY: workAny.vTop + workAny.section.offsetHeight,
              };
            })()
          : null;
      const sk = stackRects ? stackRects.cards.map((r) => `${r.y0.toFixed(0)},${r.y1.toFixed(0)}`).join(";") + `|${stackRects.endY.toFixed(0)}` : "-";
      // How I Build: the D of BUILD (ink), "01", and the empty area right of the heading (css px in its pinned screen)
      const brKey = `${key}|${buildPin?.vTop.toFixed(0)}|${portrait}|${document.documentElement.scrollHeight}`;
      if (brKey !== buildRectsKey) {
        buildRectsKey = brKey;
        buildRectsVal = null;
      }
      const buildRects =
        !portrait && buildPin && workRects
          ? buildRectsVal ?? (buildRectsVal = (() => {
              // the empty box right of the three principles, and the gap between the D of BUILD and "01"
              const pinEl = buildPin.pin;
              const t = pinEl.getBoundingClientRect().top;
              const secTop = buildPin.section.getBoundingClientRect().top + window.scrollY;
              const titleB = pinEl.querySelector<HTMLElement>(".display");
              const ink = titleB ? measureInk(titleB) : [];
              const d = ink[ink.length - 1];
              const n01 = pinEl.querySelector<HTMLElement>(".principle__number");
              const pr = pinEl.querySelector<HTMLElement>(".build__principles");
              if (!d || !n01 || !pr) return null;
              const rn = n01.getBoundingClientRect(), rp = pr.getBoundingClientRect();
              let textR = 0;
              for (const el of pr.querySelectorAll<HTMLElement>(".principle__title, .principle__text")) {
                const rg = document.createRange();
                rg.selectNodeContents(el);
                for (const r of rg.getClientRects()) textR = Math.max(textR, r.right);
              }
              return {
                box: { x0: textR + 16, y0: rp.top - t, x1: rp.right, y1: rp.bottom - t },
                gap: { x: (d.x1 - window.scrollX + rn.left) / 2, y: (d.y1 - secTop + rn.top - t) / 2 },
                top: ink[0].y0 - secTop,
              };
            })())
          : null;
      // Experience + Terminal: the strip (the union of its entries) and the terminal window (css px in its pinned screen)
      const exKey = `${key}|${exPin?.vTop.toFixed(0)}|${portrait}|${document.documentElement.scrollHeight}`;
      if (exKey !== exRectsKey) {
        exRectsKey = exKey;
        exRectsVal = null;
      }
      const exRects =
        !portrait && exPin && buildRects
          ? exRectsVal ?? (exRectsVal = (() => {
              const t = exPin.pin.getBoundingClientRect().top;
              const items = [...exPin.pin.querySelectorAll<HTMLElement>(".strip__item")].map((e) => e.getBoundingClientRect());
              const tw = exPin.pin.querySelector<HTMLElement>(".terminal-window")?.getBoundingClientRect();
              if (!items.length || !tw) return null;
              return {
                strip: { x0: Math.min(...items.map((r) => r.left)), y0: Math.min(...items.map((r) => r.top)) - t, x1: Math.max(...items.map((r) => r.right)), y1: Math.max(...items.map((r) => r.bottom)) - t },
                term: { x0: tw.left, y0: tw.top - t, x1: tw.right, y1: tw.bottom - t },
              };
            })())
          : null;
      const xk = exRects ? `${exPin!.vTop.toFixed(0)}|${exRects.strip.y1.toFixed(0)}|${exRects.term.x0.toFixed(0)},${exRects.term.y0.toFixed(0)}` : "-";
      // the footer: its virtual top, and the shift that puts the hero's AK on the footer heading as it sits on the name
      const footSec = document.querySelector<HTMLElement>('[data-section="contact"]');
      const fKey = `${key}|${portrait}|${document.documentElement.scrollHeight}`;
      if (fKey !== footRectsKey) {
        footRectsKey = fKey;
        footRectsVal = null;
      }
      const rooms = pins.reduce((a, p) => a + p.room, 0);
      const footRects =
        !portrait && exRects && footSec
          ? footRectsVal ?? (footRectsVal = (() => {
              const name = document.getElementById("hero-title"), head = document.getElementById("contact-title");
              if (!name || !head) return null;
              const rn = name.getBoundingClientRect(), rh = head.getBoundingClientRect();
              const nameTop = rn.top - hero.pin.getBoundingClientRect().top; // in the hero's screen, at rest
              const ft = footSec.getBoundingClientRect().top;
              const yF = ft + window.scrollY - rooms;
              return { dx: rh.left - rn.left, dy: yF + (rh.top - ft) - nameTop, yF };
            })())
          : null;
      const fk = footRects ? `${footRects.yF.toFixed(0)}|${footRects.dx.toFixed(0)}|${footRects.dy.toFixed(0)}` : "-";
      // phones: the empty box above "HOW" (css px in its pinned screen)
      const buildHRects =
        portrait && buildPin && stackRects
          ? (() => {
              const pinEl = buildPin.pin, t = pinEl.getBoundingClientRect().top;
              const d = pinEl.querySelector<HTMLElement>(".display")?.getBoundingClientRect();
              const c = pinEl.querySelector<HTMLElement>(".container")?.getBoundingClientRect();
              const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 0;
              if (!d || !c) return null;
              const gut = parseFloat(getComputedStyle(pinEl.querySelector(".container")!).paddingLeft) || 16;
              return { x0: c.left + gut, y0: header + 8, x1: c.right - gut, y1: d.top - t - 8 };
            })()
          : null;
      // phones: Experience's header row, the entries' text and the terminal window (css px from Experience's top)
      const exAny = pins.find((p) => p.name === "exterm");
      const exPRects =
        portrait && exAny && buildHRects && !exPin
          ? (() => {
              const t = exAny.section.getBoundingClientRect().top;
              const head = exAny.section.querySelector<HTMLElement>(".experience__head")?.getBoundingClientRect();
              const items = [...exAny.section.querySelectorAll<HTMLElement>(".strip__item")];
              const win = exAny.section.querySelector<HTMLElement>(".terminal-window")?.getBoundingClientRect();
              if (!head || !items.length || !win) return null;
              let textR = 0;
              for (const el of items.flatMap((i) => [...i.querySelectorAll<HTMLElement>("p")])) {
                const rg = document.createRange();
                rg.selectNodeContents(el);
                for (const r of rg.getClientRects()) textR = Math.max(textR, r.right);
              }
              const strip = exAny.section.querySelector<HTMLElement>(".strip");
              if (strip) {
                const cut = `${Math.max(0, strip.getBoundingClientRect().right - (textR + 16)).toFixed(0)}px`;
                if (strip.style.getPropertyValue("--strip-cut") !== cut) strip.style.setProperty("--strip-cut", cut);
              }
              return {
                yE: exAny.vTop,
                headY1: head.bottom - t,
                textR,
                lastY1: items[items.length - 1].getBoundingClientRect().bottom - t,
                win: { x0: win.left, y0: win.top - t, x1: win.right, y1: win.bottom - t },
                termTop: (exAny.section.querySelector<HTMLElement>('[data-section="terminal"]')?.getBoundingClientRect().top ?? t + window.innerHeight) - t,
                headerH: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 72,
              };
            })()
          : null;
      // phones: the footer's virtual top (the AK at the hero's own screen spot, as on desktop)
      const footRectsP =
        portrait && exPRects && footSec
          ? (() => {
              const ft = footSec.getBoundingClientRect().top;
              return { yF: ft + window.scrollY - rooms };
            })()
          : null;
      const xpk = exPRects ? `${footRectsP?.yF.toFixed(0)}|${exPRects.yE.toFixed(0)}|${exPRects.headY1.toFixed(0)},${exPRects.textR.toFixed(0)},${exPRects.lastY1.toFixed(0)},${exPRects.win.y0.toFixed(0)}` : "-";
      const bhk = buildHRects ? `${buildPin!.vTop.toFixed(0)}|${buildHRects.y0.toFixed(0)},${buildHRects.y1.toFixed(0)},${buildHRects.x1.toFixed(0)}` : "-";
      const bk = buildRects ? `${buildPin!.vTop.toFixed(0)}|${[buildRects.box].map((r) => `${r.x0.toFixed(0)},${r.y0.toFixed(0)},${r.x1.toFixed(0)},${r.y1.toFixed(0)}`).join(";")}|${buildRects.gap.x.toFixed(0)},${buildRects.gap.y.toFixed(0)},${buildRects.top.toFixed(0)}` : "-";
      const titleEl = workPin?.pin.querySelector<HTMLElement>(".work__head .display");
      const workTitle = workRects && titleEl
        ? (() => {
            const r = titleEl.getBoundingClientRect(), t = workPin!.pin.getBoundingClientRect().top;
            return { x0: r.left, y0: r.top - t, x1: r.right, y1: r.bottom - t };
          })()
        : null;
      const wk = workRects ? `${workPin!.vTop.toFixed(0)}|${workRects.map((r) => `${r.x0.toFixed(0)},${r.y0.toFixed(0)},${r.x1.toFixed(0)},${r.y1.toFixed(0)}`).join(";")}` : "-";
      const pk = `${key}|${unravel.vTop.toFixed(0)}|${portrait}|${textA?.offsetTop}|${textB?.offsetTop}|${textA?.offsetWidth}|${wk}|${sk}|${bk}|${xk}|${fk}|${bhk}|${xpk}`;
      // (while released, the release path is in place: the entry path is rebuilt once the ribbon is back in the box)
      if (pk !== pathKey && textA && textB) {
        // the wave goes between the two text blocks (rest coordinates: virtual = section top + offset in the pin)
        const pinTop = unravel.pin.getBoundingClientRect().top;
        const ra = textA.getBoundingClientRect(), rb = textB.getBoundingClientRect();
        const hwS = sl.end1().hw;
        let wave: { c: number; amp: number; top: number; lambda?: number; crestY?: number };
        const aBottom = unravel.vTop + ra.bottom - pinTop, bTop = unravel.vTop + rb.top - pinTop;
        // PHONE (owner, final): exactly the desktop choreography, horizontal: the hero ribbon goes off-screen left,
        // the text splits above and below, the head re-enters from the left and draws the wave left to right (off
        // right; the next section brings it back in from the right). The vertical phone builders are unused.
        if (false as boolean) {
          // (old) PHONE: one continuous ribbon, the desktop's look: the hero's tail flows on screen into one gentle
          // curve to the centre and straight down the middle as the same tilted-plane wave; rigid (all of it moves)
          // End 1's true end direction (last two rings): a 3-ring chord blurs it and leaves a corner at the join
          const e0 = sl.end1(), r1 = sl.poseRing(1);
          const tx = e0.p[0] - r1.p[0], ty = e0.p[1] - r1.p[1], tz = e0.p[2] - r1.p[2];
          const tl = Math.hypot(tx, ty, tz) || 1;
          const flow = buildPortraitFlow({
            W,
            H,
            end: { ...e0, t: [tx / tl, ty / tl, tz / tl] },
            ds: sl.spacing,
            y2: unravel.vTop,
            camZ: sl.cameraZ,
            c: W / 2,
            top: unravel.vTop + 0.46 * H,
            amp: Math.max(16, Math.min(0.12 * W, (rb.left - ra.right) / 2 - hwS - 8)),
            lambda: 0.32 * H,
          });
          pathD = null;
          flowK = 0;
          path = flow;
          sl.setHeadPath(flow.pos, flow.ruled, flow.k);
          // running max of each ring's screen height: the head may advance while its path stays above the follow line
          ymax = new Float32Array(flow.k);
          let mx = -Infinity;
          for (let q = 0; q < flow.k; q++) ymax[q] = mx = Math.max(mx, flow.yv[q]);
        } else {
        // DESKTOP: the approved v335 choreography (off the left edge, back in from the left drawing the wave)
        flowK = 0;
        path = null;
        // phones: continue along End 1's TRUE end direction (its last segment); the 3-ring chord blurs it and leaves a
        // small corner where the strand leaves the pose (visible once the page scrolls it up). Desktop keeps the chord.
        // ...and with its curvature, relaxed to straight (a curvature step there reads as a ridge)
        const e1 = sl.end1();
        let endBend: { axis: [number, number, number]; rate: number } | undefined;
        if (portrait) {
          const r1 = sl.poseRing(1), r2 = sl.poseRing(2);
          const unit = (a: number[], b: number[]): [number, number, number] => {
            const v = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], l = Math.hypot(v[0], v[1], v[2]) || 1;
            return [v[0] / l, v[1] / l, v[2] / l];
          };
          const tb = unit(e1.p, r1.p), ta = unit(r1.p, r2.p);
          e1.t = tb;
          const ax: [number, number, number] = [ta[1] * tb[2] - ta[2] * tb[1], ta[2] * tb[0] - ta[0] * tb[2], ta[0] * tb[1] - ta[1] * tb[0]];
          const sn = Math.hypot(ax[0], ax[1], ax[2]);
          const seg = Math.hypot(e1.p[0] - r1.p[0], e1.p[1] - r1.p[1], e1.p[2] - r1.p[2]) || 1;
          if (sn > 1e-6) endBend = { axis: ax, rate: Math.atan2(sn, ta[0] * tb[0] + ta[1] * tb[1] + ta[2] * tb[2]) / seg };
        }
        lastInput = {
          W,
          H,
          end: e1,
          endBend,
          ds: sl.spacing,
          y2: unravel.vTop,
          sClear: clear,
          transition: DESKTOP_TRANSITION_PER_H * H,
          portrait: false,
          camZ: sl.cameraZ,
          ribbonLen: sl.length,
          waveC: (aBottom + bTop) / 2,
          waveAmp: Math.max(20, Math.min(portrait ? 0.075 * H : 0.17 * H, (bTop - aBottom) / 2 - 1.2 * hwS - 16)),
          // phone: a long, gentle wave (the desktop's W / 1.75 is a zigzag on a narrow screen)
          waveLambda: portrait ? 0.95 * W : undefined,
          work: workRects && workTitle ? { y3: workPin!.vTop, cards: workRects, title: workTitle! } : undefined,
          stack: stackRects ?? undefined,
          buildH: buildHRects ? { yB: buildPin!.vTop, box: buildHRects } : undefined,
          // the coil is built loose; the compression is a per-frame squash (sl.deform below): smooth at any frame rate
          build: buildRects ? { yB: buildPin!.vTop, ...buildRects, c: 0 } : undefined,
          exterm: exRects ? { yE: exPin!.vTop, ...exRects } : undefined,
          exP: exPRects ?? undefined,
          foot: footRects || footRectsP
            ? {
                yF: (footRects ?? footRectsP)!.yF,
                // the AK at the hero's own screen spot (owner: "the exact same one as the hero")
                dx: 0,
                dy: (footRects ?? footRectsP)!.yF,
                pose: Array.from({ length: sl.count }, (_, i) => {
                  const r = sl.poseRing(i);
                  return { p: r.p, b: r.b, hw: r.hw };
                }),
              }
            : undefined,
        };
        pathD = buildJourneyPathDesktop(lastInput!);
        sl.setHeadPath(pathD.pos, pathD.ruled, pathD.k);
        // the weave: each card's proxy depth puts it in front of or behind the ribbon (never between its z values,
        // so the ribbon can never cut through a card)
        cards.forEach((c, i) => {
          const d = pathD!.work?.depths[i];
          if (d !== undefined) c.dataset.ribbonDepth = d.toFixed(0);
          const dp = pathD!.stack?.depths[i];
          if (dp !== undefined) c.dataset.ribbonDepthPortrait = dp.toFixed(0);
        });
        }
        if (spiral) {
          spiral = null;
          tailM = -1;
          sl.setTailOverride(null, null);
        }
        pathKey = pk;
      }
      if (portrait && flowK > 0 && hero.p >= 1) {
        // PHONE: the whole ribbon keeps flowing down the path as the user scrolls on (rigid)
        const q = clamp01(V / Math.max(1, unravel.vTop));
        sigma = clear + q * PHONE_FLOW_TRANSITION * H + ease(unravel.p) * PHONE_FLOW_PIN * H;
      }
      if (pathD && hero.p >= 1) {
        // DESKTOP (v335): a rigid window (head = tail - length): the hero's remaining strand flows down-left off the
        // edge during the free scroll, the head enters from the left as section 2 pins and draws the wave
        if (unravel.p <= 0) sigma = clear + clamp01(V / Math.max(1, unravel.vTop)) * (pathD.sEntry - clear);
        else {
          const lead0 = clamp01(unravel.p / 0.05);
          const draw = ease(clamp01((unravel.p - 0.05) / 0.95));
          sigma = pathD.sEntry + lead0 * (pathD.sVisible - pathD.sEntry) + draw * (pathD.sWaveEnd - pathD.sVisible);
        }
        const st = pathD.stack;
        let stackEnd = -1, stackEndV = 0;
        if (st && unravel.p >= 1) {
          // PHONE Selected Work (no pin): each crossing draws as its gap moves up the screen (from 88% to 45% down);
          // in between, the head turns round off-screen
          let prevS = pathD.sWaveEnd, prevV = unravel.vTop;
          let done = false;
          for (const ps of st.passes) {
            const v0 = ps.g - STACK_FROM * H, v1 = ps.g - STACK_TO * H;
            if (V < v0) {
              sigma = prevS + clamp01((V - prevV) / Math.max(1, v0 - prevV)) * (ps.sIn - prevS);
              done = true;
              break;
            }
            if (V < v1) {
              sigma = ps.sIn + ease((V - v0) / (v1 - v0)) * (ps.sOut - ps.sIn);
              done = true;
              break;
            }
            prevS = ps.sOut;
            prevV = v1;
          }
          // after the last crossing the ribbon flows on (off the left edge) with the scroll
          if (!done) {
            sigma = prevS + (V - prevV);
            stackEnd = prevS;
            stackEndV = prevV;
          }
        }
        const w = pathD.work;
        if (w && workPin && unravel.p >= 1) {
          if (workPin.p <= 0) {
            // free scroll from section 2 to Selected Work: the wave flows on off the right edge, the head runs its
            // hidden route down the right side to the lane's entry
            const q = clamp01((V - unravel.vTop) / Math.max(1, workPin.vTop - unravel.vTop));
            sigma = pathD.sWaveEnd + q * (w.sEntry - pathD.sWaveEnd);
          } else if (workPin.p < WORK_IN) {
            sigma = w.sEntry + (workPin.p / WORK_IN) * (w.sVisible - w.sEntry);
          } else if (workPin.p < WORK_OUT) {
            // across, fully off the left edge, back in from the left and across the cards; the turn out of sight
            // takes no scroll
            const top = w.sTopOut - w.sVisible, all = top + (w.sHeadOut - w.sBottomIn);
            const v = ease((workPin.p - WORK_IN) / (WORK_OUT - WORK_IN)) * all;
            sigma = v <= top ? w.sVisible + v : w.sBottomIn + (v - top);
          } else {
            // the head is gone; the rest of the ribbon follows it through and speeds up as it leaves
            const u = clamp01((workPin.p - WORK_OUT) / (1 - WORK_OUT));
            // (short ribbon on a wide screen: the tail is already on screen, so never step back behind the head)
            const s0 = Math.max(w.sTailIn, w.sHeadOut);
            sigma = s0 + (0.35 * u + 0.65 * u * u) * (w.sClear - s0);
          }
        }
        const bm = pathD.build;
        const phoneB = !!(bm && bm.sK !== undefined && stackEnd >= 0);
        if (bm && buildPin && ((w && workPin && workPin.p >= 1) || phoneB)) {
          const Lr = sl.length;
          // the head just out of sight when the pin starts (desktop: beyond the right edge; phone: the hidden corner
          // above the section's top-left)
          const tailEdge = phoneB ? bm.sK! : bm.sEdge - 2 * sl.end1().hw;
          const coilLen = bm.sTop - bm.sCoil0;
          let head = 0, tail = 0;
          if (buildPin.p <= 0) {
            // free scroll from Selected Work: the head runs its hidden route (desktop: down the right side; phone: up
            // the left side)
            const s0 = phoneB ? stackEnd : w!.sClear;
            const v0 = phoneB ? stackEndV : workPin!.vTop;
            const q = clamp01((V - v0) / Math.max(1, buildPin.vTop - v0));
            head = s0 + q * (tailEdge - s0);
            tail = head - Lr;
            // phone: the previous strand flows away fast (its tail races after the head out of sight), so it is gone
            // before the pinned screen arrives and the spring ribbon drops in
            if (phoneB) tail = head - Lr * (1 - Math.min(1, q * 1.6) ** 2);
          } else if (relState !== 0 || relBelow) {
            // the release (either way): the flight by the timeline, then on down the diagonal with the page
            const flightU = clamp01((relT - REL_COMPRESS) / REL_RIB);
            head = bm.sTop + easeOut3(flightU) * (bm.sBottom - bm.sTop) + relS * (bm.sStop - bm.sBottom);
            tail = head - coilLen;
            // phone: the hidden route takes the first part of the page's slide; over the rest the head comes in from the
            // right into Experience and curls down (the ribbon grows from the right edge: nothing behind it shows)
            const xpR = pathD.exP;
            if (xpR) {
              const u1 = clamp01(relS / 0.45), u2 = clamp01((relS - 0.45) / 0.55);
              head = bm.sTop + easeOut3(flightU) * (bm.sBottom - bm.sTop) + u1 * (xpR.sWait - bm.sBottom) + ease(u2) * (xpR.sReady - xpR.sWait);
              tail = head - coilLen;
              if (head > xpR.sWait) tail = Math.max(tail, Math.min(head - 40, xpR.sIn - 2 * sl.end1().hw));
            }
          } else if (buildPin.p < BUILD_COIL) {
            // in at the bottom of the box and up round the pole to the top of "HOW"; the whole ribbon comes on screen:
            // its tail follows it in, and the coil is the whole ribbon once complete
            const u = ease(buildPin.p / BUILD_COIL);
            head = tailEdge + u * (bm.sTop - tailEdge);
            const len0 = Lr, len1 = coilLen;
            tail = head - (len0 + (len1 - len0) * u);
            // phone: the spring ribbon grows from the hidden corner (nothing of the previous strand comes back)
            if (phoneB) tail = Math.max(tail, Math.min(bm.sK!, head - 1));
          } else {
            // complete; then the scroll compresses the coil (the path itself changes: buildC), the ends held
            head = bm.sTop;
            tail = bm.sCoil0;
          }
          // one deliberate scroll each way runs the release: down from the complete coil / up from the next section
          const lenis = getLenis();
          const y = window.scrollY;
          const dir = relPrevY < 0 ? 0 : Math.sign(y - relPrevY);
          relPrevY = y;
          const startRun = (d: 1 | -1) => {
            relState = d;
            relT0 = performance.now();
            relScrolling = false;
            relScrolled = false;
            // the page holds still from here: cancel the gesture's own smooth-scroll momentum, then take input away
            if (lenis) {
              if (d > 0) lenis.scrollTo(Math.min(window.scrollY, yTrig + 40), { immediate: true, force: true });
              lenis.stop();
            }
            if (d < 0) runScroll(yHold, d);
          };
          const runScroll = (to: number, d: 1 | -1) => {
            relScrolling = true;
            const done = () => {
              relScrolled = true;
              lenis?.start();
            };
            if (lenis) lenis.scrollTo(to, { duration: REL_SCROLL, force: true, lock: true, easing: (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t), onComplete: done });
            else {
              window.scrollTo({ top: to, behavior: "smooth" });
              window.setTimeout(done, REL_SCROLL * 1000);
            }
            void d;
          };
          if (relState === 0 && !relBelow && dir > 0 && y >= yTrig && y < yNext - 4) startRun(1);
          else if (relState === 0 && relBelow && dir < 0 && y < yNext - 4) startRun(-1);
          const e = (performance.now() - relT0) / 1000;
          if (relState === 1 && !relScrolling && e >= REL_SCROLL_AT) runScroll(yNext, 1);
          // finished: the timeline at its end and the page arrived
          if (relState !== 0 && relScrolled && e >= REL_T) {
            relBelow = relState > 0;
            relState = 0;
            relScrolling = false;
          }
          // PHONE Experience (no pin): once released, the head comes in from the right as the user scrolls on, curls
          // down and draws down the lane, then keeps FOLLOW_EX down the screen until it stops above the terminal; a
          // ribbon of fixed length (it grows from the right edge: nothing of the incoming strand shows)
          const xp = pathD.exP;
          const exAnyP = pins.find((p) => p.name === "exterm");
          camPhone = null;
          if (xp && exAnyP && !exPin && relBelow && relState === 0) {
            const v = V - exAnyP.vTop;
            const arcAt = (sy: number) => {
              const f = (sy - xp.ty0) / xp.tdy;
              const i = Math.max(0, Math.min(xp.tarc.length - 2, Math.floor(f)));
              const u = Math.max(0, Math.min(1, f - i));
              return xp.tarc[i] + (xp.tarc[i + 1] - xp.tarc[i]) * u;
            };
            const vr = EXP_RAMP * H;
            if (v <= 0) head = xp.sReady;
            else if (v < vr) head = xp.sReady + ease(v / vr) * (arcAt(vr + FOLLOW_EX * H) - xp.sReady);
            else head = arcAt(v + FOLLOW_EX * H);
            head = Math.min(head, xp.sEnd);
            const Lx = EXP_LEN * H;
            tail = Math.max(head - Lx, Math.min(head - 40, xp.sIn - 2 * sl.end1().hw));
            // TERMINAL (phone): the page holds when the terminal's screen fills the view; swiping fills the bar under
            // it; full: the ribbon wraps the terminal and flows off the right edge, then the footer (as on desktop)
            const lenis = getLenis();
            const now = performance.now();
            const dt = Math.min(0.1, (now - fillAt) / 1000);
            fillAt = now;
            const termEl = document.querySelector<HTMLElement>('[data-section="terminal"]');
            const yGate = termEl ? termEl.getBoundingClientRect().top + window.scrollY : 0;
            const fm = pathD.foot;
            const footSecEl = document.querySelector<HTMLElement>('[data-section="contact"]');
            const yFoot = footSecEl ? footSecEl.getBoundingClientRect().top + window.scrollY : 0;
            if (fm && footState === 0 && !footFired && window.scrollY >= yFoot - 4) footState = 2;
            let ft = -1;
            if (footState === 1) ft = Math.min(TOTAL_P, (now - footT0) / 1000);
            else if (footState === 2) ft = TOTAL_P;
            else if (footState === -1) ft = Math.max(0, TOTAL_P - ((now - footRevT0) / 1000) * FOOT_REV);
            const qaT = (window as unknown as { __footT?: number }).__footT;
            if (typeof qaT === "number" && footState !== 0) ft = qaT;
            let footSnap = false, footCam = false, footFly = false;
            const tailHold = xp.sEnd - Lx;
            const lenW = xp.sWrapOut - tailHold;
            const lenAK = fm ? fm.sE1 - fm.sE2 : 0;
            if (ft >= 0) {
              const t0 = WRAP_T, t1 = t0 + FOOT_RUN, t2 = t1 + FOOT_FLY;
              if (ft < t0) {
                // the wrap: the head draws it, the tail held above
                head = xp.sEnd + ease(ft / t0) * (xp.sWrapOut - xp.sEnd);
                tail = tailHold;
              } else if (ft < t1 || !fm) {
                // the page scrolls to the footer; the ribbon runs on off the right edge until all of it is out of sight
                const hEnd = xp.sWrapOut + lenW + 60;
                head = xp.sWrapOut + ease(Math.min(1, (ft - t0) / FOOT_RUN)) * (hEnd - xp.sWrapOut);
                tail = head - lenW;
              } else if (ft < t2) {
                const pr = fm.pre;
                const lPre = 0.65 * (pr.out - pr.in);
                const outV = pr.in + FLY_OUT * (pr.out - pr.in);
                const s0 = pr.in - (fm.sFlyIn - fm.sS0);
                const hp = s0 + Math.pow((ft - t1) / FOOT_FLY, 1.6) * (outV + lPre - s0);
                head = postOf(pr, hp);
                tail = Math.max(fm.sS0, postOf(pr, hp - lPre));
                footCam = footSnap = footFly = true;
              } else {
                const u = clamp01((ft - t2) / FOOT_FORM);
                head = fm.sDive0 + 4 + (1 - Math.pow(1 - u, 3)) * (fm.sE1 - fm.sDive0 - 4);
                tail = Math.max(fm.sDive0, head - lenAK);
                footCam = footSnap = true;
              }
              if (fm) {
                setFootIntro(ft >= t0 + FOOT_CONTENT ? "in" : "hidden");
                typeFoot(ft >= t2 ? clamp01((head - fm.sE2) / Math.max(1, lenAK * 0.995)) : 0);
              }
            }
            if (footCam && lastInput?.foot) camPhone = lastInput.foot.yF;
            if (footCam !== camWasFoot) {
              camWasFoot = footCam;
              footSnap = true;
            }
            if (footSnap) {
              sl.sigma = tail + Lr;
              sl.velocity = 0;
              sl.lead = head;
              sl.leadVelocity = 0;
            }
            const veil = document.querySelector<HTMLElement>(".contact__veil");
            if (veil) {
              const dv = footFly ? "-5000" : "5000";
              if (veil.dataset.ribbonDepth !== dv) veil.dataset.ribbonDepth = dv;
            }
            // the gate
            if (window.scrollY < yGate - 0.3 * H) gateArmed = true;
            if (!footFired && !gateOn && gateArmed && lenis && dir > 0 && window.scrollY >= yGate - 2 && window.scrollY < yGate + 0.5 * H) {
              gateOn = true;
              gateArmed = false;
              lenis.scrollTo(yGate, { immediate: true, force: true });
              lenis.stop();
            }
            if (!gateOn && !footFired && fill > 0) fill = Math.max(0, fill - FILL_DRAIN * dt);
            if (gateOn && now - fillLast > 260) fill = Math.max(0, fill - FILL_DRAIN * dt);
            const sine = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);
            if (gateOn && fill >= 1) {
              gateOn = false;
              footFired = true;
              footT0 = now;
              footState = 1;
              if (fm) {
                setFootIntro("hidden");
                typeFoot(0);
              }
            }
            // after the wrap: the page scrolls on to the footer (input held)
            if (footState === 1 && !footRevScroll && ft >= WRAP_T) {
              footRevScroll = true;
              lenis?.scrollTo(yFoot, { duration: FOOT_RUN, force: true, lock: true, easing: sine, onComplete: () => { if (!fm) lenis?.start(); } });
            }
            if (footState === 1 && ft >= TOTAL_P) {
              footState = 2;
              footRevScroll = false;
              lenis?.start();
            }
            // one swipe up from the formed footer runs it all backwards and returns to the gate with the bar empty
            if (footState === 2 && lenis && window.scrollY < yFoot - 4 && window.scrollY > yGate + 4) {
              footState = -1;
              footRevT0 = now;
              footRevScroll = false;
              lenis.scrollTo(yFoot, { immediate: true, force: true });
              lenis.stop();
            }
            if (footState === -1 && !footRevScroll && ft <= WRAP_T + FOOT_RUN) {
              footRevScroll = true;
              lenis?.scrollTo(yGate, { duration: FOOT_RUN / FOOT_REV, force: true, lock: true, easing: sine });
            }
            if (footState === -1 && ft <= 0) {
              footState = 0;
              footFired = false;
              footRevScroll = false;
              fill = 0;
              gateOn = true;
              gateArmed = false;
              setFootIntro("");
              typeFoot(1);
            }
            if (footState === 0 && footFired && window.scrollY < yGate - 40) {
              footFired = false;
              fill = 0;
            }
            // the bar: under the terminal (right-aligned with it), shown while the page is held, until it is full
            const bar = exAnyP.pin.querySelector<HTMLElement>(".fillbar");
            const winR = lastInput?.exP?.win;
            if (bar && winR) {
              const cap = exAnyP.pin.querySelector<HTMLElement>(".terminal__caption");
              const capB = cap ? cap.getBoundingClientRect().bottom - exAnyP.section.getBoundingClientRect().top : winR.y1 + 40;
              bar.style.left = `${((winR.x0 + winR.x1) / 2 - 110).toFixed(1)}px`;
              bar.style.top = `${(capB + 22).toFixed(1)}px`;
              bar.style.setProperty("--fill", fill.toFixed(3));
              const on = (gateOn || (fill > 0 && !footFired)) && !footFired;
              if (on !== bar.hasAttribute("data-on")) bar.toggleAttribute("data-on", on);
            }
          }
          // Experience + Terminal: on from the waiting point (the same shortened ribbon)
          const xm = pathD.exterm;
          if (xm && exPin && exPin.p > 0 && relBelow) {
            const q = exPin.p;
            const lenis = getLenis();
            const now = performance.now();
            const dt = Math.min(0.1, (now - fillAt) / 1000);
            fillAt = now;
            const fm = pathD.foot;
            const footSecEl = document.querySelector<HTMLElement>('[data-section="contact"]');
            const yFoot = footSecEl ? footSecEl.getBoundingClientRect().top + window.scrollY : 0;
            // the footer's timeline position: forward from the bar filling up, backward on the way back, or the end
            // when the footer was reached some other way (it is then simply formed)
            if (fm && footState === 0 && !footFired && window.scrollY >= yFoot - 4) footState = 2;
            let ft = -1;
            if (footState === 1) ft = Math.min(FOOT_T, (now - footT0) / 1000);
            else if (footState === 2) ft = FOOT_T;
            else if (footState === -1) ft = Math.max(0, FOOT_T - ((now - footRevT0) / 1000) * FOOT_REV);
            // QA: window.__footT freezes the footer's timeline at that moment
            const qaT = (window as unknown as { __footT?: number }).__footT;
            if (typeof qaT === "number" && footState !== 0) ft = qaT;
            // the footer's own head / tail (null: Experience's rules below)
            let footHT: [number, number] | null = null;
            let footSnap = false;
            let footCam = false;
            let footFly = false;
            const lenAK = fm ? fm.sE1 - fm.sE2 : 0;
            const lenXe = xm.sEnd - xm.sTailEnd;
            if (fm && ft >= 0) {
              const t1 = FOOT_RUN, t2 = t1 + FOOT_FLY;
              if (ft < t1) {
                // the page scrolls to the footer; the ribbon runs on off the right edge until all of it is out of sight
                const hEnd = xm.sOff + lenXe + 40;
                const h = xm.sEnd + ease(ft / t1) * (hEnd - xm.sEnd);
                footHT = [h, h - lenXe];
              } else if (ft < t2) {
                // (hidden jump onto the footer's own path, the camera moved down to the footer: snap)
                // the fly-through: a piece of constant apparent length recedes from the camera to the top left, slow
                // at first, quicker as it goes; in front of everything
                const pr = fm.pre;
                const lPre = 0.65 * (pr.out - pr.in);
                const outV = pr.in + FLY_OUT * (pr.out - pr.in);
                const s0 = pr.in - (fm.sFlyIn - fm.sS0); // the fly-through's start, in design arcs
                const hp = s0 + Math.pow((ft - t1) / FOOT_FLY, 1.6) * (outV + lPre - s0);
                footHT = [postOf(pr, hp), Math.max(fm.sS0, postOf(pr, hp - lPre))];
                footCam = true;
                footSnap = true;
                footFly = true;
              } else {
                // back in from the bottom left along the AK's own tail line, briskly, and the AK forms from its tail
                // end (the ribbon grows to the AK's length, its tail held beyond the screen until then)
                const u = clamp01((ft - t2) / FOOT_FORM);
                const h = fm.sDive0 + 4 + (1 - Math.pow(1 - u, 3)) * (fm.sE1 - fm.sDive0 - 4);
                footHT = [h, Math.max(fm.sDive0, h - lenAK)];
                footCam = true;
                footSnap = true;
              }
              head = footHT[0];
              setFootIntro(ft >= FOOT_CONTENT ? "in" : "hidden");
              typeFoot(clamp01((head - fm.sE2) / Math.max(1, lenAK * 0.995)));
            } else if (footFired) {
              head = xm.sEnd + easeOut3((now - footT0) / 1000 / FOOT_RUN) * 1.4 * W;
            } else if (q < EX_IN) head = xm.sWait;
            else if (q < EX_UNDER) head = xm.sWait + ease((q - EX_IN) / (EX_UNDER - EX_IN)) * (xm.sUnder - xm.sWait);
            else head = xm.sUnder + ease(clamp01((q - EX_UNDER) / (EX_END - EX_UNDER))) * (xm.sEnd - xm.sUnder);
            // a ribbon of fixed length travelling along the path: once its head is beside the terminal, its tail rests
            // where the sweep begins. It grows to that length over the underline (never faster than the head moves, so
            // its tail never runs backwards); the strand it came in on has left the screen by the first entry
            // by the time the head has passed the first entry, the tail has pulled the strand it came in on out of
            // sight (to the underline's start, beyond the left edge); from there the ribbon grows (its tail held) to
            // its length, then travels at that length
            const lenX = xm.sEnd - xm.sTailEnd;
            const tA = xm.sWait - coilLen;
            if (head <= xm.sFirst) tail = tA + ease(clamp01((head - xm.sWait) / Math.max(1, xm.sFirst - xm.sWait))) * (xm.sStart - tA);
            else tail = Math.max(xm.sStart, head - lenX);
            if (footHT) [head, tail] = footHT;
            // the camera moves to the footer's height only while the footer's own path is in use (switched while the
            // ribbon is out of sight); its jumps are instant (the springs would sweep it across the screen)
            const yFcam = footFired || footState !== 0 ? (fm && footCam ? (lastInput?.foot?.yF ?? 0) : 0) : 0;
            if (sl.cameraBase !== yFcam) {
              sl.cameraBase = yFcam;
              footSnap = true;
            }
            if (footSnap) {
              sl.sigma = tail + Lr;
              sl.velocity = 0;
              sl.lead = head;
              sl.leadVelocity = 0;
            }
            // the fly-through passes in front of everything (a full-screen weave layer)
            const veil = document.querySelector<HTMLElement>(".contact__veil");
            if (veil) {
              const d = footFly ? "-5000" : "5000";
              if (veil.dataset.ribbonDepth !== d) veil.dataset.ribbonDepth = d;
            }
            // the gate: at the pin's end the page holds while the scrolling fills the bar
            const yGate = exPin.section.getBoundingClientRect().top + window.scrollY + exPin.room;
            if (q < 0.95) gateArmed = true;
            if (!footFired && !gateOn && gateArmed && lenis && q >= EX_GATE && window.scrollY > (relPrevY < 0 ? 0 : relPrevY - 0.5)) {
              gateOn = true;
              gateArmed = false;
              lenis.scrollTo(yGate, { immediate: true, force: true });
              lenis.stop();
            }
            if (!gateOn && !footFired && fill > 0) fill = Math.max(0, fill - FILL_DRAIN * dt);
            if (gateOn && now - fillLast > 260) fill = Math.max(0, fill - FILL_DRAIN * dt);
            const sine = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);
            if (gateOn && fill >= 1) {
              // full: the bar fades, the page scrolls to the footer and the footer's sequence runs (input held)
              gateOn = false;
              footFired = true;
              footT0 = now;
              footState = fm ? 1 : 0;
              if (fm) {
                setFootIntro("hidden");
                typeFoot(0);
              }
              lenis?.scrollTo(yFoot, { duration: FOOT_RUN, force: true, lock: true, easing: sine, onComplete: () => { if (!fm) lenis.start(); } });
            }
            if (footState === 1 && ft >= FOOT_T) {
              footState = 2;
              lenis?.start();
            }
            // one scroll up from the formed footer runs it all backwards and returns to the full bar's gate
            if (footState === 2 && lenis && window.scrollY < yFoot - 4 && window.scrollY > yGate + 4) {
              footState = -1;
              footRevT0 = now;
              footRevScroll = false;
              lenis.scrollTo(yFoot, { immediate: true, force: true });
              lenis.stop();
            }
            if (footState === -1 && !footRevScroll && ft <= FOOT_RUN) {
              footRevScroll = true;
              lenis?.scrollTo(yGate, { duration: FOOT_RUN / FOOT_REV, force: true, lock: true, easing: sine });
            }
            if (footState === -1 && ft <= 0) {
              // back at the gate, the bar empty: scroll down fills it again, scroll up leaves
              footState = 0;
              footFired = false;
              fill = 0;
              gateOn = true;
              gateArmed = false;
              setFootIntro("");
              typeFoot(1);
            }
            if (footState === 0 && footFired && window.scrollY < yGate - 40) {
              footFired = false;
              fill = 0;
            }
            // the bar: under the ribbon's end, shown near the end of the pin, until it is full
            const bar = exPin.pin.querySelector<HTMLElement>(".fillbar");
            if (bar) {
              bar.style.left = `${(xm.end.x - 220).toFixed(1)}px`;
              bar.style.top = `${(xm.end.y + sl.end1().hw + 30).toFixed(1)}px`;
              bar.style.setProperty("--fill", fill.toFixed(3));
              const on = q >= EX_BAR && !footFired;
              if (on !== bar.hasAttribute("data-on")) bar.toggleAttribute("data-on", on);
            }
          }
          sigma = tail + Lr;
          leadD = head;
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
        // the whole ribbon moves on with the head (constant length after the hero exit): the S above flows forward
        // as the head draws ahead of the user
        sigma = clear + lead;
      }
    }
    // How I Build: squash the coil (about its fixed bottom) by the compression, every frame; the strand leaving its
    // top moves with the top (faded out along it)
    const coil = pathD?.build?.coil;
    if (coil && buildPin && Math.abs(buildC) > 1e-4) {
      const sm = (e0: number, e1: number, v: number) => {
        const t = Math.min(1, Math.max(0, (v - e0) / (e1 - e0)));
        return t * t * (3 - 2 * t);
      };
      const { x: cx, z: cz, r, a } = coil;
      if (coil.axis === "x") {
        // phone: the coil on its side, squashed toward its fixed left end
        const x0 = cx, x1 = coil.x1!, yA = coil.y!;
        const kC = (coil.x1Comp! - x0) / (x1 - x0);
        const k = 1 + buildC * (kC - 1);
        const dEnd = (x1 - x0) * (k - 1);
        sl.deform = (pos, ruled, n) => {
          for (let j = 0; j < n; j++) {
            const x = pos[j * 3], y = pos[j * 3 + 1], z = pos[j * 3 + 2];
            const yd = y - a * z;
            const rho = Math.hypot(yd - yA, z - cz);
            const w = (1 - sm(10, 30, Math.abs(rho - r))) * sm(x0 - 50, x0 - 15, x) * (1 - sm(x1 + 15, x1 + 50, x));
            const d = Math.hypot(x - x1, yd - yA, z - cz);
            const f = Math.max(0, 1 - d / 420);
            const shift = dEnd * f * f * (3 - 2 * f) * sm(x1 - 120, x1 + 15, x);
            pos[j * 3] = x + w * (x0 + k * (x - x0) - x) + (1 - w) * shift;
            if (w > 0) {
              const o = j * 4;
              const kk = 1 + w * (k - 1);
              const bx = kk * ruled[o], by = ruled[o + 1], bz = ruled[o + 2];
              const l = Math.hypot(bx, by, bz) || 1;
              ruled[o] = bx / l;
              ruled[o + 1] = by / l;
              ruled[o + 2] = bz / l;
            }
          }
        };
      } else {
      const kC = (coil.yTopComp - coil.yBot) / (coil.yTop - coil.yBot);
      const k = 1 + buildC * (kC - 1);
      const dTop = (coil.yTop - coil.yBot) * (k - 1);
      const { yBot, yTop } = coil;
      sl.deform = (pos, ruled, n) => {
        for (let j = 0; j < n; j++) {
          const x = pos[j * 3], y = pos[j * 3 + 1], z = pos[j * 3 + 2];
          const yd = y - a * z; // design height (the section's view shear removed)
          // weight: on the coil itself (its radius from the pole, within its height), smooth falloff: the strand
          // flying over the top passes the coil's box but never its surface, and no ring flips in or out
          const rho = Math.hypot(x - cx, z - cz);
          const w = (1 - sm(14, 42, Math.abs(rho - r))) * sm(yBot - 60, yBot - 20, yd) * (1 - sm(yTop + 20, yTop + 60, yd));
          // the strand leaving the top moves with the top (faded out along it)
          const d = Math.hypot(x - cx, yd - yTop, z - cz);
          const f = Math.max(0, 1 - d / 520);
          const shift = dTop * f * f * (3 - 2 * f) * sm(yTop - 160, yTop + 20, yd);
          const ySq = yBot + k * (yd - yBot) + a * z;
          pos[j * 3 + 1] = y + w * (ySq - y) + (1 - w) * shift;
          if (w > 0) {
            // the band's width vector through the same linear map (dy' = k dy + a (1 - k) dz), blended by w
            const o = j * 4;
            const kk = 1 + w * (k - 1);
            const bx = ruled[o], by = kk * ruled[o + 1] + a * (1 - kk) * ruled[o + 2], bz = ruled[o + 2];
            const l = Math.hypot(bx, by, bz) || 1;
            ruled[o] = bx / l;
            ruled[o + 1] = by / l;
            ruled[o + 2] = bz / l;
          }
        }
      };
      }
    } else sl.deform = null;
    // phones: the camera sits at Experience's height once the head is past its waiting point (the ribbon is out of
    // sight there), so Experience is seen head-on (no view shear on the twisting descent)
    const xpC = pathD?.exP;
    if (xpC && !(W >= 768 && W > H)) {
      const exAnyC = pins.find((p) => p.name === "exterm");
      const cam = camPhone ?? (exAnyC && sl.lead > xpC.sWait + 1 ? exAnyC.vTop : 0);
      if (sl.cameraBase !== cam) sl.cameraBase = cam;
      // (Experience on phones: no floor shadow there; the footer's AK keeps it)
      sl.cameraBackdrop = cam === 0 || cam !== exAnyC?.vTop;
    }
    sl.driveTarget = sigma;
    // desktop: rigid (the head moves with the tail); portrait: the head has its own position
    sl.driveLead = pathD || flowK > 0 ? (Number.isNaN(leadD) ? sigma : leadD) : lead;
    if (window.__journeyDebug !== undefined) window.__journeyDebug = { V, clear, hero: hero.p, unravel: unravel?.p, sigma, lead, sWave: path?.sWave, sWaveEnd: path?.sWaveEnd, build: buildPin?.p, buildC, relT, relState, relS, bm: pathD?.build, fm: pathD?.foot, xm: pathD?.exterm, footState, leadS: sl.lead, tailS: sl.sigma - sl.length, input: lastInput };
  };
}
