// phone coil close-up with one lighting term switched off: node scripts/journey/coillight.mjs <out> '<json settings patch>'
import { chromium } from "playwright";
const [,, out, patch = "{}"] = process.argv;
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 }).catch(() => {});
await p.evaluate(() => { const s = document.querySelector('[data-section="build"]'); const pin = s.querySelector("[data-pin]"); window.scrollTo(0, s.getBoundingClientRect().top + scrollY + 0.82 * (s.offsetHeight - pin.offsetHeight)); });
await p.waitForTimeout(2500);
await p.evaluate((patch) => {
  const e = window.__ribbonState.engine, s = e.core.settings;
  const merge = (a, b) => { for (const k in b) { if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k])) merge(a[k], b[k]); else a[k] = b[k]; } };
  merge(s, JSON.parse(patch));
  e.applySettings(true);
}, patch);
await p.waitForTimeout(1200);
await p.screenshot({ path: out, clip: { x: 30, y: 90, width: 210, height: 150 } });
await b.close();
