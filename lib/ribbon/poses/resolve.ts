/**
 * Pose resolver: anchor-space control points + a measured anchor rect -> the
 * world-space RibbonPose the sim springs towards.
 *
 * DOM-free (the anchor rect and view size are passed in), so it is shared by
 * the site mount and the pose editor. Re-run it on resize and when fonts load.
 */
import { RibbonCurve, type SplineKind } from "../frames";
import type { FoldSpec } from "../fold";
import type { HairpinSpec, RibbonPose } from "../types";
import { DEFAULT_FOV, cameraDistance } from "./camera";
import type { AnchorRect, FitSpec, PoseFile, PosePoint, PoseVariant, RuledRing, ScreenClass, TailSpec } from "./types";

/** phone < 768, tablet 768-1099, desktop 1100-2199, ultrawide >= 2200 (the CSS screen classes) */
export function screenClassFor(viewW: number): ScreenClass {
  if (viewW < 768) return "phone";
  if (viewW < 1100) return "tablet";
  if (viewW >= 2200) return "ultrawide";
  return "desktop";
}

export interface VariantPick {
  variant: PoseVariant | null;
  /** the class whose data is used */
  source: ScreenClass;
  /** true when `source` differs from the requested class (no override stored) */
  derived: boolean;
}

/**
 * Pick the variant to use for a screen class. Tablet falls back to the phone
 * variant in portrait and to the desktop variant in landscape (the hero
 * composition switches there); ultrawide reuses desktop; everything else falls
 * back to whatever exists.
 */
export function variantFor(file: PoseFile, cls: ScreenClass, portrait: boolean): VariantPick {
  const v = file.variants;
  const order: ScreenClass[] =
    cls === "tablet"
      ? portrait
        ? ["tablet", "phone", "desktop", "ultrawide"]
        : ["tablet", "desktop", "ultrawide", "phone"]
      : cls === "ultrawide"
        ? ["ultrawide", "desktop", "tablet", "phone"]
        : cls === "phone"
          ? ["phone", "tablet", "desktop", "ultrawide"]
          : ["desktop", "ultrawide", "tablet", "phone"];
  for (const c of order) {
    const variant = v[c];
    if (variant && (variant.points.length >= 2 || (variant.ruled?.length ?? 0) >= 2)) return { variant, source: c, derived: c !== cls };
  }
  return { variant: null, source: cls, derived: true };
}

export interface ResolveContext {
  /** the drawing surface (the engine's size), CSS px */
  viewW: number;
  viewH: number;
  anchor: AnchorRect;
  fov?: number;
}

/** anchor space -> where the point appears, viewport CSS px (y down) */
export function anchorToScreen(
  p: Pick<PosePoint, "x" | "y">,
  anchor: AnchorRect,
): { x: number; y: number } {
  return { x: anchor.left + p.x * anchor.width, y: anchor.top + p.y * anchor.height };
}

/** viewport CSS px -> anchor-space x / y */
export function screenToAnchor(
  sx: number,
  sy: number,
  anchor: AnchorRect,
): { x: number; y: number } {
  return { x: (sx - anchor.left) / anchor.width, y: (sy - anchor.top) / anchor.height };
}

/** one control point -> world px (x, y up, z) */
export function pointToWorld(
  p: PosePoint,
  ctx: ResolveContext,
  out: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const s = anchorToScreen(p, ctx.anchor);
  const z = p.z * ctx.anchor.height;
  const D = cameraDistance(ctx.viewH, ctx.fov ?? DEFAULT_FOV);
  const k = (D - z) / D; // the point must appear at (sx, sy): undo the perspective
  out[0] = (s.x - ctx.viewW / 2) * k;
  out[1] = (ctx.viewH / 2 - s.y) * k;
  out[2] = z;
  return out;
}

/** world px -> anchor-space point (inverse of pointToWorld, twist / width untouched) */
export function worldToPoint(
  x: number,
  y: number,
  z: number,
  ctx: ResolveContext,
): { x: number; y: number; z: number } {
  const D = cameraDistance(ctx.viewH, ctx.fov ?? DEFAULT_FOV);
  const k = D / Math.max(D - z, 1);
  const sx = ctx.viewW / 2 + x * k;
  const sy = ctx.viewH / 2 - y * k;
  const a = screenToAnchor(sx, sy, ctx.anchor);
  return { x: a.x, y: a.y, z: z / ctx.anchor.height };
}

/** authored control points -> world xyz triples + twist + width arrays (same count) */
export function resolveControlPoints(
  points: readonly PosePoint[],
  ctx: ResolveContext,
): { pos: Float32Array; twist: Float32Array; width: Float32Array } {
  const n = points.length;
  const pos = new Float32Array(n * 3);
  const twist = new Float32Array(n);
  const width = new Float32Array(n);
  const tmp: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    pointToWorld(points[i], ctx, tmp);
    pos[i * 3] = tmp[0];
    pos[i * 3 + 1] = tmp[1];
    pos[i * 3 + 2] = tmp[2];
    twist[i] = points[i].twist;
    width[i] = points[i].width;
  }
  return { pos, twist, width };
}

/** the engine's max control points (RibbonGeometry is built for 128) */
export const MAX_POSE_POINTS = 120;

const curve = new RibbonCurve(128);

/**
 * Resolve to exactly `count` world-space control points for `RibbonSim.setTargetPose`:
 * the authored points are run through the same centripetal spline the geometry
 * uses and resampled by arc length, so the sim's control polygon follows the
 * authored curve (no smoothing: tight bends stay tight).
 */
export function resolvePose(
  points: readonly PosePoint[],
  ctx: ResolveContext,
  count: number,
  orientation: "curvature" | "rmf" = "curvature",
  spline: SplineKind = "catmull",
  spans?: PoseVariant["spans"],
): RibbonPose {
  const src = resolveControlPoints(points.slice(0, MAX_POSE_POINTS), ctx);
  const n = Math.min(points.length, MAX_POSE_POINTS);
  const outPos = new Float32Array(count * 3);
  const outTan = new Float32Array(count * 3);
  const outTw = new Float32Array(count);
  const outWd = new Float32Array(count);
  if (n < 2) return { points: outPos, twists: outTw, widths: outWd.fill(1), orientation };
  curve.setControl(src.pos, src.twist, src.width, n, spline);
  curve.sampleRings(count, 0, outPos, outTan, outTw, outWd);
  // folds: arc fraction of each marked control point along the authored curve
  const folds: FoldSpec[] = [];
  const hairpins: HairpinSpec[] = [];
  for (let i = 0; i < n; i++) {
    const f = points[i].fold;
    if (f) folds.push({ at: curve.arcFractionAtControl(i), angle: f.angle, radius: f.radius, ...(f.name ? { name: f.name } : {}) });
    const h = points[i].hairpin;
    if (h) hairpins.push({ at: curve.arcFractionAtControl(i), name: h.name, radius: h.radius });
  }
  const outSpans = (spans ?? [])
    .filter((s) => s.from >= 0 && s.to > s.from && s.to < n)
    .map((s) => ({
      at0: curve.arcFractionAtControl(s.from),
      at1: curve.arcFractionAtControl(s.to),
      rolls: s.rolls,
      ...(s.name ? { name: s.name } : {}),
      ...(s.length ? { length: s.length } : {}),
    }));
  return {
    points: outPos,
    twists: outTw,
    widths: outWd,
    orientation,
    ...(outSpans.length ? { spans: outSpans } : {}),
    ...(folds.length ? { folds } : {}),
    ...(hairpins.length ? { hairpins } : {}),
  };
}

/**
 * Resolve a RULED variant: each ring's two ends are unprojected with the engine camera (so the projection
 * equals the authored screen positions), centre = midpoint, B = unit(R - L), half width = |R - L| / 2.
 * `count` control points are chosen along the centreline with density rising with turning x width (the
 * hairpins keep their shape), each carrying B and half width; the geometry interpolates those to its rings.
 */
/**
 * Responsive placement (see FitSpec): the source sculpture keeps its 3D shape; it is scaled uniformly, placed so the
 * body's projected bbox fits the target box (anchor units, clipped to the safe area, aspect kept, right-aligned when
 * it has to shrink) and rotated so this camera sees the body from the source camera's direction.
 */
export function fitRuled(src: readonly RuledRing[], ctx: ResolveContext, fit: FitSpec): RuledRing[] {
  const n = src.length;
  const sctx: ResolveContext = { viewW: fit.ctx.viewW, viewH: fit.ctx.viewH, anchor: fit.ctx.anchor, fov: fit.ctx.fov };
  const Dp = cameraDistance(sctx.viewH, sctx.fov ?? DEFAULT_FOV);
  const Dd = cameraDistance(ctx.viewH, ctx.fov ?? DEFAULT_FOV);
  const t3: [number, number, number] = [0, 0, 0];
  const W = new Float64Array(n * 6);
  for (let i = 0; i < n; i++) {
    pointToWorld({ x: src[i].L[0], y: src[i].L[1], z: src[i].L[2] } as PosePoint, sctx, t3);
    W[i * 6] = t3[0]; W[i * 6 + 1] = t3[1]; W[i * 6 + 2] = t3[2];
    pointToWorld({ x: src[i].R[0], y: src[i].R[1], z: src[i].R[2] } as PosePoint, sctx, t3);
    W[i * 6 + 3] = t3[0]; W[i * 6 + 4] = t3[1]; W[i * 6 + 5] = t3[2];
  }
  const b0 = Math.max(0, Math.min(n - 2, Math.round(fit.bodyFrom)));
  let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = b0; i < n; i++) for (let e = 0; e < 2; e++) for (let q = 0; q < 3; q++) {
    const v = W[i * 6 + e * 3 + q]; if (v < mn[q]) mn[q] = v; if (v > mx[q]) mx[q] = v;
  }
  const Pc = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
  const dirP = (() => { const v = [Pc[0], Pc[1], Pc[2] - Dp]; const m = Math.hypot(v[0], v[1], v[2]); return [v[0] / m, v[1] / m, v[2] / m]; })();
  // target box in screen px, clipped to the safe area keeping its aspect (right-aligned, vertically centred)
  const A = ctx.anchor;
  const [sl, st, sr, sb] = fit.safe ?? [16, 72, 24, 0.97];
  let bx0 = A.left + fit.box[0] * A.width, by0 = A.top + fit.box[1] * A.height;
  let bx1 = A.left + fit.box[2] * A.width, by1 = A.top + fit.box[3] * A.height;
  const sx0 = sl, sy0 = st, sx1 = ctx.viewW - sr, sy1 = ctx.viewH * sb;
  const f0 = Math.min(1, (sx1 - sx0) / (bx1 - bx0), (sy1 - sy0) / (by1 - by0));
  if (f0 < 1) {
    const w = (bx1 - bx0) * f0, h = (by1 - by0) * f0, cy = (by0 + by1) / 2;
    bx1 = Math.min(bx1, sx1); bx0 = bx1 - w; by0 = cy - h / 2; by1 = cy + h / 2;
  }
  if (bx1 > sx1) { bx0 -= bx1 - sx1; bx1 = sx1; }
  if (by0 < sy0) { by1 += sy0 - by0; by0 = sy0; }
  if (by1 > sy1) { by0 -= by1 - sy1; by1 = sy1; }
  const bw = bx1 - bx0, bh = by1 - by0;
  let k = 1, cxs = (bx0 + bx1) / 2, cys = (by0 + by1) / 2;
  const out = new Float64Array(n * 6);
  const xform = () => {
    const zt = k * Pc[2];
    const kk = (Dd - zt) / Dd;
    const T = [(cxs - ctx.viewW / 2) * kk, (ctx.viewH / 2 - cys) * kk, zt];
    const dv = [T[0], T[1], T[2] - Dd];
    const dm = Math.hypot(dv[0], dv[1], dv[2]);
    const dd = [dv[0] / dm, dv[1] / dm, dv[2] / dm];
    const v = [dirP[1] * dd[2] - dirP[2] * dd[1], dirP[2] * dd[0] - dirP[0] * dd[2], dirP[0] * dd[1] - dirP[1] * dd[0]];
    const sn = Math.hypot(v[0], v[1], v[2]), cs = dirP[0] * dd[0] + dirP[1] * dd[1] + dirP[2] * dd[2];
    // Rodrigues matrix rotating dirP onto dd
    let R = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    if (sn > 1e-9) {
      const kx = v[0] / sn, ky = v[1] / sn, kz = v[2] / sn, c = cs, s = sn, C = 1 - c;
      R = [c + kx * kx * C, kx * ky * C - kz * s, kx * kz * C + ky * s,
           ky * kx * C + kz * s, c + ky * ky * C, ky * kz * C - kx * s,
           kz * kx * C - ky * s, kz * ky * C + kx * s, c + kz * kz * C];
    }
    for (let i = 0; i < n * 2; i++) {
      const x = k * (W[i * 3] - Pc[0]), y = k * (W[i * 3 + 1] - Pc[1]), z = k * (W[i * 3 + 2] - Pc[2]);
      out[i * 3] = T[0] + R[0] * x + R[1] * y + R[2] * z;
      out[i * 3 + 1] = T[1] + R[3] * x + R[4] * y + R[5] * z;
      out[i * 3 + 2] = T[2] + R[6] * x + R[7] * y + R[8] * z;
    }
  };
  const bbox = () => {
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (let i = b0 * 2; i < n * 2; i++) {
      const z = out[i * 3 + 2], kz = Dd / Math.max(Dd - z, 1);
      const x = ctx.viewW / 2 + out[i * 3] * kz, y = ctx.viewH / 2 - out[i * 3 + 1] * kz;
      if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y;
    }
    return [l, t, r, b];
  };
  // initial scale from the source's projected body size
  { const ks = Dp / Math.max(Dp - Pc[2], 1); const sw = (mx[0] - mn[0]) * ks, sh = (mx[1] - mn[1]) * ks; k = Math.min(bw / sw, bh / sh) * (Dp / Dd); }
  for (let it = 0; it < 8; it++) {
    xform();
    const [l, t, r, b] = bbox();
    k *= Math.min(bw / (r - l), bh / (b - t));
    xform();
    const [l2, t2, r2, b2] = bbox();
    // right-align horizontally (the sculpture hugs the right side of its box), centre vertically
    cxs += bx1 - r2;
    cys += (by0 + by1) / 2 - (t2 + b2) / 2;
  }
  xform();
  const res: RuledRing[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const Lp = worldToPoint(out[i * 6], out[i * 6 + 1], out[i * 6 + 2], ctx);
    const Rp = worldToPoint(out[i * 6 + 3], out[i * 6 + 4], out[i * 6 + 5], ctx);
    res[i] = { L: [Lp.x, Lp.y, Lp.z], R: [Rp.x, Rp.y, Rp.z] };
  }
  return res;
}

/**
 * Responsive leading end (see TailSpec): rings 0..fromRing are rebuilt for THIS viewport as a cubic Bezier in world
 * space from an exit point just below the bottom edge (the band's right edge at `rightEdgeX` of the width) to ring
 * `fromRing`, tangent-continuous there. The band is turned face-on to the camera along the new tail and blends back
 * into the authored ruling over the last 24 rings. Rings after `fromRing` are returned unchanged.
 */
export function steerTail(rings: readonly RuledRing[], ctx: ResolveContext, tail: TailSpec): RuledRing[] {
  const n = rings.length;
  const k0 = Math.max(8, Math.min(n - 8, Math.round(tail.fromRing)));
  const D = cameraDistance(ctx.viewH, ctx.fov ?? DEFAULT_FOV);
  const l: [number, number, number] = [0, 0, 0];
  const r: [number, number, number] = [0, 0, 0];
  const cen = (i: number): number[] => {
    pointToWorld({ x: rings[i].L[0], y: rings[i].L[1], z: rings[i].L[2] } as PosePoint, ctx, l);
    pointToWorld({ x: rings[i].R[0], y: rings[i].R[1], z: rings[i].R[2] } as PosePoint, ctx, r);
    return [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2, (l[2] + r[2]) / 2, r[0] - l[0], r[1] - l[1], r[2] - l[2]];
  };
  const norm = (v: number[]): number[] => {
    const m = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / m, v[1] / m, v[2] / m];
  };
  const c0 = cen(k0);
  const cA = cen(k0 - 4);
  const cB = cen(k0 + 4);
  const P0 = [c0[0], c0[1], c0[2]];
  const hw = Math.hypot(c0[3], c0[4], c0[5]) / 2;
  const b0 = norm([c0[3], c0[4], c0[5]]);
  const T0 = norm([cB[0] - cA[0], cB[1] - cA[1], cB[2] - cA[2]]);
  // exit point: screen position of the centre so the RIGHT edge crosses the bottom edge at rightEdgeX
  const a = (tail.exitAngleDeg * Math.PI) / 180;
  const zE = tail.zExit;
  const kE = D / Math.max(D - zE, 1); // world px -> screen px at that depth
  const hwPx = hw * kE;
  const cosA = Math.max(Math.cos(a), 0.2);
  const sxE = tail.rightEdgeX * ctx.viewW - hwPx / cosA;
  const syE = ctx.viewH + hwPx * Math.abs(Math.tan(a)) + 24;
  const E = [(sxE - ctx.viewW / 2) / kE, (ctx.viewH / 2 - syE) / kE, zE];
  // into-the-screen direction at the exit (world, y up): opposite of the outward screen direction (sin a, cos a)
  const dIn = norm([-Math.sin(a), Math.cos(a), (P0[2] - zE) / (Math.hypot(P0[0] - E[0], P0[1] - E[1]) || 1)]);
  const dist = Math.hypot(P0[0] - E[0], P0[1] - E[1], P0[2] - E[2]);
  const L = tail.swing * dist;
  const L0 = (tail.joinSwing ?? tail.swing) * dist;
  const B1 = [E[0] + dIn[0] * L, E[1] + dIn[1] * L, E[2] + dIn[2] * L];
  const B2 = [P0[0] - T0[0] * L0, P0[1] - T0[1] * L0, P0[2] - T0[2] * L0];
  const bez = (t: number): number[] => {
    const u = 1 - t;
    return [0, 1, 2].map((q) => u * u * u * E[q] + 3 * u * u * t * B1[q] + 3 * u * t * t * B2[q] + t * t * t * P0[q]);
  };
  // arc-length table, then k0+1 rings evenly spaced (ring 0 = exit, ring k0 = P0)
  const NS = 400;
  const pts: number[][] = [];
  const acc: number[] = [0];
  for (let j = 0; j <= NS; j++) {
    pts.push(bez(j / NS));
    if (j) acc.push(acc[j - 1] + Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1], pts[j][2] - pts[j - 1][2]));
  }
  const total = acc[NS];
  const pos: number[][] = [];
  let jj = 0;
  for (let i = 0; i <= k0; i++) {
    const target = (total * i) / k0;
    while (jj < NS - 1 && acc[jj + 1] < target) jj++;
    const f = (target - acc[jj]) / ((acc[jj + 1] - acc[jj]) || 1);
    pos.push([0, 1, 2].map((q) => pts[jj][q] + (pts[jj + 1][q] - pts[jj][q]) * f));
  }
  // rulings: parallel-transport the authored ruling at k0 back along the new curve (no twist through the bend),
  // then turn it face-on to the camera only on the straight lower part (i < 0.55 k0, fully below 0.2 k0)
  const out: RuledRing[] = rings.slice() as RuledRing[];
  const bs: number[][] = new Array(k0 + 1);
  let tr = b0;
  for (let i = k0; i >= 0; i--) {
    const pa = pos[Math.max(i - 1, 0)], pb = pos[Math.min(i + 1, k0)];
    const T = norm([pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]]);
    const d0 = tr[0] * T[0] + tr[1] * T[1] + tr[2] * T[2];
    tr = norm([tr[0] - d0 * T[0], tr[1] - d0 * T[1], tr[2] - d0 * T[2]]);
    const v = norm([-pos[i][0], -pos[i][1], D - pos[i][2]]);
    let bf = norm([T[1] * v[2] - T[2] * v[1], T[2] * v[0] - T[0] * v[2], T[0] * v[1] - T[1] * v[0]]);
    if (bf[0] * tr[0] + bf[1] * tr[1] + bf[2] * tr[2] < 0) bf = [-bf[0], -bf[1], -bf[2]];
    const x = Math.min(Math.max((0.55 * k0 - i) / (0.35 * k0), 0), 1);
    const w = x * x * (3 - 2 * x);
    let bb = [(1 - w) * tr[0] + w * bf[0], (1 - w) * tr[1] + w * bf[1], (1 - w) * tr[2] + w * bf[2]];
    const d = bb[0] * T[0] + bb[1] * T[1] + bb[2] * T[2];
    bb = norm([bb[0] - d * T[0], bb[1] - d * T[1], bb[2] - d * T[2]]);
    bs[i] = bb;
  }
  // blend the last W rings into the authored S (positions and rulings), so curvature is continuous at the join
  const W = Math.min(30, k0 - 1);
  for (let i = k0 - W; i <= k0; i++) {
    const o = cen(i);
    const x = (i - (k0 - W)) / W;
    const w = x * x * (3 - 2 * x);
    pos[i] = [0, 1, 2].map((q) => (1 - w) * pos[i][q] + w * o[q]);
    const bo = norm([o[3], o[4], o[5]]);
    const sgn = bo[0] * bs[i][0] + bo[1] * bs[i][1] + bo[2] * bs[i][2] < 0 ? -1 : 1;
    bs[i] = norm([0, 1, 2].map((q) => (1 - w) * bs[i][q] + w * sgn * bo[q]));
  }
  // extend with the authored rings past the join, then smooth centre + ruling across it (gaussian sigma 6,
  // weight 1 within 18 rings of k0, fading to 0 by 36): no kink where the two pieces meet
  const KE = Math.min(n - 1, k0 + 60);
  const hws: number[] = new Array(KE + 1).fill(hw);
  for (let i = k0 + 1; i <= KE; i++) {
    const o = cen(i);
    pos[i] = [o[0], o[1], o[2]];
    hws[i] = Math.hypot(o[3], o[4], o[5]) / 2;
    let bo = norm([o[3], o[4], o[5]]);
    const pb = bs[i - 1];
    if (bo[0] * pb[0] + bo[1] * pb[1] + bo[2] * pb[2] < 0) bo = [-bo[0], -bo[1], -bo[2]];
    bs[i] = bo;
  }
  const SG = 6, R3 = 18;
  const gk: number[] = [];
  for (let d = -R3; d <= R3; d++) gk.push(Math.exp(-(d * d) / (2 * SG * SG)));
  const sp = pos.map((p) => p.slice());
  const sb = bs.map((b) => b.slice());
  for (let i = Math.max(0, k0 - 36); i <= Math.min(KE - R3, k0 + 36); i++) {
    const acc = [0, 0, 0], accb = [0, 0, 0];
    let wsum = 0;
    for (let d = -R3; d <= R3; d++) {
      const j = Math.min(Math.max(i + d, 0), KE);
      const g = gk[d + R3];
      for (let q = 0; q < 3; q++) { acc[q] += g * pos[j][q]; accb[q] += g * bs[j][q]; }
      wsum += g;
    }
    const dist = Math.abs(i - k0);
    const x = Math.min(Math.max((36 - dist) / 18, 0), 1);
    const w = x * x * (3 - 2 * x);
    sp[i] = [0, 1, 2].map((q) => (1 - w) * pos[i][q] + (w * acc[q]) / wsum);
    sb[i] = norm([0, 1, 2].map((q) => (1 - w) * bs[i][q] + (w * accb[q]) / wsum));
  }
  for (let i = 0; i <= KE; i++) {
    const p = sp[i];
    const pa = sp[Math.max(i - 1, 0)], pb = sp[Math.min(i + 1, KE)];
    const T = norm([pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]]);
    let b = sb[i];
    const d = b[0] * T[0] + b[1] * T[1] + b[2] * T[2];
    b = norm([b[0] - d * T[0], b[1] - d * T[1], b[2] - d * T[2]]);
    const h = hws[i];
    const Lw = worldToPoint(p[0] - h * b[0], p[1] - h * b[1], p[2] - h * b[2], ctx);
    const Rw = worldToPoint(p[0] + h * b[0], p[1] + h * b[1], p[2] + h * b[2], ctx);
    out[i] = { L: [Lw.x, Lw.y, Lw.z], R: [Rw.x, Rw.y, Rw.z] };
  }
  return out;
}

export function resolveRuled(
  rings: readonly RuledRing[],
  ctx: ResolveContext,
  count: number,
  faceSign: 1 | -1 = 1,
): RibbonPose {
  const n = rings.length;
  const C = new Float64Array(n * 3);
  const Bv = new Float64Array(n * 3);
  const H = new Float64Array(n);
  const l: [number, number, number] = [0, 0, 0];
  const r: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    pointToWorld({ x: rings[i].L[0], y: rings[i].L[1], z: rings[i].L[2] } as PosePoint, ctx, l);
    pointToWorld({ x: rings[i].R[0], y: rings[i].R[1], z: rings[i].R[2] } as PosePoint, ctx, r);
    const dx = r[0] - l[0], dy = r[1] - l[1], dz = r[2] - l[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    C[i * 3] = (l[0] + r[0]) / 2;
    C[i * 3 + 1] = (l[1] + r[1]) / 2;
    C[i * 3 + 2] = (l[2] + r[2]) / 2;
    Bv[i * 3] = dx / len;
    Bv[i * 3 + 1] = dy / len;
    Bv[i * 3 + 2] = dz / len;
    H[i] = len / 2;
  }
  // sampling weight: arc length + turning angle x width (turns keep more control points)
  const w = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const ds = Math.hypot(C[i * 3] - C[i * 3 - 3], C[i * 3 + 1] - C[i * 3 - 2], C[i * 3 + 2] - C[i * 3 - 1]);
    let turn = 0;
    if (i >= 2) {
      const ax = C[i * 3 - 3] - C[i * 3 - 6], ay = C[i * 3 - 2] - C[i * 3 - 5], az = C[i * 3 - 1] - C[i * 3 - 4];
      const bx = C[i * 3] - C[i * 3 - 3], by = C[i * 3 + 1] - C[i * 3 - 2], bz = C[i * 3 + 2] - C[i * 3 - 1];
      const d = (ax * bx + ay * by + az * bz) / ((Math.hypot(ax, ay, az) * Math.hypot(bx, by, bz)) || 1);
      turn = Math.acos(Math.min(Math.max(d, -1), 1));
    }
    // the ruling can rotate fast where the centreline barely turns (the sections of a paper fold swing to the crease):
    // weight that too, and half-width changes, so those stretches keep enough control points
    const bd = Bv[i * 3] * Bv[i * 3 - 3] + Bv[i * 3 + 1] * Bv[i * 3 - 2] + Bv[i * 3 + 2] * Bv[i * 3 - 1];
    const rot = Math.acos(Math.min(Math.max(bd, -1), 1));
    w[i] = w[i - 1] + ds + 3 * turn * H[i] * 2 + 3 * rot * H[i] * 2 + 2 * Math.abs(H[i] - H[i - 1]);
  }
  const outPos = new Float32Array(count * 3);
  const data = new Float32Array(count * 4);
  let j = 0;
  for (let k = 0; k < count; k++) {
    const target = count > 1 ? (k / (count - 1)) * w[n - 1] : 0;
    while (j < n - 2 && w[j + 1] < target) j++;
    const span = w[j + 1] - w[j];
    const f = span > 1e-9 ? Math.min(Math.max((target - w[j]) / span, 0), 1) : 0;
    for (let a = 0; a < 3; a++) {
      outPos[k * 3 + a] = C[j * 3 + a] + (C[(j + 1) * 3 + a] - C[j * 3 + a]) * f;
      data[k * 4 + a] = Bv[j * 3 + a] + (Bv[(j + 1) * 3 + a] - Bv[j * 3 + a]) * f;
    }
    const bl = Math.hypot(data[k * 4], data[k * 4 + 1], data[k * 4 + 2]) || 1;
    data[k * 4] /= bl;
    data[k * 4 + 1] /= bl;
    data[k * 4 + 2] /= bl;
    data[k * 4 + 3] = H[j] + (H[j + 1] - H[j]) * f;
  }
  return {
    points: outPos,
    twists: new Float32Array(count),
    widths: new Float32Array(count).fill(1),
    orientation: "curvature",
    ruled: { data, sign: faceSign },
  };
}
