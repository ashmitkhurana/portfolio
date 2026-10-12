// /contact (entrance finished) -> home via the logo: frames over the first seconds (hero intro, no reverse)
import { chromium } from "playwright";
const [W, H] = (process.env.SIZE ?? "1512x860").split("x").map(Number);
const touch = process.env.TOUCH === "1";
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: W, height: H }, ...(touch ? { deviceScaleFactor: 1, isMobile: true, hasTouch: true } : {}) });
p.on("pageerror", (e) => console.log("pageerror", e.message));
await p.goto("http://localhost:3100/contact", { waitUntil: "networkidle" });
await p.waitForTimeout(9000);
await p.evaluate(() => [...document.querySelectorAll("a")].find((x) => x.getAttribute("href") === "/")?.click());
const t0 = Date.now();
const ts = [0.15, 0.6, 1.4, 2.4, 3.4, 5.2];
for (let i = 0; i < ts.length; i++) {
  const w = ts[i] * 1000 - (Date.now() - t0);
  if (w > 0) await p.waitForTimeout(w);
  await p.screenshot({ path: `${process.env.OUT}_${i}.png` });
}
console.log(p.url(), await p.evaluate(() => { const s = window.__ribbonState.engine.sim.slide; return `settled ${s.introSettled} sigma ${s.sigma.toFixed(0)}`; }));
await b.close();
