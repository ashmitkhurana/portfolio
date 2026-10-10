// Does sliding change the shape? Dump L/R edges at scroll 0 and a few scroll positions inside the hero pin.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const [,, out, size = "1512x860"] = process.argv;
const [w, h] = size.split("x").map(Number);
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: w, height: h } });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 });
const res = {};
for (const y of [0, 40, 120, 300]) {
  await p.evaluate((y) => window.scrollTo(0, y), y);
  await p.waitForTimeout(2500);
  res[y] = await p.evaluate(() => { const s = window.__ribbonState.engine.sim.slide; return { sigma: s.sigma, pos: Array.from(s.outPos), ruled: Array.from(s.outRuled), camZ: s.cameraZ }; });
}
writeFileSync(out, JSON.stringify(res));
await b.close();
