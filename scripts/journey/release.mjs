// The How I Build release (time-based): scroll to the end of the pin, then a frame every <step> ms.
// usage: node scripts/journey/release.mjs <outPrefix> <WxH> [frames=24] [stepMs=100]
import { chromium } from "playwright";
const [,, out, size, nArg = "24", stepArg = "100"] = process.argv;
const [w, h] = size.split("x").map(Number);
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: w, height: h } });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.evaluate(() => (window.__journeyDebug = {}));
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 }).catch(() => console.log("intro not settled"));
const at = (q) => p.evaluate((q) => {
  const s = document.querySelector('[data-section="build"]');
  const pin = s.querySelector("[data-pin]");
  return s.getBoundingClientRect().top + scrollY + q * (s.offsetHeight - pin.offsetHeight);
}, q);
// coil and compress first (as a user would), then cross the trigger
// FIRE: the pin progress where the release starts (journey.ts BUILD_FIRE)
const FIRE = +(process.env.FIRE || 0.75);
for (const q of [0.3, 0.6, FIRE - 0.05, FIRE - 0.01]) {
  await p.evaluate((y) => window.scrollTo(0, y), await at(q));
  await p.waitForTimeout(700);
}
await p.screenshot({ path: `${out}_pre.png` });
await p.evaluate((y) => window.scrollTo(0, y), await at(FIRE + 0.003));
for (let i = 0; i < +nArg; i++) {
  await p.waitForTimeout(+stepArg);
  const d = await p.evaluate(() => window.__journeyDebug);
  console.log(i, "q", (d.relQ ?? -1).toFixed(2), "q2", (d.relQ2 ?? -1).toFixed(2), "c", d.buildC, "sigma", Math.round(d.sigma), "V", Math.round(d.V));
  await p.screenshot({ path: `${out}_${String(i).padStart(2, "0")}.png` });
}
await b.close();
