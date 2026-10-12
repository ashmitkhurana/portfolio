#!/usr/bin/env node
/**
 * Colour-neutrality acceptance test for the ribbon (headless Chromium only).
 *
 *   node scripts/color-accept.mjs                       # acceptance: white / #0066ff / #808080
 *   node scripts/color-accept.mjs --mockup name          # screenshot of the default (Mockup) look -> <out>/mockup-<name>.png
 *   node scripts/color-accept.mjs --base http://localhost:3600 --out ./dir
 *
 * Needs a server running /lab (default http://localhost:3600; dev, or a build with NEXT_PUBLIC_LAB=1).
 *
 * How ribbon pixels are isolated: the pose is frozen (idle motion zeroed, snapped, N frames
 * stepped), the HTML is hidden, then the same frame is rendered over a black and over a white
 * background (grain, vignette, glow, floor shadow and dither off). A pixel belongs to the ribbon
 * iff it is identical in both renders, i.e. fully opaque ribbon (anti-aliased edge pixels differ
 * and drop out). Reported per case: mean HSV saturation (sRGB) of those pixels, the mean over
 * pixels with V > 0.2 (avoids noise on near-black), and the saturation-weighted circular mean hue.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const DEFAULT_OUT =
  "/private/tmp/claude-501/-Users-ashmitkhurana-Development-studio-portfolio/428f1961-b6ad-4758-ba30-ff5eb1800006/scratchpad/color";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}
const base = arg("base", "http://localhost:3600").replace(/\/$/, "");
const out = arg("out", DEFAULT_OUT);
const mockup = arg("mockup", "");
const patch = JSON.parse(arg("patch", "{}")); // extra settings for --mockup (look tuning)
mkdirSync(out, { recursive: true });

const W = 1440;
const H = 900;

const FREEZE = `
  const e = window.__ribbon;
  e.stop();
  e.patchSettings({
    sim: { idleAmplitude: 0, twistWobble: 0, idleCurl: 0, idleDetail: 0 },
    env: { autoRotate: false, rotationX: 0, rotationY: 0 },
    post: { adaptive: false, dither: false },
  });
  e.core.envYaw = 0;
  e.core.setReducedMotion(true);
  e.sim.snapToTarget();
`;

async function frame(page, extra) {
  await page.evaluate(
    ({ FREEZE, extra }) => {
      eval(FREEZE);
      if (extra) window.__ribbon.patchSettings(extra);
      const e = window.__ribbon;
      // make sure a pending (debounced) environment rebuild has happened
      e.applySettings(true);
      e.benchmark(30);
    },
    { FREEZE, extra },
  );
  await page.waitForTimeout(150);
}

/** screenshot with retries (a headless tab occasionally stalls waiting for a frame) */
async function snap(page, opts = {}) {
  for (let i = 0; ; i++) {
    try {
      return await page.screenshot({ type: "png", timeout: 15000, ...opts });
    } catch (err) {
      if (i >= 3) throw err;
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
    }
  }
}
async function shot(page) {
  return (await snap(page)).toString("base64");
}

/** runs in a scratch page: decode both PNGs and measure the pixels that are identical in both */
const MEASURE = async ({ a, b }) => {
  const load = async (b64) => {
    const bmp = await createImageBitmap(await (await fetch("data:image/png;base64," + b64)).blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(bmp, 0, 0);
    return g.getImageData(0, 0, bmp.width, bmp.height).data;
  };
  const A = await load(a);
  const B = await load(b);
  let n = 0, sS = 0, nV = 0, sSV = 0, sx = 0, sy = 0;
  for (let i = 0; i < A.length; i += 4) {
    if (A[i] !== B[i] || A[i + 1] !== B[i + 1] || A[i + 2] !== B[i + 2]) continue;
    const r = A[i] / 255, g = A[i + 1] / 255, bl = A[i + 2] / 255;
    const mx = Math.max(r, g, bl), mn = Math.min(r, g, bl), d = mx - mn;
    let h = 0;
    if (d > 0) {
      if (mx === r) h = ((g - bl) / d + 6) % 6;
      else if (mx === g) h = (bl - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    const s = mx === 0 ? 0 : d / mx;
    n++;
    sS += s;
    if (mx > 0.2) { nV++; sSV += s; }
    sx += Math.cos((h * Math.PI) / 180) * s;
    sy += Math.sin((h * Math.PI) / 180) * s;
  }
  const hue = ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360;
  return { pixels: n, meanSat: sS / Math.max(n, 1), meanSatV02: sSV / Math.max(nV, 1), hue };
};

const browser = await chromium.launch({
  headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-webgl"],
});
let failed = false;
try {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const scratch = await (await browser.newContext()).newPage();
  await scratch.goto("about:blank");
  page.on("pageerror", (e) => console.log("pageerror", e.message));
  await page.goto(`${base}/lab`, { waitUntil: "load" });
  await page.waitForFunction(() => !!window.__ribbon, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.addStyleTag({
    content: ".lab-pane,.lab-hud,nextjs-portal{display:none !important}.lab-hero{visibility:hidden !important}",
  });

  if (mockup) {
    // the default look, with the page chrome (HTML) hidden: only the ribbon over the backdrop
    await frame(page, { ...patch, background: { grain: 0, ...(patch.background ?? {}) } });
    const p = path.join(out, `mockup-${mockup}.png`);
    await snap(page, { path: p });
    console.log("wrote", p);
  } else {
    const cases = [
      { name: "white #ffffff", color: "#ffffff", expect: (m) => m.meanSat < 0.06 },
      { name: "blue #0066ff", color: "#0066ff", expect: (m) => Math.abs(m.hue - 216) < 8 && m.meanSat > 0.5 },
      { name: "grey #808080", color: "#808080", expect: (m) => m.meanSat < 0.06 },
    ];
    for (const c of cases) {
      const face = { color: c.color, specularColor: "#ffffff" };
      const common = {
        material: { faceA: face, faceB: face, edge: { mode: "custom", color: c.color } },
        background: { grain: 0, vignette: 0, gradient: 0 },
        shadows: { glow: false, floor: false, wall: false },
        contact: { enabled: false },
      };
      await frame(page, { ...common, background: { ...common.background, color: "#000000" } });
      const dark = await shot(page);
      await frame(page, { ...common, background: { ...common.background, color: "#ffffff" } });
      const light = await shot(page);
      const m = await scratch.evaluate(MEASURE, { a: dark, b: light });
      const slug = c.color.replace("#", "");
      await frame(page, { ...common, background: { ...common.background, color: "#000000" } });
      await snap(page, { path: path.join(out, `accept-${slug}.png`) });
      const ok = m.pixels > 5000 && c.expect(m);
      if (!ok) failed = true;
      console.log(
        `${ok ? "PASS" : "FAIL"} ${c.name}: ribbon px=${m.pixels}  mean sat=${m.meanSat.toFixed(4)}  ` +
          `mean sat (V>0.2)=${m.meanSatV02.toFixed(4)}  hue=${m.hue.toFixed(1)} deg`,
      );
    }
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
