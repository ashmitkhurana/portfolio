// Does each home section's content fit one viewport (below the fixed header)? Optional screenshots per section.
// usage: node scripts/journey/sectionfit.mjs [shotPrefix] [sizes comma list] [sections comma list]
import { chromium } from "playwright";
const [,, shot, sizesArg, secArg] = process.argv;
const SIZES = (sizesArg || "1280x800,1440x900,1512x982,1920x1080,2560x1440,3440x1440,1024x768,390x844,440x956,375x667").split(",");
const SECTIONS = (secArg || "work,build,experience,terminal").split(",");
const b = await chromium.launch({ args: ["--use-gl=angle"] });
for (const size of SIZES) {
  const [w, h] = size.split("x").map(Number);
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  for (const id of SECTIONS) {
    const r = await p.evaluate(([id, vh]) => {
      const s = document.querySelector(id.startsWith(".") ? id : `[data-section="${id}"]`);
      if (!s) return null;
      const header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 0;
      const sTop = s.getBoundingClientRect().top;
      // content = leaf elements with a box, plus whole cards / windows (their borders are visible)
      const els = [...s.querySelectorAll("*")].filter((el) => (el.children.length === 0 && !el.matches(".glyph")) || el.matches(".project-card,.terminal-window,.display__line"));
      const bad = [];
      let screens = 0, right = -Infinity;
      for (const el of els) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        if (el.closest("svg") && el.tagName !== "svg") continue;
        const rr = el.getBoundingClientRect();
        if (rr.width === 0 || rr.height === 0) continue;
        if (el.closest(".term__output")) continue; // terminal text scrolls inside its window
        right = Math.max(right, rr.right);
        const t = rr.top - sTop, bt = rr.bottom - sTop;
        const k = Math.floor((t + 0.5) / vh);
        screens = Math.max(screens, k + 1);
        if (t < k * vh + header - 1 || bt > (k + 1) * vh + 1) bad.push(`${el.tagName.toLowerCase()}.${(el.className && el.className.baseVal === undefined ? el.className : "").toString().split(" ")[0]} ${t.toFixed(0)}..${bt.toFixed(0)}`);
      }
      return { secH: s.getBoundingClientRect().height, screens, bad: bad.slice(0, 4), overflowX: right - innerWidth, header };
    }, [id, h]);
    if (!r) { console.log(size, id, "missing"); continue; }
    const fits = r.bad.length === 0 && r.overflowX <= 1;
    console.log(`${size.padEnd(10)} ${id.padEnd(10)} section ${r.secH.toFixed(0).padStart(5)} screens ${r.screens} ${fits ? "FITS" : "NO FIT " + r.bad.join(" | ")}${r.overflowX > 1 ? " overflowX " + r.overflowX.toFixed(0) : ""}`);
    if (shot) {
      for (let k = 0; k < r.screens; k++) {
        await p.evaluate(([id, k, vh]) => { const s = document.querySelector(id.startsWith(".") ? id : `[data-section="${id}"]`); window.scrollTo(0, s.getBoundingClientRect().top + scrollY + k * vh); }, [id, k, h]);
        await p.waitForTimeout(900);
        await p.screenshot({ path: `${shot}_${size}_${id}${r.screens > 1 ? "_" + (k + 1) : ""}.png` });
      }
    }
  }
  await p.close();
}
await b.close();
