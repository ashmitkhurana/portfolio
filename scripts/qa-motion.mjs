#!/usr/bin/env node
/**
 * Slide-motion QA: loads /?motion=slide&tier=4 at 390x844 (headless), screenshots at t = 0.2, 1.0, 2.0, 4.5 s,
 * scrolls 400 px and screenshots after 1 s. Checks __ribbonState (slide mode, intro settled event).
 * Usage: BASE=http://localhost:4400 node scripts/qa-motion.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:4400";
const OUT = "docs/ribbon/motion/qa";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chromium", headless: true, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.addInitScript(() => {
  window.__introEvent = null;
  window.addEventListener("ribbon:intro-settled", () => (window.__introEvent = performance.now()));
});

const t0 = Date.now();
await page.goto(`${BASE}/?motion=slide&tier=4`, { waitUntil: "domcontentloaded" });
// time is measured from the first live frame (engine load is not part of the intro)
await page.waitForFunction(() => window.__ribbonState?.phase === "live", null, { timeout: 20000 }).catch(() => {});
const live0 = Date.now();
const probe = () =>
  page.evaluate(() => {
    const e = window.__ribbonState?.engine;
    const s = e?.sim;
    return {
      phase: window.__ribbonState?.phase,
      mode: s?.params.mode,
      sigma: s?.slide.sigma,
      length: s?.slide.length,
      settled: s?.slide.introSettled,
      stateFlag: window.__ribbonState?.introSettled,
      eventFired: window.__introEvent !== null,
      dataset: document.documentElement.dataset.ribbonIntro,
    };
  });
const log = [];
for (const t of [0.2, 1.0, 2.0, 4.5]) {
  const wait = t * 1000 - (Date.now() - live0);
  if (wait > 0) await page.waitForTimeout(wait);
  const p = await probe();
  log.push({ t, ...p });
  await page.screenshot({ path: `${OUT}/t${String(t).replace(".", "_")}.png` });
}
await page.evaluate(() => window.scrollBy(0, 400));
await page.waitForTimeout(1000);
const afterScroll = await probe();
log.push({ t: "scroll400+1s", ...afterScroll });
await page.screenshot({ path: `${OUT}/scroll400.png` });
console.log(JSON.stringify(log, null, 1));

const fails = [];
const last = log[3];
if (last.mode !== "slide") fails.push(`mode is ${last.mode}, expected slide`);
if (!last.settled || !last.eventFired || !last.stateFlag || last.dataset !== "settled") fails.push("intro settled event did not fire");
if (!(log[0].sigma < -0.3 * log[0].length)) fails.push(`at 0.2 s sigma should still be far off (got ${log[0].sigma})`);
if (!(Math.abs(last.sigma) < 5)) fails.push(`at 4.5 s sigma should be ~0 (got ${last.sigma})`);
if (!(afterScroll.sigma > 100)) fails.push(`after scrolling 400 px sigma should be > 100 (got ${afterScroll.sigma})`);
if (errors.length) console.log("page errors:", errors.slice(0, 5));
console.log(fails.length ? "FAIL\n" + fails.join("\n") : "PASS");
await browser.close();
process.exit(fails.length ? 1 : 0);
