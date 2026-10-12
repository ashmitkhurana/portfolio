/**
 * Exact paper-strip fold model (port of the forward map in scripts/mockup/paper.py).
 *
 * A flat strip (u along the centreline, v across, v in [-W/2, W/2]) is folded by a chain of K roll
 * segments. Roll k has its crease axis through (u_k, 0) at angle beta_k to the strip direction
 * (a = (cos b, sin b), beyond-direction ap = (sin b, -cos b)). Xp = (q - q0).ap is the flat distance past
 * the axis:
 *   Xp <= 0              flat (in the frame of the previous segment)
 *   0 < Xp < rho*|phi|   wrapped on a cylinder of radius rho through the signed angle phi
 *   Xp >= rho*|phi|      flat again in the rotated frame (rigid transform E_k)
 * The map is an exact isometry and C1 across the roll boundaries.
 *
 * Self-contained: no imports, DOM-free, plain numbers / Float32Array.
 */

export interface PaperRoll {
  /** flat u of the crease axis centre (px) */
  u: number;
  /** crease angle to the strip direction (rad) */
  beta: number;
  /** cylinder radius (px) */
  rho: number;
  /** signed wrap angle (rad) */
  phi: number;
}

type V3 = [number, number, number];

interface Prep {
  n: number;
  q0u: Float64Array; // roll axis u
  a: Float64Array; // 2 per roll: (cos b, sin b)
  ap: Float64Array; // 2 per roll: (sin b, -cos b)
  sg: Float64Array;
  rho: Float64Array;
  len: Float64Array; // rho*|phi|
  Rc: Float64Array; // 9 per roll: composed rotation of the frame before roll k (row-major)
  tc: Float64Array; // 3 per roll
  Rend: Float64Array; // 9: composed rotation after all rolls
  tend: Float64Array; // 3
}

function prepare(rolls: PaperRoll[]): Prep {
  const n = rolls.length;
  const p: Prep = {
    n,
    q0u: new Float64Array(n),
    a: new Float64Array(2 * n),
    ap: new Float64Array(2 * n),
    sg: new Float64Array(n),
    rho: new Float64Array(n),
    len: new Float64Array(n),
    Rc: new Float64Array(9 * n),
    tc: new Float64Array(3 * n),
    Rend: new Float64Array(9),
    tend: new Float64Array(3),
  };
  let R = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  let t = [0, 0, 0];
  for (let k = 0; k < n; k++) {
    const { u, beta, rho, phi } = rolls[k];
    const ax = Math.cos(beta), ay = Math.sin(beta);
    const apx = Math.sin(beta), apy = -Math.cos(beta);
    const sg = phi >= 0 ? 1 : -1;
    const ph = Math.abs(phi);
    p.q0u[k] = u;
    p.a[2 * k] = ax; p.a[2 * k + 1] = ay;
    p.ap[2 * k] = apx; p.ap[2 * k + 1] = apy;
    p.sg[k] = sg; p.rho[k] = rho; p.len[k] = rho * ph;
    for (let i = 0; i < 9; i++) p.Rc[9 * k + i] = R[i];
    for (let i = 0; i < 3; i++) p.tc[3 * k + i] = t[i];
    // roll_E
    const cp = Math.cos(ph), sp = Math.sin(ph);
    const tv = [cp * apx, cp * apy, sg * sp];
    const a3 = [ax, ay, 0];
    // n3 = tv x a3
    const n3 = [
      tv[1] * a3[2] - tv[2] * a3[1],
      tv[2] * a3[0] - tv[0] * a3[2],
      tv[0] * a3[1] - tv[1] * a3[0],
    ];
    const ap3 = [apx, apy, 0];
    const e3 = [0, 0, 1];
    const RE = new Array<number>(9);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) RE[3 * i + j] = tv[i] * ap3[j] + a3[i] * a3[j] + n3[i] * e3[j];
    const E0 = [u + rho * sp * apx, rho * sp * apy, sg * rho * (1 - cp)];
    const qe = [u + rho * ph * apx, rho * ph * apy, 0];
    const tE = [0, 0, 0];
    for (let i = 0; i < 3; i++) tE[i] = E0[i] - (RE[3 * i] * qe[0] + RE[3 * i + 1] * qe[1] + RE[3 * i + 2] * qe[2]);
    // tc = Rc tE + tc ; Rc = Rc RE
    const tn = [0, 0, 0];
    for (let i = 0; i < 3; i++) tn[i] = R[3 * i] * tE[0] + R[3 * i + 1] * tE[1] + R[3 * i + 2] * tE[2] + t[i];
    const Rn = new Array<number>(9);
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        Rn[3 * i + j] = R[3 * i] * RE[j] + R[3 * i + 1] * RE[3 + j] + R[3 * i + 2] * RE[6 + j];
    R = Rn; t = tn;
  }
  for (let i = 0; i < 9; i++) p.Rend[i] = R[i];
  for (let i = 0; i < 3; i++) p.tend[i] = t[i];
  return p;
}

function mapPoint(p: Prep, u: number, v: number, out: number[]): void {
  let px = u, py = v, pz = 0;
  let Rof = -1; // index into Rc; -1 = use Rend
  for (let k = 0; k < p.n; k++) {
    const apx = p.ap[2 * k], apy = p.ap[2 * k + 1];
    const dx = u - p.q0u[k];
    const Xp = dx * apx + v * apy;
    if (Xp <= 0) { px = u; py = v; pz = 0; Rof = k; break; }
    if (Xp < p.len[k]) {
      const ax = p.a[2 * k], ay = p.a[2 * k + 1];
      const Yp = dx * ax + v * ay;
      const rho = p.rho[k];
      const th = Xp / rho;
      const s = rho * Math.sin(th);
      px = p.q0u[k] + Yp * ax + s * apx;
      py = Yp * ay + s * apy;
      pz = p.sg[k] * rho * (1 - Math.cos(th));
      Rof = k; break;
    }
  }
  let R: Float64Array, o: number, T: Float64Array, to: number;
  if (Rof < 0) { R = p.Rend; o = 0; T = p.tend; to = 0; }
  else { R = p.Rc; o = 9 * Rof; T = p.tc; to = 3 * Rof; }
  out[0] = R[o] * px + R[o + 1] * py + R[o + 2] * pz + T[to];
  out[1] = R[o + 3] * px + R[o + 4] * py + R[o + 5] * pz + T[to + 1];
  out[2] = R[o + 6] * px + R[o + 7] * py + R[o + 8] * pz + T[to + 2];
}

/** Folded 3D position of flat point (u, v) in the span's local frame (flat strip in z=0, u along +x, v along +y). */
export function paperPoint(u: number, v: number, rolls: PaperRoll[], out: number[]): void {
  mapPoint(prepare(rolls), u, v, out);
}

function unit(x: number, y: number, z: number): V3 {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}
function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export interface PaperSpanOpts {
  length: number;
  width: number;
  rolls: PaperRoll[];
  rings: number;
  entry: { pos: [number, number, number]; T: [number, number, number]; N: [number, number, number] };
}

export interface PaperSpan {
  pos: Float32Array;
  B: Float32Array;
  N: Float32Array;
  T: Float32Array;
  hw: Float32Array;
  exit: { pos: [number, number, number]; T: [number, number, number]; N: [number, number, number] };
}

/**
 * Sample `rings` sections at u_i = i*length/(rings-1). Each section is the true ruling: inside a roll zone
 * (0 < Xp < rho|phi| at (u_i, 0)) the straight segment parallel to that roll's crease axis, otherwise the
 * perpendicular (v direction), clipped to |v| <= W/2. Outputs are in world space via the entry frame.
 */
export function buildPaperSpan(opts: PaperSpanOpts): PaperSpan {
  const { length, width: W, rolls, rings, entry } = opts;
  const P = prepare(rolls);
  const nR = Math.max(2, rings | 0);
  const pos = new Float32Array(3 * nR), B = new Float32Array(3 * nR), N = new Float32Array(3 * nR);
  const T = new Float32Array(3 * nR), hw = new Float32Array(nR);

  // local -> world: x -> entry.T, z -> entry.N, y -> entry.N x entry.T
  const ex = entry.T, ez = entry.N;
  const ey = cross(ez, ex);
  const toW = (x: number, y: number, z: number): V3 => [
    x * ex[0] + y * ey[0] + z * ez[0],
    x * ex[1] + y * ey[1] + z * ez[1],
    x * ex[2] + y * ey[2] + z * ez[2],
  ];
  const toWp = (l: number[]): V3 => {
    const w = toW(l[0], l[1], l[2]);
    return [w[0] + entry.pos[0], w[1] + entry.pos[1], w[2] + entry.pos[2]];
  };

  const H = 0.01;
  const lo = [0, 0, 0], ro = [0, 0, 0], c0 = [0, 0, 0], c1 = [0, 0, 0];

  // Section directions (the straight lines across the strip). Inside a roll zone the only straight line is the one parallel
  // to its crease; in the flat gaps the strip is planar, so any direction is exact: there the direction ROTATES smoothly from
  // one crease to the next (and from / back to the perpendicular before the first / after the last roll), so sections never
  // cut into a roll band and the surface has no ridges. Bands on the centreline: [s_k, e_k] (Xp from 0 to rho |phi|).
  const thK: number[] = [], sK: number[] = [], eK: number[] = [], rK: number[] = [];
  for (let k = 0; k < P.n; k++) {
    let dx = P.a[2 * k], dy = P.a[2 * k + 1];
    if (dy < 0) { dx = -dx; dy = -dy; }
    thK.push(Math.atan2(dy, dx));
    const apx = Math.max(P.ap[2 * k], 1e-6);
    sK.push(P.q0u[k]);
    eK.push(P.q0u[k] + P.len[k] / apx);
    rK.push((W / 2) * Math.abs(dx / Math.max(dy, 1e-6)) + 0.25 * W); // room to turn before an oblique crease
  }
  const sm = (x: number) => { const t = x < 0 ? 0 : x > 1 ? 1 : x; return t * t * (3 - 2 * t); };
  const HALF = Math.PI / 2;
  const dirAt = (u: number): [number, number] => {
    let th = HALF;
    if (P.n) {
      if (u < sK[0]) th = HALF + (thK[0] - HALF) * sm((u - (sK[0] - rK[0])) / rK[0]);
      else if (u > eK[P.n - 1]) th = thK[P.n - 1] + (HALF - thK[P.n - 1]) * sm((u - eK[P.n - 1]) / rK[P.n - 1]);
      else
        for (let k = 0; k < P.n; k++) {
          if (u >= sK[k] && u <= eK[k]) { th = thK[k]; break; }
          if (k + 1 < P.n && u > eK[k] && u < sK[k + 1]) {
            th = thK[k] + (thK[k + 1] - thK[k]) * sm((u - eK[k]) / Math.max(sK[k + 1] - eK[k], 1e-6));
            break;
          }
        }
    }
    return [Math.cos(th), Math.sin(th)];
  };

  // local-frame section data at flat u
  const section = (u: number) => {
    const [dx, dy] = dirAt(u);
    const s = W / 2 / Math.max(dy, 1e-9); // param along d to reach |v| = W/2
    mapPoint(P, u - s * dx, -s * dy, lo);
    mapPoint(P, u + s * dx, s * dy, ro);
    mapPoint(P, u + H, 0, c1);
    mapPoint(P, u - H, 0, c0);
    const cen: V3 = [(lo[0] + ro[0]) / 2, (lo[1] + ro[1]) / 2, (lo[2] + ro[2]) / 2];
    const Bv = unit(ro[0] - lo[0], ro[1] - lo[1], ro[2] - lo[2]);
    const half = Math.hypot(ro[0] - lo[0], ro[1] - lo[1], ro[2] - lo[2]) / 2;
    const Tv = unit(c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]);
    return { cen, Bv, Tv, half };
  };

  // sign so that N = +z locally at u = 0
  const s0 = section(0);
  const n0 = cross(s0.Tv, s0.Bv);
  const sign = n0[2] >= 0 ? 1 : -1;

  for (let i = 0; i < nR; i++) {
    const u = (i * length) / (nR - 1);
    const s = section(u);
    const nn = cross(s.Tv, s.Bv);
    const Nv = unit(sign * nn[0], sign * nn[1], sign * nn[2]);
    const pw = toWp(s.cen), bw = toW(s.Bv[0], s.Bv[1], s.Bv[2]);
    const tw = toW(s.Tv[0], s.Tv[1], s.Tv[2]), nw = toW(Nv[0], Nv[1], Nv[2]);
    for (let j = 0; j < 3; j++) {
      pos[3 * i + j] = pw[j]; B[3 * i + j] = bw[j]; T[3 * i + j] = tw[j]; N[3 * i + j] = nw[j];
    }
    hw[i] = s.half;
  }

  // exit frame at u = length: orthonormal (T from the centreline, N from T x perpendicular v-tangent)
  mapPoint(P, length, 0, lo);
  mapPoint(P, length + H, 0, c1);
  mapPoint(P, length - H, 0, c0);
  const Tl = unit(c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]);
  mapPoint(P, length, H, c1);
  mapPoint(P, length, -H, c0);
  const Vl = unit(c1[0] - c0[0], c1[1] - c0[1], c1[2] - c0[2]);
  const nl = cross(Tl, Vl);
  const Nl = unit(sign * nl[0], sign * nl[1], sign * nl[2]);
  const exit = {
    pos: toWp(lo),
    T: toW(Tl[0], Tl[1], Tl[2]),
    N: toW(Nl[0], Nl[1], Nl[2]),
  };
  return { pos, B, N, T, hw, exit };
}
