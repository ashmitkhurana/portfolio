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
const prev = JSON.parse(readFileSync(root + "docs/ribbon/turns/live/ak-hero.prev2.json", "utf8")); // the ORIGINAL old-desktop pose (never the patched file)
const phone = file.variants.phone, old = prev.variants.desktop;
const Wp = worldAll(phone.ruled, cp), Wo = worldAll(old.ruled, cd);
const bp = bbox(Wp), bo = bbox(Wo);
const F = 0.82; // extra shrink on top of the old-desktop-height match
const TOP = 120, RIGHT_MARGIN = 70; // placement at the desktop ctx: projected screen bbox top y, right edge = viewW - margin
const s = F * (bo.h / bp.h);
const proj = (P, c) => { const D = camD(c.viewH, c.fov), k = D / Math.max(D - P[2], 1); return [c.viewW / 2 + P[0] * k, c.viewH / 2 - P[1] * k]; };
const sbox = (W, c) => { let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity; for (const P of W) { const [x, y] = proj(P, c); l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y); } return { left: l, top: t, right: r, bottom: b }; };
let tx = bo.cx - s * bp.cx, ty = bo.cy - s * bp.cy; // start: centre match
const tz = bo.meanZ - s * bp.meanZ; // mean-z rule
const tf = (P) => [s * P[0] + tx, s * P[1] + ty, s * P[2] + tz];
for (let it = 0; it < 30; it++) {
  const sb = sbox(Wp.map(tf), cd);
  tx += (cd.viewW - RIGHT_MARGIN - sb.right) / 1.1; // 1.1 ~ mean perspective gain k at the extremes
  ty -= (TOP - sb.top) / 1.1;
}
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
const extra = {}; // per-size screen bbox: pose -> world with THAT ctx, then project (= the anchor mapping)
for (const a of process.argv.slice(5)) { const c = JSON.parse(readFileSync(a, "utf8")); const b = sbox(worldAll(ruled, c), c); extra[a.split("/").pop()] = { vp: [c.viewW, c.viewH], left: +b.left.toFixed(1), top: +b.top.toFixed(1), right: +b.right.toFixed(1), bottom: +b.bottom.toFixed(1) }; }
const out = { faceSign: phone.faceSign ?? 1, ...(phone.points ? { points: [] } : {}), ruled };
writeFileSync(outPath, JSON.stringify(out));
const f = (a) => a.map((v) => +v.toFixed(3));
console.log(JSON.stringify({
  s, phoneBBox: { mn: f(bp.mn), mx: f(bp.mx), meanZ: bp.meanZ }, oldDesktopBBox: { mn: f(bo.mn), mx: f(bo.mx), meanZ: bo.meanZ },
  translation_world: [tx, ty, tz], screenBBox_desktopCtx: sbox(Wb, cd), screenBBoxes: extra,
  newBBox: { mn: f(nb.mn), mx: f(nb.mx), meanZ: nb.meanZ },
  roundTripMaxErrWorldPx: rt, pairs: np, maxRelDistErr: dr, rings: ruled.length, faceSign: out.faceSign,
}, null, 1));
