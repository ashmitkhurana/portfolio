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
    // portrait (owner's recipe): at the hero's bottom the band twists 90° so its EDGE faces the viewer; one pure bend
    // about that (edge-on) width carries it out of the tail's dive straight toward the middle; a small twist on that
    // straight run makes it exactly edge-on in the screen plane; an edge-on turn sends it straight down the exact
    // centre; then a regular wave down the middle. Bends only about the band's own width, twists only on straights.
    const edge: V3 = [0, 0, 1];
    const down: V3 = [0, -1, 0];
    const RA = 3 * hw, Rin = 3 * hw;
    const e1 = 3.5 * hw;
    const bE = perp(edge, t1); // edge-on to the viewer, square to the tail's direction
    const tw1 = bandTwist(b0, bE, t1);
    for (let s = step; s <= e1; s += step) samples.push({ p: add(end.p, t1, s), b: rotate(b0, t1, tw1 * smoother(s / e1)) });
    const P1 = add(end.p, t1, e1);
    // the bend about bE: the tangent turns in the plane square to bE, toward its in-screen direction (down-right)
    let side = norm(cross(t1, bE));
    if (side[0] < 0) side = scl(side, -1);
    const thA = Math.atan2(-t1[2], side[2] === 0 ? 1e-6 : side[2]); // where the tangent has no depth component
    let dA = norm(add(scl(t1, Math.cos(thA)), side, Math.sin(thA)));
    if (Math.abs(dA[2]) > 0.05 || dA[0] < 0) dA = norm([side[0], side[1], 0]);
    const arcA = arcTurn(P1, t1, dA, RA, 40);
    for (const q of arcA.samples) samples.push({ p: q.p, b: q.b });
    // the straight run toward the middle: twist to exactly edge-on (screen normal), length solved for x = centre
    const twistLen = 4 * hw;
    const bT0 = perp(arcA.bEnd, dA), bT1 = perp(edge, dA);
    const tw2 = bandTwist(bT0, bT1, dA);
    const dispB = sub(arcTurn([0, 0, 0], dA, down, Rin, 24).end, [0, 0, 0]);
    const kk = D / Math.max(1, D - arcA.end[2]);
    const cxW = world(inp.wave.c, 0)[0] / kk; // world x that projects to the centre at this depth
    const runLen = Math.max(twistLen, (cxW - arcA.end[0] - dispB[0]) / Math.max(0.05, dA[0]));
    for (let s = step; s <= runLen; s += step) samples.push({ p: add(arcA.end, dA, s), b: rotate(bT0, dA, tw2 * smoother(s / twistLen)) });
    const F0 = add(arcA.end, dA, runLen);
    const arcB = arcTurn(F0, dA, down, Rin, 40);
    for (const q of arcB.samples) samples.push({ p: q.p, b: edge });
    shearRamp = e1 + RA;
    sWave = e1 + polyLen(arcA.samples.map((q) => q.p), P1) + runLen + polyLen(arcB.samples.map((q) => q.p), F0);
    lineStart = arcB.end;
    tL = norm(arcB.tEnd);
    bL = edge;
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
    // (portrait: the ~80° twist into the first fold needs a long, even spread or the fold reads pinched)
    const sigB = (portrait ? 1.2 : 3) * hw;
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

export interface SpiralInput {
  W: number;
  H: number;
  /** the pose ring where the ribbon turns down (world centre), its direction toward the leading end, its ruling */
  box: { p: V3; t: V3; b: V3; hw: number };
  /** pose rings between End 1 and the box (they are replaced by the spiral's first stretch) */
  j: number;
  ds: number;
  y2: number;
  camZ: number;
  /** spiral radius (world px) */
  r: number;
}

export interface SpiralPath {
  /** replacement for pose rings 0..j-1 (index 0 = the new End 1, farthest along the spiral) */
  tailPos: Float32Array;
  tailRuled: Float32Array;
  /** the head path beyond the new End 1 */
  pos: Float32Array;
  ruled: Float32Array;
  k: number;
  yv: Float32Array;
  sWave: number;
  sWaveEnd: number;
}

/**
 * PORTRAIT (owner's sketch): at the "box" on the hero's diagonal tail the ribbon turns straight down and spirals down
 * the screen round an invisible vertical pole. The tail's own direction there (down-left and into the screen) IS the
 * start of a helix round a vertical axis (pitch = 2 pi r * down/horizontal speed), so it flows in tangentially, with
 * no fold. The band lies on the cylinder, its width square to the path within the surface (developable): faces the
 * viewer on the front passes, edge-on at the sides. The small mismatch with the pose's band orientation at the box
 * is twisted out over the first half turn.
 */
export function buildPortraitSpiral(inp: SpiralInput): SpiralPath {
  const { W, H, box, j, ds, y2, r } = inp;
  const D = inp.camZ;
  const t = norm(box.t);
  const kv = Math.max(0.2, -t[1]);
  const kh = Math.max(0.2, Math.hypot(t[0], t[2]));
  const phi0 = Math.atan2(-t[0] / kh, t[2] / kh);
  const xc = box.p[0] - r * Math.cos(phi0), zc = box.p[2] - r * Math.sin(phi0);
  const down: V3 = [0, -1, 0];
  const at = (s: number) => {
    const phi = phi0 + (kh / r) * s;
    const p: V3 = [xc + r * Math.cos(phi), box.p[1] - kv * s, zc + r * Math.sin(phi)];
    const eth: V3 = [-Math.sin(phi), 0, Math.cos(phi)];
    const tt = norm(add(scl(down, kv), scl(eth, kh)));
    const b = norm(sub(scl(down, kh), scl(eth, kv)));
    return { p, t: tt, b };
  };
  const b00 = at(0).b;
  const tw = bandTwist(perp(box.b, t), perp(b00, t), t);
  const halfTurn = (Math.PI * r) / kh;
  // view shear (section 2 seen head-on through the lens shift), ramped in as the spiral leaves the hero
  const alphaMax = y2 / D;
  const vyOf = (q: V3) => H / 2 - q[1];
  const total = 3 * H + j * ds;
  const n = Math.floor(total / ds);
  const P: V3[] = [], B: V3[] = [];
  let bPrev = perp(box.b, t);
  for (let i = 1; i <= n; i++) {
    const s = i * ds;
    const q = at(s);
    // undo the pose/spiral orientation mismatch over the first half turn (about the path direction)
    let b = rotate(perp(box.b, q.t), q.t, 0);
    b = perp(rotate(perp(b00, q.t), q.t, -tw * (1 - smoother(s / (3 * halfTurn)))), q.t); // over 1.5 turns: no pinch
    if (dot(b, bPrev) < 0) b = scl(b, -1);
    bPrev = b;
    const vy = vyOf(q.p);
    const al = alphaMax * smoother((vy - 0.75 * H) / Math.max(1, y2 + 0.55 * H - 0.75 * H)); // a slow ramp: a quick one twists the band
    const bs: V3 = [b[0], b[1] + al * b[2], b[2]];
    const bl = len(bs);
    P.push([q.p[0], q.p[1] + al * q.p[2], q.p[2]]);
    B.push([bs[0] / bl, bs[1] / bl, bs[2] / bl, ...[]] as unknown as V3);
    (B[B.length - 1] as unknown as number[])[3] = box.hw * bl;
  }
  // rings 1..j replace the pose's rings j-1..0 (pose ring 0 = the new End 1 = spiral ring j)
  const tailPos = new Float32Array(j * 3), tailRuled = new Float32Array(j * 4);
  for (let i = 0; i < j; i++) {
    const src = j - 1 - i; // spiral index (0-based: ring 1 at index 0)
    tailPos.set(P[src], i * 3);
    tailRuled.set(B[src] as unknown as number[], i * 4);
  }
  const k = n - j;
  const pos = new Float32Array(k * 3), ruled = new Float32Array(k * 4), yv = new Float32Array(k);
  let sWaveEnd = -1;
  for (let i = 0; i < k; i++) {
    const q = P[j + i];
    pos.set(q, i * 3);
    ruled.set(B[j + i] as unknown as number[], i * 4);
    const kk = D / Math.max(1, D - q[2]);
    yv[i] = H / 2 - q[1] * kk;
    if (sWaveEnd < 0 && yv[i] - y2 > H + 2 * box.hw) sWaveEnd = (i + 1) * ds;
  }
  if (sWaveEnd < 0) sWaveEnd = k * ds;
  void W;
  return { tailPos, tailRuled, pos, ruled, k, yv, sWave: 0, sWaveEnd };
}

/**
 * PORTRAIT (owner, final): ONE continuous ribbon, the desktop's look. The hero's tail flows on screen into one long,
 * gentle curve to the centre, then straight down the middle as the same tilted-plane wave as desktop. No twisting
 * about the path (rotation-minimizing frame along the curve), eased into the wave's band orientation over half a
 * wavelength; large radii only, so nothing folds. The ribbon is rigid (it slides along this path).
 */
export function buildPortraitFlow(inp: {
  W: number;
  H: number;
  end: { p: [number, number, number]; t: [number, number, number]; b: [number, number, number]; hw: number };
  ds: number;
  y2: number;
  camZ: number;
  /** the wave: centre x and top y (virtual css px), screen amplitude, wavelength */
  c: number;
  top: number;
  amp: number;
  lambda: number;
}): JourneyPath {
  const { W, H, end, ds, y2, c, top, lambda } = inp;
  const D = inp.camZ;
  const hw = end.hw;
  const tilt = (55 * Math.PI) / 180;
  const world = (vx: number, vy: number, z = 0): V3 => [vx - W / 2, H / 2 - vy, z];
  const step = ds / 3;
  const t1 = norm(end.t);
  // 1. the connector: a cubic from End 1 (its own direction) to the wave's top centre (heading straight down). The
  //    wave sits at the depth the tail is already heading to, so the curve never comes back toward the camera
  //    (that foreshortened return read as an elbow).
  const gap0 = len(sub(world(c, top, end.p[2]), end.p));
  const C = world(c, top, end.p[2] + t1[2] * 0.45 * gap0);
  const down: V3 = [0, -1, 0];
  const gap = len(sub(C, end.p));
  const conn = bezier(end.p, add(end.p, t1, 0.4 * gap), add(C, down, -0.5 * gap), C, 200);
  // 2. the wave straight down from C (tilted plane, same as desktop), envelope over the first half wavelength
  const dW = norm([Math.cos(tilt), 0, Math.sin(tilt)]);
  const amp = inp.amp / Math.cos(tilt);
  const pts: V3[] = [end.p, ...conn];
  const nConn = pts.length;
  for (let s = step; s <= 4 * H; s += step) {
    const e = smoother(s / (0.5 * lambda));
    pts.push(add(add(C, down, s), dW, amp * e * Math.sin((2 * Math.PI * s) / lambda)));
  }
  // resample at ds
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + len(sub(pts[i], pts[i - 1])));
  const connLen = cum[nConn - 1];
  const k = Math.floor(cum[cum.length - 1] / ds) - 1;
  const pos = new Float32Array(k * 3), ruled = new Float32Array(k * 4);
  const nW = perp(cross(down, dW), down);
  let seg = 0;
  const prevT = t1;
  const b = perp(end.b, t1);
  let bPrevF: V3 = b;
  const alphaMax = y2 / D;
  for (let j = 0; j < k; j++) {
    const s = (j + 1) * ds;
    while (seg < cum.length - 2 && cum[seg + 1] < s) seg++;
    const f = (s - cum[seg]) / (cum[seg + 1] - cum[seg] || 1);
    const p = add(pts[seg], sub(pts[seg + 1], pts[seg]), f);
    const t = norm(sub(pts[seg + 1], pts[seg]));
    // the band faces the viewer along the whole connector (its width = the path's in-screen perpendicular), eased
    // from End 1's own orientation at the start and into the wave's orientation at the end: never edge-on, no pinch
    void prevT;
    const faceOn = perp(norm(cross([0, 0, 1], t)), t);
    let w0 = perp(b, t);
    let fo = faceOn;
    if (dot(fo, w0) < 0) fo = scl(fo, -1);
    const gIn = smoother(s / Math.max(ds, 0.35 * connLen));
    let bt = norm(add(scl(w0, 1 - gIn), scl(fo, gIn)));
    const g = smoother((s - 0.66 * connLen) / (0.34 * connLen + 0.5 * lambda));
    if (g > 0) {
      let target = perp(nW, t);
      if (dot(target, bt) < 0) target = scl(target, -1);
      bt = norm(add(scl(bt, 1 - g), scl(target, g)));
    }
    if (dot(bt, bPrevF) < 0) bt = scl(bt, -1);
    bPrevF = bt;
    w0 = bt;
    // view shear (section 2 seen head-on through the lens shift), ramped in ALONG THE CONNECTOR from exactly 0 at
    // End 1 (the pose is unsheared: any shear at the join is a visible corner)
    const al = alphaMax * smoother(s / Math.max(ds, connLen + 0.25 * lambda));
    const bs: V3 = [bt[0], bt[1] + al * bt[2], bt[2]];
    const bl = len(bs);
    pos[j * 3] = p[0];
    pos[j * 3 + 1] = p[1] + al * p[2];
    pos[j * 3 + 2] = p[2];
    ruled[j * 4] = bs[0] / bl;
    ruled[j * 4 + 1] = bs[1] / bl;
    ruled[j * 4 + 2] = bs[2] / bl;
    ruled[j * 4 + 3] = hw * bl;
  }
  // per ring: screen y + V (the head-follows-the-user mapping)
  const yv = new Float32Array(k);
  for (let j = 0; j < k; j++) yv[j] = H / 2 - pos[j * 3 + 1] * (D / Math.max(1, D - pos[j * 3 + 2]));
  return { pos, ruled, k, yv, sWave: 0, sWaveEnd: k * ds };
}

/** cubic Bezier sampled densely */
function bezier(p0: V3, p1: V3, p2: V3, p3: V3, steps: number): V3[] {
  const out: V3[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    out.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1], a * p0[2] + b * p1[2] + c * p2[2] + d * p3[2]]);
  }
  return out;
}
