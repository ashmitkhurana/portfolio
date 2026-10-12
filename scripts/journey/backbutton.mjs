// home -> Contact (navbar) -> browser Back: the home page must load fresh; then scroll the journey
import { chromium } from "playwright";
const [W, H] = (process.env.SIZE ?? "1512x860").split("x").map(Number);
const touch = process.env.TOUCH === "1";
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: W, height: H }, ...(touch ? { deviceScaleFactor: 1, isMobile: true, hasTouch: true } : {}) });
p.on("pageerror", (e) => console.log("pageerror", e.message));
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 }).catch(() => {});
await p.evaluate(() => { window.__marker = 1; });
await p.evaluate(() => [...document.querySelectorAll("a")].find((x) => x.getAttribute("href") === "/contact")?.click());
await p.waitForTimeout(9000);
console.log("on", new URL(p.url()).pathname, "marker kept (client nav):", await p.evaluate(() => window.__marker === 1));
await p.goBack();
await p.waitForTimeout(1500);
console.log("back on", new URL(p.url()).pathname, "fresh load:", await p.evaluate(() => window.__marker === undefined));
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 }).catch(() => console.log("intro not settled"));
await p.waitForTimeout(800);
const out = process.env.OUT;
await p.screenshot({ path: `${out}_0.png` });
const sel = ['[data-section="hero"]', '[data-section="unravel"]', '[data-section="build"]'];
const qs = [0.7, 0.7, 0.82];
for (let i = 0; i < sel.length; i++) {
  const y = await p.evaluate(([s, q]) => { const e = document.querySelector(s); const pin = e.querySelector("[data-pin]"); return e.getBoundingClientRect().top + scrollY + q * (e.offsetHeight - (pin ? pin.offsetHeight : innerHeight)); }, [sel[i], qs[i]]);
  await p.evaluate((y) => window.scrollTo(0, y), y);
  await p.waitForTimeout(1800);
  await p.screenshot({ path: `${out}_${i + 1}.png` });
}
await b.close();
