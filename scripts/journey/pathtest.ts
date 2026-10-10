// Offline check of the journey path: prints key points on screen (section-2 view). npx tsx scripts/journey/pathtest.ts
import { buildJourneyPath } from "../../lib/ribbon/journeyPath";
const W = 390, H = 844, D = 1799, y2 = 844;
const end = { p: [-103.9, -456.6, 60] as [number, number, number], t: [-0.463, -0.531, -0.71] as [number, number, number], b: [-0.582, 0.795, -0.174] as [number, number, number], hw: 25.5 };
const ds = 2964 / 319;
const aCy = y2 + 0.42 * H, bCy = y2 + 0.68 * H, lambda = 2 * (bCy - aCy);
(globalThis as any).__jpDebug = [];
const r = buildJourneyPath({ W, H, end, ds, y2, portrait: true, camZ: D, wave: { c: 195, amp: 39, top: 0, lambda: 0.3 * H } });
console.log("k", r.k, "sWave", r.sWave.toFixed(0), "sWaveEnd", r.sWaveEnd.toFixed(0), "wave top want", (aCy - lambda / 4 - y2).toFixed(0));
for (let j = 0; j < r.k; j += 6) {
  const z = r.pos[j * 3 + 2], kk = D / (D - z);
  const sx = W / 2 + r.pos[j * 3] * kk, sy = r.yv[j] - y2;
  if (sy > -150 && sy < H + 50) console.log(`${j} s ${((j + 1) * ds).toFixed(0)} scr (${sx.toFixed(0)}, ${sy.toFixed(0)}) z ${z.toFixed(0)}`);
}
console.log(JSON.stringify((globalThis as any).__jpDebug, (k, v) => typeof v === "number" ? +v.toFixed(1) : v));
