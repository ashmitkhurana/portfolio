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
  /**
   * where the wave goes (from the section's text boxes): landscape `c` = the wave's centre line (virtual y), portrait
   * `c` = its centre (virtual x) and `top` = where it starts (virtual y); `amp` = screen amplitude (px)
   */
  wave: { c: number; amp: number; top: number; lambda?: number; crestY?: number };
}

export interface JourneyPath {
  pos: Float32Array;
  ruled: Float32Array;
  k: number;
  /** per ring: screen y + V (where it appears for any lens shift V), for the head-follows-the-user mapping */
  yv: Float32Array;
  /** head arcs: the wave starts / the head leaves the screen at the wave's end */
  sWave: number;
  sWaveEnd: number;
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
  const { W, H, end, ds, y2, portrait } = inp;
  const D = inp.camZ;
  const world = (vx: number, vy: number, z = 0): V3 => [vx - W / 2, H / 2 - vy, z];
  const step = ds / 3;
  const tilt = (55 * Math.PI) / 180;
  const hw = end.hw;
  const t1 = norm(end.t);
  // turn radius: phone 4.5 band widths; desktop 3 (the helical loop also descends ~0.7 R, so a big one would carry
  // the wave down into the lower text)
  const R = (portrait ? 4.5 : 3) * hw;

  // judged ON SCREEN while section 2 is pinned (perspective + the view shear)
  const alphaMax = y2 / D;
  const scr = (q: V3): [number, number] => {
    const kk = D / Math.max(1, D - q[2]);
    return [W / 2 + q[0] * kk, H / 2 - (q[1] + alphaMax * q[2]) * kk - y2];
  };
  const b0 = perp(end.b, t1);
  const samples: Sample[] = [{ p: end.p, b: norm(end.b) }];
  let lineStart: V3, tL: V3, bL: V3, dW: V3;
  const amp = inp.wave.amp / Math.cos(tilt);
  const lambda = inp.wave.lambda ?? (portrait ? 0.36 * H : Math.min(W / 1.75, 1.15 * H));
  let sWave = 0;
  let shearRamp = 8 * hw; // the view shear ramps in along the strand leaving End 1
  if (!portrait) {
    // landscape: the strand, then a helical half loop that comes out heading right on the wave's centre line
    const lineY = inp.wave.c - y2;
    let e1 = 5 * hw; // enough strand for a gentle twist into the loop
    for (; e1 < 4 * H; e1 += step) {
      const [x, y] = scr(helix(add(end.p, t1, e1), t1, [1, 0, 0], R, 24).end);
      if (y >= lineY || x <= 0.06 * W) break;
    }
    shearRamp = e1;
    const Ph = add(end.p, t1, e1);
    const hx = helix(Ph, t1, [1, 0, 0], R, 48);
    for (let s = step; s < e1; s += step) samples.push({ p: add(end.p, t1, s), b: b0 });
    for (const q of hx.samples) samples.push(q);
    sWave = e1 + polyLen(hx.samples.map((q) => q.p), Ph);
    lineStart = hx.end;
    tL = norm(hx.tEnd);
    bL = hx.bEnd;
    dW = norm([0, Math.cos(tilt), Math.sin(tilt)]);
  } else {
    // portrait: the strand, a turn toward the middle (rising a little toward the camera), a straight run, and a
    // fillet turn straight down into the vertical wave at its top
    const e1 = 4 * hw;
    shearRamp = e1;
    const Ph = add(end.p, t1, e1);
    // three pieces, no circular solve: (1) a planar turn from End 1's direction to a fixed steep down-right run
    // (rising a little toward the camera so the later turn is not bent flat), (2) that run, its length solved in one
    // step so (3) the short turn to straight down ends exactly on the wave's centre line (x = wave.c)
    const down: V3 = [0, -1, 0];
    const R1 = 2.6 * hw; // tight, so it does not swing out toward the left edge
    const beta = (58 * Math.PI) / 180; // across to the middle first, then down
    const d1: V3 = norm([Math.sin(beta), -Math.cos(beta), 0.3]);
    const a1 = arcTurn(Ph, t1, d1, R1, 48);
    const A1 = a1.end;
    const dispB = sub(arcTurn([0, 0, 0], d1, down, R, 24).end, [0, 0, 0]);
    const cx = world(inp.wave.c, 0)[0];
    // the screen x of the wave's line must be wave.c: perspective at the line's depth
    const zLine = (Lg: number) => A1[2] + d1[2] * Lg + dispB[2];
    let legLen = 0;
    for (let it = 0; it < 8; it++) {
      const kk = D / Math.max(1, D - zLine(legLen));
      legLen = Math.max(0, (cx / kk - A1[0] - dispB[0]) / d1[0]);
    }
    const F0 = add(A1, d1, legLen);
    const a2 = arcTurn(F0, d1, down, R, 48);
    for (let s = step; s < e1; s += step) samples.push({ p: add(end.p, t1, s), b: b0 });
    for (const q of a1.samples) samples.push(q);
    for (const q of lineSamples(A1, F0, step)) samples.push({ p: q, b: a1.bEnd });
    for (const q of a2.samples) samples.push(q);
    sWave = e1 + polyLen(a1.samples.map((q) => q.p), Ph) + legLen + polyLen(a2.samples.map((q) => q.p), F0);
    lineStart = a2.end;
    tL = norm(a2.tEnd);
    bL = a2.bEnd;
    dW = norm([Math.cos(tilt), 0, Math.sin(tilt)]);
  }
  // the wave along tL from its start: a planar sine in the plane tilted toward the camera, the band's width on that
  // plane's normal; the envelope and the band's turn into the wave's orientation grow over the first stretch
  const nW = perp(cross(tL, dW), tL);
  const lineLen = 2 * (W + H); // well past the screen: the head runs on out of view
  const twist3 = bandTwist(perp(bL, tL), perp(nW, tL), tL);
  // portrait: phase the sine so a crest (+x, right) sits at wave.crestY (beside the left text block)
  let phase = 0;
  if (portrait && inp.wave.crestY !== undefined) {
    const startVy = scr(lineStart)[1] + y2; // virtual y of the wave's start
    phase = Math.PI / 2 - (2 * Math.PI * (inp.wave.crestY - startVy)) / lambda;
  }
  // (portrait: a quick ramp, the first crest must already be full beside the first text block)
  const ramp = (portrait ? 0.3 : 0.6) * lambda;
  for (let s = step; s <= lineLen; s += step) {
    const e = smoother(s / ramp);
    const disp = amp * e * Math.sin((2 * Math.PI * s) / lambda + phase);
    samples.push({ p: add(add(lineStart, tL, s), dW, disp), b: rotate(perp(bL, tL), tL, twist3 * e) });
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
    const al = alphaMax * smoother(sArc / shearRamp);
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
  // per ring: where it shows on screen for lens shift 0 (screen y = yv - V), and where the head leaves the screen
  const yv = new Float32Array(k);
  let sWaveEnd = -1;
  for (let j = 0; j < k; j++) {
    const z = pos[j * 3 + 2], kk = D / Math.max(1, D - z);
    yv[j] = H / 2 - pos[j * 3 + 1] * kk;
    const sArc = (j + 1) * ds;
    if (sWaveEnd < 0 && sArc > sWave + ds) {
      const x = W / 2 + pos[j * 3] * kk, ySec = yv[j] - y2;
      if (portrait ? ySec > H + 2 * hw : x > W + 2 * hw) sWaveEnd = sArc;
    }
  }
  if (sWaveEnd < 0) sWaveEnd = k * ds;
  return { pos, ruled, k, yv, sWave, sWaveEnd };
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

function lineSamples(a: V3, b: V3, stepLen: number): V3[] {
  const L = len(sub(b, a));
  const n = Math.max(1, Math.ceil(L / stepLen));
  const out: V3[] = [];
  for (let i = 1; i <= n; i++) out.push(add(a, sub(b, a), i / n));
  return out;
}
