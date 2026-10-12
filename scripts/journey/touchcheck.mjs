// Touch-phone checks of the engine's touch path: pixel ratio, buffer size, layer mode at scroll positions.
// usage: node scripts/journey/touchcheck.mjs <WxH> <y1,y2,..> (css px or "<k>vh")
import { chromium, webkit } from "playwright";
const [w, h] = (process.argv[2] || "402x874").split("x").map(Number);
const b = process.env.ENGINE === "webkit" ? await webkit.launch() : await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 }).catch(() => console.log("intro not settled"));
for (const y of (process.argv[3] || "0").split(",")) {
  const px = y.endsWith("vh") ? (parseFloat(y) * h) / 100 : +y;
  await p.evaluate((px) => window.scrollTo(0, px), px);
  await p.waitForTimeout(1200);
  console.log(y, JSON.stringify(await p.evaluate(() => {
    const e = window.__ribbonState.engine;
    const layer = document.querySelector(".ribbon-layer--front");
    const c = layer.querySelector("canvas");
    return { pr: e.pixelRatio, css: [e.width, e.height], buf: [c.width, c.height], canvasCss: [c.clientWidth, c.clientHeight], tier: e.tier, pos: layer.style.position || "fixed", tf: layer.style.transform, scroll: Math.round(scrollY) };
  })));
}
await b.close();
