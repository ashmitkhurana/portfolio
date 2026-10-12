// phone: open the terminal overlay from the header button, type help, shot (prompt visible, inside the screen)
import { chromium, webkit } from "playwright";
const b = process.env.ENGINE === "webkit" ? await webkit.launch() : await chromium.launch({ args: ["--use-gl=angle"] });
const [W, H] = (process.env.SIZE ?? "390x844").split("x").map(Number);
const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: process.env.ENGINE !== "webkit", hasTouch: true });
p.on("pageerror", (e) => console.log("pageerror", e.message));
p.on("console", (m) => { if (m.type() === "error") console.log("console", m.text().slice(0, 160)); });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForTimeout(2500);
await p.locator(".site-header button").first().click();
await p.waitForTimeout(600);
const input = p.locator(".term-overlay input").first();
await input.fill("help"); await input.press("Enter");
await p.waitForTimeout(600);
console.log(await p.evaluate(() => { const pn = document.querySelector(".term-overlay__panel").getBoundingClientRect(); const i = document.querySelector(".term-overlay input").getBoundingClientRect(); return `panel ${Math.round(pn.top)}-${Math.round(pn.bottom)} input ${Math.round(i.top)}-${Math.round(i.bottom)} of ${innerHeight}`; }));
await p.screenshot({ path: process.env.OUT });
await b.close();
