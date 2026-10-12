// Page end on the home page: heading font size (vs its width-fit size), heading top vs header bar, footer fit.
import { chromium } from "playwright";
const sizes = process.argv.slice(2).length ? process.argv.slice(2)
  : ["1280x800","1440x900","1512x982","1920x1080","2560x1440","3440x1440","1024x768","390x844","440x956","375x667","1512x860","1440x780","1280x680","1000x578","1600x925"];
const b = await chromium.launch();
for (const s of sizes) {
  const [w, h] = s.split("x").map(Number);
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
  await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await p.waitForTimeout(700);
  const r = await p.evaluate(() => {
    const hd = document.querySelector("#contact-title"), bar = document.querySelector(".site-header__bar");
    const glyphs = [...document.querySelectorAll("#contact *")].filter(e => e.getBoundingClientRect().height > 0);
    const top = Math.min(...glyphs.map(e => e.getBoundingClientRect().top));
    const foot = document.querySelector(".site-footer").getBoundingClientRect();
    return { font: parseFloat(getComputedStyle(hd).fontSize).toFixed(0), top: top.toFixed(0), bar: bar.getBoundingClientRect().bottom, footTop: foot.top.toFixed(0), footBot: foot.bottom.toFixed(0) };
  });
  // ink: topmost cream row inside the heading's box column, ignoring the header controls' own rects
  const box = await p.evaluate(() => {
    const r = document.querySelector("#contact-title").getBoundingClientRect();
    const ctl = [...document.querySelectorAll(".site-header__bar a, .site-header__bar button")].map(e => e.getBoundingClientRect());
    return { x0: r.left, x1: r.right, ctlBottom: Math.max(...ctl.map(c => c.bottom)), ctl: ctl.map(c => [c.left, c.top, c.right, c.bottom]) };
  });
  // hide the header to read the heading's ink alone
  await p.addStyleTag({ content: ".site-header{visibility:hidden}" });
  await p.waitForTimeout(100);
  const out = (process.env.OUT || "/tmp") + `/cf_${w}x${h}`;
  await p.screenshot({ path: out + ".png", clip: { x: 0, y: 0, width: w, height: Math.min(h, 400) } });
  r.x0 = box.x0; r.x1 = box.x1; r.ctlBottom = box.ctlBottom;
  console.log("JSON", s, JSON.stringify(r), out);
  await p.close();
}
await b.close();
