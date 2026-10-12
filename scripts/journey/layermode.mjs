// touch phone: the ribbon layers' mode (fixed while a pin is stuck / riding the page) inside the terminal's room
import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 }).catch(() => {});
const yT = await p.evaluate(() => document.querySelector('[data-section="terminal"]').getBoundingClientRect().top + scrollY);
for (const dy of [-200, 0, 150, 400]) {
  await p.evaluate((y) => window.scrollTo(0, y), yT + dy);
  await p.waitForTimeout(700);
  console.log(dy, await p.evaluate(() => { const l = document.querySelector(".ribbon-layer--front"); return `${l.style.position || "fixed"} ${l.style.transform} winTop ${Math.round(document.querySelector(".terminal-window").getBoundingClientRect().top)}`; }));
}
await b.close();
