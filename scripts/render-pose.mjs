#!/usr/bin/env node
/**
 * Renders the live site hero at 390x844 with an arbitrary pose JSON substituted for ak-hero.json (headless Chromium, real GPU via Metal ANGLE).
 *
 *   node scripts/render-pose.mjs --pose path/to/pose.json --out docs/ribbon/turns/render_x [--base http://localhost:4100]
 *
 * Pose substitution: the server must be a build made with NEXT_PUBLIC_POSE_OVERRIDE=1 (lib/ribbon/poses/site.ts then reads
 * `window.__poseOverride`); this script injects the pose file with addInitScript before the page loads. ak-hero.json is never touched.
 *   NEXT_DIST_DIR=.next-ak NEXT_PUBLIC_POSE_OVERRIDE=1 npm run build && NEXT_DIST_DIR=.next-ak NEXT_PUBLIC_POSE_OVERRIDE=1 npx next start -p 4100
 *
 * Outputs (out dir):
 *   hero.png            full hero, 390x844 @ DPR 2 (780x1688)
 *   ribbon.png          same frame, ribbon only: the page text/UI is hidden with injected CSS (`.ribbon-content { visibility: hidden }`;
 *                       layout and the proxy rects are unchanged, so the weave still uses the real text boxes but the glyphs are not drawn)
 *   crop_<name>.png     3x crops of the cutout-px windows (cutout px / (852/390, 1846/844) = css px) of the full hero, rendered at DPR 3
 *   ribbon_crop_<name>.png   the same windows from the ribbon-only frame
 */
import { chromium } from "playwright";
import { readFileSync, mkdirSync, statSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, f) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : f;
};
const base = arg("base", "http://localhost:4100").replace(/\/$/, "");
const poseFile = path.resolve(arg("pose", path.join(root, "lib/ribbon/poses/ak-hero.json")));
const outDir = path.resolve(arg("out", path.join(root, "docs/ribbon/turns/render_baseline")));
mkdirSync(outDir, { recursive: true });
const pose = JSON.parse(readFileSync(poseFile, "utf8"));

const SX = 852 / 390, SY = 1846 / 844;
const CROPS = {
  apex: [180, 530, 480, 760],
  farleft: [0, 960, 330, 1260],
  scurve: [540, 1240, 852, 1580],
  bottomk: [480, 880, 852, 1260],
  wrap: [20, 740, 470, 1090],
  junction: [380, 780, 650, 1010],
  topk: [540, 640, 852, 930],
  endstrand: [480, 880, 720, 1260],
};
const clipOf = ([x0, y0, x1, y1]) => ({ x: x0 / SX, y: y0 / SY, width: (x1 - x0) / SX, height: (y1 - y0) / SY });

const browser = await chromium.launch({
  channel: "chromium",
  headless: true,
  args: ["--use-angle=metal", "--ignore-gpu-blocklist"],
});

async function open(dpr) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: dpr, reducedMotion: "no-preference" });
  await ctx.addInitScript((p) => {
    window.__poseOverride = p;
  }, pose);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.warn(`  [pageerror] ${e.message}`));
  await page.goto(`${base}/?tier=${arg("tier", "4")}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__ribbonState?.phase === "live", null, { timeout: 40000 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1500); // crossfade + pose snap settle
  if (dpr > 2) {
    // tier 4 caps the pixel ratio at 2: lift the cap through the engine's own settings API so the 3x crops are real 3x pixels
    await page.evaluate((d) => {
      const e = window.__ribbonState.engine;
      e.patchSettings({ post: { pixelRatioCap: d } });
      e.applySettings(true);
    }, dpr);
    await page.waitForTimeout(1500);
  }
  const info = await page.evaluate(() => ({
    canvases: [...document.querySelectorAll("canvas")].map((c) => `${c.width}x${c.height}`),
    override: !!window.__poseOverride,
  }));
  return { ctx, page, info };
}

let failed = false;
try {
  // DPR 2: hero + ribbon only
  {
    const { ctx, page, info } = await open(2);
    console.log("DPR2 canvases", info.canvases.join(" "));
    await page.screenshot({ path: path.join(outDir, "hero.png") });
    await page.addStyleTag({ content: ".ribbon-content { visibility: hidden !important; }" });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(outDir, "ribbon.png") });
    await ctx.close();
  }
  // DPR 3: the crops, full hero then ribbon only (skipped with --quick)
  if (!process.argv.includes("--quick")) {
    const { ctx, page, info } = await open(3);
    console.log("DPR3 canvases", info.canvases.join(" "));
    for (const [n, w] of Object.entries(CROPS)) await page.screenshot({ path: path.join(outDir, `crop_${n}.png`), clip: clipOf(w) });
    await page.addStyleTag({ content: ".ribbon-content { visibility: hidden !important; }" });
    await page.waitForTimeout(500);
    for (const [n, w] of Object.entries(CROPS)) await page.screenshot({ path: path.join(outDir, `ribbon_crop_${n}.png`), clip: clipOf(w) });
    await ctx.close();
  }
} catch (err) {
  failed = true;
  console.error(err);
} finally {
  await browser.close();
}
for (const f of readdirSync(outDir).sort()) console.log(`${f}  ${statSync(path.join(outDir, f)).size} B`);
process.exit(failed ? 1 : 0);
