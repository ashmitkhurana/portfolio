#!/usr/bin/env node
/**
 * Dumps the built ribbon geometry of a pose (390x844, DPR 1) for review.
 *
 *   node scripts/curve/dump-pose.mjs --pose <pose.json> --out <dir> [--base http://localhost:4100]
 *
 * Needs the NEXT_PUBLIC_POSE_OVERRIDE=1 server (see scripts/render-pose.mjs). Writes <out>/dump.json and <out>/ribbon.png.
 * dump.json: meta + body rings (c, B, N, T, hw, s) + fold/hairpin/smoothness/edge reports. World units px, +y up, camera looks down -z.
 * Playwright is resolved from RIBBON_MAIN (default: the main checkout) when this checkout has no node_modules.
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const mainRoot = process.env.RIBBON_MAIN || "/Users/ashmitkhurana/Development/studio/portfolio";
const req = createRequire(path.join(existsSync(path.join(root, "node_modules/playwright")) ? root : mainRoot, "package.json"));
const { chromium } = req("playwright");

const arg = (n, f) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : f;
};
const base = arg("base", "http://localhost:4100").replace(/\/$/, "");
const poseFile = path.resolve(arg("pose", path.join(mainRoot, "lib/ribbon/poses/ak-hero.json")));
const outDir = path.resolve(arg("out", path.join(root, "docs/ribbon/turns/curve/dump")));
mkdirSync(outDir, { recursive: true });
const pose = JSON.parse(readFileSync(poseFile, "utf8"));

const browser = await chromium.launch({ channel: "chromium", headless: true, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
let failed = false;
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: "no-preference" });
  await ctx.addInitScript((p) => {
    window.__poseOverride = p;
  }, pose);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.warn(`  [pageerror] ${e.message}`));
  await page.goto(`${base}/?tier=4`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__ribbonState?.phase === "live", null, { timeout: 40000 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1500);

  const dump = await page.evaluate(async () => {
    const e = window.__ribbonState.engine;
    e.sim.idleScale01 = 0;
    e.sim.snapToTarget();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const g = e.ribbon;
    const plain = (v) => JSON.parse(JSON.stringify(v, (k, x) => (ArrayBuffer.isView(x) ? Array.from(x) : x)));
    const rd = g.ringData;
    const R = g.totalRings, M = g.bodyRings, E = g.caps;
    const row = R * 4;
    const r4 = (v) => Math.round(v * 1e4) / 1e4;
    const c = [], B = [], N = [], T = [], hw = [], s = [];
    for (let i = E; i < E + M; i++) {
      const o = i * 4;
      c.push([r4(rd[o]), r4(rd[o + 1]), r4(rd[o + 2])]);
      hw.push(r4(rd[o + 3]));
      B.push([r4(rd[row + o]), r4(rd[row + o + 1]), r4(rd[row + o + 2])]);
      N.push([r4(rd[2 * row + o]), r4(rd[2 * row + o + 1]), r4(rd[2 * row + o + 2])]);
      T.push([r4(rd[3 * row + o]), r4(rd[3 * row + o + 1]), r4(rd[3 * row + o + 2])]);
      s.push(r4(rd[3 * row + o + 3]));
    }
    const cam = e.camera;
    cam.updateMatrixWorld(true);
    return {
      meta: {
        width: g.params.width,
        ht: g.profile.ht,
        M, E, R,
        viewW: e.width,
        viewH: e.height,
        proj: Array.from(cam.projectionMatrix.elements),
        view: Array.from(cam.matrixWorldInverse.elements),
        camPos: [cam.position.x, cam.position.y, cam.position.z],
      },
      c, B, N, T, hw, s,
      foldReports: plain(g.foldReports),
      hairpinReports: plain(g.hairpinReports),
      folds: plain(g.folds),
      smoothness: plain(g.smoothnessReport()),
      edge: plain(g.edgeReport(cam, e.width, e.height)),
    };
  });
  writeFileSync(path.join(outDir, "dump.json"), JSON.stringify(dump));
  console.log(`dump: M=${dump.meta.M} E=${dump.meta.E} width=${dump.meta.width} ht=${dump.meta.ht} view=${dump.meta.viewW}x${dump.meta.viewH} folds=${dump.foldReports.length} hairpins=${dump.hairpinReports.length}`);

  await page.addStyleTag({ content: ".ribbon-content { visibility: hidden !important; }" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(outDir, "ribbon.png") });
  await ctx.close();
} catch (err) {
  failed = true;
  console.error(err);
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
