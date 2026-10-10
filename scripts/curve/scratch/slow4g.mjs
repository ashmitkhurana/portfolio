import { chromium } from "playwright";
const [,, out, size, url = "http://localhost:3100/"] = process.argv;
const [w, h] = size.split("x").map(Number);
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const ctx = await b.newContext({ viewport: { width: w, height: h } });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 562.5, downloadThroughput: 180000, uploadThroughput: 84375 });
const logs = [];
p.on("console", (m) => { if (["error", "warning"].includes(m.type()) || /ribbon/.test(m.text())) logs.push(`${((Date.now() - t0) / 1000).toFixed(1)}s ${m.type()} ${m.text().slice(0, 6000).replace(/\n/g," | ")}`); });
p.on("pageerror", (e) => logs.push(`pageerror ${e.message}`));
const t0 = Date.now();
p.goto(url).catch((e) => logs.push("goto " + e.message));
const marks = [2, 4, 6, 9, 12, 16, 20, 25, 30, 40];
for (const s of marks) {
  await p.waitForTimeout(Math.max(0, s * 1000 - (Date.now() - t0)));
  const st = await p.evaluate(() => ({ phase: window.__ribbonState?.phase, settled: window.__ribbonState?.introSettled, fonts: document.fonts.status, typing: document.getElementById("hero-title")?.dataset.typing ?? null, typed: document.querySelectorAll("#hero-title .glyph.is-typed").length })).catch((e) => ({ err: e.message }));
  logs.push(`${s}s state ${JSON.stringify(st)}`);
  await p.screenshot({ path: `${out}_${String(s).padStart(2, "0")}.png` }).catch(() => {});
}
console.log(logs.join("\n"));
await b.close();
