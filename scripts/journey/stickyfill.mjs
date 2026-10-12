// Phone terminal (native sticky room): real touch drags scroll the page. Reports the terminal's screen position, the
// bar's fill, the drain, and the run to the footer. usage: SIZE=390x844 OUT=<prefix> node scripts/journey/stickyfill.mjs
import { chromium } from "playwright";
const [W, H] = (process.env.SIZE ?? "390x844").split("x").map(Number);
const out = process.env.OUT;
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 }).catch(() => {});
const cdp = await p.context().newCDPSession(p);
const drag = async (dy, steps = 12) => {
  const x = W / 2, y0 = dy > 0 ? H * 0.8 : H * 0.2;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
  for (let k = 1; k <= steps; k++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y0 - (dy * k) / steps }] }); await p.waitForTimeout(16); }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
};
const st = (tag) => p.evaluate((tag) => {
  const w = document.querySelector(".terminal-window").getBoundingClientRect();
  const bar = document.querySelector(".fillbar");
  return `${tag}: scroll ${Math.round(scrollY)} winTop ${Math.round(w.top)} fill ${bar.style.getPropertyValue("--fill")} barOn ${bar.hasAttribute("data-on")} foot ${Math.round(document.querySelector('[data-section="contact"]').getBoundingClientRect().top)}`;
}, tag);
const yE = await p.evaluate(() => document.querySelector(".exterm").getBoundingClientRect().top + scrollY);
await p.evaluate((y) => window.scrollTo(0, y), yE + 0.5 * H);
await p.waitForTimeout(900);
await p.evaluate((y) => window.scrollTo(0, y), yE + H - 30);
await p.waitForTimeout(900);
console.log(await st("near"));
await drag(260); await p.waitForTimeout(300);
console.log(await st("drag 260"));
if (out) await p.screenshot({ path: `${out}_partial.png` });
await p.waitForTimeout(2200);
console.log(await st("idle 2.2s (drained?)"));
await drag(400); await drag(400); await p.waitForTimeout(250);
console.log(await st("2 drags"));
await drag(400); await p.waitForTimeout(400);
console.log(await st("3rd drag"));
if (out) await p.screenshot({ path: `${out}_wrap.png` });
await drag(500); await p.waitForTimeout(200);
console.log(await st("drag during wrap"));
await p.waitForTimeout(11000);
console.log(await st("after 11 s"));
await p.waitForTimeout(4000);
console.log(await st("after 15 s (must still be at the footer)"));
if (out) await p.screenshot({ path: `${out}_foot.png` });
await drag(-300); await p.waitForTimeout(7000);
console.log(await st("swipe up + 7 s"));
if (out) await p.screenshot({ path: `${out}_back.png` });
await b.close();
