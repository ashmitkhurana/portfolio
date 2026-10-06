#!/usr/bin/env node
/**
 * S2c driver: loads scratchpad/fit/desktop/result_s2c/s2c_input.json into /lab/fit (window.__s2c), calibrates the roll,
 * optionally refines (z offsets, roll offsets, turn radii), and writes overlay / silhouette / summary / pose points.
 *
 *   node scripts/s2c/run.mjs --base http://localhost:3961 [--refine] [--gens 60] [--wscale 1] [--sign 1] [--write-pose]
 */
import { chromium } from "playwright";
import sharp from "sharp";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRATCH = "/private/tmp/claude-501/-Users-ashmitkhurana-Development-studio-portfolio/428f1961-b6ad-4758-ba30-ff5eb1800006/scratchpad/fit/desktop";
const OUT = path.join(SCRATCH, "result_s2c");
const flag = (n) => process.argv.includes(`--${n}`);
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const base = arg("base", "http://localhost:3961").replace(/\/$/, "");
const decode = (u) => Buffer.from(u.split(",")[1], "base64");

async function buildData() {
  const W = 1672;
  const H = 941;
  const rd = async (f) => await sharp(path.join(SCRATCH, f)).removeAlpha().raw().toBuffer();
  const [rib, txt, exc, cls] = await Promise.all([rd("ribbon_mask.png"), rd("text_mask.png"), rd("exclusion_mask.png"), rd("shading_classes.png")]);
  const out = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    out[i * 4] = rib[i * 3] > 127 ? 255 : 0;
    out[i * 4 + 1] = txt[i * 3] > 127 ? 255 : 0;
    out[i * 4 + 2] = exc[i * 3] > 127 ? 255 : 0;
    const r = cls[i * 3], g = cls[i * 3 + 1], b = cls[i * 3 + 2];
    let c = 0;
    if (r === 255 && g === 224) c = 1;
    else if (r === 255 && g === 120) c = 2;
    else if (b === 255) c = 3;
    out[i * 4 + 3] = c;
  }
  return out;
}

const dataBin = await buildData();
const graph = readFileSync(path.join(SCRATCH, "graph.json"));
const input = JSON.parse(readFileSync(path.join(OUT, arg("input", "s2c_input.json")), "utf8"));
const wscale = Number(arg("wscale", "1"));
if (wscale !== 1) {
  input.W *= wscale;
  input.points.forEach((p) => (p.width *= wscale));
}
if (flag("flip-fold")) input.points.forEach((p) => p.fold && (p.fold.angle = -p.fold.angle));
const browser = await chromium.launch({ channel: "chromium", headless: true, args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader=false"] });
const page = await (await browser.newContext({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 })).newPage();
page.on("pageerror", (e) => console.warn("[pageerror]", e.message));
page.on("console", (m) => m.type() === "error" && console.warn("[console.error]", m.text().slice(0, 300)));
await page.route("**/fit-assets/data.bin", (r) => r.fulfill({ body: dataBin, contentType: "application/octet-stream" }));
await page.route("**/fit-assets/graph.json", (r) => r.fulfill({ body: graph, contentType: "application/json" }));
await page.exposeFunction("__fitPersist", (json) => {
  const m = JSON.parse(json);
  if (m.log) console.log(m.log);
});
await page.goto(`${base}/lab/fit`, { waitUntil: "load" });
await page.waitForFunction(() => window.__s2c, null, { timeout: 120000 });
await page.evaluate(() => window.__s2c.ready);
await page.evaluate((i) => window.__s2c.load(i), input);
const cal = await page.evaluate(() => window.__s2c.calibrate());
console.log("calibrate", JSON.stringify(cal));
let state = await page.evaluate(() => window.__s2c.zero());
const statePath = path.join(OUT, "s2c_state.json");
if (flag("resume") && existsSync(statePath)) state = JSON.parse(readFileSync(statePath, "utf8"));
const pre = await page.evaluate((s) => window.__s2c.evaluate(s, 1), state);
console.log("pre-refine", JSON.stringify({ ...pre, crossings: pre.crossings }));
if (flag("refine")) {
  const gens = Number(arg("gens", "60"));
  const res = await page.evaluate(
    (s) => window.__s2c.refine(s, { seed: 1, stages: [{ scale: 0.25, gens: s.__g * 2, sigma: 0.6 }, { scale: 0.5, gens: s.__g, sigma: 0.3 }, { scale: 1, gens: Math.round(s.__g / 3), sigma: 0.15 }] }),
    { ...state, __g: gens },
  );
  state = res.state;
  delete state.__g;
  writeFileSync(statePath, JSON.stringify(state));
  console.log("refined", JSON.stringify(res.terms));
}
const terms = await page.evaluate((s) => window.__s2c.evaluate(s, 1), state);
const imgs = await page.evaluate((s) => window.__s2c.images(s), state);
const pose = await page.evaluate((s) => window.__s2c.pose(s), state);
const twist = await page.evaluate(() => window.__s2c.twist());
const tag = arg("tag", "");
writeFileSync(path.join(OUT, `overlay${tag}.png`), decode(imgs.overlay));
writeFileSync(path.join(OUT, `silhouette${tag}.png`), decode(imgs.silhouette));
writeFileSync(path.join(OUT, `pose_points${tag}.json`), JSON.stringify(pose));
writeFileSync(path.join(OUT, `summary${tag}.json`), JSON.stringify({ calibrate: cal, terms, regions: imgs.regions, state, W: input.W, controlPoints: pose.length, twist }, null, 1));
console.log("final", JSON.stringify({ iou: terms.iou, darkIoU: terms.darkIoU, cross: terms.cross, self: terms.self, kink: terms.kink, crinkle: terms.crinkle, driftRms: terms.driftRms, driftMax: terms.driftMax, crossings: terms.crossings }));
if (flag("write-pose")) writePose(pose);
await browser.close();

const r4 = (v) => (Math.round(v * 10000) / 10000).toString();
function writePose(points) {
  const file = path.join(root, "lib/ribbon/poses/ak-hero.json");
  const j = JSON.parse(readFileSync(file, "utf8"));
  const lines = (pts) =>
    pts
      .map((p, i) => {
        const fold = p.fold ? `, "fold": { "angle": ${r4(p.fold.angle)}, "radius": ${r4(p.fold.radius)}${p.fold.name ? `, "name": ${JSON.stringify(p.fold.name)}` : ""} }` : "";
        const hp = p.hairpin ? `, "hairpin": { "name": ${JSON.stringify(p.hairpin.name)}, "radius": ${r4(p.hairpin.radius)} }` : "";
        return `        { "x": ${r4(p.x)}, "y": ${r4(p.y)}, "z": ${r4(p.z)}, "twist": ${r4(p.twist)}, "width": ${r4(p.width)}${fold}${hp} }${i < pts.length - 1 ? "," : ""}`;
      })
      .join("\n");
  j.variants.desktop = { spline: "bspline", points };
  const order = ["phone", "tablet", "desktop", "ultrawide"].filter((c) => j.variants[c]);
  const out = ["{", `  "version": 1,`, `  "name": ${JSON.stringify(j.name)},`, `  "anchor": ${JSON.stringify(j.anchor)},`];
  if (j.notes) out.push(`  "notes": ${JSON.stringify(j.notes)},`);
  out.push(`  "orientation": ${JSON.stringify(j.orientation ?? "curvature")},`, `  "variants": {`);
  order.forEach((c, ci) => {
    out.push(`    ${JSON.stringify(c)}: {`);
    if (j.variants[c].spline === "bspline") out.push(`      "spline": "bspline",`);
    out.push(`      "points": [`, lines(j.variants[c].points), `      ]`, `    }${ci < order.length - 1 ? "," : ""}`);
  });
  out.push("  }", "}");
  writeFileSync(file, out.join("\n") + "\n");
  console.log(`wrote desktop variant to ${path.relative(root, file)}`);
}
