// The engine's journey numbers at a size: ribbon length, ring spacing, camera distance, band half width, pins.
// usage: node scripts/journey/engnums.mjs <WxH>
import { chromium } from "playwright";
const [w, h] = (process.argv[2] || "1512x860").split("x").map(Number);
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: w, height: h } });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 }).catch(() => console.log("intro not settled"));
await p.evaluate(() => (window.__journeyDebug = {}));
await p.evaluate(() => window.scrollTo(0, innerHeight * 0.5));
await p.waitForTimeout(1500);
console.log(JSON.stringify(await p.evaluate(() => {
  const s = window.__ribbonState.engine.sim.slide;
  const e = s.end1();
  const pins = [...document.querySelectorAll("main [data-pin]")].map((el) => ({ pin: el.dataset.pin, h: el.offsetHeight, room: el.parentElement.offsetHeight - el.offsetHeight }));
  return { length: s.length, spacing: s.spacing, count: s.count, cameraZ: s.cameraZ, hw: e.hw, end: e.p, dbg: window.__journeyDebug, pins };
}), null, 1));
await b.close();
