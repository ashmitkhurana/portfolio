#!/usr/bin/env node
/**
 * Layout QA: full-page screenshots of the static site at a matrix of viewport
 * sizes, plus hard assertions that nothing overflows horizontally.
 *
 *   node scripts/qa-screens.mjs                      # everything
 *   node scripts/qa-screens.mjs --widths 390,1512    # only these widths
 *   node scripts/qa-screens.mjs --routes /,/about    # only these routes ("404" = a missing page)
 *   node scripts/qa-screens.mjs --slices            # also save viewport-height strips (name__sNN.png), easier to inspect
 *   node scripts/qa-screens.mjs --base http://localhost:3300 --out ./some/dir
 *
 * Requires a running server (default http://localhost:3300) and Playwright
 * (devDependency). Pages are loaded with ?ribbon=0 so the ribbon canvases do
 * not get in the way of layout screenshots.
 *
 * Fails (exit 1) when, at any size, document.documentElement.scrollWidth >
 * innerWidth, or any visible element's right/left edge sticks out of the
 * viewport. Elements whose own scrollable overflow is clipped are reported as
 * warnings.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const DEFAULT_OUT =
  "/private/tmp/claude-501/-Users-ashmitkhurana-Development-studio-portfolio/428f1961-b6ad-4758-ba30-ff5eb1800006/scratchpad/layout";

const SIZES = [
  [320, 568], [375, 812], [390, 844], [430, 932],
  [844, 390],
  [768, 1024], [820, 1180], [1024, 1366], [1180, 820],
  [1280, 800], [1440, 900], [1512, 982], [1728, 1117], [1920, 1080],
  [2560, 1080], [3440, 1440],
];
const ROUTES = ["/", "/work", "/work/alpha-block", "/about", "404"];

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const base = arg("base", "http://localhost:3300").replace(/\/$/, "");
const out = arg("out", DEFAULT_OUT);
const widthFilter = arg("widths", "")
  .split(",")
  .filter(Boolean)
  .map(Number);
const routeFilter = arg("routes", "").split(",").filter(Boolean);
const noShots = process.argv.includes("--no-shots");
const slices = process.argv.includes("--slices");

const sizes = widthFilter.length ? SIZES.filter(([w]) => widthFilter.includes(w)) : SIZES;
const routes = routeFilter.length ? ROUTES.filter((r) => routeFilter.includes(r)) : ROUTES;

mkdirSync(out, { recursive: true });

const slug = (route) =>
  route === "/" ? "home" : route === "404" ? "404" : route.replace(/^\//, "").replace(/\//g, "-");

/** runs in the page */
function audit() {
  const vw = window.innerWidth;
  const sel = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) return `${s}#${el.id}`;
    const cls = [...el.classList].filter((c) => !c.startsWith("__")).slice(0, 2);
    if (cls.length) s += "." + cls.join(".");
    const parent = el.parentElement;
    if (parent && parent !== document.body) {
      const pc = [...parent.classList][0];
      if (pc) s = `.${pc} > ${s}`;
    }
    return s;
  };
  const doc = document.documentElement;
  const offenders = new Map();
  const warnings = new Map();
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (el.closest("[hidden]")) continue;
    if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
    if (el.classList.contains("visually-hidden") || el.classList.contains("skip-link")) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    // an element whose ancestor clips horizontally cannot actually overflow the viewport visually
    let clipped = false;
    for (let p = el.parentElement; p && p !== document.body && p !== doc; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "hidden" || ox === "clip") {
        const pr = p.getBoundingClientRect();
        if (pr.right <= vw + 0.5 && pr.left >= -0.5) {
          clipped = true;
          break;
        }
      }
    }
    if (clipped) continue;
    if (r.right > vw + 0.5 || r.left < -0.5) {
      const key = sel(el);
      const prev = offenders.get(key);
      const entry = { selector: key, left: Math.round(r.left), right: Math.round(r.right), vw };
      if (!prev || r.right > prev.right) offenders.set(key, entry);
    }
    if (
      el.scrollWidth > el.clientWidth + 1 &&
      (cs.overflowX === "hidden" || cs.overflowX === "clip") &&
      el.clientWidth > 0
    ) {
      warnings.set(sel(el), { selector: sel(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
    }
  }
  return {
    scrollWidth: doc.scrollWidth,
    innerWidth: vw,
    bodyScrollWidth: document.body.scrollWidth,
    offenders: [...offenders.values()],
    warnings: [...warnings.values()],
  };
}

const browser = await chromium.launch();
let failures = 0;
let checks = 0;
const jobs = Number(arg("jobs", "4"));

/** one viewport size: all routes (+ the mobile menu); output is buffered so parallel sizes do not interleave */
async function runSize([w, h]) {
  const lines = [];
  const log = (l) => lines.push(l);
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const route of routes) {
    const url = base + (route === "404" ? "/this-page-does-not-exist" : route) + "?ribbon=0";
    const res = await page.goto(url, { waitUntil: "networkidle" }).catch((e) => ({ error: e }));
    if (res?.error) {
      log(`FAIL ${route} @ ${w}x${h}: ${res.error.message}`);
      failures++;
      continue;
    }
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await page.evaluate(() => document.fonts.ready);
    // lazy images below the fold: scroll through once, then back to top
    await page.evaluate(async () => {
      const step = Math.max(300, window.innerHeight * 0.8);
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(250);
    const a = await page.evaluate(audit);
    const bad = a.scrollWidth > a.innerWidth || a.offenders.length > 0;
    checks++;
    if (bad) failures++;
    log(
      `${bad ? "FAIL" : "ok  "} ${route.padEnd(18)} ${w}x${h}  scrollW=${a.scrollWidth} (vw ${a.innerWidth})`,
    );
    for (const o of a.offenders.slice(0, 8))
      log(`       overflow: ${o.selector}  left=${o.left} right=${o.right} > ${o.vw}`);
    for (const o of a.warnings.slice(0, 4))
      log(`       warn clipped: ${o.selector}  scrollW=${o.scrollWidth} clientW=${o.clientWidth}`);
    if (!noShots) {
      const name = `${slug(route)}__${w}x${h}`;
      await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: true });
      if (route === "/") await page.screenshot({ path: path.join(out, `${name}__fold.png`) });
      if (slices) {
        const H = await page.evaluate(() => document.documentElement.scrollHeight);
        for (let i = 0; i * h < H; i++) {
          await page.screenshot({
            path: path.join(out, `${name}__s${String(i).padStart(2, "0")}.png`),
            fullPage: true,
            clip: { x: 0, y: i * h, width: w, height: Math.min(h, H - i * h) },
          });
        }
      }
    }
  }

  // mobile menu (hamburger visible below 768)
  if (w < 768 && (!routeFilter.length || routeFilter.includes("/"))) {
    await page.goto(base + "/?ribbon=0", { waitUntil: "networkidle" });
    await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
    await page.evaluate(() => document.fonts.ready);
    const burger = page.locator(".site-header__burger");
    if (await burger.isVisible()) {
      await burger.click();
      await page.waitForTimeout(300);
      const a = await page.evaluate(audit);
      const bad = a.scrollWidth > a.innerWidth || a.offenders.length > 0;
      checks++;
      if (bad) failures++;
      log(`${bad ? "FAIL" : "ok  "} ${"menu".padEnd(18)} ${w}x${h}  scrollW=${a.scrollWidth}`);
      for (const o of a.offenders.slice(0, 8))
        log(`       overflow: ${o.selector}  left=${o.left} right=${o.right} > ${o.vw}`);
      if (!noShots) await page.screenshot({ path: path.join(out, `menu__${w}x${h}.png`) });
    }
  }
  await ctx.close();
  console.log(lines.join("\n"));
}

const queue = [...sizes];
await Promise.all(
  Array.from({ length: Math.min(jobs, queue.length) }, async () => {
    while (queue.length) await runSize(queue.shift());
  }),
);
await browser.close();
console.log(failures ? `\n${failures} failing check(s)` : `\nAll ${checks} checks passed, no horizontal overflow.`);
console.log(`Screenshots: ${out}`);
process.exit(failures ? 1 : 0);
