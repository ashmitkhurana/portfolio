// /contact -> home (logo link): the journey rebuilds; frames at the top and in section 2 / How I Build
import { chromium } from "playwright";
const [W, H] = (process.env.SIZE ?? "390x844").split("x").map(Number);
const touch = process.env.TOUCH === "1";
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: W, height: H }, ...(touch ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
p.on("pageerror", (e) => console.log("pageerror", e.message));
await p.goto("http://localhost:3100/contact", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 }).catch(() => {});
await p.evaluate(() => { const a = [...document.querySelectorAll("a")].find((x) => x.getAttribute("href") === "/"); a?.click(); });
await p.waitForTimeout(2000);
const out = process.env.OUT;
await p.screenshot({ path: `${out}_0.png` });
const s2 = await p.evaluate(() => { const s = document.querySelector('[data-section="unravel"]'); return s.getBoundingClientRect().top + scrollY + 0.6 * (s.offsetHeight - innerHeight); });
for (const y of [400, 900, s2]) { await p.evaluate((y) => window.scrollTo(0, y), y); await p.waitForTimeout(900); }
await p.waitForTimeout(1200);
await p.screenshot({ path: `${out}_1.png` });
console.log(p.url(), await p.evaluate(() => { const s = window.__ribbonState.engine.sim.slide; return `sigma ${s.sigma.toFixed(0)} lead ${s.lead.toFixed(0)} cam ${s.cameraBase}`; }));
await b.close();
