// capture the journey path's inputs at a phone size: node scripts/journey/capinput.mjs <WxH> <out.json>
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const [w, h] = process.argv[2].split("x").map(Number);
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 }).catch(() => {});
await p.evaluate(() => { window.scrollTo(0, document.querySelector('[data-section="terminal"]').getBoundingClientRect().top + scrollY); window.__journeyDebug = {}; });
await p.waitForTimeout(1500);
writeFileSync(process.argv[3], JSON.stringify(await p.evaluate(() => window.__journeyDebug.input)));
await b.close();
