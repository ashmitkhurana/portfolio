// Phone terminal: scroll to the terminal's screen (the gate), fill the bar with the wheel, then frames of the wrap and
// the footer every <stepMs>; then one scroll up (frames of the reverse).
// usage: node scripts/journey/termwrap.mjs <outPrefix> <WxH> [frames=40] [stepMs=250]
import { chromium } from "playwright";
const [,, out, size, nArg = "40", stepArg = "250"] = process.argv;
const [w, h] = size.split("x").map(Number);
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: w, height: h } });
p.on("pageerror", (e) => console.log("pageerror", e.message));
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 }).catch(() => console.log("intro not settled"));
const top = (sel) => p.evaluate((sel) => document.querySelector(sel).getBoundingClientRect().top + scrollY, sel);
const yT = await top('[data-section="terminal"]');
for (const y of [yT - 0.6 * h, yT - 0.3 * h, yT - 40, yT + 1]) {
  await p.evaluate((y) => window.scrollTo(0, y), y);
  await p.waitForTimeout(700);
}
await p.waitForTimeout(800);
await p.screenshot({ path: `${out}_gate.png` });
console.log("gate scroll", await p.evaluate(() => Math.round(scrollY)), "yT", Math.round(yT));
await p.mouse.move(w / 2, h / 2);
for (let i = 0; i < 6; i++) { await p.mouse.wheel(0, 140); await p.waitForTimeout(60); }
await p.waitForTimeout(200);
await p.screenshot({ path: `${out}_half.png` });
for (let i = 0; i < 12; i++) { await p.mouse.wheel(0, 140); await p.waitForTimeout(60); }
for (let i = 0; i < +nArg; i++) {
  await p.waitForTimeout(+stepArg);
  await p.screenshot({ path: `${out}_f${String(i).padStart(2, "0")}.png` });
  if (i < 12) console.log("f", i, await p.evaluate(() => Math.round(scrollY)));
}
console.log("scroll", await p.evaluate(() => Math.round(scrollY)), "foot", await top('[data-section="contact"]'));
await p.mouse.wheel(0, -160);
for (let i = 0; i < +nArg; i++) {
  await p.waitForTimeout(+stepArg);
  await p.screenshot({ path: `${out}_r${String(i).padStart(2, "0")}.png` });
}
console.log("after reverse scroll", await p.evaluate(() => Math.round(scrollY)), "gate", yT);
await b.close();
