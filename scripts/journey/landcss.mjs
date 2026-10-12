import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForTimeout(2000);
console.log(await p.evaluate(() => {
  const q = matchMedia("(orientation: landscape) and (max-height: 540px) and (hover: none)").matches;
  const r = (sel) => { const e = document.querySelector(sel); if (!e) return sel + " -"; const c = getComputedStyle(e); return `${sel}: pos ${c.position} h ${Math.round(e.offsetHeight)} minh ${c.minHeight}`; };
  return [`mq ${q}`, r(".build"), r(".build__pin"), r(".build .container"), r(".exterm"), r(".exterm__pin"), r(".work__pin")].join("\n");
}));
await b.close();
