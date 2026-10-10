import { chromium } from "playwright";
const [,, out, size] = process.argv;
const [w, h] = size.split("x").map(Number);
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: w, height: h } });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
await p.reload({ waitUntil: "load" });
const t0 = Date.now();
for (let i = 0; i < 12; i++) { await p.waitForTimeout(120); await p.screenshot({ path: `${out}_${String(i).padStart(2, "0")}.png` }); }
console.log("ms", Date.now() - t0);
await b.close();
