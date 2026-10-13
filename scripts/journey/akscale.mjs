// the phone AK's fit scale (window.__akScale) on the home page and /contact, plus a hero shot
import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=angle"] });
for (const sz of (process.env.SIZES ?? "320x658,360x740,375x667,390x844,393x852,412x915,430x932").split(",")) {
  const [w, h] = sz.split("x").map(Number);
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
  await p.waitForFunction(() => window.__ribbonState?.introSettled, null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(600);
  const k = await p.evaluate(() => window.__akScale);
  if (process.env.OUT) await p.screenshot({ path: `${process.env.OUT}_${sz}.png` });
  await p.goto("http://localhost:3100/contact", { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  const kc = await p.evaluate(() => window.__akScale);
  console.log(sz, "home scale", k?.toFixed(3), "contact scale", kc?.toFixed(3));
  await p.close();
}
await b.close();
