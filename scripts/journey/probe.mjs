// Dump the live hero pose (after the intro) + camera + name/section rects for journey design.
// usage: node scripts/journey/probe.mjs <out.json> <WxH> [base]
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const [,, out, size, base = "http://localhost:3100"] = process.argv;
const [w, h] = size.split("x").map(Number);
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: w, height: h } });
await p.goto(base + "/?motion=slide", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 }).catch(() => {});
await p.waitForTimeout(500);
const d = await p.evaluate(() => {
  const e = window.__ribbonState.engine, sim = e.sim, sl = sim.slide;
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [r.left, r.top + scrollY, r.right, r.bottom + scrollY]; };
  const glyphs = [...document.querySelectorAll("#hero-title [data-glyph], #hero-title span")].filter(s => s.children.length === 0).map(rect);
  return {
    w: innerWidth, h: innerHeight, n: sim.count, length: sl.length, settled: sl.introSettled,
    camZ: e.core?.camera?.position?.z ?? sl.cameraZ,
    pos: Array.from(sl.outPos), ruled: Array.from(sl.outRuled),
    hero: rect(document.querySelector("[data-section=hero]")),
    name: rect(document.querySelector("#hero-title")), glyphs,
    sections: [...document.querySelectorAll("main section")].map(s => [s.dataset.section, ...rect(s)]),
  };
});
writeFileSync(out, JSON.stringify(d));
console.log(size, "n", d.n, "len", d.length.toFixed(0), "settled", d.settled, "camZ", d.camZ.toFixed(0), "glyphs", d.glyphs.length, "name", d.name?.map(v => v.toFixed(0)).join(","));
await b.close();
