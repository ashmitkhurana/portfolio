// /about -> /contact via the navbar: rapid frames over the first second (no stale ribbon, no content flash)
import { chromium } from "playwright";
const [W, H] = (process.env.SIZE ?? "1512x860").split("x").map(Number);
const touch = process.env.TOUCH === "1";
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: W, height: H }, ...(touch ? { deviceScaleFactor: 1, isMobile: true, hasTouch: true } : {}) });
p.on("pageerror", (e) => console.log("pageerror", e.message));
await p.goto("http://localhost:3100/about", { waitUntil: "networkidle" });
await p.waitForTimeout(3500);
await p.evaluate(() => [...document.querySelectorAll("a")].find((x) => x.getAttribute("href") === "/contact")?.click());
const t0 = Date.now();
for (let i = 0; i < 10; i++) {
  await p.screenshot({ path: `${process.env.OUT}_${String(i).padStart(2, "0")}.png` });
  const st = await p.evaluate(() => {
    const off = document.documentElement.hasAttribute("data-ribbon-off");
    const body = document.querySelector(".contact__body > *");
    return `off ${off} foot ${document.documentElement.dataset.footIntro ?? "-"} bodyOpacity ${body ? getComputedStyle(body).opacity : "-"} url ${location.pathname}`;
  });
  console.log(Date.now() - t0, "ms", st);
}
await b.close();
