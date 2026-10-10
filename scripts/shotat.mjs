// screenshot a path at a scroll fraction: node scripts/shotat.mjs <out.png> <WxH> <path> <fraction>
import { chromium } from "playwright";
const [,, out, size, path, f] = process.argv;
const [w, h] = size.split("x").map(Number);
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: w, height: h } });
await p.goto("http://localhost:3100" + path, { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
await p.evaluate((f) => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), +f);
await p.waitForTimeout(1500);
await p.screenshot({ path: out, clip: { x: 0, y: 0, width: w, height: Math.min(h, 300) } });
await b.close();
