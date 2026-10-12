// /contact (entrance finished) -> home via the logo: frames over the first seconds (hero intro, no reverse)
import { chromium } from "playwright";
const [W, H] = (process.env.SIZE ?? "1512x860").split("x").map(Number);
const touch = process.env.TOUCH === "1";
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: W, height: H }, ...(touch ? { deviceScaleFactor: 1, isMobile: true, hasTouch: true } : {}) });
p.on("pageerror", (e) => console.log("pageerror", e.message));
await p.goto("http://localhost:3100/contact", { waitUntil: "networkidle" });
await p.waitForTimeout(9000);
await p.locator("header a[href='/']").first().click();
const t0 = Date.now();
const ts = [0.15, 0.6, 1.4, 2.4, 3.4, 5.2];
for (let i = 0; i < ts.length; i++) {
  const w = ts[i] * 1000 - (Date.now() - t0);
  if (w > 0) await p.waitForTimeout(w);
  await p.screenshot({ path: `${process.env.OUT}_${i}.png` });
}
const hasName = await p.evaluate(() => { const g = [...document.querySelectorAll("#hero-title .glyph")]; return g.filter((x) => getComputedStyle(x).opacity === "1").length + "/" + g.length; });
console.log("name glyphs visible", hasName);
for (const sel of ['[data-section="unravel"]', '[data-section="build"]']) {
  const y = await p.evaluate((sel) => { const s = document.querySelector(sel); return s.getBoundingClientRect().top + scrollY + 0.7 * (s.offsetHeight - innerHeight); }, sel);
  await p.evaluate((y) => window.scrollTo(0, y), y); await p.waitForTimeout(1800);
  await p.screenshot({ path: `${process.env.OUT}_s${sel.length}.png` });
}
console.log(p.url(), await p.evaluate(() => { const s = window.__ribbonState.engine.sim.slide; return `settled ${s.introSettled} sigma ${s.sigma.toFixed(0)}`; }));
await b.close();
