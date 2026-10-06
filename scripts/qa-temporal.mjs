#!/usr/bin/env node
/**
 * Temporal stability QA of the LIVE hero (headless Chromium WITH GPU, never the user's browser).
 *
 * Static frames hide glitches. This loads the page the way a visitor does (no ?tier override,
 * desktop viewport, DPR 2), captures a stream of frames and measures how much any pixel changes
 * while the hero is supposed to be still.
 *
 *   NEXT_DIST_DIR=.next-s0 npx next build && NEXT_DIST_DIR=.next-s0 npx next start -p 3900 &
 *   node scripts/qa-temporal.mjs --label after --out <dir>
 *
 * Options
 *   --base  http://localhost:3900     --path /?debug=1       --size 1512x982   --dpr 2
 *   --secs 10 (steady capture)        --load-secs 3 (capture from navigation)
 *   --no-grain  patch the film grain off before the steady capture (only needed on builds
 *               whose grain is animated; the site's grain is static now)
 *   --label NAME   prefix of every output file       --out DIR
 *
 * Capture: CDP Page.startScreencast (lossless PNG, full device resolution) as fast as the browser
 * delivers frames. Two runs, each in a fresh browser context (no cached tier):
 *   load    capture starts at navigation and lasts --load-secs
 *   steady  load, wait 3 s, capture --secs
 *
 * Output (OUT/LABEL-*)
 *   steady-heatmap.png / load-heatmap.png    per-pixel temporal stddev (sqrt scale, 0..8/255)
 *   *-stats.json                             % of pixels over 2/255 and 0.5/255, frame rate,
 *                                            per-frame mean-luminance deltas (global pops)
 *   *-log.json                               window.__ribbonLog of that run
 *   steady-last.png                          the last frame (full resolution)
 *   steady-geometry.json                     distinct per-frame hashes of the ring data
 *
 * Exit 1 when the steady gate fails (see GATE below).
 */
import { chromium } from "playwright";
import sharp from "sharp";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const flag = (n) => process.argv.includes(`--${n}`);
const base = arg("base", "http://localhost:3900").replace(/\/$/, "");
const route = arg("path", "/?debug=1");
const [vw, vh] = arg("size", "1512x982").split("x").map(Number);
const dpr = Number(arg("dpr", "2"));
const steadySecs = Number(arg("secs", "10"));
const loadSecs = Number(arg("load-secs", "3"));
const label = arg("label", "run");
const outDir = path.resolve(arg("out", "scripts/.qa-temporal"));
mkdirSync(outDir, { recursive: true });
const noGrain = flag("no-grain");

/** GATE: after the first second of the steady capture, >= 99.9 % of pixels have stddev <= 0.5/255 */
const GATE_SD = 0.5;
const GATE_FRACTION = 0.999;

const browser = await chromium.launch({
  channel: "chromium",
  headless: true,
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"],
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** start a lossless full-resolution screencast; returns { stop() -> frames[] } */
async function startCast(page) {
  const client = await page.context().newCDPSession(page);
  const frames = [];
  client.on("Page.screencastFrame", (ev) => {
    frames.push({ ts: ev.metadata.timestamp, wall: Date.now(), data: ev.data });
    client.send("Page.screencastFrameAck", { sessionId: ev.sessionId }).catch(() => {});
  });
  await client.send("Page.startScreencast", {
    format: "png",
    maxWidth: Math.round(vw * dpr),
    maxHeight: Math.round(vh * dpr),
    everyNthFrame: 1,
  });
  return {
    async stop() {
      await client.send("Page.stopScreencast").catch(() => {});
      await client.detach().catch(() => {});
      return frames;
    },
  };
}

/** Welford per-pixel, per-channel stddev + per-frame mean luminance */
async function analyse(frames, fromMs, t0) {
  const use = frames.filter((f) => f.wall - t0 >= fromMs);
  if (use.length < 3) return { frames: use.length, error: "too few frames" };
  let w = 0;
  let h = 0;
  let mean = null;
  let m2 = null;
  const lum = [];
  let n = 0;
  for (const f of use) {
    const { data, info } = await sharp(Buffer.from(f.data, "base64")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    if (!mean) {
      w = info.width;
      h = info.height;
      mean = new Float32Array(w * h * 3);
      m2 = new Float32Array(w * h * 3);
    }
    if (info.width !== w || info.height !== h) continue;
    n++;
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      const d = v - mean[i];
      mean[i] += d / n;
      m2[i] += d * (v - mean[i]);
      sum += v;
    }
    lum.push(sum / data.length);
  }
  const px = w * h;
  const sd = new Float32Array(px);
  let over2 = 0;
  let over05 = 0;
  let maxSd = 0;
  for (let p = 0; p < px; p++) {
    const s = Math.sqrt(Math.max(m2[p * 3], m2[p * 3 + 1], m2[p * 3 + 2]) / Math.max(n - 1, 1));
    sd[p] = s;
    if (s > 2) over2++;
    if (s > GATE_SD) over05++;
    if (s > maxSd) maxSd = s;
  }
  const heat = Buffer.alloc(px * 3);
  for (let p = 0; p < px; p++) {
    // sqrt scale 0..8: black (still) -> deep red -> yellow -> white
    const v = Math.sqrt(Math.min(sd[p], 8) / 8);
    const o = p * 3;
    heat[o] = Math.min(255, Math.round(v * 2 * 255));
    heat[o + 1] = Math.max(0, Math.round((v * 2 - 1) * 255));
    heat[o + 2] = Math.max(0, Math.round((v * 3 - 2) * 255));
  }
  const dl = [];
  for (let i = 1; i < lum.length; i++) dl.push(lum[i] - lum[i - 1]);
  const ts = use.map((f) => f.ts);
  return {
    frames: n,
    width: w,
    height: h,
    seconds: ts.length > 1 ? ts[ts.length - 1] - ts[0] : 0,
    fps: ts.length > 1 ? (ts.length - 1) / (ts[ts.length - 1] - ts[0]) : 0,
    pctOver2: (100 * over2) / px,
    pctOver05: (100 * over05) / px,
    maxStd: maxSd,
    meanLuminanceRange: [Math.min(...lum), Math.max(...lum)],
    maxAbsLumDelta: dl.length ? Math.max(...dl.map(Math.abs)) : 0,
    lumDeltas: dl.map((x) => Math.round(x * 1000) / 1000),
    heat: await sharp(heat, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer(),
  };
}

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  pageerror:", e.message));
  return { ctx, page };
}

function save(name, buf) {
  writeFileSync(path.join(outDir, `${label}-${name}`), buf);
}

function describe(tag, a) {
  if (a.error) return `${tag}: ${a.error} (${a.frames} frames)`;
  return (
    `${tag}: ${a.frames} frames, ${a.fps.toFixed(1)} fps, ${a.width}x${a.height}\n` +
    `   pixels with stddev > 2/255: ${a.pctOver2.toFixed(3)} %    > ${GATE_SD}/255: ${a.pctOver05.toFixed(3)} %    max ${a.maxStd.toFixed(2)}\n` +
    `   mean luminance ${a.meanLuminanceRange.map((x) => x.toFixed(2)).join(" .. ")}, max |frame-to-frame delta| ${a.maxAbsLumDelta.toFixed(3)}`
  );
}

// ---------------------------------------------------------------------------------- load run
{
  const { ctx, page } = await newPage();
  const t0 = Date.now();
  const cast = await startCast(page);
  await page.goto(`${base}${route}`, { waitUntil: "commit" });
  await sleep(loadSecs * 1000);
  const frames = await cast.stop();
  const log = await page.evaluate(() => (window.__ribbonLog ? [...window.__ribbonLog] : null)).catch(() => null);
  const a = await analyse(frames, 0, t0);
  const late = await analyse(frames, 1000, t0);
  if (a.heat) save("load-heatmap.png", a.heat);
  if (late.heat) save("load-after1s-heatmap.png", late.heat);
  const strip = (x) => ({ ...x, heat: undefined });
  save("load-stats.json", JSON.stringify({ all: strip(a), after1s: strip(late) }, null, 1));
  save("load-log.json", JSON.stringify(log, null, 1));
  console.log(describe("LOAD   (first " + loadSecs + " s, from navigation)", a));
  console.log(describe("LOAD   (after 1 s)", late));
  console.log(`   log events: ${log ? log.length : "n/a"}`);
  await ctx.close();
}

// -------------------------------------------------------------------------------- steady run
let gateFail = false;
{
  const { ctx, page } = await newPage();
  await page.goto(`${base}${route}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__ribbonState && window.__ribbonState.phase === "live", null, { timeout: 90000 }).catch(() => {});
  await sleep(3000);
  const state = await page.evaluate(() => {
    const s = window.__ribbonState;
    return s && { phase: s.phase, tier: s.tier, reason: s.reason, dpr: s.engine && s.engine.pixelRatio, samples: s.engine && s.engine.core.effectiveSamples };
  });
  console.log("STEADY state:", JSON.stringify(state));
  if (noGrain) {
    await page.evaluate(() => window.__ribbonState.engine.patchSettings({ background: { grain: 0 } }));
    await sleep(800);
  }
  const logBefore = await page.evaluate(() => (window.__ribbonLog ? window.__ribbonLog.length : 0));
  const tStart = await page.evaluate(() => performance.now());
  const t0 = Date.now();
  const cast = await startCast(page);
  // geometry determinism: hash of the ring texture data on every animation frame while capturing
  const geo = page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const e = window.__ribbonState && window.__ribbonState.engine;
        const rd = e && e.ribbon && e.ribbon.ringData;
        if (!rd) return resolve(null);
        const u = new Uint32Array(rd.buffer, rd.byteOffset, rd.length);
        const seen = new Map();
        let frames = 0;
        const end = performance.now() + ms;
        const tick = () => {
          let h = 2166136261;
          for (let i = 0; i < u.length; i++) h = Math.imul(h ^ u[i], 16777619) >>> 0;
          seen.set(h, (seen.get(h) || 0) + 1);
          frames++;
          if (performance.now() < end) requestAnimationFrame(tick);
          else resolve({ frames, distinct: seen.size });
        };
        requestAnimationFrame(tick);
      }),
    steadySecs * 1000,
  );
  await sleep(steadySecs * 1000);
  const frames = await cast.stop();
  const geometry = await geo;
  const log = await page.evaluate(() => (window.__ribbonLog ? [...window.__ribbonLog] : null)).catch(() => null);
  const a = await analyse(frames, 1000, t0);
  if (a.heat) save("steady-heatmap.png", a.heat);
  if (frames.length) save("steady-last.png", Buffer.from(frames[frames.length - 1].data, "base64"));
  const during = log ? log.filter((e) => e.t >= tStart) : null;
  save("steady-stats.json", JSON.stringify({ state, geometry, eventsDuringCapture: during, ...a, heat: undefined }, null, 1));
  save("steady-log.json", JSON.stringify(log, null, 1));
  save("steady-geometry.json", JSON.stringify(geometry));
  console.log(describe("STEADY (capture " + steadySecs + " s, first 1 s skipped)", a));
  console.log(`   geometry: ${geometry ? `${geometry.distinct} distinct ring-data hashes over ${geometry.frames} frames` : "n/a"}`);
  console.log(`   log: ${log ? log.length : "n/a"} events total, ${during ? during.length : "n/a"} during the capture (${logBefore} before)`);
  if (during && during.length) {
    const counts = {};
    for (const e of during) counts[e.type] = (counts[e.type] || 0) + 1;
    console.log("   events during capture:", JSON.stringify(counts));
  }
  const pass = !a.error && a.pctOver05 <= (1 - GATE_FRACTION) * 100;
  const quiet = !during || during.length === 0;
  const still = !geometry || geometry.distinct === 1;
  console.log(
    `GATE  pixels stddev<=${GATE_SD}/255: ${a.error ? "n/a" : (100 - a.pctOver05).toFixed(3) + " %"} (need >= ${GATE_FRACTION * 100} %) ${pass ? "PASS" : "FAIL"}` +
      `   log quiet: ${quiet ? "PASS" : "FAIL"}   geometry bit-identical: ${still ? "PASS" : "FAIL"}`,
  );
  gateFail = !(pass && quiet && still);
  await ctx.close();
}

await browser.close();
process.exit(gateFail ? 1 : 0);
