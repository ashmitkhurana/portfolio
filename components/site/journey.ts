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
import { buildJourneyPathDesktop, buildReleasePath, type JourneyPathDesktop, type JourneyPathDesktopInput, type ReleasePath } from "@/lib/ribbon/journeyPathDesktop";
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
/** How I Build (landscape) pin progress: the ribbon comes in and down into the box by BUILD_COIL (shortening out of
 *  sight as it does); from there the scroll compresses it (it shortens visibly into the box, the twist winds tighter);
 *  at BUILD_FIRE the release runs on its own */
const BUILD_COIL = 0.3;
const BUILD_FIRE = 0.985;
/** the release, seconds: the run backwards (the old tail leads: up and out, over, down through the gap), then the
 *  auto-scroll to the next section */
const REL_RUN = 1.35;
const REL_SCROLL0 = REL_RUN + 0.05;
const REL_SCROLL = 1.1;

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
  let relT0 = -1;
  let relScrolled = false;
  /** the release path (built when the spring fires) and the entry path's input it is built from */
  let relPath: ReleasePath | null = null;
  let lastInput: JourneyPathDesktopInput | null = null;
  /** How I Build's measured rects, per layout (measuring the ink is too costly for every frame) */
  let buildRectsKey = "";
  let buildRectsVal: { box: { x0: number; y0: number; x1: number; y1: number }; gap: { x: number; y: number } } | null = null;
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
    // How I Build: the compression (from the scroll; the release keeps it wound)
    let buildC = 0;
    let relE = -1;
    if (buildPin) {
      buildC = relT0 >= 0 ? 1 : ease(clamp01((buildPin.p - BUILD_COIL) / (BUILD_FIRE - BUILD_COIL)));
      buildC = Math.round(buildC * 50) / 50;
      if (relT0 >= 0) relE = (performance.now() - relT0) / 1000;
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
              };
            })())
          : null;
      const bk = buildRects ? `${buildPin!.vTop.toFixed(0)}|${buildC}|${[buildRects.box].map((r) => `${r.x0.toFixed(0)},${r.y0.toFixed(0)},${r.x1.toFixed(0)},${r.y1.toFixed(0)}`).join(";")}|${buildRects.gap.x.toFixed(0)},${buildRects.gap.y.toFixed(0)}` : "-";
      const titleEl = workPin?.pin.querySelector<HTMLElement>(".work__head .display");
      const workTitle = workRects && titleEl
        ? (() => {
            const r = titleEl.getBoundingClientRect(), t = workPin!.pin.getBoundingClientRect().top;
            return { x0: r.left, y0: r.top - t, x1: r.right, y1: r.bottom - t };
          })()
        : null;
      const wk = workRects ? `${workPin!.vTop.toFixed(0)}|${workRects.map((r) => `${r.x0.toFixed(0)},${r.y0.toFixed(0)},${r.x1.toFixed(0)},${r.y1.toFixed(0)}`).join(";")}` : "-";
      const pk = `${key}|${unravel.vTop.toFixed(0)}|${portrait}|${textA?.offsetTop}|${textB?.offsetTop}|${textA?.offsetWidth}|${wk}|${sk}|${bk}`;
      // (while released, the release path is in place: the entry path is rebuilt once the ribbon is back in the box)
      if (pk !== pathKey && textA && textB && !relPath) {
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
          build: buildRects ? { yB: buildPin!.vTop, ...buildRects, c: buildC } : undefined,
        };
        pathD = buildJourneyPathDesktop(lastInput);
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
          if (!done) sigma = prevS + (V - prevV);
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
        if (bm && buildPin && w && workPin && workPin.p >= 1) {
          const Lr = sl.length, hw2 = 2 * sl.end1().hw;
          const tailEdge = bm.sEdge - hw2; // the tail just beyond the right edge (out of sight)
          let head = 0, tail = 0;
          // fire: the ribbon is compressed in the box, where both paths are identical: swap in the release path
          if (buildPin.p >= BUILD_FIRE && relT0 < 0 && lastInput?.build) {
            relPath = buildReleasePath({ ...lastInput, build: { ...lastInput.build, c: 1 }, sQ: bm.sQ });
            sl.setHeadPath(relPath.pos, relPath.ruled, relPath.k);
            relT0 = performance.now();
            relE = 0;
            relScrolled = false;
          }
          if (buildPin.p <= 0) {
            // free scroll from Selected Work: the head runs its hidden route down the right side
            const q = clamp01((V - workPin.vTop) / Math.max(1, buildPin.vTop - workPin.vTop));
            head = w.sClear + q * (tailEdge - w.sClear);
            tail = head - Lr;
          } else if (relT0 >= 0 && relPath && buildPin.p >= 0.9) {
            // released: the old tail leads, backwards along the release path: up the line and out (the jump), over,
            // down through the gap; the old head leaves the box once the ribbon is back to its full length
            const u = clamp01(relE / REL_RUN);
            const t0 = bm.sBoxTop;
            const hEnd = relPath.sOut - hw2;
            tail = t0 - u * u * (t0 - (hEnd - Lr));
            head = Math.min(bm.sHead, tail + Lr);
            // the page moves on only once the ribbon itself (not just its target) has left the screen
            if (relE >= REL_SCROLL0 && sl.lead <= relPath.sOut && !relScrolled) {
              relScrolled = true;
              const next = document.querySelector<HTMLElement>(".exterm");
              const y = next ? next.getBoundingClientRect().top + window.scrollY : 0;
              if (next && y > window.scrollY + 2) {
                const lenis = getLenis();
                if (lenis) lenis.scrollTo(y, { duration: REL_SCROLL });
                else window.scrollTo({ top: y, behavior: "smooth" });
              }
            }
          } else if (buildPin.p < BUILD_COIL) {
            // in from the right and down the line into the box, twisting; out of sight, the tail catches up
            const u = ease(buildPin.p / BUILD_COIL);
            head = tailEdge + u * (bm.sHead - tailEdge);
            tail = head - (Lr + u * (bm.sHead - tailEdge - Lr));
          } else {
            // the scroll compresses it: the tail follows the head down into the box (the twist winds tighter: buildC)
            head = bm.sHead;
            tail = tailEdge + buildC * (bm.sBoxTop - tailEdge);
          }
          // scrolled back into the box after a release: back on the entry path once the whole ribbon is on the line
          if (relPath && relT0 >= 0 && buildPin.p < 0.9 && sl.sigma - Lr >= relPath.sQ + hw2) {
            relPath = null;
            relT0 = -1;
            relE = -1;
            pathKey = "";
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
    sl.driveTarget = sigma;
    // desktop: rigid (the head moves with the tail); portrait: the head has its own position
    sl.driveLead = pathD || flowK > 0 ? (Number.isNaN(leadD) ? sigma : leadD) : lead;
    if (window.__journeyDebug !== undefined) window.__journeyDebug = { V, clear, hero: hero.p, unravel: unravel?.p, sigma, lead, sWave: path?.sWave, sWaveEnd: path?.sWaveEnd, build: buildPin?.p, buildC, relE, bm: pathD?.build };
  };
}
