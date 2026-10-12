import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const [W0, H0] = (process.env.SIZE || "1512x860").split("x").map(Number);
const p = await b.newPage({ viewport: { width: W0, height: H0 } });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 });
await p.evaluate(() => window.scrollTo(0, innerHeight * 1.8));
await p.waitForTimeout(1500);
console.log(await p.evaluate(() => {
  const s = window.__ribbonState.engine.sim.slide, h = s.head, e = s.end1(), P = s.poseCtr, B = s.poseRuled;
  const f = (a) => Array.from(a).map(v => v.toFixed(3)).join(",");
  const o = [`end1 p ${f(e.p)} t ${f(e.t)} b ${f(e.b)} hw ${e.hw.toFixed(1)}`];
  for (const i of [6, 5, 4, 3, 2, 1]) o.push(`pose ${i} p ${f(P.slice(i*3, i*3+3))} b ${f(B.slice(i*4, i*4+4))}`);
  for (let j = 0; j < 10; j += 1) o.push(`head ${j} p ${f(h.pos.slice(j*3, j*3+3))} b ${f(h.ruled.slice(j*4, j*4+4))}`);
  return o.join("\n");
}));
await b.close();
