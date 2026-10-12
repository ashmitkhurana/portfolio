// phone landscape: the notice, OKAY, then the static page
import { chromium } from "playwright";
const [W, H] = (process.env.SIZE ?? "844x390").split("x").map(Number);
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
p.on("pageerror", (e) => console.log("pageerror", e.message));
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
console.log("hover none:", await p.evaluate(() => matchMedia("(hover: none)").matches), "notice:", await p.locator(".landscape-notice").count());
await p.screenshot({ path: `${process.env.OUT}_0.png` });
await p.locator(".landscape-notice__button").click().catch(() => console.log("no button"));
await p.waitForTimeout(800);
await p.screenshot({ path: `${process.env.OUT}_1.png` });
const secs = ["unravel", "work", "build", "experience", "terminal", "contact"];
let i = 2;
for (const s of secs) {
  await p.evaluate((s) => window.scrollTo(0, document.querySelector(`[data-section="${s}"]`).getBoundingClientRect().top + scrollY), s);
  await p.waitForTimeout(900);
  await p.screenshot({ path: `${process.env.OUT}_${i++}.png` });
}
console.log("static:", await p.evaluate(() => { const s = window.__ribbonState.engine.sim.slide; return `sigma ${s.sigma.toFixed(0)} rooms ${[...document.querySelectorAll("main [data-pin]")].map((x) => x.parentElement.offsetHeight - x.offsetHeight).join(",")}`; }));
await p.reload({ waitUntil: "networkidle" }); await p.waitForTimeout(1500);
console.log("notice after OKAY + reload:", await p.locator(".landscape-notice").count());
await b.close();
