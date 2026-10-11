// The Experience progress bar: reach the gate, scroll in bursts, watch fill / drain / full -> footer.
// usage: node scripts/journey/gate.mjs <outPrefix> [WxH]
import { chromium } from "playwright";
const [,, out, size = "1512x860"] = process.argv;
const [w, h] = size.split("x").map(Number);
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: w, height: h } });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 });
const at = (q) => p.evaluate((q) => { const s = document.querySelector(".exterm"); return s.getBoundingClientRect().top + scrollY + q * (s.offsetHeight - innerHeight); }, q);
for (const q of [0.5, 0.9, 0.97]) { await p.evaluate((y) => window.scrollTo(0, y), await at(q)); await p.waitForTimeout(700); }
await p.mouse.move(w / 2, h / 2);
const st = async (tag) => console.log(tag, JSON.stringify(await p.evaluate(() => { const b = document.querySelector(".fillbar"); return { fill: getComputedStyle(b).getPropertyValue("--fill"), on: b.hasAttribute("data-on"), y: Math.round(scrollY) }; })));
await p.mouse.wheel(0, 100); await p.waitForTimeout(400); await st("reached gate");
for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 100); await p.waitForTimeout(60); }
await st("after 6 wheels");
await p.screenshot({ path: `${out}_fill.png` });
await p.waitForTimeout(800); await st("after 0.8 s pause");
for (let i = 0; i < 30; i++) { await p.mouse.wheel(0, 100); await p.waitForTimeout(40); }
await st("after 30 wheels");
for (const t of [300, 700, 1200, 2000]) { await p.waitForTimeout(t === 300 ? 300 : t - [300, 700, 1200, 2000][[300, 700, 1200, 2000].indexOf(t) - 1]); await st(`+${t}ms`); await p.screenshot({ path: `${out}_run${t}.png` }); }
await b.close();
