import type { PosePoint } from "@/lib/ribbon/poses/types";
import type { CurveView } from "./curveView";
import type { StageRings } from "./stageApi";

export type TwistMode = "keep" | "A" | "B" | "level";

const TAU = Math.PI * 2;

/**
 * Roll the strip about its tangent so the chosen face looks straight at the camera:
 *   keep  the face that is visible now stays visible (only the roll is corrected)
 *   A / B force the lit / the shaded face
 * The twist of each point is unwrapped against the previous point, so the strip
 * never spins a full turn between neighbours. Frames come from the rendered rings
 * (twist is undone to recover the transported frame).
 */
export function autoTwist(
  points: PosePoint[],
  ids: number[],
  rings: StageRings,
  curve: CurveView,
  camZ: number,
  mode: TwistMode,
): PosePoint[] {
  const out = points.map((p) => ({ ...p }));
  let prev: number | null = null;
  for (const i of ids) {
    const r = curve.ctrlRing[i];
    const t = points[i].twist;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const o = r * 3;
    // untwisted transported frame
    const n0 = [0, 1, 2].map((a) => rings.N[o + a] * c - rings.B[o + a] * s);
    const b0 = [0, 1, 2].map((a) => rings.N[o + a] * s + rings.B[o + a] * c);
    const v = [-rings.pos[o], -rings.pos[o + 1], camZ - rings.pos[o + 2]];
    const dn = n0[0] * v[0] + n0[1] * v[1] + n0[2] * v[2];
    const db = b0[0] * v[0] + b0[1] * v[1] + b0[2] * v[2];
    let target = Math.atan2(db, dn); // face A towards the camera
    const wantB = mode === "B" || ((mode === "keep" || mode === "level") && !curve.faceA[r]);
    if (mode === "level") {
      // width direction as horizontal on screen as the tangent allows: the front/back cut
      // (where the strip crosses a proxy plane) then runs along x, so it fits a line gap
      const T = [rings.T[o], rings.T[o + 1], rings.T[o + 2]];
      const k = T[0];
      const bt = [1 - k * T[0], -k * T[1], -k * T[2]];
      const l = Math.hypot(bt[0], bt[1], bt[2]) || 1;
      const bn = bt.map((q) => q / l);
      // B(theta) = cos(theta) B0 - sin(theta) N0 ... (see twistFrames)
      const cb = bn[0] * b0[0] + bn[1] * b0[1] + bn[2] * b0[2];
      const cn = bn[0] * n0[0] + bn[1] * n0[1] + bn[2] * n0[2];
      const th = Math.atan2(-cn, cb);
      // the two solutions (B or -B) differ by pi: keep the visible face
      const nAt = (a: number) => {
        const nx = n0[0] * Math.cos(a) + b0[0] * Math.sin(a);
        const ny = n0[1] * Math.cos(a) + b0[1] * Math.sin(a);
        const nz = n0[2] * Math.cos(a) + b0[2] * Math.sin(a);
        return nx * v[0] + ny * v[1] + nz * v[2];
      };
      target = th;
      if ((nAt(th) > 0) !== !wantB) target = th + Math.PI;
    } else if (wantB) target += Math.PI;
    const ref = prev ?? t;
    target += Math.round((ref - target) / TAU) * TAU;
    out[i].twist = target;
    prev = target;
  }
  return out;
}
