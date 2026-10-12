#!/usr/bin/env node
/**
 * Renders the ribbon posters (T0 <noscript> / T1 fallback layers).
 *
 *   node scripts/render-posters.mjs                      # every entry of lib/ribbon/posters.json
 *   node scripts/render-posters.mjs --only hero-phone    # one entry
 *   node scripts/render-posters.mjs --base http://localhost:3500
 *
 * Data-driven: lib/ribbon/posters.json is a list of { set, name, pose, route,
 * time, idle, media, viewport:{width,height,dpr} }. Poses change later (AK etc.):
 * edit the list (or the pose), re-run this script, commit public/ribbon/posters/.
 *
 * How: headless Chromium WITH GPU (Metal ANGLE on macOS) loads the real page
 * (`<route>?tier=4&capture=1`, so the real HTML proxies weave the ribbon), the
 * engine freezes the pose at `time` / `idle` (default: the static pose, exactly what
 * prefers-reduced-motion shows) and hands back both layers:
 *   front  the transparent canvas above the HTML       -> PNG as is
 *   back   the OPAQUE canvas below the HTML. Rendered twice (pure black and pure
 *          white background, no vignette / grain / dither / glow) and turned into a
 *          transparent layer by difference matting: a = 1 - (white - black),
 *          colour = black / a. It composites over the page `--bg` exactly.
 * Both are encoded to AVIF + WebP (sharp, which ships with Next) in public/ribbon/posters/.
 *
 * Needs a running server (production build or dev) and Playwright.
 */
import { chromium } from "playwright";
import sharp from "sharp";
import { readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(path.join(root, "lib/ribbon/posters.json"), "utf8"));

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}
const base = arg("base", "http://localhost:3500").replace(/\/$/, "");
const only = arg("only", "");
const outDir = path.join(root, "public", manifest.dir.replace(/^\//, ""));
mkdirSync(outDir, { recursive: true });

const png = (dataUrl) => Buffer.from(dataUrl.split(",")[1], "base64");

/** transparent RGBA from the same frame rendered over black and over white */
async function matte(blackUrl, whiteUrl) {
  const k = await sharp(png(blackUrl)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = await sharp(png(whiteUrl)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = k.info;
  const out = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    const d = (w.data[o] - k.data[o] + (w.data[o + 1] - k.data[o + 1]) + (w.data[o + 2] - k.data[o + 2])) / 3;
    let a = 1 - d / 255;
    a = a < 0 ? 0 : a > 1 ? 1 : a;
    if (a < 2 / 255) continue; // transparent (noise floor)
    out[o] = Math.min(255, Math.round(k.data[o] / a));
    out[o + 1] = Math.min(255, Math.round(k.data[o + 1] / a));
    out[o + 2] = Math.min(255, Math.round(k.data[o + 2] / a));
    out[o + 3] = Math.round(a * 255);
  }
  return { data: out, width, height };
}

async function write(img, name, layer) {
  const sh = () =>
    sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } });
  const files = [];
  for (const fmt of manifest.formats) {
    const file = path.join(outDir, `${name}-${layer}.${fmt}`);
    if (fmt === "avif") await sh().avif({ quality: 62, effort: 6, chromaSubsampling: "4:4:4" }).toFile(file);
    else if (fmt === "webp") await sh().webp({ quality: 86, alphaQuality: 92, effort: 6 }).toFile(file);
    else await sh().png().toFile(file);
    files.push(file);
  }
  return files;
}

const list = manifest.posters.filter((p) => !only || p.name === only || p.set === only);
if (list.length === 0) {
  console.error("no matching poster entries");
  process.exit(1);
}

const browser = await chromium.launch({
  channel: "chromium", // full Chromium in new headless mode: real GPU (Metal ANGLE)
  headless: true,
  args: ["--use-angle=metal", "--ignore-gpu-blocklist"],
});
let failed = false;
try {
  for (const p of list) {
    const ctx = await browser.newContext({
      viewport: { width: p.viewport.width, height: p.viewport.height },
      deviceScaleFactor: p.viewport.dpr,
      reducedMotion: "no-preference",
    });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.warn(`  [pageerror] ${e.message}`));
    await page.goto(`${base}${p.route}?tier=4&capture=1`, { waitUntil: "load" });
    await page.waitForFunction(() => window.__ribbonCapture && window.__ribbonState?.phase === "live", null, { timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    const opts = { pose: p.pose, time: p.time ?? 0, idle: p.idle ?? 0 };
    const black = await page.evaluate((o) => window.__ribbonCapture({ ...o, matte: "black" }), opts);
    const white = await page.evaluate((o) => window.__ribbonCapture({ ...o, matte: "white" }), opts);
    const back = await matte(black.back, white.back);
    const front = await sharp(png(black.front)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const files = [
      ...(await write(back, p.name, "back")),
      ...(await write({ data: front.data, width: front.info.width, height: front.info.height }, p.name, "front")),
    ];
    console.log(`${p.name}: ${back.width}x${back.height}`);
    for (const f of files) console.log(`  ${path.relative(root, f)}`);
    await ctx.close();
  }
} catch (err) {
  failed = true;
  console.error(err);
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
