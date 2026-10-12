// /contact entrance frames (direct load, or NAV=1: from the home page via the navbar link)
// usage: SIZE=390x844 TOUCH=1 OUT=<prefix> node scripts/journey/contactseq.mjs
import { chromium } from "playwright";
const [W, H] = (process.env.SIZE ?? "390x844").split("x").map(Number);
const touch = process.env.TOUCH === "1";
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: W, height: H }, ...(touch ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
p.on("pageerror", (e) => console.log("pageerror", e.message));
if (process.env.NAV === "1") {
  await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
  await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 }).catch(() => {});
  await p.evaluate(() => [...document.querySelectorAll("a")].find((x) => x.getAttribute("href") === "/contact")?.click());
} else {
  await p.goto("http://localhost:3100/contact", { waitUntil: "domcontentloaded" });
  await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.ready, null, { timeout: 40000 }).catch(() => console.log("not ready"));
}
const t0 = Date.now();
const ts = [0.5, 1.2, 1.9, 2.6, 3.4, 4.4, 7.5];
for (let i = 0; i < ts.length; i++) {
  const wait = ts[i] * 1000 - (Date.now() - t0);
  if (wait > 0) await p.waitForTimeout(wait);
  await p.screenshot({ path: `${process.env.OUT}_${i}.png` });
}
await b.close();
