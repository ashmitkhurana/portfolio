// Android phone sweep of the live site (Playwright device profiles: Android Chrome UA, density, touch).
// usage: DEVICE="Pixel 7" OUT=<prefix> [BASE=https://www.ashmitkhurana.com] node scripts/journey/android.mjs
import { chromium, devices } from "playwright";
const base = process.env.BASE ?? "https://www.ashmitkhurana.com";
const dev = devices[process.env.DEVICE ?? "Pixel 7"];
const out = process.env.OUT;
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const ctx = await b.newContext({ ...dev });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push("pageerror: " + e.message.slice(0, 120)));
p.on("console", (m) => { if (m.type() === "error") errs.push("console: " + m.text().slice(0, 120)); });
const { width: W, height: H } = dev.viewport;
const cdp = await ctx.newCDPSession(p);
const drag = async (dy) => {
  const x = W / 2, y0 = dy > 0 ? H * 0.8 : H * 0.25;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
  for (let k = 1; k <= 12; k++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y0 - (dy * k) / 12 }] }); await p.waitForTimeout(16); }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
};
const shot = async (n) => p.screenshot({ path: `${out}_${n}.png` });
const at = (sel, q, below) => p.evaluate(([sel, q, below]) => {
  const s = document.querySelector(sel); const pin = s.querySelector("[data-pin]");
  const top = s.getBoundingClientRect().top + scrollY;
  return below ? top + q * innerHeight : top + q * (s.offsetHeight - pin.offsetHeight);
}, [sel, q, below]);
await p.goto(base + "/", { waitUntil: "networkidle" });
const live = await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 30000 }).then(() => true).catch(() => false);
const phase = await p.evaluate(() => `${window.__ribbonState?.phase} tier ${window.__ribbonState?.tier}`);
await shot("0hero");
const go = async (y, n, wait = 1800) => { await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(wait); await shot(n); };
await go(await at('[data-section="hero"]', 0.7), "1exit");
await go(await at('[data-section="unravel"]', 0.6), "2wave");
await go(await at('[data-section="work"]', 1.0, true), "3work");
for (const q of [0.3, 0.6, 0.82]) await go(await at('[data-section="build"]', q), "4coil", 700);
// one swipe: compress, spring, launch, page slides to Experience
await drag(140); await p.waitForTimeout(3200); await shot("5experience");
await go(await at('[data-section="experience"]', 0.45, true), "6descent");
// the terminal's screen (sticky room), fill by swiping, wrap, footer
const yT = await p.evaluate(() => document.querySelector('[data-section="terminal"]').getBoundingClientRect().top + scrollY);
await p.evaluate((y) => scrollTo(0, y - 60), yT); await p.waitForTimeout(900);
await drag(120); await p.waitForTimeout(900); await shot("7terminal");
for (let k = 0; k < 4; k++) { await drag(380); await p.waitForTimeout(150); }
await p.waitForTimeout(900); await shot("8wrap");
await p.waitForTimeout(10500); await shot("9footer");
const footY = await p.evaluate(() => Math.round(document.querySelector('[data-section="contact"]').getBoundingClientRect().top));
// menu + terminal overlay
await p.locator(".site-header button[aria-controls]").last().click(); await p.waitForTimeout(700); await shot("10menu");
await p.locator(".site-header button[aria-controls]").last().click(); await p.waitForTimeout(700);
await p.locator(".site-header button").first().click(); await p.waitForTimeout(600);
const inp = p.locator(".term-overlay input").first(); await inp.fill("help"); await inp.press("Enter"); await p.waitForTimeout(400); await shot("11term");
const term = await p.evaluate(() => { const i = document.querySelector(".term-overlay input").getBoundingClientRect(); return `prompt ${Math.round(i.top)}-${Math.round(i.bottom)} of ${innerHeight}`; });
await p.keyboard.press("Escape").catch(() => {});
// /contact
await p.goto(base + "/contact", { waitUntil: "networkidle" }); await p.waitForTimeout(8000); await shot("12contact");
const hOver = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
console.log(`${process.env.DEVICE} ${W}x${H}@${dev.deviceScaleFactor}: ${phase}, intro ${live}; footer top after fill ${footY}; ${term}; /contact h-overflow ${hOver}; errors: ${errs.length ? [...new Set(errs)].join(" | ") : "none"}`);
await b.close();
