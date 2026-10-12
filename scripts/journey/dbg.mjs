import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: 1512, height: 860 } });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 });
console.log(await p.evaluate(() => {
  const e = window.__ribbonState.engine, sl = e.sim.slide;
  const g = document.querySelectorAll("#hero-title .glyph").length;
  return { camZ: sl.cameraZ, ready: sl.ready, len: sl.length, glyphs: g, driven: sl.params.driven, W: e.width, H: e.height, hasBF: typeof e.beforeFrame };
}));
await b.close();
