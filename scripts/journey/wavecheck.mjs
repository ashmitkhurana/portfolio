import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: 1512, height: 860 } });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 });
await p.evaluate((at) => window.scrollTo(0, innerHeight * at), +(process.env.AT || 3.1));
await p.waitForTimeout(2500);
console.log(await p.evaluate(() => {
  const s = window.__ribbonState.engine.sim.slide, n = s.count, P = s.outPos, B = s.outRuled, W = innerWidth, H = innerHeight, D = s.cameraZ, V = s.offsetY;
  const rows = [];
  for (let i = 0; i < n; i += 2) {
    const x = P[i*3], y = P[i*3+1], z = P[i*3+2], k = D / (D - z);
    const sx = W/2 + x*k, sy = H/2 - y*k - V;
    if (sx > -50 && sx < W + 50 && sy > -50 && sy < H + 50) rows.push(`${i} sx ${sx.toFixed(0)} sy ${sy.toFixed(0)} z ${z.toFixed(0)} b ${[B[i*4],B[i*4+1],B[i*4+2]].map(v=>v.toFixed(2)).join(",")} hw ${B[i*4+3].toFixed(1)}`);
  }
  return rows.join("\n");
}));
await b.close();
