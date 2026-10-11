/**
 * DESKTOP (landscape) journey path, the owner-approved v335 choreography: the strand leaves the hero off the left
 * edge, a hidden route, and the head comes back in from the left edge drawing the wave. (Portrait: journeyPath.ts.)
 *
 * The path the ribbon's leading end travels after the hero (no three.js; pure math).
 *
 * Coordinates: the journey's VIRTUAL page (the page with every pin's scroll room removed: each pinned section is
 * one screen, stacked). World px = (vx - W/2, H/2 - vy, z); the renderer shows the slice at virtual scroll V by a
 * lens shift, so this path is static while the page scrolls.
 *
 * Shape, in order from End 1 (the hero's leading end):
 *  1. straight on from End 1 along its own direction until it is off the left edge (physically exact: no bending);
 *  2. a hidden route (always left of the screen, x < 0) of a prescribed length, so the head is where the scroll
 *     choreography needs it when the next section pins; its band orientation turns here, out of sight;
 *  3. landscape: the head re-enters from the left edge and draws a horizontal wave across section 2;
 *     portrait: it crosses above section 2's top (hidden while that section is pinned), and draws a vertical wave
 *     down from the top edge.
 * The wave is a real ribbon wave: a planar sine in a plane tilted `tilt` from the screen toward the camera, the band's
 * width on the plane's normal (a ribbon bending about its width axis, never within its own plane), so the face shows
 * (sin tilt) while it undulates through depth.
 *
 * View shear: the camera stays where the hero needs it and the page scroll is a lens shift, so a section further
 * down is seen obliquely (from above). Each section is designed as if the camera were centred on it, then sheared
 * y += z * (section's virtual top) / camZ: through the shifted lens that projects exactly like the head-on view.
 * (An affine map keeps a developable band developable.) The shear ramps in along the strand leaving End 1.
 */

export interface JourneyPathDesktopInput {
  W: number;
  H: number;
  /** End 1 of the pose (world): centre, outward unit tangent, unit ruling, half width */
  end: { p: [number, number, number]; t: [number, number, number]; b: [number, number, number]; hw: number };
  /** ring spacing (world px) */
  ds: number;
  /**
   * The pose's bend at End 1 (rotation axis, radians per world px). Given, the strand leaving End 1 starts with that
   * curvature and relaxes it to straight over a few rings (a curvature step reads as a ridge); else it is straight.
   */
  endBend?: { axis: [number, number, number]; rate: number };
  /** virtual y (css px) of section 2's top */
  y2: number;
  /** slide distance at the end of the hero pin (the head must be hidden there) */
  sClear: number;
  /** extra slide during the free scroll between the hero and section 2 (the hero's remaining strand follows) */
  transition: number;
  portrait: boolean;
  /** camera distance (world px): for the per-section view shear (see `shear`) */
  camZ: number;
  /** the ribbon's length (world px): the head may enter only once the trailing end is near the edge it left by */
  ribbonLen: number;
  /** the wave's centre line (virtual y) and screen amplitude, from section 2's text boxes (the wave runs between them) */
  waveC?: number;
  waveAmp?: number;
  /** the wave's wavelength (world px); default min(W / 1.75, 1.15 H) */
  waveLambda?: number;
  /**
   * Selected Work (landscape): the pinned screen's virtual top and the three cards' rects in screen order (css px in
   * that screen, y down). The ribbon leaves section 2 off the right edge, comes back in from the right, crosses fully
   * off the left edge, comes back in from the left and sweeps across the cards off the right edge (see buildWork).
   */
  work?: { y3: number; cards: Rect[]; title: Rect };
  /**
   * Selected Work on phones (no pin): the three cards stacked (VIRTUAL page coordinates, css px) and the virtual y
   * where the section ends. The ribbon crosses the gap under each card, slightly diagonal: under card 1 right to left
   * (back in from the right after section 2), under card 2 left to right, under card 3 right to left and off the left
   * edge; it turns round off-screen between the crossings (see buildStack).
   */
  stack?: { cards: Rect[]; endY: number };
  /**
   * How I Build (landscape, after Selected Work): the pinned screen's virtual top, the empty box right of the three
   * principles (css px in that screen), the gap between the D of BUILD and "01", the top of "HOW", and the coil's
   * compression c (0 = loose, up to the top of "HOW"; 1 = compressed into the box; < 0 = overshooting as it jumps).
   */
  build?: BuildInput;
  exterm?: ExtermInput;
}

/**
 * Experience + Terminal (landscape, after How I Build): the pinned screen's virtual top, the experience strip (the
 * union of its entries) and the terminal window (css px in that screen).
 */
export interface ExtermInput {
  yE: number;
  strip: Rect;
  term: Rect;
}

export interface ExtermMarks {
  /** slide distances of the head: waiting at the left edge just before the first entry, the underline done, the
   *  end beside the terminal; and the end point on screen (the progress bar sits under it) */
  sWait: number;
  sUnder: number;
  sEnd: number;
  end: { x: number; y: number };
}

export interface BuildInput {
  yB: number;
  box: Rect;
  gap: { x: number; y: number };
  /** screen y of the top of "HOW" (the loose coil's top) */
  top: number;
  c: number;
}

export interface BuildMarks {
  /** slide distances: the lead-in crosses into view at the right edge, the coil's top (the head waits there while the
   *  scroll compresses the coil), the head's stop in the next section (where the ribbon waits) */
  sEdge: number;
  /** the coil's first point (the ribbon's tail rests here once the whole ribbon is on screen) */
  sCoil0: number;
  sTop: number;
  /** the head on the diagonal at the screen's bottom edge (the release while still pinned ends here) */
  sBottom: number;
  sStop: number;
}

export interface StackMarks {
  /** per crossing: the head at its entry edge / past its exit edge (slide distances), and the virtual y of the gap's
   *  middle (the page scroll that shows it) */
  passes: { sIn: number; sOut: number; g: number }[];
  /** per card (top to bottom), its proxy depth for the weave */
  depths: number[];
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface WorkMarks {
  /** slide distances: the head reaches the right edge (pin starts) / is in view / has left after card 3 / the tail
   *  has entered (the head is long gone) / the tail has left: the cards are clear */
  sEntry: number;
  sVisible: number;
  /** the head has left on the left / is back in from the left */
  sTopOut: number;
  sBottomIn: number;
  sHeadOut: number;
  sTailIn: number;
  sClear: number;
  /** per card (screen order), its proxy depth for the weave (see cardDepths) */
  depths: number[];
}

export interface JourneyPathDesktop {
  pos: Float32Array;
  ruled: Float32Array;
  k: number;
  /** slide distances (arc of the head beyond End 1): section 2's pin starts / the head comes into view / the wave is complete */
  sEntry: number;
  sVisible: number;
  sWaveEnd: number;
  work?: WorkMarks;
  stack?: StackMarks;
  build?: BuildMarks;
  exterm?: ExtermMarks;
}

type V3 = [number, number, number];
const add = (a: V3, b: V3, s = 1): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const smoother = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/** cubic Bezier sampled densely */
function bezier(p0: V3, p1: V3, p2: V3, p3: V3, steps: number): V3[] {
  const out: V3[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    out.push([
      a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
      a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1],
      a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2],
    ]);
  }
  return out;
}

function polyLen(pts: V3[], from?: V3): number {
  let L = 0;
  let prev = from ?? pts[0];
  for (const p of pts) {
    L += len(sub(p, prev));
    prev = p;
  }
  return L;
}

export function buildJourneyPathDesktop(inp: JourneyPathDesktopInput): JourneyPathDesktop {
  const { W, H, end, ds, y2, portrait } = inp;
  const world = (vx: number, vy: number, z = 0): V3 => [vx - W / 2, H / 2 - vy, z];
  const margin = end.hw * 2 + 40; // off-screen clearance for the band (width + perspective)
  const tilt = (55 * Math.PI) / 180;

  // the dense centreline, plus per point: the band orientation it wants (null = carry the transported one)
  const pts: V3[] = [end.p];
  const want: (V3 | null)[] = [null];
  let acc = 0; // arc of pts so far
  const push = (list: V3[], w: V3 | null) => {
    for (const p of list) {
      acc += len(sub(p, pts[pts.length - 1]));
      pts.push(p);
      want.push(w);
    }
  };

  // 1. straight on from End 1 until the band is off the left edge ON SCREEN (perspective: a strand diving into depth
  //    is pulled toward the centre, so the projected x decides, with the band's own half width)
  // the lead-in: End 1's curvature relaxed to zero over LEAD rings (only when endBend is given)
  let t1 = norm(end.t);
  let start: V3 = end.p;
  const lead: V3[] = [];
  if (inp.endBend && inp.endBend.rate > 0) {
    const LEAD = 8 * ds, n = Math.ceil(LEAD / (ds / 3)), h = LEAD / n;
    const ax = norm(inp.endBend.axis);
    for (let i = 1; i <= n; i++) {
      const sMid = (i - 0.5) * h;
      const k = inp.endBend.rate * 0.5 * (1 + Math.cos((Math.PI * sMid) / LEAD));
      t1 = norm(rotate(t1, ax, k * h));
      start = add(start, t1, h);
      lead.push(start);
    }
  }
  const leadLen = lead.length ? polyLen(lead, end.p) : 0;
  const D = inp.camZ;
  const projX = (q: V3) => q[0] * (D / Math.max(1, D - q[2])); // world x on the z = 0 plane
  const offLeft = (q: V3) => projX(q) + end.hw * (D / Math.max(1, D - q[2])) < -W / 2 - 24;
  let exitLen = 0;
  while (exitLen < 4 * H && !offLeft(add(start, t1, exitLen))) exitLen += ds / 3;
  const P1 = add(start, t1, exitLen);
  push(lead, null);
  push(lineSamples(start, P1, ds / 3), null);
  // then turn smoothly out of the dive into the screen plane (hidden): a cubic from P1 (tangent t1) to C (tangent t1f)
  const t1f = norm([t1[0], t1[1], 0]);
  const blendL = 6 * end.hw;
  const C: V3 = add(add(P1, t1, blendL * 0.5), t1f, blendL * 0.5);
  const blend = bezier(P1, add(P1, t1, blendL * 0.35), add(C, t1f, -blendL * 0.35), C, 24);
  push(blend, null);
  const a1 = leadLen + exitLen + polyLen(blend, P1);

  // the wave: entry point, direction and its band normal
  let Q: V3, dq: V3, wave: V3[], waveNormal: V3, pre: V3[] = [];
  if (!portrait) {
    const yW = inp.waveC ?? y2 + 0.74 * H; // between the two text lines
    Q = world(-margin, yW, 0);
    dq = [1, 0, 0];
    const d: V3 = [0, Math.cos(tilt), Math.sin(tilt)];
    waveNormal = norm(cross(dq, d));
    const amp = (inp.waveAmp ?? 0.15 * H) / Math.cos(tilt);
    const lambda = inp.waveLambda ?? Math.min(W / 1.75, 1.15 * H); // ultrawide: keep the waves round, not stretched
    wave = [];
    const x0 = Q[0];
    const x1 = W / 2 + margin + lambda; // a little past the right edge, then straight
    for (let x = x0 + ds / 3; x <= x1; x += ds / 3) {
      const e = smoother((x - x0) / (0.7 * lambda));
      const s = amp * e * Math.sin((2 * Math.PI * (x - x0)) / lambda);
      wave.push([x, Q[1] + d[1] * s, d[2] * s]);
    }
  } else {
    const xc = 0.5 * W;
    const r = Math.max(60, 0.12 * W);
    const yTop = y2 - margin; // just above section 2's top: hidden while it is pinned
    // crossing above the top (hidden during the pin), quarter turn down into the top edge
    const Ql = world(-margin, yTop - r, 0);
    const turnStart = world(xc - r, yTop - r, 0);
    Q = Ql;
    dq = [1, 0, 0];
    pre = lineSamples(Ql, turnStart, ds / 3).slice(0);
    const cx = turnStart[0], cy = turnStart[1] - r; // centre of the quarter turn (world y up)
    for (let i = 1; i <= 24; i++) {
      const a = (Math.PI / 2) * (i / 24);
      pre.push([cx + r * Math.sin(a), cy + r * Math.cos(a), 0]);
    }
    const top = pre[pre.length - 1];
    const dDown: V3 = [0, -1, 0];
    const d: V3 = [Math.cos(tilt), 0, Math.sin(tilt)];
    waveNormal = norm(cross(dDown, d));
    const amp = (inp.waveAmp ?? 0.26 * W) / Math.cos(tilt);
    const lambda = 0.36 * H;
    wave = [];
    const yEnd = H / 2 - (y2 + H + margin); // world y of virtual y2 + H + margin: below section 2's bottom
    const y0 = top[1];
    for (let y = y0 - ds / 3; y >= yEnd; y -= ds / 3) {
      const e = smoother((y0 - y) / (0.7 * lambda));
      const s = amp * e * Math.sin((2 * Math.PI * (y0 - y)) / lambda);
      wave.push([top[0] + d[0] * s, y, d[2] * s]);
    }
  }

  // 2. hidden route P1 -> Q with a prescribed length: straight on along t1 for l, then a Bezier into Q along dq.
  //    Its length makes the head arrive at Q (the wave's entry; for portrait the hidden crossing) exactly when
  //    section 2 pins: sEntry = sClear + transition (at least what the geometry needs).
  // the route runs in the screen plane (End 1's direction without its depth): long hidden runs must not dive, or the
  // view shear would stretch them
  const routeFor = (l: number) => {
    const A: V3 = add(C, t1f, l);
    const h = 0.4 * len(sub(Q, A));
    return { A, bez: bezier(A, add(A, t1f, h), add(Q, dq, -h), Q, 96) };
  };
  const routeLen = (l: number) => {
    const { A, bez } = routeFor(l);
    return l + polyLen(bez, A);
  };
  const minRoute = routeLen(0);
  // the head enters only once the trailing end is within one band of the edge the strand leaves by, so the
  // leaving strand and the entering wave never cross on screen
  // (portrait: the strand leaves top-left while the wave comes down from the top centre: they never meet)
  const sEntry = Math.max(inp.sClear + inp.transition, a1 + minRoute, portrait ? 0 : inp.ribbonLen + a1 - 4 * end.hw);
  const target = sEntry - a1;
  let lo = 0, hi = Math.max(target, 1);
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (routeLen(mid) < target) lo = mid;
    else hi = mid;
  }
  const route = routeFor(lo);
  push(lineSamples(C, route.A, ds / 3), null);
  // the band turns to the wave's orientation along the hidden route (and stays so through the crossing)
  push(route.bez, waveNormal);
  push(pre, waveNormal);
  const preLen = pre.length ? polyLen(pre, Q) : 0;
  push(wave, waveNormal);
  const waveVisible = waveVisibleLen(wave, W, H, y2, portrait);
  let work: WorkMarks | undefined;
  let build: BuildMarks | undefined;
  let exterm: ExtermMarks | undefined;
  let stack: { passes: { s0: number; s1: number; g: number }[]; rings: [number, number][] } | undefined;
  // later sections are seen head-on through their own lens shift: their view shear, blended in from s0 to s1 (hidden)
  const shearKnots: { s0: number; s1: number; a: number }[] = [];
  if (!portrait && inp.stack && inp.stack.cards.length === 3) {
    // ── Selected Work, phone ──
    const st = buildStack(inp, inp.stack, margin, tilt, ds);
    const routeTo = (Q: V3, dq: V3, w: V3) => {
      const last = pts[pts.length - 1], prev = pts[pts.length - 2];
      const tP = norm(sub(last, prev));
      const h = 0.45 * len(sub(Q, last));
      push(bezier(last, add(last, tP, h), add(Q, dq, -h), Q, 96), w);
    };
    const passes: { s0: number; s1: number; g: number }[] = [];
    st.passes.forEach((ps, k) => {
      const s0 = acc;
      // section 2's wave -> the first crossing (off the right edge); then the turns off-screen between crossings
      routeTo(ps.curve[0], norm(sub(ps.curve[1], ps.curve[0])), ps.normal);
      shearKnots.push({ s0, s1: acc, a: ps.v0 / inp.camZ });
      const sIn = acc;
      push(ps.curve.slice(1), ps.normal);
      passes.push({ s0: sIn, s1: acc, g: ps.g });
      void k;
    });
    stack = { passes, rings: [] };
    // straight on (off the left edge, hidden), far enough for the whole ribbon to follow
    const l2 = pts[pts.length - 1], p2 = pts[pts.length - 2];
    push(lineSamples(l2, add(l2, norm(sub(l2, p2)), inp.ribbonLen + 2 * H), ds / 3), st.passes[2].normal);
  } else if (!portrait && inp.work && inp.work.cards.length === 3) {
    // ── Selected Work ──
    const w3 = buildWork(inp, inp.work, margin, tilt, ds);
    // hidden route off the right edge: from the wave's end down to the entry beside the lane, a cubic that arrives
    // heading left (its length is the free scroll's flow)
    const last = pts[pts.length - 1], prev = pts[pts.length - 2];
    const tP = norm(sub(last, prev));
    const Q3 = w3.curve[0];
    const dq3 = norm(sub(w3.curve[1], w3.curve[0]));
    const route3 = (l: number) => {
      const A: V3 = add(last, tP, l);
      const h = 0.45 * len(sub(Q3, A));
      return { A, bez: bezier(A, add(A, tP, h), add(Q3, dq3, -h), Q3, 96) };
    };
    const r = route3(0);
    const s0 = acc;
    push(r.bez, waveNormal);
    const sEntry3 = acc;
    push(w3.curve.slice(1), waveNormal);
    // marks (pre-shear arc): the curve's own marks are arcs from its first point
    work = {
      sEntry: sEntry3,
      sVisible: sEntry3 + w3.visible,
      sTopOut: sEntry3 + w3.topOut,
      sBottomIn: sEntry3 + w3.bottomIn,
      sHeadOut: sEntry3 + w3.headOut,
      sTailIn: sEntry3 + inp.ribbonLen,
      sClear: sEntry3 + w3.headOut + inp.ribbonLen + 2 * end.hw,
      depths: [],
    };
    shearKnots.push({ s0, s1: sEntry3, a: inp.work.y3 / inp.camZ });
    if (inp.build) {
      // ── How I Build: a hidden route down the right side (long enough that the whole ribbon has left the cards
      // before the head reaches the screen), then the lead-in, the coil and the way out
      const ln = buildCoil(inp, inp.build, margin, ds);
      const last = pts[pts.length - 1], prev = pts[pts.length - 2];
      const tP = norm(sub(last, prev));
      const Q = ln.curve[0], dq = norm(sub(ln.curve[1], ln.curve[0]));
      const routeB = (l: number) => {
        const A: V3 = add(last, tP, l);
        const h = 0.45 * len(sub(Q, A)) + 0.25 * H;
        return { A, bez: bezier(A, add(A, tP, h), add(Q, dq, -h), Q, 160) };
      };
      const need = work.sClear - acc + 0.4 * H;
      let lo = 0, hi = Math.max(need, 1);
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        const r = routeB(mid);
        if (mid + polyLen(r.bez, r.A) < need) lo = mid;
        else hi = mid;
      }
      const r = routeB(hi);
      const sB0 = acc;
      push(lineSamples(last, r.A, ds / 3), ln.want[0]);
      push(r.bez, ln.want[0]);
      const sQ = acc;
      shearKnots.push({ s0: sB0, s1: sQ, a: inp.build.yB / inp.camZ });
      for (let i = 1; i < ln.curve.length; i++) {
        acc += len(sub(ln.curve[i], pts[pts.length - 1]));
        pts.push(ln.curve[i]);
        want.push(ln.want[i]);
      }
      build = { sEdge: sQ + ln.sEdge, sCoil0: sQ + ln.sCoil0, sTop: sQ + ln.sTop, sBottom: sQ + ln.sBottom, sStop: sQ + ln.sStop };
      if (inp.exterm) {
        // ── Experience + Terminal: out of sight beyond the left edge, a turn round into the underline's plane, then
        // the underline, the loops and the sweep (see buildExterm)
        const ex = buildExterm(inp, inp.exterm, margin, ds);
        const E = pts[pts.length - 1], dE = norm(sub(E, pts[pts.length - 2]));
        const Q = ex.curve[0], dQ = norm(sub(ex.curve[1], ex.curve[0]));
        const h = 0.4 * len(sub(Q, E)) + 220;
        const turn = bezier(E, add(E, dE, h), add(Q, dQ, -h), Q, 140);
        const wA = ln.wEnd;
        const wB = dot(ex.want[0], wA) < 0 ? ([-ex.want[0][0], -ex.want[0][1], -ex.want[0][2]] as V3) : ex.want[0];
        const sT0 = acc;
        turn.forEach((q, i) => {
          acc += len(sub(q, pts[pts.length - 1]));
          pts.push(q);
          want.push(norm(add(wA, sub(wB, wA), smoother((i + 1) / turn.length))));
        });
        const sX = acc;
        shearKnots.push({ s0: sT0, s1: sX, a: inp.exterm.yE / inp.camZ });
        for (let i = 1; i < ex.curve.length; i++) {
          acc += len(sub(ex.curve[i], pts[pts.length - 1]));
          pts.push(ex.curve[i]);
          want.push(ex.want[i]);
        }
        exterm = { sWait: sX + ex.sWait, sUnder: sX + ex.sUnder, sEnd: sX + ex.sEnd, end: ex.end };
        // the head waits at the left edge: How I Build's release ends there
        build.sStop = exterm.sWait;
      }
    } else {
      // straight on, hidden, far enough for the whole ribbon to clear the cards
      const l2 = pts[pts.length - 1], p2 = pts[pts.length - 2];
      push(lineSamples(l2, add(l2, norm(sub(l2, p2)), inp.ribbonLen + 2 * H), ds / 3), waveNormal);
    }
  } else {
    // straight on past the wave's end (hidden)
    const last = pts[pts.length - 1], prev = pts[pts.length - 2];
    push(lineSamples(last, add(last, norm(sub(last, prev)), 2 * H), ds / 3), waveNormal);
  }

  // resample at ds, frames by parallel transport, eased toward the wanted orientation on the hidden route
  const sWaveEndPre = sEntry + preLen + waveVisible;
  const out = resample(pts, want, end, ds, sEntry, sWaveEndPre);
  // per-section view shear, ramped in over the strand leaving End 1 (arc 0 .. a1)
  const alphaMax = y2 / inp.camZ;
  for (let j = 0; j < out.k; j++) {
    const sArc = (j + 1) * ds;
    let a = alphaMax * smoother(sArc / Math.max(1, a1));
    for (const kn of shearKnots) if (sArc > kn.s0) a += (kn.a - a) * smoother((sArc - kn.s0) / Math.max(1, kn.s1 - kn.s0));
    const z = out.pos[j * 3 + 2];
    out.pos[j * 3 + 1] += a * z;
    // the band's width vector shears with it (same linear map), keep the true half width
    const hw = out.ruled[j * 4 + 3];
    const bx = out.ruled[j * 4], by = out.ruled[j * 4 + 1] + a * out.ruled[j * 4 + 2], bz = out.ruled[j * 4 + 2];
    const l = Math.hypot(bx, by, bz) || 1;
    out.ruled[j * 4] = bx / l;
    out.ruled[j * 4 + 1] = by / l;
    out.ruled[j * 4 + 2] = bz / l;
    out.ruled[j * 4 + 3] = hw * l;
  }
  // the slide measures arc on the final (sheared) rings: map the marks onto it
  const postArc = (pre: number) => {
    let acc = len(sub([out.pos[0], out.pos[1], out.pos[2]], end.p));
    const idx = Math.min(out.k - 1, Math.max(0, Math.round(pre / ds) - 1));
    for (let j = 1; j <= idx; j++) {
      acc += Math.hypot(out.pos[j * 3] - out.pos[j * 3 - 3], out.pos[j * 3 + 1] - out.pos[j * 3 - 2], out.pos[j * 3 + 2] - out.pos[j * 3 - 1]);
    }
    return acc;
  };
  out.sEntry = postArc(sEntry);
  // the head is in view after the hidden crossing (portrait) / the off-screen margin (landscape)
  out.sVisible = postArc(sEntry + (portrait ? preLen : margin));
  out.sWaveEnd = postArc(sWaveEndPre);
  if (work && inp.work) {
    out.work = {
      sEntry: postArc(work.sEntry),
      sVisible: postArc(work.sVisible),
      sTopOut: postArc(work.sTopOut),
      sBottomIn: postArc(work.sBottomIn),
      sHeadOut: postArc(work.sHeadOut),
      sTailIn: postArc(work.sEntry) + inp.ribbonLen,
      sClear: postArc(work.sHeadOut) + inp.ribbonLen + 2 * end.hw,
      depths: cardDepths(out, inp.work, W, H, inp.camZ),
    };
  }
  if (build) {
    out.build = { sEdge: postArc(build.sEdge), sCoil0: postArc(build.sCoil0), sTop: postArc(build.sTop), sBottom: postArc(build.sBottom), sStop: postArc(build.sStop) };
  }
  if (exterm) {
    out.exterm = { sWait: postArc(exterm.sWait), sUnder: postArc(exterm.sUnder), sEnd: postArc(exterm.sEnd), end: exterm.end };
  }
  if (stack && inp.stack) {
    out.stack = {
      passes: stack.passes.map((p) => ({ sIn: postArc(p.s0), sOut: postArc(p.s1), g: p.g })),
      depths: stackDepths(out, inp.stack, stack.passes, ds, W, H, inp.camZ),
    };
  }
  return out;
}

function lineSamples(a: V3, b: V3, step: number): V3[] {
  const L = len(sub(b, a));
  const n = Math.max(1, Math.ceil(L / step));
  const out: V3[] = [];
  for (let i = 1; i <= n; i++) out.push(add(a, sub(b, a), i / n));
  return out;
}

/** arc length of the wave until its head is off screen (right edge / bottom edge of section 2) */
function waveVisibleLen(wave: V3[], W: number, H: number, y2: number, portrait: boolean): number {
  let L = 0;
  for (let i = 1; i < wave.length; i++) {
    const p = wave[i];
    if (!portrait && p[0] > W / 2) break;
    if (portrait && H / 2 - p[1] > y2 + H) break;
    L += len(sub(p, wave[i - 1]));
  }
  return L;
}

function resample(pts: V3[], want: (V3 | null)[], end: JourneyPathDesktopInput["end"], ds: number, sEntry: number, sWaveEnd: number): JourneyPathDesktop {
  // cumulative arc
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + len(sub(pts[i], pts[i - 1])));
  const total = cum[cum.length - 1];
  const k = Math.floor(total / ds);
  const pos = new Float32Array(k * 3);
  const ruled = new Float32Array(k * 4);
  // the arc where the hidden route begins easing the orientation, and where it must be done
  let wStart = -1, wEnd = -1;
  for (let i = 0; i < pts.length; i++) {
    if (want[i] && wStart < 0) wStart = cum[i];
  }
  // finish the turn well before the route reaches the entry (90% of the route)
  wEnd = wStart >= 0 ? wStart + 0.9 * (sEntry - wStart) : -1;
  let b: V3 = norm(end.b);
  let prevT: V3 = norm(end.t);
  let seg = 0;
  for (let j = 0; j < k; j++) {
    const s = (j + 1) * ds;
    while (seg < cum.length - 2 && cum[seg + 1] < s) seg++;
    const f = (s - cum[seg]) / (cum[seg + 1] - cum[seg] || 1);
    const p = add(pts[seg], sub(pts[seg + 1], pts[seg]), f);
    const t = norm(sub(pts[Math.min(seg + 1, pts.length - 1)], pts[seg]));
    // parallel transport b from prevT to t
    const axis = cross(prevT, t);
    const sa = len(axis), ca = dot(prevT, t);
    if (sa > 1e-9) {
      const ax = norm(axis);
      const ang = Math.atan2(sa, ca);
      b = rotate(b, ax, ang);
    }
    // re-orthogonalise
    b = norm(sub(b, [t[0] * dot(b, t), t[1] * dot(b, t), t[2] * dot(b, t)]));
    const w = want[seg + 1] ?? want[seg];
    if (w && wStart >= 0 && s >= wStart) {
      // target: w made square to t, with the sign closest to the transported b
      let tw = norm(sub(w, [t[0] * dot(w, t), t[1] * dot(w, t), t[2] * dot(w, t)]));
      if (dot(tw, b) < 0) tw = [-tw[0], -tw[1], -tw[2]];
      // turn about t by (remaining angle) x (this step / remaining distance): an even twist that lands at wEnd
      const ang = Math.atan2(dot(cross(b, tw), t), dot(b, tw));
      const frac = s >= wEnd ? 1 : Math.min(1, ds / Math.max(ds, wEnd - s));
      b = rotate(b, t, ang * frac);
    }
    prevT = t;
    pos.set(p, j * 3);
    ruled[j * 4] = b[0];
    ruled[j * 4 + 1] = b[1];
    ruled[j * 4 + 2] = b[2];
    ruled[j * 4 + 3] = end.hw;
  }
  return { pos, ruled, k, sEntry, sVisible: sEntry, sWaveEnd };
}

/** Rodrigues rotation of v about unit axis a by angle */
function rotate(v: V3, a: V3, ang: number): V3 {
  const c = Math.cos(ang), s = Math.sin(ang);
  const d = dot(a, v);
  const x = cross(a, v);
  return [v[0] * c + x[0] * s + a[0] * d * (1 - c), v[1] * c + x[1] * s + a[1] * d * (1 - c), v[2] * c + x[2] * s + a[2] * d * (1 - c)];
}

/**
 * Selected Work's curve (landscape), world coordinates pre-shear: designed on the pinned screen (css px, y down) and
 * lifted onto ONE plane tilted `tilt` from the screen (up = toward the camera, the same plane normal as section 2's
 * wave, so the band never twists between the sections) by casting the head-on camera's rays through it: the curve
 * projects exactly where it is designed, and the band (width = the plane's normal) only ever bends about its width.
 * Cards in screen order: c1 left (raised), c2 middle (low), c3 right (raised).
 *   top leg: in from the right edge beside the heading, down into the lane above the middle card, level across and
 *   fully off the left edge (nearer the camera: in front of the raised cards);
 *   a half turn off-screen left (a turn in the plane shows the band's edge at its apex: out of sight there);
 *   bottom leg: back in from the left edge, a gentle wave behind the left card, in front of the middle card (crest)
 *   and behind the right card (trough), off the right edge.
 * Marks are arcs from the curve's first point: `visible` (the head is in view), `topOut` (it has left on the left),
 * `bottomIn` (it is back in view), `headOut` (it has left on the right).
 */
function buildWork(inp: JourneyPathDesktopInput, work: { y3: number; cards: Rect[]; title: Rect }, margin: number, tilt: number, ds: number) {
  const { W, H, camZ: D } = inp;
  const { y3 } = work;
  const [c1, c2, c3] = work.cards;
  const tanT = Math.tan(tilt);
  // screen size of the band's half width (nearer than z = 0 on the top leg: a little bigger)
  const hwS = inp.end.hw * 1.15;
  const laneTop = Math.min(c1.y0, c3.y0), laneBottom = c2.y0;
  const yT = (laneTop + laneBottom) / 2;
  const yB = c2.y0 + 0.45 * (c2.y1 - c2.y0);
  const r = (yB - yT) / 2;
  const xU = -margin; // the turn's centre: everything left of it is off-screen
  const x2c = (c2.x0 + c2.x1) / 2, x3c = (c3.x0 + c3.x1) / 2;
  const lambda = 2 * (x3c - x2c);
  const aT = Math.max(0, Math.min(0.02 * H, (laneBottom - laneTop) / 2 - hwS - 8));
  const aB = 0.07 * H;
  const xIn = W + margin;

  // the plane: through the bottom leg's line at z = zB, the legs' mid-height at z = 0
  const zB = -tanT * r;
  const yc = -y3; // the head-on camera's height (world)
  const y0 = yc + (1 - zB / D) * (H / 2 - yB);
  const lift = (sx: number, sy: number): V3 => {
    const t = (D - zB - tanT * (yc - y0)) / (D + tanT * (H / 2 - sy));
    return [t * (sx - W / 2), yc + t * (H / 2 - sy), D * (1 - t)];
  };

  const step = ds / 3;
  const scr: [number, number][] = [];
  // top leg (right to left): in beside the heading (behind "View all"), sweeping down into the lane, level across
  const yE = Math.min((work.title.y0 + work.title.y1) / 2, yT - 0.12 * H);
  const xa = x2c, xb = W;
  for (let x = xIn; x > xU; x -= step) {
    const e = smoother((xIn - x) / (0.5 * lambda)) * smoother((x - xU) / (0.5 * lambda));
    const drop = smoother((xb - x) / (xb - xa));
    scr.push([x, yE + (yT - yE) * drop + aT * e * Math.sin((2 * Math.PI * (xIn - x)) / lambda)]);
  }
  // the half turn, off-screen left (about (xU, mid))
  const ym = (yT + yB) / 2;
  const nTurn = Math.max(24, Math.ceil((Math.PI * r) / step));
  for (let i = 0; i <= nTurn; i++) {
    const th = (Math.PI * i) / nTurn;
    scr.push([xU - r * Math.sin(th), ym - r * Math.cos(th)]);
  }
  // bottom leg (left to right): crest over the middle card, trough over the right card
  const iBottom = scr.length;
  const xEnd = W + margin + 0.5 * lambda;
  for (let x = xU + step; x <= xEnd; x += step) {
    const e = smoother((x - xU) / Math.max(1, x2c - xU));
    scr.push([x, yB - aB * e * Math.cos((2 * Math.PI * (x - x2c)) / lambda)]);
  }
  const curve = scr.map(([x, y]) => lift(x, y));
  // marks (arc along the lifted curve)
  let a = 0, visible = -1, topOut = -1, bottomIn = -1, headOut = -1;
  for (let i = 1; i < curve.length; i++) {
    a += len(sub(curve[i], curve[i - 1]));
    const [x] = scr[i];
    if (visible < 0 && x <= xIn - margin) visible = a;
    if (i < iBottom && topOut < 0 && x <= -margin) topOut = a;
    if (i >= iBottom && bottomIn < 0 && x >= -margin) bottomIn = a;
    if (i >= iBottom && headOut < 0 && x >= W + margin) headOut = a;
  }
  return { curve, visible, topOut, bottomIn, headOut: headOut < 0 ? a : headOut };
}

/**
 * The proxy depth for each card (screen order), from the final rings as seen while Selected Work is pinned. The top
 * leg is nearer the camera (z > 0) than the bottom leg (z < 0): the raised outer cards sit between the two (the top
 * leg passes in front of them, the bottom leg behind); the middle card sits behind the ribbon (below every z over it).
 */
function cardDepths(out: JourneyPathDesktop, work: { y3: number; cards: Rect[]; title: Rect }, W: number, H: number, D: number): number[] {
  const MARGIN = 60;
  return work.cards.map((c, i) => {
    let lo = Infinity, loNear = Infinity, hiFar = -Infinity;
    for (let j = 0; j < out.k; j++) {
      const x = out.pos[j * 3], y = out.pos[j * 3 + 1], z = out.pos[j * 3 + 2];
      const f = D / Math.max(1, D - z);
      const sx = W / 2 + x * f, sy = H / 2 - y * f - work.y3;
      const hw = out.ruled[j * 4 + 3] * f;
      if (sx + hw < c.x0 || sx - hw > c.x1 || sy + hw < c.y0 || sy - hw > c.y1) continue;
      lo = Math.min(lo, z);
      if (z > 0) loNear = Math.min(loNear, z);
      else hiFar = Math.max(hiFar, z);
    }
    if (i === 1) return Number.isFinite(lo) ? lo - MARGIN : -5000;
    if (Number.isFinite(loNear) && Number.isFinite(hiFar)) return (loNear + hiFar) / 2;
    if (Number.isFinite(loNear)) return loNear - MARGIN;
    if (Number.isFinite(hiFar)) return hiFar + MARGIN;
    return 0;
  });
}

/**
 * Selected Work on phones: three crossings, one in the gap under each card, slightly diagonal and downhill along the
 * way they travel (a zigzag down the page): each comes out from UNDER the card above at its high end (crossings 1 and
 * 3: the bottom-right corner, behind the arrow button; crossing 2: the bottom-left) and lies OVER the card below at
 * its low end (its image's top corner), a band edge tucking ~a third of the band over each card.
 * Each crossing is designed as seen when its gap is 60% down the screen, and lifted (head-on camera rays) onto its own
 * plane, tilted `tilt` about the crossing's chord (up = toward the camera, as everywhere else), at its own depth:
 * crossing 1 nearest, crossing 3 farthest, so each card sits between the crossing above it (in front) and the one
 * below it (behind). Returns world points pre-shear.
 */
function buildStack(inp: JourneyPathDesktopInput, stack: { cards: Rect[]; endY: number }, margin: number, tilt: number, ds: number) {
  const { W, H, camZ: D } = inp;
  const hb = inp.end.hw * Math.sin(tilt) * 1.06; // the band's half thickness on screen
  const ov = 0.6 * hb; // how far a band edge tucks over a card
  const Z = [120, 0, -120];
  const passes: { curve: V3[]; normal: V3; v0: number; g: number }[] = [];
  for (let k = 0; k < 3; k++) {
    const above = stack.cards[k];
    const gTop = above.y1;
    const gBot = k < 2 ? stack.cards[k + 1].y0 : stack.endY;
    // high where it comes out from under the card above, low where it lies over the card below
    const yHigh = gTop + hb - ov, yLow = gBot - hb + ov;
    const g = (gTop + gBot) / 2;
    const v0 = g - 0.6 * H;
    const rtl = k !== 1; // right to left?
    const xa = rtl ? W + margin : -margin, xb = rtl ? -margin : W + margin;
    // downhill along the way it travels
    const yAt = (x: number) => yHigh + (yLow - yHigh) * smoother((rtl ? W + margin - x : x + margin) / (W + 2 * margin));
    // the plane: tilted about the chord, through the chord's middle at depth Z[k]
    const C: V3 = [0, -v0, D];
    const world = (vx: number, vy: number): V3 => [vx - W / 2, H / 2 - vy, 0];
    const A = world(xa, yAt(xa)), B = world(xb, yAt(xb));
    const h = norm(sub(B, A));
    let pp: V3 = [-h[1], h[0], 0];
    if (pp[1] < 0) pp = [-pp[0], -pp[1], -pp[2]];
    const d: V3 = [pp[0] * Math.cos(tilt), pp[1] * Math.cos(tilt), Math.sin(tilt)];
    const n = norm(cross(h, d));
    const M = world((xa + xb) / 2, yAt((xa + xb) / 2));
    const tM = 1 - Z[k] / D;
    const X0: V3 = add(C, sub(M, C), tM);
    const lift = (vx: number, vy: number): V3 => {
      const dir = sub(world(vx, vy), C);
      const t = dot(n, sub(X0, C)) / dot(n, dir);
      return add(C, dir, t);
    };
    const curve: V3[] = [];
    const step = ds / 3;
    const nS = Math.ceil(Math.abs(xb - xa) / step);
    for (let i = 0; i <= nS; i++) {
      const x = xa + ((xb - xa) * i) / nS;
      curve.push(lift(x, yAt(x)));
    }
    passes.push({ curve, normal: n, v0, g });
  }
  return { passes };
}

/**
 * Proxy depths for the stacked cards (top to bottom): card k sits behind crossing k-1 (the one over its top) and in
 * front of crossing k (the one under it): halfway between their depths over the card, or a margin past the only one.
 */
function stackDepths(out: JourneyPathDesktop, stack: { cards: Rect[]; endY: number }, passes: { s0: number; s1: number }[], ds: number, W: number, H: number, D: number): number[] {
  const MARGIN = 60;
  return stack.cards.map((c, k) => {
    const zr = (p: number) => {
      if (p < 0 || p > 2) return null;
      let lo = Infinity, hi = -Infinity;
      const j0 = Math.max(0, Math.floor(passes[p].s0 / ds) - 1), j1 = Math.min(out.k - 1, Math.ceil(passes[p].s1 / ds));
      for (let j = j0; j <= j1; j++) {
        const x = out.pos[j * 3], y = out.pos[j * 3 + 1], z = out.pos[j * 3 + 2];
        const f = D / Math.max(1, D - z);
        const sx = W / 2 + x * f, vy = H / 2 - y * f;
        const hw = out.ruled[j * 4 + 3] * f;
        if (sx + hw < c.x0 || sx - hw > c.x1 || vy + hw < c.y0 || vy - hw > c.y1) continue;
        lo = Math.min(lo, z);
        hi = Math.max(hi, z);
      }
      return Number.isFinite(lo) ? { lo, hi } : null;
    };
    const over = zr(k - 1), under = zr(k);
    if (over && under) return (over.lo + under.hi) / 2;
    if (over) return over.lo - MARGIN;
    if (under) return under.hi + MARGIN;
    return 0;
  });
}

/**
 * How I Build (landscape), world coordinates pre-shear plus the band orientation wanted at every point:
 *   lead-in: straight in from the right edge at the bottom of the box (in front of the pole, z = r), face on;
 *   the coil: the band wound UP round an invisible vertical pole through the box (the band lying on the cylinder, so
 *   it only bends about its width), from the box's bottom to the top of "HOW" when loose (c = 0); compressed (c = 1)
 *   the same turns sit inside the box, the turns just clear of each other (the bottom never moves);
 *   the way out: from the coil's top, up and over to the diagonal through the gap between the D of BUILD and "01"
 *   (45 degrees, in the screen plane), down it into the next section, where the head stops and waits (sStop).
 * Marks are arcs from the curve's first point.
 */
function buildCoil(inp: JourneyPathDesktopInput, bd: BuildInput, margin: number, ds: number) {
  const { W, H } = inp;
  const world = (sx: number, sy: number, z = 0): V3 => [sx - W / 2, H / 2 - (bd.yB + sy), z];
  const hwS = inp.end.hw;
  const bx = bd.box;
  // as wide as the box allows (the box's height limits the turns: a wider coil is a longer ribbon)
  const r = Math.max(36, Math.min(0.46 * (bx.x1 - bx.x0) - 4, 150));
  const xc = (bx.x0 + bx.x1) / 2;
  const yBot = bx.y1 - hwS - 4;
  const pMin = 2.08 * hwS; // compressed: the turns all but touch (the band's width plus ~4%)
  const compH = Math.max(pMin, yBot - (bx.y0 + hwS + 4));
  const N = Math.min(3.5, Math.max(1.25, compH / pMin));
  const pLoose = Math.max(pMin, (yBot - (bd.top + hwS)) / N);
  const pComp = compH / N;
  const c = bd.c;
  const p = pLoose + (pComp - pLoose) * c; // c < 0 overshoots past loose (the jump)
  const yTop = yBot - N * p;
  const step = ds / 3;
  const curve: V3[] = [];
  const want: V3[] = [];
  // the pole sits r behind the page plane, so the coil's nearest point is at z = 0: never nearer the camera (never
  // drawn wider) than the rest of the ribbon. The climb eases in over the first quarter turn (flat at the start:
  // the horizontal lead-in joins it without a kink)
  const ramp = Math.PI / 2;
  const climb = (th: number) => (th < ramp ? (th * th) / (2 * ramp) : th - ramp / 2);
  const gEnd = climb(2 * Math.PI * N);
  const coilAt = (th: number): V3 => world(xc - r * Math.sin(th), yBot - ((yBot - yTop) * climb(th)) / gEnd, r * Math.cos(th) - r);
  const coilWidth = (th: number): V3 => {
    const a = coilAt(th - 1e-3), b = coilAt(th + 1e-3);
    const T = norm(sub(b, a));
    return norm(cross([-Math.sin(th), 0, Math.cos(th)], T));
  };
  // lead-in: horizontal, in from beyond the right edge at the box's bottom, straight into the coil's front point
  const w0 = coilWidth(0);
  const C0 = coilAt(0);
  let sEdge = 0;
  let acc = 0;
  for (let x = W + margin + 120; x > xc; x -= step) {
    const q = world(x, yBot, 0);
    if (curve.length) acc += len(sub(q, curve[curve.length - 1]));
    curve.push(q);
    want.push(w0);
    if (x >= W + margin) sEdge = acc;
  }
  acc += len(sub(C0, curve[curve.length - 1]));
  curve.push(C0);
  want.push(w0);
  const sCoil0 = acc;
  const thEnd = 2 * Math.PI * N;
  const nC = Math.ceil((thEnd * Math.hypot(r, p / (2 * Math.PI))) / step);
  for (let i = 1; i <= nC; i++) {
    const th = (thEnd * i) / nC;
    const q = coilAt(th);
    acc += len(sub(q, curve[curve.length - 1]));
    curve.push(q);
    want.push(coilWidth(th));
  }
  const sTop = acc;
  // the way out: a cubic from the coil's top (along its tangent) to J on the diagonal near the top edge, then the
  // diagonal through the gap (face on, the band's width in the screen plane)
  const P0 = coilAt(thEnd);
  const T0 = norm(sub(coilAt(thEnd + 1e-3), coilAt(thEnd - 1e-3)));
  const beta = (45 * Math.PI) / 180;
  const v: [number, number] = [-Math.cos(beta), Math.sin(beta)];
  const g = bd.gap;
  const tJ = (Math.min(140, g.y - 60) - g.y) / v[1]; // up-right of the gap, below the top edge
  const J = world(g.x + v[0] * tJ, g.y + v[1] * tJ, 0);
  const vW = norm([v[0], -v[1], 0]);
  const wDiag = norm(cross([0, 0, 1], vW));
  const hA = 0.75 * len(sub(J, P0)) + 140, hB = 0.6 * len(sub(J, P0)) + 120;
  const out = bezier(P0, add(P0, T0, hA), add(J, vW, -hB), J, Math.max(24, Math.ceil(len(sub(J, P0)) / step)));
  // the band follows the curve untwisted (its width carried along, square to the path); the turn to face-on happens
  // afterwards, on the straight diagonal (never twist inside a turn)
  let bT: V3 = coilWidth(thEnd);
  out.forEach((q, i) => {
    const prevQ = curve[curve.length - 1];
    acc += len(sub(q, prevQ));
    curve.push(q);
    const T = norm(sub(i + 1 < out.length ? out[i + 1] : q, prevQ));
    bT = norm(sub(bT, [T[0] * dot(bT, T), T[1] * dot(bT, T), T[2] * dot(bT, T)]));
    want.push(bT);
  });
  const wD = dot(wDiag, bT) < 0 ? ([-wDiag[0], -wDiag[1], -wDiag[2]] as V3) : wDiag;
  // twist from the carried width to face-on along a long stretch of the diagonal (gentle: a slow flip, never a pinch)
  const ang = Math.atan2(dot(cross(bT, wD), vW), dot(bT, wD));
  let dDone = 0;
  // the diagonal, down through the gap into the next section: the head stops near its top (above its first entry)
  const yStop = H + 0.12 * H;
  let sStop = 0, sBottom = 0;
  for (let t = tJ + step; ; t += step) {
    const sx = g.x + v[0] * t, sy = g.y + v[1] * t;
    const q = world(sx, sy, 0);
    dDone += len(sub(q, curve[curve.length - 1]));
    acc += len(sub(q, curve[curve.length - 1]));
    curve.push(q);
    want.push(rotate(bT, vW, ang * smoother(dDone / Math.max(600, 0.6 * H))));
    if (!sBottom && (sy >= H || sx <= -margin)) sBottom = acc;
    if (!sStop && (sy >= yStop || sx <= -margin)) sStop = acc;
    // with Experience next, the diagonal ends off the left edge (that path turns round out of sight)
    if (inp.exterm && sx < -margin - 30) break;
    if (sy > 3 * H || sx < -W) break;
  }
  return { curve, want, sEdge, sCoil0, sTop, sBottom, sStop, wEnd: want[want.length - 1] };
}

/**
 * Experience + Terminal (landscape), designed on its pinned screen (css px, y down) and lifted (head-on camera rays)
 * onto planes tilted `tilt` from the screen (up = toward the camera) with the band's width on their normal n, so it
 * only ever bends about its width:
 *   the underline: in from beyond the left edge, under the four entries, a gentle wave;
 *   an open U-turn at the right end (down and back left; no loop crossing itself: a tight curl would have to step out
 *   of its plane, and the section's shear distorts that badly);
 *   the sweep: left along the band above the terminal, then an S down through the empty area;
 *   a wider U-turn at the bottom left (back right);
 *   the end: rising gently to just left of the terminal; then straight on (behind the terminal) for the next part.
 * The plane passes through the screen's middle height at z = 0 (the ribbon's size changes by under ~9% across it).
 */
function buildExterm(inp: JourneyPathDesktopInput, ex: ExtermInput, margin: number, ds: number) {
  const { W, H, camZ: D } = inp;
  const tilt = (45 * Math.PI) / 180;
  const n: V3 = [0, -Math.sin(tilt), Math.cos(tilt)];
  const world = (sx: number, sy: number, z = 0): V3 => [sx - W / 2, H / 2 - (ex.yE + sy), z];
  const C: V3 = [0, -ex.yE, D];
  const hw = inp.end.hw;
  const st = ex.strip, tm = ex.term;
  // the band's half height on screen (its width along n, seen at ~45 degrees, a little nearer than z = 0)
  const hb = 1.02 * hw;
  const yU = st.y1 + hb + 12; // its top edge just clear of the entries
  const xR = st.x1 - 60;
  // open U-turns (no loop crossing itself: a tight curl stepping out of its plane is distorted by the section's shear)
  const yS = Math.min(yU + 2 * 70, tm.y0 - hb - 14); // the leg back stays clear of the terminal
  const R1 = (yS - yU) / 2;
  const R2 = 80;
  const yEnd = tm.y0 + 0.35 * (tm.y1 - tm.y0);
  const yB2 = yEnd + 20 - 2 * 80;
  const xA = Math.max(st.x0 + 140, 0.17 * W);
  const x2 = tm.x0 - 70;
  const xEnd = tm.x0 - 34;
  const yRef = (yU + yEnd) / 2;
  const R = world(W / 2, yRef, 0);
  const lift = (sx: number, sy: number, w: number): V3 => {
    const P0 = world(sx, sy, 0);
    const dir = sub(P0, C);
    const lam = (dot(n, R) + w - dot(n, C)) / dot(n, dir);
    return add(C, dir, lam);
  };
  const step = ds / 3;
  const scr: [number, number, number][] = [];
  // the underline
  const x0 = -margin - 40;
  const lam = Math.max(240, (st.x1 - st.x0) / 4);
  for (let x = x0; x <= xR; x += step) {
    const e = smoother((x - st.x0) / 200) * smoother((xR - x) / 160);
    scr.push([x, yU + 5 * e * Math.sin((2 * Math.PI * (x - st.x0)) / lam), 0]);
  }
  const iUnder = scr.length - 1;
  // loop 1
  const nL1 = Math.ceil((Math.PI * R1) / step);
  for (let i = 1; i <= nL1; i++) {
    const th = (Math.PI * i) / nL1;
    scr.push([xR + R1 * Math.sin(th), yU + R1 - R1 * Math.cos(th), 0]);
  }
  // the sweep: left above the terminal, then an S down to loop 2's top
  for (let x = xR - step; x >= x2; x -= step) scr.push([x, yS, 0]);
  const nS = Math.ceil(Math.hypot(x2 - xA, yB2 - yS) * 1.15 / step);
  for (let i = 1; i <= nS; i++) {
    const t = i / nS;
    const wnd = 16 * t * t * (1 - t) * (1 - t);
    scr.push([x2 + (xA - x2) * t, yS + (yB2 - yS) * smoother(t) + 70 * wnd * Math.sin(2 * Math.PI * t), 0]);
  }
  // loop 2
  const nL2 = Math.ceil((Math.PI * R2) / step);
  for (let i = 1; i <= nL2; i++) {
    const th = (Math.PI * i) / nL2;
    scr.push([xA - R2 * Math.sin(th), yB2 + R2 - R2 * Math.cos(th), 0]);
  }
  // the end, then straight on behind the terminal (for the way on)
  const yL = yB2 + 2 * R2;
  for (let x = xA + step; x <= xEnd; x += step) scr.push([x, yL + (yEnd - yL) * smoother((x - xA) / (xEnd - xA)), 0]);
  const iEnd = scr.length - 1;
  for (let x = xEnd + step; x <= W + 3 * margin + inp.ribbonLen; x += step) scr.push([x, yEnd, 0]);
  const curve = scr.map(([x, y, w]) => lift(x, y, w));
  const want = curve.map(() => n);
  let a = 0, sWait = 0, sUnder = 0, sEnd = 0;
  for (let i = 1; i < curve.length; i++) {
    a += len(sub(curve[i], curve[i - 1]));
    if (scr[i][0] <= st.x0 - 34 && i <= iUnder) sWait = a;
    if (i === iUnder) sUnder = a;
    if (i === iEnd) sEnd = a;
  }
  return { curve, want, sWait, sUnder, sEnd, end: { x: xEnd, y: yEnd } };
}
