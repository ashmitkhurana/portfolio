// The hero intro's timeline: ribbon progress (1 + sigma / length) and glyphs typed, every 250 ms.
// usage: node scripts/journey/introtime.mjs [WxH]
import { chromium } from "playwright";
const [w, h] = (process.argv[2] || "1512x860").split("x").map(Number);
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: w, height: h } });
await p.goto("http://localhost:3100/", { waitUntil: "domcontentloaded" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.ready, null, { timeout: 40000 });
const t0 = Date.now();
for (let i = 0; i < 40; i++) {
  const r = await p.evaluate(() => {
    const s = window.__ribbonState.engine.sim.slide;
    const g = document.querySelectorAll("#hero-title .glyph").length, typed = document.querySelectorAll("#hero-title .glyph.is-typed").length;
    return { p: 1 + s.sigma / s.length, typed, g, settled: s.introSettled };
  });
  console.log(((Date.now() - t0) / 1000).toFixed(2), "ribbon", (r.p * 100).toFixed(1) + "%", "typed", `${r.typed}/${r.g}`, r.settled ? "SETTLED" : "");
  if (r.settled) break;
  await p.waitForTimeout(250);
}
await b.close();
