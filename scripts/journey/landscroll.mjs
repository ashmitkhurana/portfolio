// phone landscape (static mode): dismiss the notice, then shots every 0.8 screens down the whole page
import { chromium } from "playwright";
const [W, H] = (process.env.SIZE ?? "844x390").split("x").map(Number);
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForTimeout(2000);
await p.locator(".landscape-notice__button").click().catch(() => {});
const total = await p.evaluate(() => document.documentElement.scrollHeight);
let i = 0;
for (let y = 0; y < total; y += 0.8 * H) {
  await p.evaluate((y) => window.scrollTo(0, y), y);
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${process.env.OUT}_${String(i++).padStart(2, "0")}.png` });
}
console.log("frames", i, "page height", total);
await b.close();
