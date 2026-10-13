import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1512, height: 860 }, deviceScaleFactor: 2 });
await p.goto("http://localhost:3100/work", { waitUntil: "networkidle" });
await p.waitForTimeout(1200);
await p.locator(".project-card").nth(1).screenshot({ path: process.argv[2] });
await b.close();
