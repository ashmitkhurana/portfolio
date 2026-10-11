// Frame strip of the scroll journey: waits for the intro, then scrolls to each Y (css px or "<k>vh") and shoots.
// usage: node scripts/journey/strip.mjs <outPrefix> <WxH> <y1,y2,...> [settleMs]
//   y: css px, "<k>vh", or "@<section>:<p>" = that section's pin progress p (0..1; negative = p viewport heights
//   before the section's top; "<q>h" = q viewport heights below the section's top, for sections without a pin)
import { chromium, webkit } from "playwright";
const [,, out, size, ys, settle = "1800"] = process.argv;
const [w, h] = size.split("x").map(Number);
const b = process.env.ENGINE === "webkit" ? await webkit.launch() : await chromium.launch({ args: ["--use-gl=angle"] });
// TOUCH=1: a phone (coarse pointer, touch, 3x screen): the engine's touch path (page-attached layers, full density)
const touch = process.env.TOUCH === "1";
const p = await b.newPage({ viewport: { width: w, height: h }, ...(touch ? { deviceScaleFactor: 3, isMobile: true, hasTouch: true } : {}) });
p.on("pageerror", (e) => console.log("pageerror", e.message));
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 }).catch(() => console.log("intro not settled"));
await p.waitForTimeout(800);
let i = 0;
for (const y of ys.split(",")) {
  const px = y.startsWith("@")
    ? await p.evaluate(([name, q, below]) => {
        const s = document.querySelector(`[data-section="${name}"]`);
        const pin = s.querySelector("[data-pin]");
        const top = s.getBoundingClientRect().top + scrollY;
        const room = pin ? s.offsetHeight - pin.offsetHeight : 0;
        return below || q < 0 ? top + q * innerHeight : top + q * room;
      }, [y.slice(1).split(":")[0], parseFloat(y.split(":")[1]), y.endsWith("h")])
    : y.endsWith("vh") ? parseFloat(y) * h / 100 : +y;
  await p.evaluate((px) => window.scrollTo(0, px), px);
  await p.waitForTimeout(+settle);
  const st = await p.evaluate(() => { const s = window.__ribbonState.engine.sim.slide; return `sigma ${s.sigma.toFixed(0)} tgt ${s.driveTarget.toFixed(0)} off ${s.offsetY.toFixed(0)}`; });
  console.log(size, y, st);
  await p.screenshot({ path: `${out}_${String(i++).padStart(2, "0")}.png` });
}
await b.close();
