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

const r4 = (v) => (Math.round(v * 10000) / 10000).toString();
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
if (flag("nofold")) input.points.forEach((p) => { delete p.fold; });
if (flag("nohair")) input.points.forEach((p) => { delete p.hairpin; });
await page.evaluate((i) => window.__s2c.load(i), input);
if (flag("probe")) {
  console.log("rTwist", JSON.stringify(await page.evaluate(() => { window.__s2c.probeTwist(0.5); const g = window.__fit.session.rend.geometry; const out = []; for (const th of [0, 0.5]) { const st = window.__s2c.zero(); window.__s2c.probeTwist(th); const d = g.sweep.uRingTex.value.image.data; const tot = g.totalRings; const o = (g.caps + 300) * 4; const q = (g.caps + 20) * 3; out.push({ th, tw: g.rTwist[g.caps + 20], c: g.rTwC[g.caps + 20], n0: [g.rN0[q], g.rN0[q+1], g.rN0[q+2]], n: [g.rN[q], g.rN[q+1], g.rN[q+2]], B: [d[tot*4+o], d[tot*4+o+1], d[tot*4+o+2]], rB: [g.rB[(g.caps+300)*3], g.rB[(g.caps+300)*3+1], g.rB[(g.caps+300)*3+2]], N: [d[2*tot*4+o], d[2*tot*4+o+1], d[2*tot*4+o+2]] }); } return out; })));
  for (const th of [0.5, 1.0, -0.5]) console.log("probe", th, JSON.stringify(await page.evaluate((t) => window.__s2c.probeTwist(t), th)));
}
await page.evaluate((w) => window.__s2c.setDarkW(w), Number(arg("dark-w", "0.25")));
const cal = flag("no-calibrate") ? null : await page.evaluate(() => (window.__s2c.calibrateReal()));
if (cal) console.log("detail", cal.detail);
if (flag("lock")) console.log("lock", JSON.stringify(await page.evaluate(() => window.__s2c.lockCentreline(8))));
if (flag("parity")) {
  const names = ["drop_R", "crossbar_right", "ret_hidden_start", "K_junction", "lower_tip", "upper_tip", "S_turn", "A_right_leg_low", "lower_back"];
  const cl = JSON.parse(readFileSync(path.join(OUT, "centreline2d.json"), "utf8"));
  const N = cl.points.length;
  const spots = [];
  for (const n of names) spots.push(await page.evaluate((a) => window.__s2c.controlAt(a), input.reversed ? N - 1 - cl.anchors[n] : cl.anchors[n]));
  const r = await page.evaluate((sp) => window.__s2c.parityScan(sp), spots);
  console.log("parity spots", JSON.stringify(spots), "best flips", JSON.stringify(r.best), "score", r.score.toFixed(3), "min", Math.min(...r.scores).toFixed(3));
}
if (!flag("no-sil")) console.log("silhouette roll", JSON.stringify(await page.evaluate((a) => window.__s2c.calibrateSilhouette(...a), [Number(arg('sil-passes', '2')), Number(arg('sil-span', '0.8')), Number(arg('sil-steps', '17')), Number(arg('sil-cont', '0.25')), 95, 1.5, flag('sil-global')])));
console.log("calibrate", JSON.stringify(cal));
if (flag("lock")) console.log("lock2", JSON.stringify(await page.evaluate(() => window.__s2c.lockCentreline(6))));
if (flag("local")) {
  for (let r = 0; r < Number(arg("local-rounds", "1")); r++) console.log("refineLocal", JSON.stringify(await page.evaluate((a) => window.__s2c.refineLocal(...a), [Number(arg("local-passes", "2")), Number(arg("local-step", "7")), 0.06, Number(arg("local-max", "16"))])));
}
if (flag("twist-after")) console.log("twist-after", JSON.stringify(await page.evaluate(() => window.__s2c.calibrateSilhouette(2, 0.6, 13, 0.25, 95, 1.5, true))));
if (flag("local2")) console.log("refineLocal2", JSON.stringify(await page.evaluate(() => window.__s2c.refineLocal(3, 6, 0.05, 30))));
if (flag("tw-smooth")) await page.evaluate((sg) => window.__s2c.smoothTwist(sg), Number(arg("tw-smooth", "1")));
if (flag("fix-kink")) console.log("fixKink", JSON.stringify(await page.evaluate((n) => window.__s2c.fixKink(n), Number(arg("fix-kink", "40")))));
if (flag("polish")) {
  for (let r = 0; r < Number(arg("polish", "1")); r++) {
    console.log("polish local", JSON.stringify(await page.evaluate(() => window.__s2c.refineLocal(2, 5, 0.04, 30))));
    console.log("polish fixKink", JSON.stringify(await page.evaluate(() => window.__s2c.fixKink(30))));
  }
}
if (flag("lock-after")) {
  for (let r = 0; r < Number(arg("lock-rounds", "2")); r++) {
    const h = await page.evaluate(() => window.__s2c.lockCentreline(6));
    console.log("lock", r, h.map((x) => x.rms.toFixed(1) + "/" + x.max.toFixed(0)).join(" "));
    console.log("silhouette roll", JSON.stringify(await page.evaluate(() => window.__s2c.calibrateSilhouette(1, 0.4, 9, 0.25))));
  }
}
let state = await page.evaluate(() => window.__s2c.zero());
const statePath = path.join(OUT, "s2c_state.json");
if (flag("resume") && existsSync(statePath)) state = JSON.parse(readFileSync(statePath, "utf8"));
const pre = await page.evaluate((s) => window.__s2c.evaluate(s, 1), state);
console.log("pre-refine", JSON.stringify({ ...pre, driftAll: undefined }));
if (flag("refine")) {
  const gens = Number(arg("gens", "60"));
  const res = await page.evaluate(
    (s) => window.__s2c.refine(s, { seed: 1, stages: s.__st }),
    { ...state, __g: gens, __st: flag('gentle') ? [{ scale: 0.5, gens, sigma: 0.25 }, { scale: 1, gens: Math.round(gens / 3), sigma: 0.12 }] : [{ scale: 0.25, gens: gens * 2, sigma: 0.6 }, { scale: 0.5, gens, sigma: 0.3 }, { scale: 1, gens: Math.round(gens / 3), sigma: 0.15 }] },
  );
  state = res.state;
  delete state.__g;
  delete state.__st;
  writeFileSync(statePath, JSON.stringify(state));
  console.log("refined", JSON.stringify({ ...res.terms, driftAll: undefined }));
}
const terms = await page.evaluate((s) => window.__s2c.evaluate(s, 1), state);
const imgs = await page.evaluate((s) => window.__s2c.images(s), state);
const pose = await page.evaluate((s) => window.__s2c.pose(s), state);
writeFileSync(path.join(OUT, `classes${arg('tag', '')}.bin`), Buffer.from(await page.evaluate((s) => window.__s2c.classMap(s), state), 'base64'));
const twist = await page.evaluate(() => window.__s2c.twist());
const tag = arg("tag", "");
writeFileSync(path.join(OUT, `overlay${tag}.png`), decode(imgs.overlay));
writeFileSync(path.join(OUT, `silhouette${tag}.png`), decode(imgs.silhouette));
writeFileSync(path.join(OUT, `pose_points${tag}.json`), JSON.stringify(pose));
writeFileSync(path.join(OUT, `summary${tag}.json`), JSON.stringify({ calibrate: cal, terms, regions: imgs.regions, state, W: input.W, controlPoints: pose.length, twist }, null, 1));
console.log("final", JSON.stringify({ iou: terms.iou, darkIoU: terms.darkIoU, cross: terms.cross, self: terms.self, kink: terms.kink, crinkle: terms.crinkle, driftRms: terms.driftRms, driftMax: terms.driftMax, crossings: terms.crossings }));
if (flag("write-pose")) writePose(pose);
await browser.close();

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
