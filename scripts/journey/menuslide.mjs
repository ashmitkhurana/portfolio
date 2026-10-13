import { chromium } from "playwright";
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await p.goto("http://localhost:3100/about", { waitUntil: "networkidle" });
await p.waitForTimeout(1000);
const r = await p.evaluate(async () => {
  const m = document.querySelector(".mobile-menu");
  const btn = [...document.querySelectorAll(".site-header button[aria-controls]")].pop();
  const xs = [];
  btn.click();
  const t0 = performance.now();
  while (performance.now() - t0 < 600) {
    await new Promise((res) => requestAnimationFrame(res));
    xs.push(Math.round(m.getBoundingClientRect().left));
  }
  return xs.filter((_, i) => i % 3 === 0).join(",");
});
console.log("open: menu left edge per frame:", r);
await b.close();
