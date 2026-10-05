#!/usr/bin/env node
/**
 * Numeric pose QA on the LIVE engine (headless Chromium): loads the hero at several viewport sizes, lets the authored
 * pose settle and fails (exit 1) when
 *   - the strip is crinkled: curvature / roll reverse again and again within 3 widths, or the roll rate is too high
 *     (lib/ribbon/smooth.ts, fold zones excluded), or
 *   - a fold could not be built, or has an error issue (impossible turn, overlapping, ...).
 * Warnings (a very tight radius, a mismatch with the authored path) are printed, not failed.
 *
 *   node scripts/pose-check.mjs                       # http://localhost:3800
 *   node scripts/pose-check.mjs --base http://localhost:3300 --sizes 1512x982,390x844
 */
import { chromium } from "playwright";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const base = arg("base", "http://localhost:3800").replace(/\/$/, "");
const sizes = arg("sizes", "1512x982,1440x900,1920x1080,390x844").split(",").map((s) => s.split("x").map(Number));

const browser = await chromium.launch({ channel: "chromium", headless: true, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
let failed = false;
for (const [w, h] of sizes) {
  const page = await (await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })).newPage();
  await page.goto(`${base}/?tier=3`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__ribbonState && window.__ribbonState.engine, null, { timeout: 90000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2500);
  const r = await page.evaluate(() => {
    const e = window.__ribbonState.engine;
    e.sim.idleScale01 = 0;
    e.sim.snapToTarget();
    return new Promise((res) =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          res({
            smooth: e.ribbon.smoothnessReport(),
            folds: e.ribbon.foldReports.map((f) => ({ at: f.at, built: f.built, theta: f.theta, mismatch: f.mismatch, issues: f.issues })),
          }),
        ),
      ),
    );
  });
  const s = r.smooth;
  const lines = [];
  if (!s.ok) lines.push(`crinkled (curvature at ring ${s.curvatureAt}, roll at ${s.rollAt}, rate at ${s.rateAt}): curvature reversals ${s.curvature} (max 4), roll reversals ${s.roll} (max 2), roll rate ${s.rollRate.toFixed(2)} (max 1.6)`);
  if (r.folds.length !== 3) lines.push(`expected exactly 3 folds, found ${r.folds.length}`);
  for (const f of r.folds) {
    if (!f.built) lines.push(`fold at ${f.at.toFixed(3)} not built`);
    for (const i of f.issues) lines.push(`fold at ${f.at.toFixed(3)} ${i.level}: ${i.text}`);
  }
  const bad = !s.ok || r.folds.length !== 3 || r.folds.some((f) => !f.built || f.issues.some((i) => i.level === "error"));
  if (bad) failed = true;
  console.log(`${bad ? "FAIL" : "ok  "} ${w}x${h}  curvature ${s.curvature}  roll ${s.roll}  rate ${s.rollRate.toFixed(2)}  folds ${r.folds.length}`);
  for (const l of lines) console.log("     " + l);
  await page.context().close();
}
await browser.close();
process.exit(failed ? 1 : 0);
