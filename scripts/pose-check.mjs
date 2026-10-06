#!/usr/bin/env node
/**
 * Numeric pose QA on the LIVE engine (headless Chromium): loads the hero at several viewport sizes, lets the authored
 * pose settle and fails (exit 1) when
 *   - the strip is crinkled: curvature / roll reverse again and again within 3 widths, or the roll rate is too high
 *     (lib/ribbon/smooth.ts, fold zones excluded), or
 *   - a fold could not be built, or has an error issue (impossible turn, overlapping, ...), or
 *   - the desktop pose does not have the expected turn structure: exactly ONE true rounded fold (the A apex) and three
 *     ROLLED HAIRPINS (the K tips and the S turn: bracelet-like U-turns the curvature frames roll, never folds), each
 *     hairpin really turning > 150 degrees with a centreline radius inside 0.3 - 2.5 band widths.
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
const sizes = arg("sizes", "1280x800,1440x900,1512x982,1920x1080,2560x1080,390x844").split(",").map((s) => s.split("x").map(Number));

/** the turn structure the desktop pose (>= 768 px wide) must have */
const EXPECTED = { folds: ["a-apex"], hairpins: ["k-upper", "k-lower", "s-turn"] };
/** the phone pose predates it (three folds, no hairpins) and is left alone */
const PHONE_FOLDS = 3;

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
            edge: e.ribbon.edgeReport(e.camera, e.width, e.height),
            folds: e.ribbon.foldReports.map((f, i) => ({
              at: f.at,
              name: e.ribbon.folds[i]?.name ?? null,
              built: f.built,
              theta: f.theta,
              mismatch: f.mismatch,
              issues: f.issues,
            })),
            hairpins: e.ribbon.hairpinReports.map((h) => ({ name: h.name, turn: h.turn, radiusW: h.radiusW, rolled: h.rolled })),
          }),
        ),
      ),
    );
  });
  const s = r.smooth;
  const lines = [];
  if (!s.ok) lines.push(`crinkled (curvature at ring ${s.curvatureAt}, roll at ${s.rollAt}, rate at ${s.rateAt}): curvature reversals ${s.curvature} (max 4), roll reversals ${s.roll} (max 2), roll rate ${s.rollRate.toFixed(2)} (max 1.6)`);
  const desktop = w >= 768;
  const foldNames = r.folds.map((f) => f.name);
  const hairNames = r.hairpins.map((h) => h.name);
  let structureOk = true;
  if (desktop) {
    if (JSON.stringify(foldNames) !== JSON.stringify(EXPECTED.folds)) {
      lines.push(`expected folds [${EXPECTED.folds}], found [${foldNames}]`);
      structureOk = false;
    }
    if (JSON.stringify([...hairNames].sort()) !== JSON.stringify([...EXPECTED.hairpins].sort())) {
      lines.push(`expected hairpins [${EXPECTED.hairpins}], found [${hairNames}]`);
      structureOk = false;
    }
    for (const h of r.hairpins) {
      const deg = (h.turn * 180) / Math.PI;
      if (!h.rolled) {
        lines.push(`hairpin ${h.name} only turns ${deg.toFixed(0)} degrees (needs > 150): it is not a hairpin`);
        structureOk = false;
      }
      if (h.radiusW < 0.3 || h.radiusW > 2.5) {
        lines.push(`hairpin ${h.name}: centreline radius ${h.radiusW.toFixed(2)} widths outside 0.3 - 2.5`);
        structureOk = false;
      }
    }
  } else if (r.folds.length !== PHONE_FOLDS) {
    lines.push(`expected exactly ${PHONE_FOLDS} folds on the phone pose, found ${r.folds.length}`);
    structureOk = false;
  }
  for (const f of r.folds) {
    if (!f.built) lines.push(`fold at ${f.at.toFixed(3)} not built`);
    for (const i of f.issues) lines.push(`fold at ${f.at.toFixed(3)} ${i.level}: ${i.text}`);
  }
  // projected band-edge smoothness (notches the eye sees); the phone pose has a known tight hairpin (warn only below 768 px)
  const ed = r.edge;
  if (!ed.ok) lines.push(`edge kink ${ed.kink.toFixed(1)} > ${ed.limit} at ring ${ed.kinkAt} (${ed.edge} edge)${w < 768 ? " [warning: phone pose]" : ""}`);
  const bad = (!ed.ok && w >= 768) || !s.ok || !structureOk || r.folds.some((f) => !f.built || f.issues.some((i) => i.level === "error"));
  if (bad) failed = true;
  console.log(`${bad ? "FAIL" : "ok  "} ${w}x${h}  curvature ${s.curvature}  roll ${s.roll}  rate ${s.rollRate.toFixed(2)}  folds ${r.folds.length} hairpins ${r.hairpins.length}${r.hairpins.length ? ` (turn ${r.hairpins.map((h) => ((h.turn * 180) / Math.PI).toFixed(0)).join("/")}, r ${r.hairpins.map((h) => h.radiusW.toFixed(2)).join("/")} w)` : ""}  edge kink ${ed.kink.toFixed(1)} (max ${ed.limit})  jerk ${ed.jerk.toFixed(0)}`);
  for (const l of lines) console.log("     " + l);
  await page.context().close();
}
await browser.close();
process.exit(failed ? 1 : 0);
