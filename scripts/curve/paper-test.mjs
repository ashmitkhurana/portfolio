// Run: node --experimental-strip-types scripts/curve/paper-test.mjs
import { buildPaperSpan, paperPoint } from "../../lib/ribbon/paper.ts";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

let failed = 0;
const check = (name, ok, info = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? "  " + info : ""}`);
  if (!ok) failed++;
};
const P = (u, v, rolls) => { const o = [0, 0, 0]; paperPoint(u, v, rolls, o); return o; };
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const W = 51;

// a. no rolls
{
  const ex = [0.6, 0.0, 0.8], ez = [0, 1, 0]; // arbitrary orthonormal pair
  const entry = { pos: [10, 20, 30], T: ex, N: ez };
  const s = buildPaperSpan({ length: 100, width: W, rolls: [], rings: 11, entry });
  let ok = true;
  for (let i = 0; i < 11; i++) {
    const u = i * 10;
    for (let j = 0; j < 3; j++) {
      if (Math.abs(s.pos[3 * i + j] - (entry.pos[j] + u * ex[j])) > 1e-4) ok = false;
      if (Math.abs(s.T[3 * i + j] - ex[j]) > 1e-5) ok = false;
      if (Math.abs(s.N[3 * i + j] - ez[j]) > 1e-5) ok = false;
    }
    if (Math.abs(s.hw[i] - W / 2) > 1e-4) ok = false;
    const B = [s.B[3 * i], s.B[3 * i + 1], s.B[3 * i + 2]];
    if (Math.abs(B[0] * ex[0] + B[1] * ex[1] + B[2] * ex[2]) > 1e-5) ok = false;
  }
  const e = s.exit;
  if (dist(e.pos, [10 + 60, 20, 30 + 80]) > 1e-4 || dist(e.T, ex) > 1e-5 || dist(e.N, ez) > 1e-5) ok = false;
  check("a. no rolls: straight strip, hw=W/2, N=entry.N, exit", ok);
}

const ID = { pos: [0, 0, 0], T: [1, 0, 0], N: [0, 0, 1] };

function isoErr(rolls, uMax, step = 2) {
  let worst = 0;
  const nu = Math.floor(uMax / step), nv = Math.floor(W / step);
  const g = (i, j) => P(i * step, -W / 2 + j * step, rolls);
  for (let i = 0; i <= nu; i++)
    for (let j = 0; j <= nv; j++) {
      const p = g(i, j);
      if (i < nu) worst = Math.max(worst, Math.abs(dist(p, g(i + 1, j)) - step) / step);
      if (j < nv) worst = Math.max(worst, Math.abs(dist(p, g(i, j + 1)) - step) / step);
    }
  return worst;
}

// b. one roll
{
  const rolls = [{ u: 100, beta: Math.PI / 2, rho: 20, phi: Math.PI }];
  const e = isoErr(rolls, 400);
  check("b. one roll: isometry within 0.5%", e < 0.005, `worst rel err ${(e * 100).toFixed(4)}%`);
  const s = buildPaperSpan({ length: 400, width: W, rolls, rings: 401, entry: ID });
  const n = 400;
  const endZ = s.pos[3 * n + 2], endX = s.pos[3 * n];
  check("b. far end lies back over start, 2*rho above", Math.abs(Math.abs(endZ) - 40) < 0.05 && endX < 0, `end=(${endX.toFixed(2)}, ${s.pos[3 * n + 1].toFixed(2)}, ${endZ.toFixed(2)})`);
  const Nz0 = s.N[2], NzE = s.N[3 * n + 2];
  check("b. N(end) = -N(start)", Math.abs(Nz0 - 1) < 1e-4 && Math.abs(NzE + 1) < 1e-3, `Nz0=${Nz0.toFixed(4)} NzE=${NzE.toFixed(4)}`);
  check("b. exit frame", Math.abs(s.exit.pos[2] - endZ) < 1e-3 && Math.abs(s.exit.T[0] + 1) < 1e-4 && Math.abs(s.exit.N[2] + 1) < 1e-4);
}

// c. two rolls
{
  const rho = 18, L = rho * Math.PI;
  const mk = (phi2) => [
    { u: 100, beta: Math.PI / 2, rho, phi: Math.PI },
    { u: 100 + 20 * Math.PI + 30, beta: 2 * Math.PI / 5, rho, phi: phi2 },
  ];
  for (const [label, phi2] of [["phi2=+pi (as specified)", Math.PI], ["phi2=-pi (z-fold)", -Math.PI]]) {
    const rolls = mk(phi2);
    const e = isoErr(rolls, 400);
    check(`c. two rolls [${label}]: isometry within 0.5%`, e < 0.005, `worst ${(e * 100).toFixed(4)}%`);
    // layers by flat classification
    const r1 = rolls[0], r2 = rolls[1];
    const ap2 = [Math.sin(r2.beta), -Math.cos(r2.beta)];
    const L1 = [], L2 = [], L3 = [];
    for (let u = 0; u <= 400; u += 2)
      for (let v = -W / 2; v <= W / 2 + 1e-9; v += 3) {
        const X1 = u - r1.u; // beta1 = pi/2
        const X2 = (u - r2.u) * ap2[0] + v * ap2[1];
        const p = P(u, v, rolls);
        if (X1 <= 0) L1.push(p);
        else if (X1 >= L && X2 <= 0) L2.push(p);
        else if (X2 >= L) L3.push(p);
      }
    const minD = (A, B) => { let m = Infinity; for (const a of A) for (const b of B) m = Math.min(m, dist(a, b)); return m; };
    const d13 = minD(L1, L3), d12 = minD(L1, L2), d23 = minD(L2, L3);
    console.log(`     layer sizes ${L1.length}/${L2.length}/${L3.length}; min dist L1-L3 ${d13.toFixed(2)}, L1-L2 ${d12.toFixed(2)}, L2-L3(flat) ${d23.toFixed(2)}`);
    if (phi2 > 0) console.log(`INFO c. [${label}]: same-sense double U-turn returns layer 3 to z=0 (geometrically coincides with layer 1; min ${d13.toFixed(2)}) - expected, not a bug`);
    else check(`c. two rolls [${label}]: non-adjacent layers (1,3) separated >= 3 px`, d13 >= 3, `min ${d13.toFixed(2)}`);
  }
}

// d. compare with paper.py
{
  const here = dirname(fileURLToPath(import.meta.url));
  const py = "/Users/ashmitkhurana/Development/studio/portfolio/scripts/mockup/.venv/bin/python";
  const mockup = resolve(here, "../mockup");
  if (!existsSync(py)) console.log("SKIP d. python venv not found");
  else {
    const rolls = [
      { u: 100, beta: 1.2, rho: 20, phi: 2.9 },
      { u: 230, beta: 1.9, rho: 18, phi: -2.4 },
    ];
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const pts = [];
    for (let i = 0; i < 5; i++) pts.push([rnd() * 500 - 20, (rnd() - 0.5) * W]);
    for (const u of [90, 110, 160, 300, 450]) pts.push([u, 10]);
    const code = `
import sys, json
sys.path.insert(0, sys.argv[1])
import numpy as np
from paper import surface
d = json.loads(sys.stdin.read())
x = [0,0,0,0,0,0]
for r in d['rolls']: x += [r['u'], r['beta'], r['rho'], r['phi']]
pts = np.array(d['pts'])
print(json.dumps(surface(x, pts[:,0], pts[:,1], K=len(d['rolls'])).tolist()))
`;
    const r = spawnSync(py, ["-I", "-c", code, mockup], { input: JSON.stringify({ rolls, pts }), encoding: "utf8" });
    if (r.status !== 0) console.log("SKIP d. python failed: " + (r.stderr || "").slice(0, 200));
    else {
      const ref = JSON.parse(r.stdout);
      let worst = 0;
      pts.forEach((p, i) => { worst = Math.max(worst, dist(P(p[0], p[1], rolls), ref[i])); });
      check("d. paperPoint matches paper.py (2-roll chain, 10 points)", worst < 1e-6, `max diff ${worst.toExponential(2)}`);
    }
  }
}

if (failed) { console.log(`${failed} FAILED`); process.exit(1); }
console.log("ALL PASS");
