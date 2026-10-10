import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: 1512, height: 982 }, deviceScaleFactor: 2 });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForTimeout(8000);
for (const y of [600, 1000]) { await p.evaluate((y) => window.scrollTo(0, y), y); await p.waitForTimeout(2500); await p.screenshot({ path: `/tmp/scroll_${y}.png` }); }
await b.close();
