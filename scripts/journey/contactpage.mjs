// /contact: direct load and navbar navigation from the home page; frames during the intro and settled.
// usage: SIZE=390x844 TOUCH=1 OUT=<prefix> node scripts/journey/contactpage.mjs
import { chromium } from "playwright";
const [W, H] = (process.env.SIZE ?? "390x844").split("x").map(Number);
const touch = process.env.TOUCH === "1";
const out = process.env.OUT;
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: W, height: H }, ...(touch ? { deviceScaleFactor: 3, isMobile: true, hasTouch: true } : {}) });
p.on("pageerror", (e) => console.log("pageerror", e.message));
// direct
await p.goto("http://localhost:3100/contact", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.ready, null, { timeout: 40000 }).catch(() => console.log("not ready"));
await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}_d_mid.png` });
await p.waitForTimeout(5000);
await p.screenshot({ path: `${out}_d_end.png` });
// from home via the nav
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 }).catch(() => {});
await p.evaluate(() => window.scrollTo(0, 2000));
await p.waitForTimeout(1200);
await p.evaluate(() => { const a = [...document.querySelectorAll("a")].find((x) => x.getAttribute("href") === "/contact"); a?.click(); });
await p.waitForTimeout(1600);
console.log("url", p.url(), "scroll", await p.evaluate(() => Math.round(scrollY)));
await p.screenshot({ path: `${out}_n_mid.png` });
await p.waitForTimeout(5000);
await p.screenshot({ path: `${out}_n_end.png` });
console.log(await p.evaluate(() => { const s = window.__ribbonState.engine.sim.slide; return `settled ${s.introSettled} sigma ${s.sigma.toFixed(0)} lead ${s.lead.toFixed(0)} cam ${s.cameraBase} off ${s.offsetY}`; }));
await b.close();
