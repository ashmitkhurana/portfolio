#!/usr/bin/env node
/**
 * Build the desktop ruled variant from the phone (rotosurf r39) variant: the same 3D shape, uniformly scaled and
 * translated (in world px) so its bbox sits where the old desktop sculpture sits.
 *   node scripts/curve/desktopify.mjs <ctx_phone.json> <ctx_desktop.json> <out.json>
 * Exact port of lib/ribbon/poses/resolve.ts pointToWorld / worldToPoint (cameraDistance from camera.ts).
 */
import { readFileSync, writeFileSync } from "node:fs";
const [, , cpPath, cdPath, outPath] = process.argv;
const root = new URL("../../", import.meta.url).pathname;
const file = JSON.parse(readFileSync(root + "lib/ribbon/poses/ak-hero.json", "utf8"));
const cp = JSON.parse(readFileSync(cpPath, "utf8"));
const cd = JSON.parse(readFileSync(cdPath, "utf8"));
const DEG = Math.PI / 180;
const camD = (H, fov) => H / 2 / Math.tan((fov * DEG) / 2);
function toWorld(p, c) {
  const sx = c.anchor.left + p[0] * c.anchor.width, sy = c.anchor.top + p[1] * c.anchor.height;
  const z = p[2] * c.anchor.height, D = camD(c.viewH, c.fov), k = (D - z) / D;
  return [(sx - c.viewW / 2) * k, (c.viewH / 2 - sy) * k, z];
}
function toPose(w, c) {
  const D = camD(c.viewH, c.fov), k = D / Math.max(D - w[2], 1);
  const sx = c.viewW / 2 + w[0] * k, sy = c.viewH / 2 - w[1] * k;
  return [(sx - c.anchor.left) / c.anchor.width, (sy - c.anchor.top) / c.anchor.height, w[2] / c.anchor.height];
}
const worldAll = (rings, c) => rings.flatMap((r) => [toWorld(r.L, c), toWorld(r.R, c)]);
const bbox = (pts) => {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  let mz = 0;
  for (const p of pts) { for (let a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], p[a]); mx[a] = Math.max(mx[a], p[a]); } mz += p[2]; }
  return { mn, mx, cx: (mn[0] + mx[0]) / 2, cy: (mn[1] + mx[1]) / 2, h: mx[1] - mn[1], w: mx[0] - mn[0], meanZ: mz / pts.length };
};
const phone = file.variants.phone, old = file.variants.desktop;
const Wp = worldAll(phone.ruled, cp), Wo = worldAll(old.ruled, cd);
const bp = bbox(Wp), bo = bbox(Wo);
const s = bo.h / bp.h;
const tf = (P) => [s * (P[0] - bp.cx) + bo.cx, s * (P[1] - bp.cy) + bo.cy, s * (P[2] - bp.meanZ) + bo.meanZ];
const Wn = Wp.map(tf);
const R6 = (v) => Math.round(v * 1e6) / 1e6;
const ruled = phone.ruled.map((_, i) => ({ L: toPose(Wn[2 * i], cd).map(R6), R: toPose(Wn[2 * i + 1], cd).map(R6) }));
// round-trip
const Wb = worldAll(ruled, cd);
let rt = 0;
for (let i = 0; i < Wb.length; i++) for (let a = 0; a < 3; a++) rt = Math.max(rt, Math.abs(Wb[i][a] - Wn[i][a]));
// distortion: pairwise distances of 200 sampled points (phone world -> desktop world) scale by s
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const idx = Array.from({ length: 200 }, () => Math.floor(rnd() * Wp.length));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
let dr = 0, np = 0;
for (let i = 0; i < idx.length; i++) for (let j = i + 1; j < idx.length; j++) {
  const d0 = dist(Wp[idx[i]], Wp[idx[j]]);
  if (d0 < 1e-6) continue;
  dr = Math.max(dr, Math.abs(dist(Wb[idx[i]], Wb[idx[j]]) / (s * d0) - 1)); np++;
}
const nb = bbox(Wb);
const out = { faceSign: phone.faceSign ?? 1, ...(phone.points ? { points: [] } : {}), ruled };
writeFileSync(outPath, JSON.stringify(out));
const f = (a) => a.map((v) => +v.toFixed(3));
console.log(JSON.stringify({
  s, phoneBBox: { mn: f(bp.mn), mx: f(bp.mx), meanZ: bp.meanZ }, oldDesktopBBox: { mn: f(bo.mn), mx: f(bo.mx), meanZ: bo.meanZ },
  translation_world_delta_center: [bo.cx - s * bp.cx, bo.cy - s * bp.cy, bo.meanZ - s * bp.meanZ],
  newBBox: { mn: f(nb.mn), mx: f(nb.mx), meanZ: nb.meanZ },
  roundTripMaxErrWorldPx: rt, pairs: np, maxRelDistErr: dr, rings: ruled.length, faceSign: out.faceSign,
}, null, 1));
