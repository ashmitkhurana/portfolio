import { chromium } from "playwright";
const b = await chromium.launch();
for (const [w,h] of [[1440,900],[390,844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto("http://localhost:4100/", { waitUntil: "networkidle" });
  const r = await p.evaluate(() => {
    const el = document.querySelector('[data-ribbon-anchor="hero-name"]');
    const ls = [...el.querySelectorAll(".display__line")].map(l => l.getBoundingClientRect());
    const x0 = Math.min(...ls.map(b => b.left)), y0 = Math.min(...ls.map(b => b.top)), x1 = Math.max(...ls.map(b => b.right)), y1 = Math.max(...ls.map(b => b.bottom));
    return { left: x0 + scrollX, top: y0 + scrollY, width: x1 - x0, height: y1 - y0, n: ls.length };
  });
  console.log(JSON.stringify({ viewW: w, viewH: h, fov: 26.4, anchor: r }));
  await p.close();
}
await b.close();
