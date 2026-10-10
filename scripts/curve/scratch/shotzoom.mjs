import { chromium } from "playwright";
const [,, out] = process.argv;
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: 1512, height: 982 }, deviceScaleFactor: 2 });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForTimeout(10000);
await p.screenshot({ path: out });
await b.close();
