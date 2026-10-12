import { chromium } from "playwright";
const [,, out, ...sizes] = process.argv;
const b = await chromium.launch({ args: ["--use-gl=angle"] });
for (const s of sizes) {
  const [w, h] = s.split("x").map(Number);
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
  await p.waitForTimeout(9000);
  await p.screenshot({ path: `${out}_${w}x${h}.png` });
  await p.close();
}
await b.close();
