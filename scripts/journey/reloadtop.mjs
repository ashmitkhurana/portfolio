// reload from mid-page: the page must come back at the very top
import { chromium, webkit } from "playwright";
const b = process.env.ENGINE === "webkit" ? await webkit.launch() : await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: process.env.ENGINE !== "webkit", hasTouch: true });
p.on("pageerror", (e) => console.log("pageerror", e.message));
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
await p.evaluate(() => window.scrollTo(0, 6000));
await p.waitForTimeout(1500);
console.log("before reload", await p.evaluate(() => Math.round(scrollY)));
await p.reload({ waitUntil: "networkidle" });
await p.waitForTimeout(3000);
console.log("after reload", await p.evaluate(() => Math.round(scrollY)));
await b.close();
