// Ring-to-ring tangent and band-normal changes of the visible ribbon at a scroll position (finds creases/kinks).
import { chromium } from "playwright";
const [w, h] = (process.env.SIZE || "1512x860").split("x").map(Number);
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: w, height: h } });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 });
for (const f of (process.env.AT || "1.5,1.8").split(",")) {
  await p.evaluate((f) => window.scrollTo(0, innerHeight * f), +f);
  await p.waitForTimeout(1800);
  const r = await p.evaluate(() => {
    const s = window.__ribbonState.engine.sim.slide, n = s.count, P = s.outPos, B = s.outRuled, D = s.cameraZ, W = innerWidth, H = innerHeight;
    const T = [], N = [], out = [];
    for (let i = 0; i < n; i++) {
      const j = Math.min(i + 1, n - 1), k = Math.max(i - 1, 0);
      let t = [P[j*3]-P[k*3], P[j*3+1]-P[k*3+1], P[j*3+2]-P[k*3+2]]; const l = Math.hypot(...t) || 1; t = t.map(v => v / l);
      const bb = [B[i*4], B[i*4+1], B[i*4+2]];
      let nn = [t[1]*bb[2]-t[2]*bb[1], t[2]*bb[0]-t[0]*bb[2], t[0]*bb[1]-t[1]*bb[0]];
      const nl = Math.hypot(...nn) || 1; nn = nn.map(v => v / nl);
      T.push(t); N.push(nn);
    }
    const ang = (a, c) => Math.acos(Math.min(1, Math.abs(a[0]*c[0]+a[1]*c[1]+a[2]*c[2]))) * 180 / Math.PI;
    for (let i = 1; i < n; i++) {
      const k = D / (D - P[i*3+2]); const sx = W/2 + P[i*3]*k, sy = H/2 - P[i*3+1]*k - s.offsetY;
      const vis = sx > -60 && sx < W + 60 && sy > -60 && sy < H + 60;
      const dn = ang(N[i], N[i-1]), dt = ang(T[i], T[i-1]);
      if (vis && (dn > 1.5 || dt > 2)) out.push(`ring ${i} scr(${sx.toFixed(0)},${sy.toFixed(0)}) z ${P[i*3+2].toFixed(0)} dNormal ${dn.toFixed(1)} dTangent ${dt.toFixed(1)} hw ${B[i*4+3].toFixed(1)}`);
    }
    return `sigma ${s.sigma.toFixed(0)}\n` + out.join("\n");
  });
  console.log("AT", f, r);
}
await b.close();
