import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
console.log(await p.evaluate(() => { let out = []; for (const ss of document.styleSheets) { try { for (const r of ss.cssRules) { if (r.conditionText && r.conditionText.includes("540px")) out.push(r.cssText.slice(0, 300)); } } catch {} } return out.join("\n---\n") || "none"; }));
await b.close();
