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
  const t1 = norm(end.t);
  const D = inp.camZ;
  const projX = (q: V3) => q[0] * (D / Math.max(1, D - q[2])); // world x on the z = 0 plane
  const offLeft = (q: V3) => projX(q) + end.hw * (D / Math.max(1, D - q[2])) < -W / 2 - 24;
  let exitLen = 0;
  while (exitLen < 4 * H && !offLeft(add(end.p, t1, exitLen))) exitLen += ds / 3;
  const P1 = add(end.p, t1, exitLen);
  push(lineSamples(end.p, P1, ds / 3), null);
  // then turn smoothly out of the dive into the screen plane (hidden): a cubic from P1 (tangent t1) to C (tangent t1f)
  const t1f = norm([t1[0], t1[1], 0]);
  const blendL = 6 * end.hw;
  const C: V3 = add(add(P1, t1, blendL * 0.5), t1f, blendL * 0.5);
  const blend = bezier(P1, add(P1, t1, blendL * 0.35), add(C, t1f, -blendL * 0.35), C, 24);
  push(blend, null);
  const a1 = exitLen + polyLen(blend, P1);

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
  let shear3: { s0: number; s1: number; a3: number } | null = null;
  if (!portrait && inp.work && inp.work.cards.length === 3) {
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
    shear3 = { s0, s1: sEntry3, a3: inp.work.y3 / inp.camZ };
    // straight on, hidden, far enough for the whole ribbon to clear the cards
    const l2 = pts[pts.length - 1], p2 = pts[pts.length - 2];
    push(lineSamples(l2, add(l2, norm(sub(l2, p2)), inp.ribbonLen + 2 * H), ds / 3), waveNormal);
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
    // Selected Work is seen head-on through its own lens shift: its shear, blended in along the hidden route
    if (shear3 && sArc > shear3.s0) a += (shear3.a3 - alphaMax) * smoother((sArc - shear3.s0) / Math.max(1, shear3.s1 - shear3.s0));
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
