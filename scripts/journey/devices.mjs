// Device / fallback sweep of the home page: frames at each section (+ /contact).
// usage: SIZE=768x1024 [TOUCH=1] [RM=1 reduced motion] [NOGL=1 no WebGL] [CPU=4 throttle] OUT=<prefix> node scripts/journey/devices.mjs
import { chromium } from "playwright";
const [W, H] = (process.env.SIZE ?? "390x844").split("x").map(Number);
const touch = process.env.TOUCH === "1";
const args = process.env.NOGL === "1" ? ["--disable-webgl", "--disable-webgl2", "--disable-gpu"] : ["--use-gl=angle"];
const b = await chromium.launch({ args });
const ctx = await b.newContext({ viewport: { width: W, height: H }, reducedMotion: process.env.RM === "1" ? "reduce" : "no-preference", ...(touch ? { deviceScaleFactor: 2, isMobile: true, hasTouch: true } : {}) });
const p = await ctx.newPage();
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.introSettled || ["poster", "off"].includes(window.__ribbonState?.phase), null, { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(1200);
const phase = await p.evaluate(() => `${window.__ribbonState?.phase} tier ${window.__ribbonState?.tier}`);
if (process.env.CPU) { const c = await ctx.newCDPSession(p); await c.send("Emulation.setCPUThrottlingRate", { rate: +process.env.CPU }); }
const shots = [["hero", 0], ["unravel", 0.6], ["work", 0.4], ["build", 0.82], ["experience", 0.35], ["terminal", 0.02], ["contact", 0]];
let i = 0;
const fpsLog = [];
for (const [name, q] of shots) {
  const y = await p.evaluate(([name, q]) => {
    const s = document.querySelector(`[data-section="${name}"]`);
    if (!s) return -1;
    const pinEl = s.querySelector("[data-pin]") ?? s.closest(".exterm")?.querySelector("[data-pin]");
    const sec = pinEl ? pinEl.parentElement : s;
    const room = pinEl ? sec.offsetHeight - pinEl.offsetHeight : 0;
    const top = s.getBoundingClientRect().top + scrollY;
    return room > 1 && s.contains(pinEl) ? top + q * room : top + q * innerHeight;
  }, [name, q]);
  if (y < 0) continue;
  // scroll there in steps (like a user), measuring frame times on the way
  const from = await p.evaluate(() => scrollY);
  const steps = 12;
  const t = await p.evaluate(async ([from, y, steps]) => {
    const times = [];
    let last = performance.now();
    for (let k = 1; k <= steps; k++) {
      window.scrollTo(0, from + ((y - from) * k) / steps);
      await new Promise((r) => requestAnimationFrame(() => r()));
      const now = performance.now(); times.push(now - last); last = now;
    }
    return times;
  }, [from, y, steps]);
  fpsLog.push(...t);
  await p.waitForTimeout(1800);
  await p.screenshot({ path: `${process.env.OUT}_${i++}_${name}.png` });
}
const sorted = fpsLog.slice().sort((a, b) => a - b);
console.log(`${W}x${H}${touch ? " touch" : ""}${process.env.RM ? " reduced-motion" : ""}${process.env.NOGL ? " no-webgl" : ""}${process.env.CPU ? " cpu/" + process.env.CPU : ""}: phase ${phase}; frame ms median ${sorted[Math.floor(sorted.length / 2)]?.toFixed(1)} p90 ${sorted[Math.floor(sorted.length * 0.9)]?.toFixed(1)}; errors ${errs.length ? errs.join(" | ").slice(0, 200) : "none"}`);
await b.close();
