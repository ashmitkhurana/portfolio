import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
await p.locator(".landscape-notice__button").click().catch(() => {});
let i = 0;
for (const s of ["build", "contact"]) {
  await p.evaluate((s) => window.scrollTo(0, document.querySelector(`[data-section="${s}"]`).getBoundingClientRect().top + scrollY), s);
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${process.env.OUT}_${i++}.png` });
}
console.log(await p.evaluate(() => { const h = document.getElementById("contact-title"); return `contact heading font ${getComputedStyle(h).fontSize} h ${h.offsetHeight}`; }));
await b.close();
