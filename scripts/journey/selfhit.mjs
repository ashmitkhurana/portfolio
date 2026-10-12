// Self-intersection check: for ring pairs far apart along the ribbon, the closest distance between their band
// surfaces (5 samples across each band's width). usage: node scripts/journey/selfhit.mjs <WxH> <selector> <q1,q2,..>
import { chromium } from "playwright";
const [w, h] = (process.argv[2] || "1512x860").split("x").map(Number);
const sel = process.argv[3] || ".exterm";
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: w, height: h } });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 });
for (const q of (process.argv[4] || "0.5").split(",").map(Number)) {
  await p.evaluate(([sel, q]) => { const s = document.querySelector(sel); window.scrollTo(0, s.getBoundingClientRect().top + scrollY + q * (s.offsetHeight - innerHeight)); }, [sel, q]);
  await p.waitForTimeout(2500);
  console.log("q", q, await p.evaluate(() => {
    const s = window.__ribbonState.engine.sim.slide, P = s.outPos, B = s.outRuled, n = s.count;
    const pts = [];
    for (let i = 0; i < n; i++) for (let k = -2; k <= 2; k++) { const hw = B[i*4+3] * k / 2; pts.push([i, P[i*3] + B[i*4]*hw, P[i*3+1] + B[i*4+1]*hw, P[i*3+2] + B[i*4+2]*hw]); }
    let best = [Infinity, 0, 0];
    const hits = [];
    for (let a = 0; a < pts.length; a++) for (let c = a + 1; c < pts.length; c++) {
      const A = pts[a], C = pts[c];
      if (Math.abs(A[0] - C[0]) < 12) continue;
      const d = Math.hypot(A[1]-C[1], A[2]-C[2], A[3]-C[3]);
      if (d < best[0]) best = [d, A[0], C[0]];
      if (d < 14) hits.push(`${A[0]}-${C[0]}:${d.toFixed(0)}`);
    }
    return `closest ${best[0].toFixed(1)} between rings ${best[1]} and ${best[2]}; under 14 px: ${hits.length} ${hits.slice(0, 12).join(" ")}`;
  }));
}
await b.close();
