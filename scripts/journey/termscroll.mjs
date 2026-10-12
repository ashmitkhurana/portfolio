// the terminal's output scrolls inside: type commands until it overflows, wheel (desktop) / touch drag (phone) over it
import { chromium } from "playwright";
const [W, H] = (process.env.SIZE ?? "1512x860").split("x").map(Number);
const touch = process.env.TOUCH === "1";
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: W, height: H }, ...(touch ? { deviceScaleFactor: 1, isMobile: true, hasTouch: true } : {}) });
p.on("pageerror", (e) => console.log("pageerror", e.message));
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 }).catch(() => {});
const y = await p.evaluate(() => document.querySelector(".terminal-window").getBoundingClientRect().top + scrollY - 200);
await p.evaluate((y) => window.scrollTo(0, y), y);
await p.waitForTimeout(1500);
const input = p.locator(".terminal-window input").first();
for (let i = 0; i < 4; i++) { await input.fill("help"); await input.press("Enter"); await p.waitForTimeout(250); }
const st = () => p.evaluate(() => { const o = document.querySelector(".terminal-window .term__output"); return `out ${Math.round(o.scrollTop)}/${o.scrollHeight - o.clientHeight} page ${Math.round(scrollY)}`; });
console.log("after typing", await st());
const r = await p.evaluate(() => { const b = document.querySelector(".terminal-window .term__output").getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
if (touch) {
  const cdp = await p.context().newCDPSession(p);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: r.x, y: r.y - 60 }] });
  for (let k = 1; k <= 10; k++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: r.x, y: r.y - 60 + 12 * k }] }); await p.waitForTimeout(16); }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
} else {
  await p.mouse.move(r.x, r.y);
  for (let k = 0; k < 4; k++) { await p.mouse.wheel(0, -120); await p.waitForTimeout(80); }
}
await p.waitForTimeout(700);
console.log("after scrolling up inside", await st());
await b.close();
