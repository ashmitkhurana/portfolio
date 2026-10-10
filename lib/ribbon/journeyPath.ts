/**
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

export interface JourneyPathInput {
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
}

export interface JourneyPath {
  pos: Float32Array;
  ruled: Float32Array;
  k: number;
  /** slide distances (arc of the head beyond End 1): section 2's pin starts / the head comes into view / the wave is complete */
  sEntry: number;
  sVisible: number;
  sWaveEnd: number;
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

export function buildJourneyPath(inp: JourneyPathInput): JourneyPath {
  const { W, H, end, ds, y2, portrait } = inp;
  const world = (vx: number, vy: number, z = 0): V3 => [vx - W / 2, H / 2 - vy, z];
  const margin = end.hw * 2 + 40; // off-screen clearance for the band (width + perspective)
  const tilt = (55 * Math.PI) / 180;

  // the dense centreline, plus per point: the band orientation it wants (null = carry the transported one)
  const pts: V3[] = [end.p];
  const want: (V3 | null)[] = [null];
  const push = (list: V3[], w: V3 | null) => {
    for (const p of list) {
      pts.push(p);
      want.push(w);
    }
  };

  // 1. straight on from End 1 until the band is off the left edge
  const t1 = norm(end.t);
  const leftX = -W / 2 - margin;
  let exitLen = 0;
  if (t1[0] < -0.05) exitLen = Math.max(0, (end.p[0] - leftX) / -t1[0]);
  else exitLen = H; // (never: the tails leave down-left) go a screen on and let the route handle it
  const P1 = add(end.p, t1, exitLen);
  push(lineSamples(end.p, P1, ds / 3), null);
  const a1 = exitLen;

  // the wave: entry point, direction and its band normal
  let Q: V3, dq: V3, wave: V3[], waveNormal: V3, pre: V3[] = [];
  if (!portrait) {
    const yW = y2 + 0.74 * H; // clear of the strand leaving the left edge above it
    Q = world(-margin, yW, 0);
    dq = [1, 0, 0];
    const d: V3 = [0, Math.cos(tilt), Math.sin(tilt)];
    waveNormal = norm(cross(dq, d));
    const amp = (0.15 * H) / Math.cos(tilt);
    const lambda = Math.min(W / 1.75, 1.15 * H); // ultrawide: keep the waves round, not stretched
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
    const amp = (0.26 * W) / Math.cos(tilt);
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
  const t1f = norm([t1[0], t1[1], 0]);
  const routeFor = (l: number) => {
    const A: V3 = [P1[0] + t1f[0] * l, P1[1] + t1f[1] * l, P1[2]];
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
  push(lineSamples(P1, route.A, ds / 3), null);
  // the band turns to the wave's orientation along the hidden route (and stays so through the crossing)
  push(route.bez, waveNormal);
  push(pre, waveNormal);
  const preLen = pre.length ? polyLen(pre, Q) : 0;
  push(wave, waveNormal);
  const waveVisible = waveVisibleLen(wave, W, H, y2, portrait);
  // straight on past the wave's end (hidden)
  const last = pts[pts.length - 1], prev = pts[pts.length - 2];
  push(lineSamples(last, add(last, norm(sub(last, prev)), 2 * H), ds / 3), waveNormal);

  // resample at ds, frames by parallel transport, eased toward the wanted orientation on the hidden route
  const sWaveEndPre = sEntry + preLen + waveVisible;
  const out = resample(pts, want, end, ds, sEntry, sWaveEndPre);
  // per-section view shear, ramped in over the strand leaving End 1 (arc 0 .. a1)
  const alphaMax = y2 / inp.camZ;
  for (let j = 0; j < out.k; j++) {
    const sArc = (j + 1) * ds;
    const a = alphaMax * smoother(sArc / Math.max(1, a1));
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

function resample(pts: V3[], want: (V3 | null)[], end: JourneyPathInput["end"], ds: number, sEntry: number, sWaveEnd: number): JourneyPath {
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
