import { chromium } from "playwright";
const [w, h] = (process.env.SIZE || "1512x860").split("x").map(Number);
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: w, height: h } });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 });
await p.evaluate(() => { window.__journeyDebug = {}; });
for (const f of (process.env.AT || "2.1,2.4,2.7,3.1").split(",")) {
  await p.evaluate((f) => window.scrollTo(0, innerHeight * f), +f);
  await p.waitForTimeout(1500);
  const d = await p.evaluate(() => {
    const s = window.__ribbonState.engine.sim.slide, P = s.outPos, D = s.cameraZ, W = innerWidth, H = innerHeight;
    const k = D / (D - P[2]);
    return { ...window.__journeyDebug, head: [W / 2 + P[0] * k, H / 2 - P[1] * k - s.offsetY].map((v) => +v.toFixed(0)), sig: +s.sigma.toFixed(0) };
  });
  console.log(f, JSON.stringify(d, (k, v) => typeof v === "number" ? +v.toFixed(2) : v));
}
await b.close();
