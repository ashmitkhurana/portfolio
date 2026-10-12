// Phone (touch) gate: scroll onto the terminal's screen, swipe up with real touch events (CDP), report the bar's fill.
import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 }).catch(() => {});
const yT = await p.evaluate(() => document.querySelector('[data-section="terminal"]').getBoundingClientRect().top + scrollY);
for (const y of [yT - 300, yT - 40, yT + 1]) { await p.evaluate((y) => window.scrollTo(0, y), y); await p.waitForTimeout(600); }
const cdp = await p.context().newCDPSession(p);
const fillNow = () => p.evaluate(() => getComputedStyle(document.querySelector(".fillbar")).getPropertyValue("--fill") || document.querySelector(".fillbar").style.getPropertyValue("--fill"));
const swipe = async (y0, y1) => {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 200, y: y0 }] });
  for (let k = 1; k <= 10; k++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 200, y: y0 + ((y1 - y0) * k) / 10 }] }); await p.waitForTimeout(16); }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
};
console.log("gate scroll", await p.evaluate(() => Math.round(scrollY)), "yT", Math.round(yT), "fill", await fillNow());
await swipe(650, 350);
console.log("after 1 swipe: scroll", await p.evaluate(() => Math.round(scrollY)), "fill", await fillNow());
await swipe(650, 350); await swipe(650, 350);
await p.waitForTimeout(3500);
console.log("after 3 swipes + 3.5 s: scroll", await p.evaluate(() => Math.round(scrollY)), "fill", await fillNow());
await p.waitForTimeout(9000);
const yF = await p.evaluate(() => document.querySelector('[data-section="contact"]').getBoundingClientRect().top + scrollY);
console.log("footer: scroll", await p.evaluate(() => Math.round(scrollY)), "yFoot", Math.round(yF));
await b.close();
