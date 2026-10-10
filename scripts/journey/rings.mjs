import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: 1512, height: 860 } });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 });
await p.evaluate(() => window.scrollTo(0, innerHeight * 1.8));
await p.waitForTimeout(1800);
console.log(await p.evaluate(() => {
  const s = window.__ribbonState.engine.sim.slide, P = s.outPos, B = s.outRuled;
  const o = [];
  for (let i = 276; i < 320; i += 3) o.push(`${i} p ${[P[i*3],P[i*3+1],P[i*3+2]].map(v=>v.toFixed(0)).join(",")} b ${[B[i*4],B[i*4+1],B[i*4+2]].map(v=>v.toFixed(3)).join(",")}`);
  return o.join("\n");
}));
await b.close();
