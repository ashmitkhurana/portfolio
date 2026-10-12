// Is the header backdrop on (data-covered) at given scroll positions? Home rests should be clear; mid-scroll covered.
import { chromium } from "playwright";
const [w, h] = (process.argv[2] || "1512x860").split("x").map(Number);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: w, height: h } });
for (const path of ["/", "/about", "/work"]) {
  await p.goto("http://localhost:3100" + path, { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  const max = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const secs = await p.evaluate(() => [...document.querySelectorAll("main section")].map(s => [s.dataset.section || s.className.split(" ")[0], Math.min(s.getBoundingClientRect().top + scrollY, document.documentElement.scrollHeight - innerHeight)]));
  const pts = path === "/" ? secs.map(([n, y]) => [n + "@rest", y]) : [];
  for (const f of [0, 0.15, 0.4, 0.7, 1]) pts.push([`${(f * 100).toFixed(0)}%`, Math.round(max * f)]);
  const res = [];
  for (const [n, y] of pts) {
    await p.evaluate((y) => window.scrollTo(0, y), y);
    await p.waitForTimeout(250);
    res.push(`${n}:${await p.evaluate(() => document.querySelector(".site-header").hasAttribute("data-covered") ? "COVER" : "clear")}`);
  }
  console.log(path, res.join("  "));
}
await b.close();
