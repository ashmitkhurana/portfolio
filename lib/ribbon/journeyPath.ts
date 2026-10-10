/**
 * The path the ribbon's leading end travels after the hero (no three.js; pure math). ONE continuous, visible
 * ribbon: nothing leaves the screen and comes back.
 *
 * Coordinates: the journey's VIRTUAL page (the page with every pin's scroll room removed: each pinned section is
 * one screen, stacked). World px = (vx - W/2, H/2 - vy, z); the renderer shows the slice at virtual scroll V by a
 * lens shift.
 *
 * Shape, from End 1 (the hero's leading end):
 *  1. straight on from End 1 along its own direction down into section 2 (the band twists evenly into the loop's
 *     orientation on the way);
 *  2. one helical loop, like a ribbon wrapped half round an invisible pole: a cylinder-section turn about an axis
 *     `a` with t_in.a = t_out.a, the band's width square to the path within the cylinder surface (developable,
 *     never bent within its own plane); it curls toward the camera;
 *  3. the line across section 2 (landscape: horizontal, left to right; portrait: down the screen toward the bottom
 *     right). `morph` (0..1, section 2's pin) swells it into a real ribbon wave: a planar sine in a plane tilted
 *     55 deg toward the camera, the band's width on that plane's normal;
 *  4. straight on beyond the screen: only the very head runs ahead out of view (the hero exit needs that length).
 *
 * View shear: the camera stays where the hero needs it, so section 2 is seen obliquely through the lens shift.
 * Section 2 is designed as if the camera were centred on it, then sheared y += z * y2 / camZ (exactly the head-on
 * image through the shifted lens; an affine map keeps a developable band developable). Ramped in along part 1.
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
  portrait: boolean;
  /** camera distance (world px), for the view shear */
  camZ: number;
  /** 0 = a straight line, 1 = the full wave */
  morph: number;
}

export interface JourneyPath {
  pos: Float32Array;
  ruled: Float32Array;
  k: number;
}

type V3 = [number, number, number];
const add = (a: V3, b: V3, s = 1): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const perp = (v: V3, t: V3): V3 => norm(sub(v, scl(t, dot(v, t))));
const smoother = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
/** rotate v about unit axis a by angle (Rodrigues) */
function rotate(v: V3, a: V3, ang: number): V3 {
  const c = Math.cos(ang), s = Math.sin(ang), d = dot(a, v), x = cross(a, v);
  return [v[0] * c + x[0] * s + a[0] * d * (1 - c), v[1] * c + x[1] * s + a[1] * d * (1 - c), v[2] * c + x[2] * s + a[2] * d * (1 - c)];
}
/** signed angle about t from b0 to b1 (both square to t) */
const angleAbout = (b0: V3, b1: V3, t: V3) => Math.atan2(dot(cross(b0, b1), t), dot(b0, b1));
/** the shorter twist from b0 to the band direction b1: a band's width direction is only defined up to sign */
const bandTwist = (b0: V3, b1: V3, t: V3) => {
  const a = angleAbout(b0, b1, t);
  return Math.abs(a) > Math.PI / 2 ? a - Math.sign(a) * Math.PI : a;
};

interface Sample {
  p: V3;
  b: V3;
}

/** helical half turn from t_in to t_out (|t| = 1), radius R, curling toward +z; returns samples + end state */
function helix(P: V3, tIn: V3, tOut: V3, R: number, steps: number) {
  // the axis: the half turn reflects the direction across it, so it is the bisector of t_in and t_out
  const sum = add(tIn, tOut);
  const a = len(sum) < 1e-6 ? norm(cross(tIn, [0, 0, 1])) : norm(sum);
  const c = dot(tIn, a);
  const s = Math.sqrt(Math.max(1e-6, 1 - c * c));
  const u = norm(sub(tIn, scl(a, c)));
  // w: the third axis, chosen so the loop curls toward the camera (+z)
  let w = cross(a, u);
  if (w[2] < 0) w = scl(w, -1);
  // the half turn: the perpendicular part rotates u -> w -> -u, so the path leaves along c a - s u = t_out
  const out: Sample[] = [];
  for (let i = 1; i <= steps; i++) {
    const th = (Math.PI * i) / steps;
    const eth = add(scl(u, Math.cos(th)), w, Math.sin(th));
    const p = add(add(add(P, a, (c * R * th) / s), u, R * Math.sin(th)), w, R * (1 - Math.cos(th)));
    out.push({ p, b: norm(sub(scl(a, s), scl(eth, c))) });
  }
  const tEnd = norm(add(scl(a, c), scl(u, -s)));
  return { samples: out, end: out[out.length - 1].p, tEnd, bStart: norm(sub(scl(a, s), scl(u, c))), bEnd: out[out.length - 1].b };
}

/**
 * planar arc (a cylinder section) from t_in to t_out, radius R: the band's width on the turn's axis
 * n = t_in x t_out (it bends about its own width axis: physically exact). Used where the turn is small (portrait),
 * because a helix's half turn would swing out past the screen edge first.
 */
function arcTurn(P: V3, tIn: V3, tOut: V3, R: number, steps: number) {
  let n = cross(tIn, tOut);
  if (len(n) < 1e-6) n = perp([0, 0, 1], tIn);
  n = norm(n);
  const phi = Math.acos(Math.min(1, Math.max(-1, dot(tIn, tOut))));
  const C = add(P, cross(n, tIn), R);
  const r0 = sub(P, C);
  const out: Sample[] = [];
  for (let i = 1; i <= steps; i++) out.push({ p: add(C, rotate(r0, n, (phi * i) / steps)), b: n });
  return { samples: out, end: out[out.length - 1].p, tEnd: norm(rotate(tIn, n, phi)), bStart: n, bEnd: n };
}

export function buildJourneyPath(inp: JourneyPathInput): JourneyPath {
  const { W, H, end, ds, y2, portrait, morph } = inp;
  const D = inp.camZ;
  const world = (vx: number, vy: number, z = 0): V3 => [vx - W / 2, H / 2 - vy, z];
  const step = ds / 3;
  const tilt = (55 * Math.PI) / 180;
  const hw = end.hw;
  const t1 = norm(end.t);
  const R = 4.5 * hw; // a graceful curl, never a kink

  // where the loop sits, judged ON SCREEN while section 2 is pinned (perspective + the view shear): the strand
  // runs down until it reaches the line's height (landscape ~ the middle of section 2, portrait just under the
  // statement) or the left margin, whichever comes first
  const alphaMax = y2 / D;
  const scr = (q: V3): [number, number] => {
    const kk = D / Math.max(1, D - q[2]);
    return [W / 2 + q[0] * kk, H / 2 - (q[1] + alphaMax * q[2]) * kk - y2];
  };
  const lineY = portrait ? 0.34 * H : 0.5 * H;
  const leftX = portrait ? 0.06 * W + 2 * hw : 0.06 * W;
  // the turn into the line: landscape a helical half loop (a big turn), portrait a planar arc (a small one)
  const turn = (P0: V3, tIn: V3, tOut: V3, steps: number) => (portrait ? arcTurn(P0, tIn, tOut, R, steps) : helix(P0, tIn, tOut, R, steps));
  // the line's direction: landscape +x; portrait toward the lower right of section 2 (refined with the loop's end)
  const lineDir = (from: V3): V3 => {
    if (!portrait) return [1, 0, 0];
    const target = world(0.62 * W, y2 + 1.1 * H, from[2]);
    return norm([target[0] - from[0], target[1] - from[1], 0]);
  };
  // search the strand length so the LOOP'S END (where the line starts) lands at the line's height on screen
  let e1 = (portrait ? 6 : 8) * hw; // enough strand for a gentle twist into the turn
  for (; e1 < 4 * H; e1 += step) {
    const P0 = add(end.p, t1, e1);
    let to = lineDir(P0);
    let h0 = turn(P0, t1, to, 24);
    if (portrait) {
      to = lineDir(h0.end);
      h0 = turn(P0, t1, to, 24);
    }
    const [x, y] = scr(h0.end);
    if (y >= lineY || x <= leftX) break;
  }
  const Ph = add(end.p, t1, e1);
  let tOut = lineDir(Ph);
  let hx = turn(Ph, t1, tOut, 48);
  for (let it = 0; portrait && it < 3; it++) {
    tOut = lineDir(hx.end);
    hx = turn(Ph, t1, tOut, 48);
  }

  const samples: Sample[] = [{ p: end.p, b: norm(end.b) }];
  // 1. the strand: twist evenly from End 1's band orientation into the loop's
  const b0 = perp(end.b, t1);
  // (the strand keeps End 1's orientation; the twist into the turn comes from the smoothing below)
  for (let s = step; s < e1; s += step) samples.push({ p: add(end.p, t1, s), b: b0 });
  // 2. the loop
  for (const q of hx.samples) samples.push(q);
  // 3. the line (and the wave, by morph), along tOut from the loop's end
  const L0 = hx.end;
  const tL = norm(hx.tEnd);
  // the wave's displacement direction: square to the line, in its screen-plane perpendicular tilted toward the camera
  const inPlane = perp(cross([0, 0, 1], tL), tL); // screen-plane perpendicular of the line
  const up = inPlane[1] >= 0 ? inPlane : scl(inPlane, -1);
  const dW = norm(add(scl(up, Math.cos(tilt)), [0, 0, Math.sin(tilt)]));
  const nW = perp(cross(tL, dW), tL);
  const ampScreen = portrait ? 0.24 * W : 0.15 * H;
  const amp = (ampScreen / Math.cos(tilt)) * morph;
  const lambda = portrait ? 0.36 * H : Math.min(W / 1.75, 1.15 * H);
  const lineLen = 2 * (W + H); // well past the screen: the head runs on out of view
  const bL = hx.bEnd;
  const twist3 = bandTwist(perp(bL, tL), perp(nW, tL), tL);
  const ramp = 0.6 * lambda; // the band turns to the wave's orientation, and the wave's envelope grows, over this
  for (let s = step; s <= lineLen; s += step) {
    const e = smoother(s / ramp);
    const disp = amp * e * Math.sin((2 * Math.PI * s) / lambda);
    samples.push({ p: add(add(L0, tL, s), dW, disp), b: rotate(perp(bL, tL), tL, twist3 * e) });
  }

  // one consistent sign for the band's width direction along the whole path (a band's width is defined up to sign;
  // the parts are built independently)
  for (let i = 1; i < samples.length; i++) if (dot(samples[i].b, samples[i - 1].b) < 0) samples[i].b = scl(samples[i].b, -1);
  // spread every twist evenly: Gaussian (~3 band widths) over the band's width direction, the start extended with
  // End 1's own orientation, then eased back onto it at End 1 itself, so the join with the pose is seamless and a
  // short strand or a tight turn never packs its twist into a few rings
  {
    const sigB = 3 * hw;
    const rb = Math.ceil((2.5 * sigB) / step);
    const B0 = samples.map((q) => q.b);
    for (let i = 1; i < samples.length; i++) {
      let acc: V3 = [0, 0, 0];
      for (let j = i - rb; j <= Math.min(B0.length - 1, i + rb); j++) {
        const x = ((j - i) * step) / sigB;
        acc = add(acc, j < 0 ? b0 : B0[j], Math.exp(-0.5 * x * x));
      }
      const sm = norm(acc);
      const g = smoother((i * step) / (2.5 * sigB));
      samples[i].b = norm(add(scl(b0, 1 - g), scl(sm, g)));
    }
  }

  // light smoothing of the centreline across the part joins (curvature steps read as hitches)
  const P = samples.map((q) => q.p);
  const sig = 1.2 * hw;
  const rad = Math.ceil((2.5 * sig) / step);
  const Ps: V3[] = P.map((_, i) => {
    let acc: V3 = [0, 0, 0], wsum = 0;
    for (let j = Math.max(0, i - rad); j <= Math.min(P.length - 1, i + rad); j++) {
      // keep End 1 fixed: the weight window shrinks near the start
      if (i < rad && Math.abs(j - i) > i) continue;
      const x = ((j - i) * step) / sig, wgt = Math.exp(-0.5 * x * x);
      acc = add(acc, P[j], wgt);
      wsum += wgt;
    }
    return scl(acc, 1 / wsum);
  });

  // resample at ds, the band square to the path, shear ramped in along part 1
  const cum = [0];
  for (let i = 1; i < Ps.length; i++) cum.push(cum[i - 1] + len(sub(Ps[i], Ps[i - 1])));
  const k = Math.floor(cum[cum.length - 1] / ds) - 1;
  const pos = new Float32Array(k * 3);
  const ruled = new Float32Array(k * 4);
  let seg = 0;
  let bPrev: V3 = norm(end.b);
  for (let j = 0; j < k; j++) {
    const sArc = (j + 1) * ds;
    while (seg < cum.length - 2 && cum[seg + 1] < sArc) seg++;
    const f = (sArc - cum[seg]) / (cum[seg + 1] - cum[seg] || 1);
    const p = add(Ps[seg], sub(Ps[seg + 1], Ps[seg]), f);
    const t = norm(sub(Ps[seg + 1], Ps[seg]));
    let b = perp(add(scl(samples[seg].b, 1 - f), scl(samples[seg + 1].b, f)), t);
    if (dot(b, bPrev) < 0) b = scl(b, -1);
    bPrev = b;
    const al = alphaMax * smoother(sArc / e1);
    // shear the point and the band's width vector (same linear map), keep the true half width
    const bs: V3 = [b[0], b[1] + al * b[2], b[2]];
    const bl = len(bs);
    pos[j * 3] = p[0];
    pos[j * 3 + 1] = p[1] + al * p[2];
    pos[j * 3 + 2] = p[2];
    ruled[j * 4] = bs[0] / bl;
    ruled[j * 4 + 1] = bs[1] / bl;
    ruled[j * 4 + 2] = bs[2] / bl;
    ruled[j * 4 + 3] = hw * bl;
  }
  return { pos, ruled, k };
}
