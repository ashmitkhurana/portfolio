/**
 * Soft folds: the strip rolls over itself like a satin ribbon looped over and laid flat.
 *
 * A fold is NOT a bend of the strip in its own plane (a steel rod: the inner edge pinches) and NOT
 * a crisp crease. It is paper geometry with a generous radius:
 *
 *   t1 = tangent arriving, t2 = tangent leaving (both in the band plane Pi, normal N1)
 *   crease axis   c  = normalize(t1 + t2)      the bisector: reflecting t1 across c gives t2
 *   crease normal m  = normalize(t1 - t2)      (in Pi, perpendicular to c)
 *   phi = theta / 2 where theta is the turn angle between t1 and t2
 *
 * The straight (unfolded) strip travels along t1. Measured across the crease, b = (x) sin(phi) is
 * the distance to the virtual crease line and a_c = (x) cos(phi) the distance along it. The strip
 * is wrapped around a CYLINDER of radius rho (`creaseRadius`) whose axis is c: for b in
 * [b0, b0 + psi rho] the sheet turns by beta = (b - b0) / rho about c, then continues straight in
 * the reflected direction. b0 is chosen so the leaving leg lies exactly where a sharp fold would
 * put it, hence the ring path still meets the authored path after the fold.
 *
 *   point(x) = X + a_c c + m(b) m_dir + Z(b) Z_dir        (X = where the tangent lines meet)
 *   normal   = N1 cos(beta) - s sin(beta) m_dir          (rolls through 180 degrees: face A -> B)
 *
 * Rulings (the line across the width of each ring) are what makes this a developable strip and not
 * a bent bar: they swing smoothly from B1 (perpendicular to t1) to the crease axis c across the
 * roll and on to the reflected perpendicular of t2, so the sections follow the (diagonal) crease
 * and no inner edge ever pinches. A section whose ruling is sheared by `omega` from the
 * perpendicular is longer by 1 / cos(omega): the strip keeps a constant perpendicular width. All of it
 * lives in the existing per-ring sweep texture: row 1 holds the ruling instead of the plain
 * width direction, `hwScale` goes into the half-width (row 0 w), and the normal in row 2 is
 * perpendicular to ruling and tangent (so the thickness never interpenetrates: the folded layers sit
 * 2 rho apart). The shader needs no new data.
 *
 * Exactness: rings are straight sections; where a sheared ruling reaches into the roll the true
 * surface is slightly curved. With a soft radius (>= 0.45 widths) the error is invisible and the
 * profile stays smooth and continuous.
 */
import { hyp3 } from "./frames";

export interface FoldSpec {
  /** position along the body, 0..1 of the arc length */
  at: number;
  /** signed dihedral angle in radians (pi = the strip lies back over itself); the sign picks the side the strip rolls towards (+: towards face A's normal) */
  angle: number;
  /** soft radius of the roll, in ribbon widths */
  radius: number;
}

export const DEFAULT_FOLD_ANGLE = Math.PI;
export const DEFAULT_FOLD_RADIUS = 0.75;
/** below this the fold reads as a crease (editor diagnostic) */
export const MIN_FOLD_RADIUS = 0.45;
/** rings whose turn angle is outside [MIN_TURN, MAX_TURN] are not a fold */
export const MIN_TURN = (50 * Math.PI) / 180;
export const MAX_TURN = (172 * Math.PI) / 180;

export type FoldIssueKind =
  | "radius"
  | "turn-gentle"
  | "turn-hairpin"
  | "roll"
  | "zone"
  | "mismatch"
  | "overlap"
  | "gap";

export interface FoldIssue {
  kind: FoldIssueKind;
  level: "error" | "warn";
  text: string;
}

export interface FoldReport {
  index: number;
  at: number;
  /** first / last body ring of the fold zone */
  ring0: number;
  ring1: number;
  /** turn angle between the arriving and leaving tangents, radians */
  theta: number;
  /** half-length of the soft roll (px) and the radius (px) */
  rho: number;
  /** max ruling shear (radians from the perpendicular) */
  shear: number;
  /** distance between the two layers where the strip lies over itself (px) */
  gap: number;
  /** distance (px) the authored path had to be nudged to meet the construction at the exit */
  mismatch: number;
  /** part of that along the band normal, signed towards the side the strip rolls to (px): the layers sit this much further apart than the radius makes them */
  liftError: number;
  /** roll (radians) applied to the strip before the fold to bring its plane into the turn plane */
  roll: number;
  /** false when the fold could not be built (the rings are left as they were) */
  built: boolean;
  /** normal of the plane the fold lies in (the strip's normal as it arrives) */
  n1: [number, number, number];
  /** crease axis and the corner X (world), for the editor overlay */
  crease: { cx: number; cy: number; cz: number; ax: number; ay: number; az: number; half: number } | null;
  issues: FoldIssue[];
}

export interface FoldTarget {
  /** body ring count and the ring offset of the first body ring (caps) */
  M: number;
  E: number;
  /** ribbon width (px, before the per-ring multiplier) and half thickness */
  width: number;
  ht: number;
  /** body ring spacing (px, mean) */
  ds: number;
  /** per-ring width multiplier (indexed like pos, including the cap offset) */
  rWidth: Float32Array;
  pos: Float32Array;
  tan: Float32Array;
  N: Float32Array;
  B: Float32Array;
  /** per-ring half-width multiplier (>= 1), written here */
  hwScale: Float32Array;
}

const smooth01 = (t: number): number => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * x * (x * (x * 6 - 15) + 10);
};

/** nominal half-extent in rings of a fold zone (used to keep other passes out of it) */
export function foldZoneRings(spec: FoldSpec, width: number, ds: number): number {
  const hw = 0.5 * width;
  const rho = Math.max(spec.radius, 0.2) * width;
  const sphi = Math.sin((100 * Math.PI) / 360); // a nominal ~100 degree turn
  const half = 1.6 * hw + (Math.PI * rho) / sphi + 1.2 * hw + 0.5 * hw;
  return Math.ceil(half / Math.max(ds, 1e-3)) + 2;
}

/**
 * Where the folds of `specs` land, as ring ranges, for passes that must leave them alone.
 * `out[i]` = 1 inside the (padded) zone of any fold.
 */
export function foldMask(
  out: Uint8Array | Float32Array,
  M: number,
  specs: readonly FoldSpec[],
  width: number,
  ds: number,
  pad = 0,
): void {
  out.fill(0);
  for (const s of specs) {
    const c = s.at * (M - 1);
    const h = foldZoneRings(s, width, ds) + pad;
    const lo = Math.max(0, Math.floor(c - h));
    const hi = Math.min(M - 1, Math.ceil(c + h));
    for (let i = lo; i <= hi; i++) out[i] = 1;
  }
}

// scratch, reused across folds (no per-frame allocation churn beyond a few small arrays)
const V = {
  t1: [0, 0, 0],
  t2: [0, 0, 0],
  n1: [0, 0, 0],
  b1: [0, 0, 0],
  c: [0, 0, 0],
  md: [0, 0, 0],
  zd: [0, 0, 0],
  e1: [0, 0, 0],
  x0: [0, 0, 0],
  x1: [0, 0, 0],
};

const dot = (a: number[], b: number[]): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const set3 = (o: number[], x: number, y: number, z: number) => {
  o[0] = x;
  o[1] = y;
  o[2] = z;
};
const norm3 = (o: number[]): number => {
  const l = hyp3(o[0], o[1], o[2]) || 1;
  o[0] /= l;
  o[1] /= l;
  o[2] /= l;
  return l;
};

/** fold-ring construction buffers (sized on demand) */
let bufPos = new Float32Array(0);
let bufRul = new Float32Array(0);
let bufNc = new Float32Array(0);
let bufTc = new Float32Array(0);
let bufHs = new Float32Array(0);
let bufX = new Float32Array(0);
function ensure(n: number): void {
  if (bufPos.length >= n * 3) return;
  bufPos = new Float32Array(n * 3);
  bufRul = new Float32Array(n * 3);
  bufNc = new Float32Array(n * 3);
  bufTc = new Float32Array(n * 3);
  bufHs = new Float32Array(n);
  bufX = new Float32Array(n);
}

/**
 * Where the fold zones are and which plane each lies in, for the curvature frames: a fold lies IN the plane
 * of its turn (the strip's normal is perpendicular to both legs), while an ordinary tight bend stands across
 * its plane (bracelet). Fills `w` (0..1 per body ring, soft shoulders) and `n` (xyz per body ring: the turn
 * plane normal) so `CurvatureFramer` steers the roll to it on the way into and out of a fold.
 */
export function foldOverrides(
  w: Float32Array,
  n: Float32Array,
  g: Pick<FoldTarget, "M" | "E" | "width" | "ds" | "rWidth" | "pos" | "tan">,
  specs: readonly FoldSpec[],
): void {
  const { M, E, tan } = g;
  w.fill(0);
  for (const spec of specs) {
    const fc = Math.min(Math.max(spec.at, 0), 1) * (M - 1);
    const W = g.width * g.rWidth[E + Math.round(fc)];
    const hw = 0.5 * W;
    const ds = Math.max(g.ds, 1e-3);
    const rho = Math.max(spec.radius, 0.2) * W;
    let Lin = 3 * hw;
    let Lout = 3 * hw;
    let iA = 1;
    let iB = M - 2;
    for (let it = 0; it < 3; it++) {
      iA = Math.max(1, Math.round(fc - Lin / ds));
      iB = Math.min(M - 2, Math.round(fc + Lout / ds));
      if (iB - iA < 4) break;
      const a = (E + iA) * 3;
      const b = (E + iB) * 3;
      const d = tan[a] * tan[b] + tan[a + 1] * tan[b + 1] + tan[a + 2] * tan[b + 2];
      const theta = Math.acos(Math.min(Math.max(d, -1), 1));
      const half = Math.min(Math.max(theta, MIN_TURN), MAX_TURN) / 2;
      const gamma = Math.PI / 2 - half;
      const Ls = hw * Math.min(Math.max(2.6 * Math.tan(gamma), 1.2), 5);
      const reach = hw * Math.tan(gamma);
      const sphi = Math.sin(half);
      Lin = Ls + reach + rho / sphi + 0.5 * hw;
      Lout = Ls + reach + (rho * Math.PI) / sphi + 1.5 * hw;
    }
    if (iB - iA < 4) continue;
    const a = (E + iA) * 3;
    const b = (E + iB) * 3;
    let nx = tan[a + 1] * tan[b + 2] - tan[a + 2] * tan[b + 1];
    let ny = tan[a + 2] * tan[b] - tan[a] * tan[b + 2];
    let nz = tan[a] * tan[b + 1] - tan[a + 1] * tan[b];
    const nl = hyp3(nx, ny, nz);
    if (nl < 0.12) continue; // legs (anti)parallel: no turn plane, keep the frame as it is
    nx /= nl;
    ny /= nl;
    nz /= nl;
    const pre1 = iA - Math.round(W / ds);
    const pre0 = pre1 - Math.round((3 * W) / ds);
    const post1 = iB;
    const post2 = iB + Math.round((3 * W) / ds);
    for (let i = Math.max(0, pre0); i <= Math.min(M - 1, post2); i++) {
      const k = i < pre1 ? smooth01((i - pre0) / Math.max(pre1 - pre0, 1)) : i <= post1 ? 1 : 1 - smooth01((i - post1) / Math.max(post2 - post1, 1));
      if (k > w[i]) {
        w[i] = k;
        n[i * 3] = nx;
        n[i * 3 + 1] = ny;
        n[i * 3 + 2] = nz;
      }
    }
  }
}

/**
 * Build the folds. Rings inside each fold zone are REPLACED (position, tangent, ruling, normal, half
 * width multiplier); rings after a fold are rolled about their tangent by the angle the fold turned
 * the strip through, so the face that is visible after the fold carries on (A -> B -> A ...).
 * Folds must be sorted by `at`; overlapping ones are skipped and reported.
 */
export function applyFolds(g: FoldTarget, specs: readonly FoldSpec[], reports?: FoldReport[]): void {
  const { M, E, pos, tan, N, B, hwScale } = g;
  if (reports) reports.length = 0;
  let lastEnd = -1;
  for (let fi = 0; fi < specs.length; fi++) {
    const spec = specs[fi];
    const rep: FoldReport = {
      index: fi,
      at: spec.at,
      ring0: 0,
      ring1: 0,
      theta: 0,
      rho: 0,
      shear: 0,
      gap: 0,
      mismatch: 0,
      liftError: 0,
      n1: [0, 0, 1],
      roll: 0,
      built: false,
      crease: null,
      issues: [],
    };
    reports?.push(rep);
    const fc = Math.min(Math.max(spec.at, 0), 1) * (M - 1);
    const fcI = Math.round(fc);
    const W = g.width * g.rWidth[E + fcI];
    const hw = 0.5 * W;
    const ds = Math.max(g.ds, 1e-3);
    const rho = Math.max(spec.radius, 0.2) * W;
    rep.rho = rho;
    const psi = Math.min(Math.max(Math.abs(spec.angle), 0.35), Math.PI);
    const side = spec.angle < 0 ? -1 : 1;
    if (spec.radius < MIN_FOLD_RADIUS) {
      rep.issues.push({
        kind: "radius",
        level: "warn",
        text: `radius ${spec.radius.toFixed(2)} w is too tight (< ${MIN_FOLD_RADIUS} w): it reads as a crease, not a soft roll`,
      });
    }

    // ---- 1. zone + the two legs ---------------------------------------------------------------
    let Lin = 3 * hw;
    let Lout = 3 * hw;
    let iA = 0;
    let iB = 0;
    let theta = 0;
    let sphi = 1;
    let cphi = 0;
    let Ls = hw;
    for (let it = 0; it < 4; it++) {
      iA = Math.max(1, Math.round(fc - Lin / ds));
      iB = Math.min(M - 2, Math.round(fc + Lout / ds));
      if (iB - iA < 4) break;
      const oA = (E + iA) * 3;
      const oB = (E + iB) * 3;
      set3(V.t1, tan[oA], tan[oA + 1], tan[oA + 2]);
      set3(V.t2, tan[oB], tan[oB + 1], tan[oB + 2]);
      theta = Math.acos(Math.min(Math.max(dot(V.t1, V.t2), -1), 1));
      const half = Math.min(Math.max(theta, MIN_TURN), MAX_TURN) / 2;
      sphi = Math.sin(half);
      cphi = Math.cos(half);
      const gamma = Math.PI / 2 - half;
      Ls = hw * Math.min(Math.max(2.6 * Math.tan(gamma), 1.2), 5);
      const reach = hw * Math.tan(gamma);
      Lin = Ls + reach + rho / sphi + 0.5 * hw;
      Lout = Ls + reach + (rho * Math.PI) / sphi + 1.5 * hw;
    }
    rep.theta = theta;
    rep.ring0 = iA;
    rep.ring1 = iB;
    if (iB - iA < 6 || iA <= lastEnd) {
      rep.issues.push({
        kind: iA <= lastEnd ? "overlap" : "zone",
        level: "error",
        text: iA <= lastEnd ? "overlaps the previous fold" : "too close to an end of the ribbon for this radius",
      });
      continue;
    }
    if (theta < MIN_TURN) {
      rep.issues.push({
        kind: "turn-gentle",
        level: "error",
        text: `the path only turns ${((theta * 180) / Math.PI).toFixed(0)} degrees here: the crease would run along the strip. Fold only turns of ${((MIN_TURN * 180) / Math.PI).toFixed(0)}+ degrees`,
      });
      continue;
    }
    if (theta > MAX_TURN) {
      rep.issues.push({
        kind: "turn-hairpin",
        level: "warn",
        text: "the path doubles back almost exactly: the two legs are parallel, so the fold falls back to a symmetric corner",
      });
    }

    // ---- 1b. the band plane is the plane of the turn ---------------------------------------------
    // A paper fold happens in the plane that contains both legs. The strip's own frame may be rolled
    // against it (the author never has to level it): roll the strip into the turn plane over the
    // rings arriving at the zone (a limited rate, so it can never pinch), then fold in that plane.
    {
      const oA0 = (E + iA) * 3;
      const t1x = tan[oA0];
      const t1y = tan[oA0 + 1];
      const t1z = tan[oA0 + 2];
      const oB0 = (E + iB) * 3;
      let nx = t1y * tan[oB0 + 2] - t1z * tan[oB0 + 1];
      let ny = t1z * tan[oB0] - t1x * tan[oB0 + 2];
      let nz = t1x * tan[oB0 + 1] - t1y * tan[oB0];
      const nl = hyp3(nx, ny, nz);
      const bx = N[oA0];
      const by = N[oA0 + 1];
      const bz = N[oA0 + 2];
      if (nl > 0.12) {
        nx /= nl;
        ny /= nl;
        nz /= nl;
        if (nx * bx + ny * by + nz * bz < 0) {
          nx = -nx;
          ny = -ny;
          nz = -nz;
        }
      } else {
        // legs (anti)parallel: no turn plane; keep the strip's own plane
        const d = bx * t1x + by * t1y + bz * t1z;
        nx = bx - t1x * d;
        ny = by - t1y * d;
        nz = bz - t1z * d;
        norm3([nx, ny, nz]);
        const l = hyp3(nx, ny, nz) || 1;
        nx /= l;
        ny /= l;
        nz /= l;
      }
      set3(V.n1, nx, ny, nz);
      rep.n1 = [nx, ny, nz];
      // roll angle about t1 from the strip's normal to the turn plane normal
      const cosE = bx * nx + by * ny + bz * nz;
      const sinE = (by * nz - bz * ny) * t1x + (bz * nx - bx * nz) * t1y + (bx * ny - by * nx) * t1z;
      const eps = Math.atan2(sinE, cosE);
      rep.roll = eps;
      if (Math.abs(eps) > 1.15) {
        rep.issues.push({
          kind: "roll",
          level: "warn",
          text: `the strip is rolled ${((Math.abs(eps) * 180) / Math.PI).toFixed(0)} degrees into the turn plane before this fold: level it (twist) so the fold arrives face-on`,
        });
      }
      if (Math.abs(eps) > 1e-3) {
        const Lr = Math.max(Math.ceil((Math.abs(eps) * W * 1.0) / ds), 3);
        const iR = Math.max(lastEnd + 1, iA - Lr);
        const span = Math.max(iA - iR, 1);
        for (let j = iR; j <= iA; j++) {
          const q = (E + j) * 3;
          const ph = eps * smooth01((j - iR) / span);
          const cp = Math.cos(ph);
          const sp = Math.sin(ph);
          const qnx = N[q];
          const qny = N[q + 1];
          const qnz = N[q + 2];
          const qbx = B[q];
          const qby = B[q + 1];
          const qbz = B[q + 2];
          N[q] = qnx * cp + qbx * sp;
          N[q + 1] = qny * cp + qby * sp;
          N[q + 2] = qnz * cp + qbz * sp;
          B[q] = -qnx * sp + qbx * cp;
          B[q + 1] = -qny * sp + qby * cp;
          B[q + 2] = -qnz * sp + qbz * cp;
        }
        // the rings between the ramp and the zone start are rolled by the full angle
      }
    }

    // ---- 2. frame of the unfolded strip ----------------------------------------------------------
    const oA = (E + iA) * 3;
    const oB = (E + iB) * 3;
    // B1 = t1 x N1 (the existing convention: N = B x T)
    set3(
      V.b1,
      V.t1[1] * V.n1[2] - V.t1[2] * V.n1[1],
      V.t1[2] * V.n1[0] - V.t1[0] * V.n1[2],
      V.t1[0] * V.n1[1] - V.t1[1] * V.n1[0],
    );
    norm3(V.b1);
    // crease axis / normal
    set3(V.c, V.t1[0] + V.t2[0], V.t1[1] + V.t2[1], V.t1[2] + V.t2[2]);
    if (hyp3(V.c[0], V.c[1], V.c[2]) < 1e-3) set3(V.c, V.b1[0], V.b1[1], V.b1[2]);
    norm3(V.c);
    set3(V.md, V.t1[0] - V.t2[0], V.t1[1] - V.t2[1], V.t1[2] - V.t2[2]);
    if (hyp3(V.md[0], V.md[1], V.md[2]) < 1e-3) set3(V.md, V.t1[0], V.t1[1], V.t1[2]);
    // keep m in the plane, perpendicular to c, pointing along the arriving direction
    {
      const d = dot(V.md, V.c);
      V.md[0] -= V.c[0] * d;
      V.md[1] -= V.c[1] * d;
      V.md[2] -= V.c[2] * d;
      norm3(V.md);
      if (dot(V.md, V.t1) < 0) {
        V.md[0] = -V.md[0];
        V.md[1] = -V.md[1];
        V.md[2] = -V.md[2];
      }
    }
    set3(V.zd, V.n1[0] * side, V.n1[1] * side, V.n1[2] * side);
    // ruling target c' (the end of c with a non-negative component on B1) and the shear angle gamma
    let cs = 1;
    if (dot(V.c, V.b1) < 0) cs = -1;
    const cB = dot(V.c, V.b1) * cs;
    const gammaA = Math.acos(Math.min(Math.max(cB, 0), 1)); // angle between B1 and c'
    const dB = cB;
    set3(
      V.e1,
      V.c[0] * cs - V.b1[0] * dB,
      V.c[1] * cs - V.b1[1] * dB,
      V.c[2] * cs - V.b1[2] * dB,
    );
    if (hyp3(V.e1[0], V.e1[1], V.e1[2]) < 1e-4) set3(V.e1, V.t1[0], V.t1[1], V.t1[2]);
    norm3(V.e1);
    // exact decomposition t1 = cphi c + sphi m (c and m span the band plane)
    sphi = Math.max(dot(V.t1, V.md), 0.12);
    cphi = dot(V.t1, V.c);

    // ---- 3. corner X: where the two tangent lines meet (in the plane) -------------------------
    const P0x = pos[oA];
    const P0y = pos[oA + 1];
    const P0z = pos[oA + 2];
    const Dx = pos[oB] - P0x;
    const Dy = pos[oB + 1] - P0y;
    const Dz = pos[oB + 2] - P0z;
    const D = [Dx, Dy, Dz];
    const Dt1 = dot(D, V.t1);
    const Db1 = dot(D, V.b1);
    const t2c = dot(V.t2, V.t1);
    const t2s = dot(V.t2, V.b1);
    let a: number;
    let b: number;
    if (Math.abs(t2s) > 0.2) {
      b = Db1 / t2s;
      a = Dt1 - b * t2c;
    } else {
      a = -1;
      b = -1;
    }
    // the unfolded strip must be about as long as the path it replaces; otherwise (near-parallel legs,
    // the tangent lines meet far away or behind) take the nominal leg lengths and let the exit nudge
    // absorb the offset between the legs
    const aNom = Math.max((fc - iA) * ds, 0.5 * hw);
    const bNom = Math.max((iB - fc) * ds, 0.5 * hw);
    const minLeg = 0.5 * hw;
    if (!(a > minLeg && b > minLeg && a < 1.8 * aNom && b < 1.8 * bNom && a > 0.55 * aNom && b > 0.55 * bNom)) {
      a = aNom;
      b = bNom;
    }
    // zone layout in the unfolded strip: x along t1, the virtual crease at x = a (= u)
    const total = a + b;
    const xs = -a;
    const xe = b;
    const reach = hw * Math.tan(gammaA); // a sheared section reaches +-hw tan(gamma) along the strip
    const cosPsi = Math.cos(psi);
    const sinPsi = Math.sin(psi);
    let sideZ = side;
    let rhoE = rho;
    let b0 = 0;
    let rollLen = 0;
    let x0 = 0;
    let x1 = 0;
    let xr0 = 0;
    let xr1 = 0;
    let LsIn = 0;
    let LsOut = 0;
    const setup = (r: number): void => {
      rhoE = r;
      // b0: where the roll starts so that the leaving leg sits where a sharp fold would put it
      b0 = psi > 0.02 ? (-r * (Math.sin(psi) - psi * Math.cos(psi))) / Math.max(1 - Math.cos(psi), 1e-4) : 0;
      rollLen = psi * r;
      x0 = b0 / sphi; // roll start / end along the centreline, relative to the crease (x = u - a)
      x1 = (b0 + rollLen) / sphi;
      xr0 = x0 - reach; // ruling is the crease axis from here ...
      xr1 = x1 + reach; // ... to here
      LsIn = Math.max(Math.min(Ls, xr0 - xs - 0.05 * hw), 0.2 * hw);
      LsOut = Math.max(Math.min(Ls, xe - xr1 - 0.05 * hw), 0.2 * hw);
    };
    const mAt = (bb: number): number => {
      if (bb <= b0) return bb;
      if (bb <= b0 + rollLen) return b0 + rhoE * Math.sin((bb - b0) / rhoE);
      return b0 + rhoE * sinPsi + (bb - b0 - rollLen) * cosPsi;
    };
    const zAt = (bb: number): number => {
      if (bb <= b0) return 0;
      if (bb <= b0 + rollLen) return rhoE * (1 - Math.cos((bb - b0) / rhoE));
      return rhoE * (1 - cosPsi) + (bb - b0 - rollLen) * sinPsi;
    };

    // ---- 4. rings ------------------------------------------------------------------------------
    const n = iB - iA + 1;
    ensure(n);
    // corner X in 3D
    const Xx = P0x + a * V.t1[0];
    const Xy = P0y + a * V.t1[1];
    const Xz = P0z + a * V.t1[2];
    // exit of the construction (before the nudge): what the authored path has to be moved by
    const exitOffset = (): void => {
      const bb = xe * sphi;
      const ac = xe * cphi;
      const m = mAt(bb);
      const z = zAt(bb) * sideZ;
      const Ex = Xx + ac * V.c[0] + m * V.md[0] + z * V.n1[0];
      const Ey = Xy + ac * V.c[1] + m * V.md[1] + z * V.n1[1];
      const Ez = Xz + ac * V.c[2] + m * V.md[2] + z * V.n1[2];
      V.x0[0] = pos[oB] - Ex;
      V.x0[1] = pos[oB + 1] - Ey;
      V.x0[2] = pos[oB + 2] - Ez;
    };
    setup(rho);
    // the side the strip rolls to follows the authored path: take the one whose layer lift the exit already has
    // (spec sign wins ties)
    exitOffset();
    {
      const err = (): number => (V.x0[0] * V.n1[0] + V.x0[1] * V.n1[1] + V.x0[2] * V.n1[2]) * sideZ;
      const e0 = err();
      sideZ = -sideZ;
      exitOffset();
      const e1 = err();
      if (e1 <= e0 + 0.15 * rho) {
        sideZ = -sideZ;
        exitOffset();
      }
    }
    // the roll's mid point (the outermost point of the turn, on the centreline) is pulled onto the authored fold point: the
    // author draws WHERE the turn is, the legs keep the tangent-intersection geometry, and the difference is a smooth
    // bump over the roll (see `wBump` below), so the rolled apex sits exactly where it was drawn
    const oF = (E + Math.min(Math.max(Math.round(fc), 0), M - 1)) * 3;
    let xMid = 0;
    const bumpVec = (): void => {
      const betaM = Math.min(psi, Math.PI) / 2;
      const bbM = b0 + betaM * rhoE;
      xMid = bbM / sphi;
      const acM = xMid * cphi;
      const mM = b0 + rhoE * Math.sin(betaM);
      const zM = rhoE * (1 - Math.cos(betaM)) * sideZ;
      V.x1[0] = pos[oF] - (Xx + acM * V.c[0] + mM * V.md[0] + zM * V.n1[0]);
      V.x1[1] = pos[oF + 1] - (Xy + acM * V.c[1] + mM * V.md[1] + zM * V.n1[1]);
      V.x1[2] = pos[oF + 2] - (Xz + acM * V.c[2] + mM * V.md[2] + zM * V.n1[2]);
    };
    const anchor = (): void => {
      exitOffset();
      bumpVec();
    };
    anchor();
    // the authored layers may sit further apart than the radius makes them (the exit is lifted along the
    // band normal): roll wider to meet them (up to 1.7 x the radius) instead of nudging the exit
    {
      const f = 1 - cosPsi;
      const lift = f * rho;
      const dnS = (V.x0[0] * V.n1[0] + V.x0[1] * V.n1[1] + V.x0[2] * V.n1[2]) * sideZ;
      if (f > 0.1 && dnS > 0.05 * lift) {
        const want = (lift + dnS) / f;
        const r2 = Math.min(Math.max(want, rho), 1.7 * rho);
        if (r2 > rho * 1.01) {
          setup(r2);
          anchor();
          rep.rho = r2;
        }
      }
    }
    // entry offset: the authored path at the start of the zone vs the construction's straight leg
    const inX = P0x - (Xx - a * V.t1[0]);
    const inY = P0y - (Xy - a * V.t1[1]);
    const inZ = P0z - (Xz - a * V.t1[2]);
    rep.mismatch = Math.max(hyp3(V.x0[0], V.x0[1], V.x0[2]), hyp3(inX, inY, inZ), hyp3(V.x1[0], V.x1[1], V.x1[2]));
    rep.liftError = (V.x0[0] * V.n1[0] + V.x0[1] * V.n1[1] + V.x0[2] * V.n1[2]) * sideZ;
    // split the exit offset: the part along the band normal (the layer lift) waits until the roll is
    // over so the two layers stay apart; the in-plane part (legs that are not on one line) is
    // spread from the start of the roll
    const dn = V.x0[0] * V.n1[0] + V.x0[1] * V.n1[1] + V.x0[2] * V.n1[2];
    const nnx = V.n1[0] * dn;
    const nny = V.n1[1] * dn;
    const nnz = V.n1[2] * dn;
    const npx = V.x0[0] - nnx;
    const npy = V.x0[1] - nny;
    const npz = V.x0[2] - nnz;
    const xNudgeN = xr1 + 0.3 * LsOut;
    const xNudgeP = x0;
    let maxShear = 0;
    for (let k = 0; k < n; k++) {
      const u = (k / (n - 1)) * total;
      const x = u - a;
      const bb = x * sphi;
      const ac = x * cphi;
      let beta: number;
      let dm: number;
      let dz: number;
      if (bb <= b0) {
        beta = 0;
        dm = 1;
        dz = 0;
      } else if (bb <= b0 + rollLen) {
        beta = (bb - b0) / rho;
        dm = Math.cos(beta);
        dz = Math.sin(beta);
      } else {
        beta = psi;
        dm = cosPsi;
        dz = sinPsi;
      }
      const m = mAt(bb);
      const z = zAt(bb) * sideZ;
      let px = Xx + ac * V.c[0] + m * V.md[0] + z * V.n1[0];
      let py = Xy + ac * V.c[1] + m * V.md[1] + z * V.n1[1];
      let pz = Xz + ac * V.c[2] + m * V.md[2] + z * V.n1[2];
      // nudge: after the roll the construction gives way to the authored exit
      const sN = x <= xNudgeN ? 0 : smooth01((x - xNudgeN) / Math.max(xe - xNudgeN, 1e-3));
      const sP = x <= xNudgeP ? 0 : smooth01((x - xNudgeP) / Math.max(xe - xNudgeP, 1e-3));
      const wIn = 1 - smooth01((x - xs) / Math.max(xr0 - xs, 1e-3));
      // bump over the plateau: 0 at its ends, 1 at the roll's mid point
      const wBump = x <= xr0 || x >= xr1 ? 0 : x < xMid ? smooth01((x - xr0) / Math.max(xMid - xr0, 1e-3)) : 1 - smooth01((x - xMid) / Math.max(xr1 - xMid, 1e-3));
      px += nnx * sN + npx * sP + inX * wIn + V.x1[0] * wBump;
      py += nny * sN + npy * sP + inY * wIn + V.x1[1] * wBump;
      pz += nnz * sN + npz * sP + inZ * wIn + V.x1[2] * wBump;
      // tangent along the centreline: d/dx of the unfolded point
      let tx = cphi * V.c[0] + sphi * (dm * V.md[0] + dz * sideZ * V.n1[0]);
      let ty = cphi * V.c[1] + sphi * (dm * V.md[1] + dz * sideZ * V.n1[1]);
      let tz = cphi * V.c[2] + sphi * (dm * V.md[2] + dz * sideZ * V.n1[2]);
      const tl = hyp3(tx, ty, tz) || 1;
      tx /= tl;
      ty /= tl;
      tz /= tl;
      // ruling in the unfolded strip: B1 -> c' (across the roll) -> B1, smooth ramps
      let w: number;
      if (x < xr0) w = smooth01((x - (xr0 - LsIn)) / LsIn);
      else if (x <= xr1) w = 1;
      else w = 1 - smooth01((x - xr1) / LsOut);
      const om = gammaA * w;
      const co = Math.cos(om);
      const so = Math.sin(om);
      const rux = co * V.b1[0] + so * V.e1[0];
      const ruy = co * V.b1[1] + so * V.e1[1];
      const ruz = co * V.b1[2] + so * V.e1[2];
      const rc = rux * V.c[0] + ruy * V.c[1] + ruz * V.c[2];
      const rm = rux * V.md[0] + ruy * V.md[1] + ruz * V.md[2];
      const cb = Math.cos(beta);
      const sb = Math.sin(beta);
      const rx = rc * V.c[0] + rm * (cb * V.md[0] + sb * sideZ * V.n1[0]);
      const ry = rc * V.c[1] + rm * (cb * V.md[1] + sb * sideZ * V.n1[1]);
      const rz = rc * V.c[2] + rm * (cb * V.md[2] + sb * sideZ * V.n1[2]);
      const hs = 1 / Math.max(co, 0.34);
      if (om > maxShear) maxShear = om;
      const q = k * 3;
      bufPos[q] = px;
      bufPos[q + 1] = py;
      bufPos[q + 2] = pz;
      bufTc[q] = tx;
      bufTc[q + 1] = ty;
      bufTc[q + 2] = tz;
      bufRul[q] = rx;
      bufRul[q + 1] = ry;
      bufRul[q + 2] = rz;
      // N1 cos(beta) - s sin(beta) m_dir
      bufNc[q] = V.n1[0] * cb - sideZ * sb * V.md[0];
      bufNc[q + 1] = V.n1[1] * cb - sideZ * sb * V.md[1];
      bufNc[q + 2] = V.n1[2] * cb - sideZ * sb * V.md[2];
      bufHs[k] = hs;
      bufX[k] = x;
    }
    rep.shear = maxShear;
    rep.built = true;
    rep.crease = {
      cx: Xx,
      cy: Xy,
      cz: Xz,
      ax: V.c[0],
      ay: V.c[1],
      az: V.c[2],
      half: hw / Math.max(sphi, 0.2),
    };

    // layer separation: the lifted layer sits 2 rho (psi = pi) above the first; flag when the thickness
    // would touch
    rep.gap = rep.rho * (1 - cosPsi) - 2 * g.ht;
    if (rep.gap < 0.5 * g.ht) {
      rep.issues.push({
        kind: "gap",
        level: "warn",
        text: "the two layers are closer than the strip's thickness: raise the radius or the angle",
      });
    }
    if (rep.mismatch > 1.1 * W) {
      rep.issues.push({
        kind: "mismatch",
        level: "warn",
        text: `the authored path misses the fold's own geometry by ${rep.mismatch.toFixed(0)} px at the exit: add depth (z) to the points after the fold, or move the turn`,
      });
    }

    // ---- 5. write back: tangents from the final path, normals from ruling x tangent -------------
    for (let k = 0; k < n; k++) {
      const q = k * 3;
      const o = (E + iA + k) * 3;
      pos[o] = bufPos[q];
      pos[o + 1] = bufPos[q + 1];
      pos[o + 2] = bufPos[q + 2];
    }
    for (let k = 0; k < n; k++) {
      const q = k * 3;
      const o = (E + iA + k) * 3;
      let tx: number;
      let ty: number;
      let tz: number;
      if (k === 0 || k === n - 1) {
        tx = bufTc[q];
        ty = bufTc[q + 1];
        tz = bufTc[q + 2];
      } else {
        tx = bufPos[q + 3] - bufPos[q - 3];
        ty = bufPos[q + 4] - bufPos[q - 2];
        tz = bufPos[q + 5] - bufPos[q - 1];
        const l = hyp3(tx, ty, tz);
        if (l < 1e-6) {
          tx = bufTc[q];
          ty = bufTc[q + 1];
          tz = bufTc[q + 2];
        } else {
          tx /= l;
          ty /= l;
          tz /= l;
        }
      }
      tan[o] = tx;
      tan[o + 1] = ty;
      tan[o + 2] = tz;
      // N = B x T (B = the ruling), sign matched to the analytic roll
      const rx = bufRul[q];
      const ry = bufRul[q + 1];
      const rz = bufRul[q + 2];
      let nx = ry * tz - rz * ty;
      let ny = rz * tx - rx * tz;
      let nz = rx * ty - ry * tx;
      const nl = hyp3(nx, ny, nz);
      if (nl > 1e-5) {
        nx /= nl;
        ny /= nl;
        nz /= nl;
        if (nx * bufNc[q] + ny * bufNc[q + 1] + nz * bufNc[q + 2] < 0) {
          nx = -nx;
          ny = -ny;
          nz = -nz;
        }
      } else {
        nx = bufNc[q];
        ny = bufNc[q + 1];
        nz = bufNc[q + 2];
      }
      N[o] = nx;
      N[o + 1] = ny;
      N[o + 2] = nz;
      B[o] = rx;
      B[o + 1] = ry;
      B[o + 2] = rz;
      hwScale[E + iA + k] = bufHs[k];
    }

    // ---- 6. carry the flip: roll everything after the zone about its tangent -------------------
    {
      const o = (E + iB) * 3;
      // the base rings of the zone were replaced: compare the exit normal with the NEXT ring's base frame
      const j = iB + 1;
      if (j < M) {
        const oj = (E + j) * 3;
        // rotation about T_j taking N_j (base) to the exit normal projected perpendicular to T_j
        const Tx = tan[oj];
        const Ty = tan[oj + 1];
        const Tz = tan[oj + 2];
        let fx = N[o];
        let fy = N[o + 1];
        let fz = N[o + 2];
        const dd = fx * Tx + fy * Ty + fz * Tz;
        fx -= Tx * dd;
        fy -= Ty * dd;
        fz -= Tz * dd;
        const fl = hyp3(fx, fy, fz) || 1;
        fx /= fl;
        fy /= fl;
        fz /= fl;
        const gx = N[oj];
        const gy = N[oj + 1];
        const gz = N[oj + 2];
        const c = gx * fx + gy * fy + gz * fz;
        // (g x f) . T
        const s = (gy * fz - gz * fy) * Tx + (gz * fx - gx * fz) * Ty + (gx * fy - gy * fx) * Tz;
        const delta = Math.atan2(s, c);
        if (Math.abs(delta) > 1e-4) {
          for (let jj = j; jj < M; jj++) {
            const q = (E + jj) * 3;
            const cd = Math.cos(delta);
            const sd = Math.sin(delta);
            const nx = N[q];
            const ny = N[q + 1];
            const nz = N[q + 2];
            const bx = B[q];
            const by = B[q + 1];
            const bz = B[q + 2];
            N[q] = nx * cd + bx * sd;
            N[q + 1] = ny * cd + by * sd;
            N[q + 2] = nz * cd + bz * sd;
            B[q] = -nx * sd + bx * cd;
            B[q + 1] = -ny * sd + by * cd;
            B[q + 2] = -nz * sd + bz * cd;
          }
        }
      }
    }
    lastEnd = iB;
  }
}

export interface InferParams {
  /** turn angle window (radians) that counts as a sharp turn */
  minTurn: number;
  maxTurn: number;
}

/**
 * Where the authored path turns sharply within the band plane (the places that want to be a fold
 * and not a bend): local maxima of the turn angle over a window of about a width on either side,
 * whose turning axis is close to the strip normal. Used by the editor's "Detect folds" and its
 * diagnostics. Positions are returned as arc fractions `at`.
 */
export function inferFolds(
  M: number,
  E: number,
  width: number,
  ds: number,
  pos: ArrayLike<number>,
  tan: ArrayLike<number>,
  N: ArrayLike<number>,
  p: InferParams = { minTurn: (80 * Math.PI) / 180, maxTurn: (176 * Math.PI) / 180 },
): FoldSpec[] {
  const k = Math.max(2, Math.round((0.9 * width) / Math.max(ds, 1e-3)));
  const cand: { i: number; th: number }[] = [];
  const th = new Float32Array(M);
  for (let i = k; i < M - k; i++) {
    const a = (E + i - k) * 3;
    const b = (E + i + k) * 3;
    const d = tan[a] * tan[b] + tan[a + 1] * tan[b + 1] + tan[a + 2] * tan[b + 2];
    const t = Math.acos(Math.min(Math.max(d, -1), 1));
    // turning axis ~ t1 x t2: must be along the band normal (in-plane turn)
    const ax = tan[a + 1] * tan[b + 2] - tan[a + 2] * tan[b + 1];
    const ay = tan[a + 2] * tan[b] - tan[a] * tan[b + 2];
    const az = tan[a] * tan[b + 1] - tan[a + 1] * tan[b];
    const al = hyp3(ax, ay, az) || 1;
    const c = (E + i) * 3;
    const inPlane = Math.abs((ax * N[c] + ay * N[c + 1] + az * N[c + 2]) / al);
    th[i] = inPlane > 0.7 ? t : 0;
  }
  void pos;
  for (let i = k; i < M - k; i++) {
    if (th[i] >= p.minTurn && th[i] <= p.maxTurn && th[i] >= th[i - 1] && th[i] > th[i + 1]) cand.push({ i, th: th[i] });
  }
  cand.sort((a, b) => b.th - a.th);
  const kept: { i: number; th: number }[] = [];
  const minSep = Math.round((2.5 * width) / Math.max(ds, 1e-3));
  for (const c of cand) if (kept.every((q) => Math.abs(q.i - c.i) > minSep)) kept.push(c);
  kept.sort((a, b) => a.i - b.i);
  return kept.map((c) => ({ at: c.i / (M - 1), angle: DEFAULT_FOLD_ANGLE, radius: DEFAULT_FOLD_RADIUS }));
}
