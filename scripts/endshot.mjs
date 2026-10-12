import { chromium } from "playwright";
const [,, out, ...sizes] = process.argv;
const b = await chromium.launch({ args: ["--use-gl=angle"] });
for (const s of sizes) {
  const [w, h] = s.split("x").map(Number);
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
  await p.waitForTimeout(3000);
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await p.waitForTimeout(3000);
  const info = await p.evaluate(() => { const h = document.querySelector("#contact-title").getBoundingClientRect(); return { top: h.top, sy: scrollY, max: document.documentElement.scrollHeight - innerHeight, bar: document.querySelector(".site-header__bar").getBoundingClientRect().bottom }; });
  console.log(s, JSON.stringify(info));
  await p.screenshot({ path: `${out}_${w}x${h}.png` });
  await p.close();
}
await b.close();
