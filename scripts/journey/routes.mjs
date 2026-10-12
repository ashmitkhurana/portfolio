// /work and /about (no ribbon), direct and via the nav from the home page; then back to /contact (ribbon)
import { chromium } from "playwright";
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
p.on("pageerror", (e) => console.log("pageerror", e.message));
const vis = () => p.evaluate(() => getComputedStyle(document.querySelector(".ribbon-layer--front") ?? document.body).visibility);
for (const path of ["/work", "/about"]) {
  await p.goto("http://localhost:3100" + path, { waitUntil: "networkidle" });
  await p.waitForTimeout(2500);
  console.log(path, "direct: layer", await vis());
  await p.screenshot({ path: `${process.env.OUT}${path.slice(1)}.png` });
}
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForTimeout(3000);
console.log("/ layer", await vis());
await p.evaluate(() => [...document.querySelectorAll("a")].find((x) => x.getAttribute("href") === "/about")?.click());
await p.waitForTimeout(1500);
console.log("nav -> /about layer", await vis());
await p.evaluate(() => [...document.querySelectorAll("a")].find((x) => x.getAttribute("href") === "/contact")?.click());
await p.waitForTimeout(1500);
console.log("nav -> /contact layer", await vis());
await b.close();
