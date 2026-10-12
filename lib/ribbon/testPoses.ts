/**
 * Lab-only hand-authored test poses. Anchors are authored in the reference
 * mockup's pixel space (1672 x 941) and mapped to the viewport, then resampled
 * to the sim's control-point count with the same centripetal spline the
 * geometry uses (so the sim's control polygon is already smooth).
 */
import { RibbonCurve } from "./frames";
import type { RibbonPose } from "./types";

const REF_W = 1672;
const REF_H = 941;

/** x, y (ref px, y down), z (px at ref scale), twist (rad) */
type Anchor = [number, number, number, number];

const SWEEP: Anchor[] = [
  [180, 1010, -60, 0.0],
  [520, 915, 0, 0.0],
  [860, 860, 60, 0.0],
  [1130, 800, 110, 0.35],
  [1250, 690, 120, 1.6],
  [1130, 585, 80, 2.9],
  [880, 535, 10, 3.14],
  [660, 590, -60, 3.14],
  [600, 710, -110, 3.14],
  [740, 800, -120, 3.3],
  [960, 770, -90, 4.5],
  [1160, 650, -50, 5.9],
  [1350, 520, -10, 6.28],
  [1530, 470, 50, 6.28],
  [1640, 560, 100, 6.28],
  [1630, 700, 140, 6.3],
  [1500, 775, 120, 6.4],
  [1340, 710, 60, 7.6],
  [1255, 560, -10, 9.0],
  [1235, 400, -80, 9.42],
  [1170, 235, -140, 9.42],
  [1020, 110, -120, 9.42],
  [850, 175, -40, 9.5],
  [820, 330, 70, 10.7],
  [960, 445, 110, 12.0],
  [1180, 450, 80, 12.57],
  [1390, 360, 10, 12.57],
  [1560, 240, -60, 12.57],
  [1650, 130, -90, 12.57],
];

/** A calm S-wave with three clean half-twists (colour flips A -> B -> A -> B). */
function twistAnchors(): Anchor[] {
  const out: Anchor[] = [];
  const tw = [0, 0, 0.25, 1.6, 3.14, 3.14, 3.3, 4.7, 6.28, 6.28, 6.45, 7.8, 9.42, 9.42];
  for (let i = 0; i < tw.length; i++) {
    out.push([
      100 + i * 118,
      560 + 190 * Math.sin(i * 0.62 + 0.4),
      90 * Math.sin(i * 0.8 + 1),
      tw[i],
    ]);
  }
  return out;
}

function knotAnchors(): Anchor[] {
  const out: Anchor[] = [];
  // tail in from bottom-left
  out.push([420, 1010, -60, 0]);
  out.push([700, 900, -20, 0.3]);
  out.push([960, 760, 20, 0.6]);
  // trefoil knot centred right of the headline
  const cx = 1250;
  const cy = 450;
  const S = 118;
  const N = 36;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2;
    const x = Math.sin(t) + 2 * Math.sin(2 * t);
    const y = Math.cos(t) - 2 * Math.cos(2 * t);
    const z = -Math.sin(3 * t);
    out.push([cx + x * S * 0.62, cy + y * S * 0.62, z * 130, 0.9 + t * 1.5]);
  }
  out.push([1500, 760, 20, 8.5]);
  out.push([1640, 900, -40, 8.9]);
  return out;
}

const POSES: Record<string, Anchor[]> = {
  sweep: SWEEP,
  twists: twistAnchors(),
  knot: knotAnchors(),
};

export const TEST_POSE_NAMES = Object.keys(POSES);

const curve = new RibbonCurve(128);

/**
 * Build a pose for the given viewport (CSS px). World coords: origin at the
 * viewport centre, +y up, 1 unit = 1 css px at z = 0.
 */
export function makeTestPose(
  name: string,
  viewW: number,
  viewH: number,
  controlPoints: number,
): RibbonPose {
  const anchors = POSES[name] ?? SWEEP;
  const n = anchors.length;
  const pos = new Float32Array(n * 3);
  const tw = new Float32Array(n);
  const wd = new Float32Array(n).fill(1);
  const zScale = Math.min(viewW / REF_W, 1) * 1.2;
  for (let i = 0; i < n; i++) {
    const [ax, ay, az, at] = anchors[i];
    pos[i * 3] = (ax / REF_W) * viewW - viewW / 2;
    pos[i * 3 + 1] = viewH / 2 - (ay / REF_H) * viewH;
    pos[i * 3 + 2] = az * zScale;
    tw[i] = at;
  }
  curve.setControl(pos, tw, wd, n);
  const outPos = new Float32Array(controlPoints * 3);
  const outTan = new Float32Array(controlPoints * 3);
  const outTw = new Float32Array(controlPoints);
  const outWd = new Float32Array(controlPoints);
  curve.sampleRings(controlPoints, 0, outPos, outTan, outTw, outWd);
  outWd.fill(1); // the engine scales ribbon width with the viewport
  // even out curvature: a few [1 2 1] passes over the control polygon
  smooth(outPos, controlPoints, 5);
  return { points: outPos, twists: outTw, widths: outWd };
}

/** Laplacian-smooth xyz triples in place, pinning both ends. */
function smooth(p: Float32Array, n: number, passes: number): void {
  const tmp = new Float32Array(p.length);
  for (let k = 0; k < passes; k++) {
    tmp.set(p);
    for (let i = 1; i < n - 1; i++) {
      for (let a = 0; a < 3; a++) {
        p[i * 3 + a] =
          0.25 * tmp[(i - 1) * 3 + a] + 0.5 * tmp[i * 3 + a] + 0.25 * tmp[(i + 1) * 3 + a];
      }
    }
  }
}
