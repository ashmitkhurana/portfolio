// Headless check: with each section's top at the viewport top, does any visible content intrude into the
// fixed header band (0..header bar bottom)? Also reports sections whose content overflows the viewport.
// usage: node scripts/navclear.mjs [base] [sizes...]
import { chromium } from "playwright";
const base = process.argv[2] || "http://localhost:3100";
const sizes = process.argv.slice(3).length ? process.argv.slice(3)
  : ["1280x800","1440x900","1512x982","1920x1080","2560x1440","3440x1440","1024x768","390x844","440x956","375x667"];
const paths = ["/", "/about", "/work"];
const b = await chromium.launch();
let bad = 0;
for (const s of sizes) {
  const [w, h] = s.split("x").map(Number);
  const p = await b.newPage({ viewport: { width: w, height: h } });
  for (const path of paths) {
    await p.goto(base + path, { waitUntil: "networkidle" });
    await p.waitForTimeout(500);
    await p.evaluate((h) => { window.__home = h; }, path === "/");
    const res = await p.evaluate(async () => {
      const bar = document.querySelector(".site-header__bar");
      const band = bar.getBoundingClientRect().bottom;
      const out = [];
      const secs = [...document.querySelectorAll("main section, main > *:first-child")];
      for (const sec of new Set(secs)) {
        // resting position: section top at the viewport top, or the end of the page if it can't get there
        window.scrollTo(0, sec.getBoundingClientRect().top + scrollY);
        await new Promise(r => setTimeout(r, 80));
        const els = [...sec.querySelectorAll("h1,h2,h3,h4,p,a,li,button,img,span,dt,dd,label,input,figure")];
        let minTop = Infinity, who = "", maxBot = -Infinity, whoB = "";
        for (const e of els) {
          const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
          if (r.width < 1 || r.height < 1 || cs.visibility === "hidden" || +cs.opacity === 0) continue;
          if (e.closest("canvas") || e.closest(".sr-only")) continue; // visual glyph spans count too
          const id = e.tagName + "." + (e.className || "").toString().split(" ")[0];
          if (r.top < minTop) { minTop = r.top; who = id; }
          if (r.bottom > maxBot) { maxBot = r.bottom; whoB = id; }
        }
        const name = sec.dataset.section || sec.className.toString().split(" ")[0] || sec.tagName;
        if (minTop < band + 8) out.push(`${name}: ${who} top ${minTop.toFixed(0)} < band ${band.toFixed(0)}+8`);
        if (window.__home && maxBot > innerHeight) out.push(`${name}: ${whoB} bottom ${maxBot.toFixed(0)} > vh ${innerHeight}`);
      }
      return out;
    });
    for (const r of res) { bad++; console.log(`${s} ${path} ${r}`); }
  }
  await p.close();
}
await b.close();
console.log(bad ? `${bad} intrusions` : "clean");
