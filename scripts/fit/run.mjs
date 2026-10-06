#!/usr/bin/env node
/**
 * Drives the AK pose fit in headless Chromium WITH GPU (Metal ANGLE) against /lab/fit.
 *
 *   NEXT_DIST_DIR=.next-fit npx next dev --turbopack -p 4000      # (or a production build with NEXT_PUBLIC_LAB=1)
 *   node scripts/fit/run.mjs                 # full run
 *   node scripts/fit/run.mjs --resume        # continue from result/params.json
 *   node scripts/fit/run.mjs --bench         # evaluations / second only
 *   node scripts/fit/run.mjs --final-only    # re-score result/params.json at full res, parity check, write images
 *
 * Options: --base URL (4000)  --budget S (3600)  --seed N  --restarts N  --target IoU (0.85)
 *          --from STAGE  --headed  --no-pose (do not touch ak-hero.json)
 *
 * Inputs: <scratch>/fit/desktop/{ribbon_mask,text_mask,exclusion_mask,shading_classes}.png + graph.json
 * Outputs (<scratch>/fit/desktop/result/): params.json, progress.csv, overlay.png, silhouette.png,
 *   engine_silhouette.png, parity_diff.png, summary.json; and the desktop variant of lib/ribbon/poses/ak-hero.json.
 */
import { chromium } from "playwright";
import sharp from "sharp";
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRATCH =
  "/private/tmp/claude-501/-Users-ashmitkhurana-Development-studio-portfolio/428f1961-b6ad-4758-ba30-ff5eb1800006/scratchpad/fit/desktop";
const OUT = process.argv.includes("--out") ? path.resolve(process.argv[process.argv.indexOf("--out") + 1]) : path.join(SCRATCH, "result");
mkdirSync(OUT, { recursive: true });

const flag = (n) => process.argv.includes(`--${n}`);
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}
const base = arg("base", "http://localhost:4100").replace(/\/$/, "");
const budget = Number(arg("budget", "3600"));
const seed = Number(arg("seed", "1"));
const restarts = Number(arg("restarts", "6"));
const target = Number(arg("target", "0.92"));
const fromStage = arg("from", undefined);
const fovLock = arg("fov", undefined);

/** RGBA per pixel: R ribbon, G text, B exclusion, A shading class (0 none, 1 bright, 2 mid, 3 dark) */
async function buildData() {
  const W = 1672;
  const H = 941;
  const rd = async (f) => (await sharp(path.join(SCRATCH, f)).removeAlpha().raw().toBuffer());
  const [rib, txt, exc, cls] = await Promise.all([
    rd("ribbon_mask.png"),
    rd("text_mask.png"),
    rd("exclusion_mask.png"),
    rd("shading_classes.png"),
  ]);
  const out = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    out[i * 4] = rib[i * 3] > 127 ? 255 : 0;
    out[i * 4 + 1] = txt[i * 3] > 127 ? 255 : 0;
    out[i * 4 + 2] = exc[i * 3] > 127 ? 255 : 0;
    const r = cls[i * 3];
    const g = cls[i * 3 + 1];
    const b = cls[i * 3 + 2];
    let c = 0;
    if (r === 255 && g === 224) c = 1; // bright (255,224,70)
    else if (r === 255 && g === 120) c = 2; // mid (255,120,20)
    else if (b === 255) c = 3; // dark (40,90,255)
    out[i * 4 + 3] = c;
  }
  return out;
}

const decode = (u) => Buffer.from(u.split(",")[1], "base64");

async function main() {
  const dataBin = await buildData();
  const graph = readFileSync(path.join(SCRATCH, "graph.json"));
  const browser = await chromium.launch({
    channel: "chromium",
    headless: !flag("headed"),
    args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader=false"],
  });
  const ctx = await browser.newContext({ viewport: { width: 1672, height: 941 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.warn("[pageerror]", e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.warn("[console.error]", m.text().slice(0, 300));
  });
  await page.route("**/fit-assets/data.bin", (r) => r.fulfill({ body: dataBin, contentType: "application/octet-stream" }));
  await page.route("**/fit-assets/graph.json", (r) => r.fulfill({ body: graph, contentType: "application/json" }));

  const csv = path.join(OUT, "progress.csv");
  const resume = flag("resume") || flag("final-only") || flag("bench") || flag("init-only");
  if (!resume || !existsSync(csv)) {
    writeFileSync(csv, "t,stage,restart,gen,evals,scale,total,iou,chamfer,smooth,self,cross,darkIoU,cornerXor,kink,sigma,popsize\n");
  }
  let lastBest = null;
  const t0 = Date.now();
  await page.exposeFunction("__fitPersist", (json) => {
    const m = JSON.parse(json);
    if (m.log) {
      console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m.log}`);
      appendFileSync(path.join(OUT, "run.log"), `${new Date().toISOString()} ${m.log}\n`);
      return;
    }
    if (m.best) {
      lastBest = m.best;
      writeParams(m.best.state, m.best.terms, `best (restart ${m.best.restart})`);
      return;
    }
    const { snap, improved, info } = m;
    const t = snap.terms;
    appendFileSync(
      csv,
      [
        snap.seconds.toFixed(1), snap.stage, snap.restart, snap.gen, snap.evals, snap.scale,
        t.total.toFixed(5), t.iou.toFixed(5), t.chamfer.toFixed(4), t.smooth.toFixed(4), t.self.toFixed(4),
        t.cross.toFixed(4), t.darkIoU.toFixed(4), t.cornerXor.toFixed(4), t.kink.toFixed(2), info.sigma.toFixed(4), info.popsize,
      ].join(",") + "\n",
    );
    // the stage best is the resume point while the main pass is running (restarts only write via onBest)
    if (improved && snap.restart === 0) writeParams(snap.state, snap.terms, `${snap.stage} gen ${snap.gen}`);
    if (snap.gen % 10 === 0) console.log(`[${snap.seconds.toFixed(0)}s] ${snap.stage} r${snap.restart} g${snap.gen} iou ${t.iou.toFixed(4)} total ${t.total.toFixed(4)} cham ${t.chamfer.toFixed(3)} x${snap.evals}`);
  });

  function writeParams(state, terms, note) {
    writeFileSync(
      path.join(OUT, "params.json"),
      JSON.stringify({ note, savedAt: new Date().toISOString(), state, terms: slimTerms(terms) }, null, 1),
    );
  }
  const slimTerms = (t) => ({ ...t });

  await page.goto(`${base}/lab/fit`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__fit, null, { timeout: 120000 });
  await page.evaluate(() => window.__fit.ready);
  console.log("page ready");

  let state = null;
  if (resume && !flag("init-only") && existsSync(path.join(OUT, "params.json"))) {
    state = JSON.parse(readFileSync(path.join(OUT, "params.json"), "utf8")).state;
    console.log("resuming from params.json");
  }

  if (flag("bench")) {
    const b = await page.evaluate((s) => window.__fit.benchmark(s, 200), state);
    console.log("benchmark", b);
    await browser.close();
    return;
  }

  if (flag("init-only")) state = await page.evaluate(() => window.__fit.initial());
  if (!flag("final-only") && !flag("init-only")) {
    const res = await page.evaluate(
      ([s, cfg]) => window.__fit.run(s, cfg),
      [state, { budget, seed, target, maxRestarts: restarts, ...(fromStage ? { fromStage } : {}), ...(fovLock ? { fovLock: Number(fovLock) } : {}) }],
    );
    state = res.state;
    writeParams(res.state, res.terms, "final");
  }
  if (!state) throw new Error("no state to finalize");

  // ---- final scoring, images, parity -------------------------------------------
  const fin = await page.evaluate((s) => window.__fit.finalize(s), state);
  state = fin.state; // migrated to the current layout
  writeFileSync(path.join(OUT, "overlay.png"), decode(fin.images.overlay));
  writeFileSync(path.join(OUT, "silhouette.png"), decode(fin.images.silhouette));
  let par = null;
  try {
    par = await page.evaluate((s) => window.__fit.parity(s), state);
    writeFileSync(path.join(OUT, "engine_silhouette.png"), decode(par.engineSilhouette));
    writeFileSync(path.join(OUT, "parity_diff.png"), decode(par.diff));
  } catch (e) {
    console.warn("parity failed:", e.message);
  }
  const mat = await page.evaluate((st) => window.__fit.material(st), state);
  writeFileSync(path.join(OUT, "material.png"), decode(mat));
  await materialSheets();
  const summary = {
    iouFull: fin.terms.iou,
    darkFaceIoU: fin.terms.darkIoU,
    chamfer: fin.terms.chamfer,
    crossing: fin.terms.crossing,
    smoothness: { bend: fin.terms.bend, hardBend: fin.terms.hardBend, twistRate: fin.terms.twistRate },
    selfIntersection: fin.terms.self,
    cornerXor: fin.terms.cornerXor,
    cornerArc: fin.terms.cornerArc,
    edgeKink: fin.terms.kink,
    state: { width: state.width, fov: state.fov, foldR: state.foldR, foldSign: state.foldSign, hairR: { "k-upper": state.hairR[0], "k-lower": state.hairR[1], "s-turn": state.hairR[2] } },
    parityIoU: par?.iou ?? null,
    parityNote: par?.note ?? null,
    mismatchRegions: fin.regions,
  };
  writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 1));
  if (!flag("init-only")) writeParams(state, fin.terms, "final (full res)");
  console.log(JSON.stringify(summary, null, 1));

  writeFileSync(path.join(OUT, "pose_points.json"), JSON.stringify(fin.posePoints));
  if (!flag("no-pose") && (fin.terms.iou >= 0.85 || flag("force-pose"))) writePose(fin.posePoints, state.fov);
  else console.log(fin.terms.iou >= 0.85 ? "ak-hero.json untouched (--no-pose)" : "IoU < 0.85: ak-hero.json untouched");
  await browser.close();
}

const r4 = (v) => (Math.round(v * 10000) / 10000).toString();

/** side-by-side (mockup | ours) and 50/50 blend of the real-material render */
async function materialSheets() {
  const mock = await sharp("/Users/ashmitkhurana/Development/studio/portfolio/public/lab/ref/hero-desktop.webp").resize(1672, 941).removeAlpha().png().toBuffer();
  const ours = readFileSync(path.join(OUT, "material.png"));
  await sharp({ create: { width: 1672 * 2 + 16, height: 941, channels: 3, background: "#222" } })
    .composite([{ input: mock, left: 0, top: 0 }, { input: ours, left: 1672 + 16, top: 0 }])
    .png()
    .toFile(path.join(OUT, "material_vs.png"));
  const half = await sharp(ours).ensureAlpha(0.5).png().toBuffer();
  await sharp(mock).composite([{ input: half, blend: "over" }]).png().toFile(path.join(OUT, "material_blend.png"));
}

/** write the desktop variant of ak-hero.json (phone variant and the file layout are untouched) */
function writePose(points, fov) {
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
  const out = [];
  out.push("{", `  "version": 1,`, `  "name": ${JSON.stringify(j.name)},`, `  "anchor": ${JSON.stringify(j.anchor)},`);
  if (j.notes) out.push(`  "notes": ${JSON.stringify(j.notes)},`);
  out.push(`  "orientation": ${JSON.stringify(j.orientation ?? "curvature")},`, `  "variants": {`);
  order.forEach((c, ci) => {
    out.push(`    ${JSON.stringify(c)}: {`);
    if (j.variants[c].spline === "bspline") out.push(`      "spline": "bspline",`);
    out.push(`      "points": [`, lines(j.variants[c].points), `      ]`, `    }${ci < order.length - 1 ? "," : ""}`);
  });
  out.push("  }", "}");
  writeFileSync(file, out.join("\n") + "\n");
  console.log(`wrote desktop variant to ${path.relative(root, file)} (fit fov ${fov.toFixed(2)})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
