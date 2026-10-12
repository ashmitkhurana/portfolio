import { projectWorld } from "@/lib/ribbon/poses/camera";
import type { StageLayout, StageRings } from "./stageApi";

export interface CurveView {
  /** ring positions on screen, viewport CSS px: x0, y0, x1, y1 ... */
  screen: Float32Array;
  /** 1 where face A (the lit orange side) faces the camera */
  faceA: Uint8Array;
  /** for each control point, the nearest ring (monotone along the strip) */
  ctrlRing: Int32Array;
  /** SVG path data of runs of equal visible face */
  runs: { d: string; faceA: boolean }[];
  /** projected unit width direction at each control point (screen) */
  widthDir: { x: number; y: number }[];
  /** projected half width at each control point, px */
  halfWidth: number[];
  /** screen direction the tip of the width tick moves when the roll (twist) increases */
  rollDir: { x: number; y: number }[];
}

/** Everything the overlay and depth views draw, derived from the rendered rings. */
export function buildCurveView(
  rings: StageRings,
  layout: StageLayout,
  controlWorld: Float32Array,
  n: number,
): CurveView {
  const M = rings.count;
  const { viewW, viewH, fov } = layout;
  const screen = new Float32Array(M * 2);
  const faceA = new Uint8Array(M);
  const camZ = viewH / 2 / Math.tan((fov * Math.PI) / 360);
  for (let i = 0; i < M; i++) {
    const x = rings.pos[i * 3];
    const y = rings.pos[i * 3 + 1];
    const z = rings.pos[i * 3 + 2];
    const s = projectWorld(x, y, z, viewW, viewH, fov);
    screen[i * 2] = s.x;
    screen[i * 2 + 1] = s.y;
    const dot =
      rings.N[i * 3] * (0 - x) + rings.N[i * 3 + 1] * (0 - y) + rings.N[i * 3 + 2] * (camZ - z);
    faceA[i] = dot > 0 ? 1 : 0;
  }
  // runs of equal face (a shared end point keeps the polyline continuous)
  const runs: CurveView["runs"] = [];
  let start = 0;
  for (let i = 1; i <= M; i++) {
    if (i === M || faceA[i] !== faceA[start]) {
      const end = Math.min(i, M - 1);
      let d = "";
      for (let k = start; k <= end; k++) {
        d += `${k === start ? "M" : "L"}${screen[k * 2].toFixed(1)} ${screen[k * 2 + 1].toFixed(1)}`;
      }
      runs.push({ d, faceA: faceA[start] === 1 });
      start = i;
    }
  }
  // control point -> ring (monotone nearest, in world space)
  const ctrlRing = new Int32Array(n);
  let from = 0;
  for (let c = 0; c < n; c++) {
    const cx = controlWorld[c * 3];
    const cy = controlWorld[c * 3 + 1];
    const cz = controlWorld[c * 3 + 2];
    let best = from;
    let bd = Infinity;
    // search a forward window (the curve passes the control points in order)
    const lim = Math.min(M, from + Math.max(40, Math.ceil((M * 3) / Math.max(n, 1))));
    for (let i = from; i < lim; i++) {
      const dx = rings.pos[i * 3] - cx;
      const dy = rings.pos[i * 3 + 1] - cy;
      const dz = rings.pos[i * 3 + 2] - cz;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    ctrlRing[c] = best;
    from = best;
  }
  const widthDir: CurveView["widthDir"] = [];
  const halfWidth: number[] = [];
  const rollDir: CurveView["rollDir"] = [];
  for (let c = 0; c < n; c++) {
    const r = ctrlRing[c];
    const hw = rings.hw[r];
    const p = projectWorld(
      rings.pos[r * 3] + rings.B[r * 3] * hw,
      rings.pos[r * 3 + 1] + rings.B[r * 3 + 1] * hw,
      rings.pos[r * 3 + 2] + rings.B[r * 3 + 2] * hw,
      viewW,
      viewH,
      fov,
    );
    const dx = p.x - screen[r * 2];
    const dy = p.y - screen[r * 2 + 1];
    const l = Math.hypot(dx, dy);
    widthDir.push(l > 1e-3 ? { x: dx / l, y: dy / l } : { x: 0, y: -1 });
    halfWidth.push(l);
    // d(B)/d(twist) = -N (see twistFrames): where the tick tip goes when the roll grows
    const q = projectWorld(
      rings.pos[r * 3] + (rings.B[r * 3] - rings.N[r * 3] * 0.25) * hw,
      rings.pos[r * 3 + 1] + (rings.B[r * 3 + 1] - rings.N[r * 3 + 1] * 0.25) * hw,
      rings.pos[r * 3 + 2] + (rings.B[r * 3 + 2] - rings.N[r * 3 + 2] * 0.25) * hw,
      viewW,
      viewH,
      fov,
    );
    const rx = q.x - p.x;
    const ry = q.y - p.y;
    const rl = Math.hypot(rx, ry);
    // edge-on to the camera the tick barely moves: fall back to the perpendicular of the tick
    rollDir.push(rl > 0.5 ? { x: rx / rl, y: ry / rl } : { x: -(dy / (l || 1)), y: dx / (l || 1) });
  }
  return { screen, faceA, ctrlRing, runs, widthDir, halfWidth, rollDir };
}
