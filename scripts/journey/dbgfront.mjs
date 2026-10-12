import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: +(process.env.W ?? 440), height: +(process.env.H ?? 956) }, ...(process.env.TOUCH === "1" ? { deviceScaleFactor: 3, isMobile: true, hasTouch: true } : {}) });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 }).catch(() => {});
const yT = await p.evaluate(() => document.querySelector('[data-section="terminal"]').getBoundingClientRect().top + scrollY);
for (const y of [yT - 300, yT - 40, yT + 1]) { await p.evaluate((y) => window.scrollTo(0, y), y); await p.waitForTimeout(600); }
if (process.env.TOUCH === "1") {
  const cdp = await p.context().newCDPSession(p);
  for (let k = 0; k < +(process.env.SWIPES ?? 3); k++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 200, y: 700 }] });
    for (let j = 1; j <= 10; j++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 200, y: 700 - 30 * j }] }); await p.waitForTimeout(16); }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
} else {
  await p.mouse.move(200, 400);
  for (let i = 0; i < 14; i++) { await p.mouse.wheel(0, 140); await p.waitForTimeout(50); }
}
await p.waitForTimeout(+(process.env.WAIT ?? 1600));
console.log(await p.evaluate(() => {
  const e = window.__ribbonState.engine, c = e.core;
  const st = e.stats ?? window.__ribbonState.stats;
  const px = c?.proxies ?? e.proxies;
  return JSON.stringify({ keys: Object.keys(window.__ribbonState), frontActive: st?.frontActive, maxZ: c?.ribbon?.maxZ, weave: c?.weave });
}));
console.log(await p.evaluate(() => {
  const els = document.elementsFromPoint(300, 338).slice(0, 8).map((e) => `${e.tagName}.${(e.className && e.className.baseVal === undefined ? e.className : "").toString().slice(0, 40)} z=${getComputedStyle(e).zIndex} pos=${getComputedStyle(e).position}`);
  const lay = [...document.querySelectorAll(".ribbon-layer")].map((l) => `${l.className} z=${getComputedStyle(l).zIndex} pos=${getComputedStyle(l).position} parent=${l.parentElement.className}`);
  return JSON.stringify({ els, lay }, null, 1);
}));
if (process.env.HIDE) { await p.evaluate((h) => { document.querySelector(".ribbon-layer--" + h).style.visibility = "hidden"; }, process.env.HIDE); await p.waitForTimeout(100); }
if (process.env.VIEW) { await p.evaluate((v) => { window.__ribbonState.engine.core.settings.debug.view = v; }, process.env.VIEW); await p.waitForTimeout(300); }
await p.screenshot({ path: process.argv[2] });
await b.close();
