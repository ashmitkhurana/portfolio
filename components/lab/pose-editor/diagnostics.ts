/**
 * Pose diagnostics (pure, DOM-free). Works on the rings the engine actually
 * renders (so path relaxation is included) and on the authored curve:
 *
 *  - crossing: the ribbon surface crosses a proxy depth plane INSIDE a glyph's ink
 *    box. The front/back split is a hard cut at that line, so it would slice a
 *    letter. Crossings must happen in gaps.
 *  - close:    two strands that are not neighbours along the strip come within
 *    2 x thickness of each other (z-fighting / self-intersection).
 *  - curvature: the strip bends edge-wise tighter than its own half width (the inner
 *    edge would pinch; the engine relaxes it, which moves the path), or kinks.
 *  - fold:     a soft fold the engine could not build (impossible turn, too gentle / too close to an end /
 *    overlapping), or one whose radius is so tight it reads as a crease, or whose layers touch.
 *  - wobble:   the strip is crinkled: its curvature or roll reverses again and again within a few widths
 *    (too many / uneven control points). The mockup is made of long calm curves.
 */
import {
  CurvatureFramer,
  DEFAULT_CURVATURE_FRAME,
  RibbonCurve,
  transportFrames,
  twistFrames,
} from "@/lib/ribbon/frames";
import { SMOOTH_LIMITS } from "@/lib/ribbon/smooth";
import { projectWorld } from "@/lib/ribbon/poses/camera";
import { onInk } from "@/lib/ribbon/poses/types";
import type { StageLayout, StageRings } from "./stageApi";

export type IssueKind = "crossing" | "close" | "curvature" | "fold" | "wobble";

export interface Issue {
  id: string;
  kind: IssueKind;
  /** crossings are errors (red), the rest warnings (amber) */
  level: "error" | "warn";
  /** viewport CSS px */
  x: number;
  y: number;
  /** world z at the issue */
  z: number;
  /** nearest control point */
  ctrl: number;
  message: string;
}

export interface DiagnosticsInput {
  rings: StageRings;
  layout: StageLayout;
  /** authored control points: world xyz triples, twist, width multiplier */
  control: { pos: Float32Array; twist: Float32Array; width: Float32Array; n: number };
  /** frame mode of the pose (default curvature) */
  orientation?: "curvature" | "rmf";
}

export interface DiagnosticsOptions {
  /** in-plane radius below which a bend is flagged, in half widths */
  minInPlaneRadius: number;
  /** out-of-plane radius below which a bend kinks, px */
  minBendRadius: number;
  /** strands closer than this many thicknesses are flagged */
  closeThicknesses: number;
}

export const DEFAULT_DIAG: DiagnosticsOptions = {
  minInPlaneRadius: 1,
  minBendRadius: 16,
  closeThicknesses: 2,
};

const SAMPLE_U = [-1, -0.5, 0, 0.5, 1];

function nearestControl(c: DiagnosticsInput["control"], x: number, y: number, z: number): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < c.n; i++) {
    const dx = c.pos[i * 3] - x;
    const dy = c.pos[i * 3 + 1] - y;
    const dz = c.pos[i * 3 + 2] - z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

interface Raw {
  x: number;
  y: number;
  z: number;
  /** world position for the nearest-control lookup */
  wx: number;
  wy: number;
  wz: number;
  note: string;
}

/** merge raw hits closer than `r` px on screen into one issue each */
function cluster<T extends Raw>(raw: T[], r: number): T[][] {
  const out: T[][] = [];
  for (const h of raw) {
    let hit: T[] | null = null;
    for (const c of out) {
      const a = c[0];
      if (Math.hypot(a.x - h.x, a.y - h.y) < r) {
        hit = c;
        break;
      }
    }
    if (hit) hit.push(h);
    else out.push([h]);
  }
  return out;
}

export function runDiagnostics(
  input: DiagnosticsInput,
  opts: DiagnosticsOptions = DEFAULT_DIAG,
): Issue[] {
  const { rings, layout, control, orientation } = input;
  const issues: Issue[] = [];
  const M = rings.count;
  if (M < 4) return issues;
  const { viewW, viewH, fov } = layout;
  const proj = (x: number, y: number, z: number) => projectWorld(x, y, z, viewW, viewH, fov);

  // ---- 1. proxy-plane crossings inside glyph ink -----------------------------
  const depths = Array.from(new Set(layout.proxies.map((p) => p.depth)));
  if (!depths.length) depths.push(0);
  const ink = layout.ink;
  const pad = 1.5;
  const insideInk = (sx: number, sy: number): string | null => {
    for (const b of ink) {
      if (onInk(b, sx, sy, pad)) return b.ch;
    }
    return null;
  };
  const surf = (i: number, u: number, out: number[]) => {
    const hw = rings.hw[i] * u;
    out[0] = rings.pos[i * 3] + rings.B[i * 3] * hw;
    out[1] = rings.pos[i * 3 + 1] + rings.B[i * 3 + 1] * hw;
    out[2] = rings.pos[i * 3 + 2] + rings.B[i * 3 + 2] * hw;
  };
  const a = [0, 0, 0];
  const b = [0, 0, 0];
  const rawCross: Raw[] = [];
  const push = (t: number, p: number[], q: number[], d: number) => {
    const x = p[0] + (q[0] - p[0]) * t;
    const y = p[1] + (q[1] - p[1]) * t;
    const z = d;
    const s = proj(x, y, z);
    const ch = insideInk(s.x, s.y);
    if (ch) rawCross.push({ x: s.x, y: s.y, z, wx: x, wy: y, wz: z, note: ch });
  };
  for (const d of depths) {
    for (let i = 0; i < M - 1; i++) {
      for (let k = 0; k < SAMPLE_U.length; k++) {
        surf(i, SAMPLE_U[k], a);
        // along the strip
        surf(i + 1, SAMPLE_U[k], b);
        const za = a[2] - d;
        const zb = b[2] - d;
        if ((za < 0) !== (zb < 0)) push(za / (za - zb), a, b, d);
        // across the strip
        if (k < SAMPLE_U.length - 1) {
          surf(i, SAMPLE_U[k + 1], b);
          const zc = b[2] - d;
          if ((za < 0) !== (zc < 0)) push(za / (za - zc), a, b, d);
        }
      }
    }
  }
  for (const c of cluster(rawCross, 36)) {
    const h = c[0];
    const letters = Array.from(new Set(c.map((r) => r.note))).join("");
    issues.push({
      id: `x${issues.length}`,
      kind: "crossing",
      level: "error",
      x: h.x,
      y: h.y,
      z: h.z,
      ctrl: nearestControl(control, h.wx, h.wy, h.wz),
      message: `Crosses the text plane inside "${letters}"`,
    });
  }

  // ---- 2. strands too close / intersecting -----------------------------------
  const thick = Math.max(layout.ribbonThickness, 1);
  const thr = thick * opts.closeThicknesses;
  const step = Math.max(1, Math.round(M / 300));
  const idx: number[] = [];
  for (let i = 0; i < M; i += step) idx.push(i);
  if (idx[idx.length - 1] !== M - 1) idx.push(M - 1);
  const P = idx.length;
  // arc length at each retained ring
  const arc = new Float32Array(P);
  for (let k = 1; k < P; k++) {
    const i = idx[k];
    const j = idx[k - 1];
    arc[k] =
      arc[k - 1] +
      Math.hypot(
        rings.pos[i * 3] - rings.pos[j * 3],
        rings.pos[i * 3 + 1] - rings.pos[j * 3 + 1],
        rings.pos[i * 3 + 2] - rings.pos[j * 3 + 2],
      );
  }
  // per-patch AABB (patch k spans retained rings k..k+1, full width)
  const aabb = new Float32Array((P - 1) * 6);
  for (let k = 0; k < P - 1; k++) {
    let x0 = Infinity,
      y0 = Infinity,
      z0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity,
      z1 = -Infinity;
    for (const r of [idx[k], idx[k + 1]]) {
      for (const u of [-1, 1]) {
        surf(r, u, a);
        x0 = Math.min(x0, a[0]);
        y0 = Math.min(y0, a[1]);
        z0 = Math.min(z0, a[2]);
        x1 = Math.max(x1, a[0]);
        y1 = Math.max(y1, a[1]);
        z1 = Math.max(z1, a[2]);
      }
    }
    aabb.set([x0 - thr, y0 - thr, z0 - thr, x1 + thr, y1 + thr, z1 + thr], k * 6);
  }
  const minArc = layout.ribbonWidth * 2.5;
  /** separation of patch `k`'s sample points from patch `m`'s plane, only where they project inside it */
  const sep = (k: number, m: number): number => {
    const r0 = idx[m];
    const r1 = idx[m + 1];
    // patch m plane: centre of its two rings, normal from the mean N
    const cx = (rings.pos[r0 * 3] + rings.pos[r1 * 3]) / 2;
    const cy = (rings.pos[r0 * 3 + 1] + rings.pos[r1 * 3 + 1]) / 2;
    const cz = (rings.pos[r0 * 3 + 2] + rings.pos[r1 * 3 + 2]) / 2;
    let nx = rings.N[r0 * 3] + rings.N[r1 * 3];
    let ny = rings.N[r0 * 3 + 1] + rings.N[r1 * 3 + 1];
    let nz = rings.N[r0 * 3 + 2] + rings.N[r1 * 3 + 2];
    let nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl;
    ny /= nl;
    nz /= nl;
    let bx = rings.B[r0 * 3] + rings.B[r1 * 3];
    let by = rings.B[r0 * 3 + 1] + rings.B[r1 * 3 + 1];
    let bz = rings.B[r0 * 3 + 2] + rings.B[r1 * 3 + 2];
    nl = Math.hypot(bx, by, bz) || 1;
    bx /= nl;
    by /= nl;
    bz /= nl;
    const hw = (rings.hw[r0] + rings.hw[r1]) / 2;
    const tx = rings.pos[r1 * 3] - rings.pos[r0 * 3];
    const ty = rings.pos[r1 * 3 + 1] - rings.pos[r0 * 3 + 1];
    const tz = rings.pos[r1 * 3 + 2] - rings.pos[r0 * 3 + 2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    const half = tl / 2;
    let best = Infinity;
    for (const r of [idx[k], idx[k + 1]]) {
      for (const u of SAMPLE_U) {
        surf(r, u, a);
        const dx = a[0] - cx;
        const dy = a[1] - cy;
        const dz = a[2] - cz;
        const across = dx * bx + dy * by + dz * bz;
        const along = (dx * tx + dy * ty + dz * tz) / tl;
        if (Math.abs(across) > hw + 2 || Math.abs(along) > half + 2) continue;
        const d = Math.abs(dx * nx + dy * ny + dz * nz);
        if (d < best) best = d;
      }
    }
    return best;
  };
  const rawClose: (Raw & { d: number })[] = [];
  for (let k = 0; k < P - 1; k++) {
    for (let m = k + 1; m < P - 1; m++) {
      if (arc[m] - arc[k + 1] < minArc) continue;
      const A = k * 6;
      const Bb = m * 6;
      if (
        aabb[A] > aabb[Bb + 3] ||
        aabb[A + 3] < aabb[Bb] ||
        aabb[A + 1] > aabb[Bb + 4] ||
        aabb[A + 4] < aabb[Bb + 1] ||
        aabb[A + 2] > aabb[Bb + 5] ||
        aabb[A + 5] < aabb[Bb + 2]
      ) {
        continue;
      }
      const d = Math.min(sep(k, m), sep(m, k));
      if (d < thr) {
        const r = idx[k];
        const wx = rings.pos[r * 3];
        const wy = rings.pos[r * 3 + 1];
        const wz = rings.pos[r * 3 + 2];
        const s = proj(wx, wy, wz);
        rawClose.push({ x: s.x, y: s.y, z: wz, wx, wy, wz, note: "", d });
      }
    }
  }
  for (const c of cluster(rawClose, 50)) {
    const h = c.reduce((p, q) => (q.d < p.d ? q : p));
    const d = h.d;
    issues.push({
      id: `c${issues.length}`,
      kind: "close",
      level: "warn",
      x: h.x,
      y: h.y,
      z: h.z,
      ctrl: nearestControl(control, h.wx, h.wy, h.wz),
      message:
        d < thick * 0.9
          ? `Strands intersect (gap ${d.toFixed(0)} px, thickness ${thick.toFixed(0)})`
          : `Strands too close (gap ${d.toFixed(0)} px, want >= ${thr.toFixed(0)})`,
    });
  }

  // ---- 3. curvature of the AUTHORED curve (before the engine relaxes it) ------
  if (control.n >= 3) {
    const curve = new RibbonCurve(128);
    curve.setControl(control.pos, control.twist, control.width, control.n);
    const Mc = 360;
    const pos = new Float32Array(Mc * 3);
    const tan = new Float32Array(Mc * 3);
    const tw = new Float32Array(Mc);
    const wd = new Float32Array(Mc);
    curve.sampleRings(Mc, 0, pos, tan, tw, wd);
    const n0 = new Float32Array(Mc * 3);
    const N = new Float32Array(Mc * 3);
    const B = new Float32Array(Mc * 3);
    const cs = new Float32Array(Mc);
    const sn = new Float32Array(Mc);
    for (let i = 0; i < Mc; i++) {
      cs[i] = Math.cos(tw[i]);
      sn[i] = Math.sin(tw[i]);
    }
    if (orientation === "rmf") transportFrames(Mc, 0, pos, tan, n0, 0, 0, 1);
    else {
      new CurvatureFramer().compute(Mc, 0, pos, tan, n0, [0, 0, 1], {
        ...DEFAULT_CURVATURE_FRAME,
        width: layout.ribbonWidth,
      });
    }
    twistFrames(0, Mc, 0, tan, n0, cs, sn, N, B);
    const baseHw = layout.ribbonWidth / 2;
    const rawCurv: (Raw & { note: string })[] = [];
    for (let i = 2; i < Mc - 2; i++) {
      const o0 = (i - 2) * 3;
      const o1 = (i + 2) * 3;
      const ds = Math.hypot(pos[o1] - pos[o0], pos[o1 + 1] - pos[o0 + 1], pos[o1 + 2] - pos[o0 + 2]) || 1;
      const kx = (tan[o1] - tan[o0]) / ds;
      const ky = (tan[o1 + 1] - tan[o0 + 1]) / ds;
      const kz = (tan[o1 + 2] - tan[o0 + 2]) / ds;
      const o = i * 3;
      const kB = Math.abs(kx * B[o] + ky * B[o + 1] + kz * B[o + 2]);
      const kN = Math.abs(kx * N[o] + ky * N[o + 1] + kz * N[o + 2]);
      const hw = baseHw * wd[i];
      let note = "";
      if (kB > 1e-6 && 1 / kB < hw * opts.minInPlaneRadius) {
        note = `Edge-wise bend radius ${(1 / kB).toFixed(0)} px < half width ${hw.toFixed(0)} px (the engine will relax the path)`;
      } else if (kN > 1e-6 && 1 / kN < opts.minBendRadius) {
        note = `Kinked: bend radius ${(1 / kN).toFixed(0)} px`;
      }
      if (note) {
        const s = proj(pos[o], pos[o + 1], pos[o + 2]);
        rawCurv.push({ x: s.x, y: s.y, z: pos[o + 2], wx: pos[o], wy: pos[o + 1], wz: pos[o + 2], note });
      }
    }
    for (const c of cluster(rawCurv, 60)) {
      const h = c[0];
      issues.push({
        id: `k${issues.length}`,
        kind: "curvature",
        level: "warn",
        x: h.x,
        y: h.y,
        z: h.z,
        ctrl: nearestControl(control, h.wx, h.wy, h.wz),
        message: h.note,
      });
    }
  }

  // ---- 4. folds and smoothness (what the engine built) ---------------------------------------
  const ringIssue = (i: number, kind: IssueKind, level: Issue["level"], message: string) => {
    const k = Math.min(Math.max(i, 0), M - 1) * 3;
    const wx = rings.pos[k];
    const wy = rings.pos[k + 1];
    const wz = rings.pos[k + 2];
    const p = proj(wx, wy, wz);
    issues.push({
      id: `${kind[0]}${issues.length}`,
      kind,
      level,
      x: p.x,
      y: p.y,
      z: wz,
      ctrl: nearestControl(control, wx, wy, wz),
      message,
    });
  };
  for (const f of rings.folds ?? []) {
    const mid = Math.round((f.ring0 + f.ring1) / 2);
    for (const it of f.issues) {
      if (it.kind === "mismatch" && f.mismatch < 0.6 * layout.ribbonWidth) continue;
      ringIssue(mid, "fold", it.level, `fold ${f.index + 1}: ${it.text}`);
    }
    if (!f.built && f.issues.length === 0) ringIssue(mid, "fold", "error", `fold ${f.index + 1} could not be built`);
  }
  const sm = rings.smooth;
  if (sm && !sm.ok) {
    const why: string[] = [];
    if (sm.curvature > SMOOTH_LIMITS.curvature) why.push(`curvature reverses ${sm.curvature}x within 3 widths`);
    if (sm.roll > SMOOTH_LIMITS.roll) why.push(`roll reverses ${sm.roll}x within 3 widths`);
    if (sm.rollRate > SMOOTH_LIMITS.rollRate) why.push(`roll rate ${sm.rollRate.toFixed(1)} rad per width`);
    const at = sm.curvature > SMOOTH_LIMITS.curvature ? sm.curvatureAt : sm.roll > SMOOTH_LIMITS.roll ? sm.rollAt : sm.rateAt;
    ringIssue(at, "wobble", "warn", `crinkled strip: ${why.join(", ")}. Use fewer, evenly spaced points and smooth z / twist`);
  }
  return issues;
}
