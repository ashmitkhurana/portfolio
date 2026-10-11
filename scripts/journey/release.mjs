// How I Build, one gesture each way: coil in, one scroll down (frames every <step> ms), then one scroll up (frames).
// usage: node scripts/journey/release.mjs <outPrefix> <WxH> [frames=24] [stepMs=100]
import { chromium } from "playwright";
const [,, out, size, nArg = "24", stepArg = "100"] = process.argv;
const [w, h] = size.split("x").map(Number);
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: w, height: h } });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 }).catch(() => console.log("intro not settled"));
await p.evaluate(() => (window.__journeyDebug = {}));
const at = (q) => p.evaluate((q) => {
  const s = document.querySelector('[data-section="build"]');
  const pin = s.querySelector("[data-pin]");
  return s.getBoundingClientRect().top + scrollY + q * (s.offsetHeight - pin.offsetHeight);
}, q);
for (const q of [0.3, 0.6, 0.82]) {
  await p.evaluate((y) => window.scrollTo(0, y), await at(q));
  await p.waitForTimeout(800);
}
await p.screenshot({ path: `${out}_pre.png` });
const log = async (tag, i) => {
  const d = await p.evaluate(() => window.__journeyDebug);
  console.log(tag, i, "state", d.relState, "t", (d.relT ?? 0).toFixed(2), "s", (d.relS ?? 0).toFixed(2), "c", d.buildC, "V", Math.round(d.V));
};
// one scroll down
await p.mouse.move(w / 2, h / 2);
await p.mouse.wheel(0, 120);
for (let i = 0; i < +nArg; i++) {
  await p.waitForTimeout(+stepArg);
  await log("down", i);
  await p.screenshot({ path: `${out}_d${String(i).padStart(2, "0")}.png` });
}
await p.waitForTimeout(1500);
// one scroll up
await p.mouse.wheel(0, -120);
for (let i = 0; i < +nArg; i++) {
  await p.waitForTimeout(+stepArg);
  await log("up", i);
  await p.screenshot({ path: `${out}_u${String(i).padStart(2, "0")}.png` });
}
await b.close();
