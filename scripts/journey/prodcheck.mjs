// production build smoke test: the ribbon goes live, the journey runs, no page errors (BASE, SIZE, TOUCH)
import { chromium } from "playwright";
const base = process.env.BASE ?? "http://localhost:4300";
const [W, H] = (process.env.SIZE ?? "1512x860").split("x").map(Number);
const touch = process.env.TOUCH === "1";
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: W, height: H }, ...(touch ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 120)); });
await p.goto(base + "/", { waitUntil: "networkidle" });
const ok = await p.waitForFunction(() => window.__ribbonState?.introSettled, null, { timeout: 30000 }).then(() => true).catch(() => false);
await p.screenshot({ path: `${process.env.OUT}_0.png` });
for (const [s, q, i] of [["unravel", 0.6, 1], ["build", 0.82, 2]]) {
  const y = await p.evaluate(([s, q]) => { const e = document.querySelector(`[data-section="${s}"]`); const pin = e.querySelector("[data-pin]"); return e.getBoundingClientRect().top + scrollY + q * (e.offsetHeight - pin.offsetHeight); }, [s, q]);
  await p.evaluate((y) => window.scrollTo(0, y), y); await p.waitForTimeout(2000);
  await p.screenshot({ path: `${process.env.OUT}_${i}.png` });
}
console.log(`${W}x${H}: live ${await p.evaluate(() => window.__ribbonState?.phase)} intro settled ${ok}; errors: ${errs.length ? errs.join(" | ") : "none"}`);
await b.close();
