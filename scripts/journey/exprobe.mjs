import { chromium } from "playwright";
const [w, h] = (process.argv[2] || "390x844").split("x").map(Number);
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await p.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await p.waitForFunction(() => window.__ribbonState?.engine?.sim?.slide?.introSettled, null, { timeout: 40000 }).catch(() => console.log("intro not settled"));
const d = await p.evaluate(() => {
  const sl = window.__ribbonState.engine.sim.slide;
  const ex = document.querySelector("[data-section=experience]"), tm = document.querySelector("[data-section=terminal]");
  const top = ex.getBoundingClientRect().top;
  const R = (el) => { const r = el.getBoundingClientRect(); return [r.left, r.top - top, r.right, r.bottom - top].map(v => Math.round(v)); };
  const textR = (el) => { const rg = document.createRange(); rg.selectNodeContents(el); let m = 0; for (const r of rg.getClientRects()) m = Math.max(m, r.right); return Math.round(m); };
  const rooms = [...document.querySelectorAll("main [data-pin]")].map(p => [p.dataset.pin, p.parentElement.offsetHeight - p.offsetHeight]);
  return {
    hw: sl.end1().hw, camZ: sl.cameraZ, len: sl.length, spacing: sl.spacing, rooms,
    exTop: Math.round(top + scrollY), exH: ex.offsetHeight, termTop: Math.round(tm.getBoundingClientRect().top - top), termH: tm.offsetHeight,
    head: R(ex.querySelector(".experience__head")), label: R(ex.querySelector(".experience__head .label")), link: R(ex.querySelector(".experience__head a")),
    items: [...ex.querySelectorAll(".strip__item")].map(e => ({ r: R(e), text: Math.max(...[...e.querySelectorAll("p")].map(textR)) })),
    win: R(tm.querySelector(".terminal-window")), cap: R(tm.querySelector(".terminal__caption")),
    contactTop: Math.round(document.querySelector("[data-section=contact]").getBoundingClientRect().top - top),
    header: getComputedStyle(document.documentElement).getPropertyValue("--header-h"),
  };
});
console.log(JSON.stringify(d));
await b.close();
