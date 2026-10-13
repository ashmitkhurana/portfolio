import { chromium, devices } from "playwright";
const dev = devices["Pixel 5"];
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const ctx = await b.newContext({ ...dev });
const p = await ctx.newPage();
await p.goto((process.env.BASE ?? "https://www.ashmitkhurana.com") + "/", { waitUntil: "networkidle" });
await p.waitForTimeout(3000);
const yT = await p.evaluate(() => document.querySelector('[data-section="terminal"]').getBoundingClientRect().top + scrollY);
await p.evaluate((y) => scrollTo(0, y), yT); await p.waitForTimeout(1200);
console.log(await p.evaluate(() => {
  const out = [];
  for (const y of [300, 450, 581, 620]) {
    const el = document.elementFromPoint(195, y);
    const chain = [];
    for (let e = el; e && chain.length < 6; e = e.parentElement) { const c = getComputedStyle(e); chain.push(`${e.tagName.toLowerCase()}.${(e.className || "").toString().split(" ")[0]} ov=${c.overflowY} ta=${c.touchAction} sh=${e.scrollHeight}/${e.clientHeight}`); }
    out.push(y + ": " + chain.join(" < "));
  }
  return out.join("\n");
}));
await b.close();
