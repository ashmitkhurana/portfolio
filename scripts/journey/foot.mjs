// The footer sequence at fixed timeline moments (window.__footT): fill the bar, then freeze t and shoot.
// usage: node scripts/journey/foot.mjs <outPrefix> <WxH> <t1,t2,..>
import { chromium } from "playwright";
const [,, out, size = "1512x860", ts = "2,3,4"] = process.argv;
const [w, h] = size.split("x").map(Number);
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: w, height: h } });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 });
const at = (q) => p.evaluate((q) => { const s = document.querySelector(".exterm"); return s.getBoundingClientRect().top + scrollY + q * (s.offsetHeight - innerHeight); }, q);
for (const q of [0.5, 0.9, 0.97]) { await p.evaluate((y) => window.scrollTo(0, y), await at(q)); await p.waitForTimeout(700); }
await p.mouse.move(w / 2, h / 2);
await p.mouse.wheel(0, 100);
await p.waitForTimeout(400);
await p.evaluate(() => (window.__footT = 0));
for (let i = 0; i < 24; i++) { await p.mouse.wheel(0, 100); await p.waitForTimeout(30); }
await p.waitForTimeout(2500); // the page scroll to the footer
let i = 0;
for (const t of ts.split(",").map(Number)) {
  await p.evaluate((t) => (window.__footT = t), t);
  await p.waitForTimeout(900);
  await p.screenshot({ path: `${out}_${String(i++).padStart(2, "0")}.png` });
  console.log("t", t, "->", `${out}_${String(i - 1).padStart(2, "0")}.png`);
}
await b.close();
