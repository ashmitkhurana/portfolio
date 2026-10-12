// Offline clearance check of the desktop journey path: rebuilds it from captured inputs (window.__journeyDebug.input)
// and reports, between path rings far apart along the arc, the closest distance between their band surfaces.
// usage: npx tsx scripts/journey/pathclear.ts <input.json> [arcFrom] [arcTo]
import fs from "fs";
import { buildJourneyPathDesktop } from "../../lib/ribbon/journeyPathDesktop";
const inp = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const out = buildJourneyPathDesktop(inp);
const { pos, ruled, k } = out;
const ds = inp.ds;
const from = process.argv[3] ? +process.argv[3] : out.exterm ? out.exterm.sWait : 0;
const to = process.argv[4] ? +process.argv[4] : out.exterm ? out.exterm.sEnd : k * ds;
const j0 = Math.max(0, Math.floor(from / ds)), j1 = Math.min(k - 1, Math.ceil(to / ds));
const pts: [number, number, number, number][] = [];
for (let j = j0; j <= j1; j++) for (let t = -2; t <= 2; t++) {
  const h = (ruled[j * 4 + 3] * t) / 2;
  pts.push([j, pos[j * 3] + ruled[j * 4] * h, pos[j * 3 + 1] + ruled[j * 4 + 1] * h, pos[j * 3 + 2] + ruled[j * 4 + 2] * h]);
}
const minGap = Math.ceil((4 * ruled[j0 * 4 + 3]) / ds); // rings within two band widths along the arc are neighbours
let best = { d: Infinity, a: 0, b: 0 };
const hist = new Map<number, number>();
for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) {
  if (Math.abs(pts[a][0] - pts[b][0]) < minGap) continue;
  const d = Math.hypot(pts[a][1] - pts[b][1], pts[a][2] - pts[b][2], pts[a][3] - pts[b][3]);
  if (d < best.d) best = { d, a: pts[a][0], b: pts[b][0] };
  if (d < 30) hist.set(pts[a][0], Math.min(hist.get(pts[a][0]) ?? 1e9, d));
}
console.log(`arc ${from.toFixed(0)}..${to.toFixed(0)}: closest ${best.d.toFixed(1)} px between path rings ${best.a} (arc ${(best.a * ds).toFixed(0)}) and ${best.b} (arc ${(best.b * ds).toFixed(0)}); rings within 30 px of a far ring: ${hist.size}`);
console.log("marks", JSON.stringify(out.exterm));
