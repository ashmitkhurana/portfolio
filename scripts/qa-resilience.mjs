#!/usr/bin/env node
/**
 * Resilience QA: the site must never be broken, blank, janky or stuck on any
 * device / browser. Headless Playwright only (never the user's real browser).
 *
 *   node scripts/qa-resilience.mjs                      # every case
 *   node scripts/qa-resilience.mjs --only nogpu,nojs    # some cases (ids, comma separated)
 *   node scripts/qa-resilience.mjs --base http://localhost:3500 --out ./dir
 *
 * Needs a running server (production build recommended: `NEXT_DIST_DIR=.next-res
 * next build && next start -p 3500`). For every case it asserts:
 *   - the content is visible (hero heading rendered, non-empty, inside the viewport width)
 *   - no uncaught errors and no console errors
 *   - the expected capability tier was logged ("[ribbon] tier Tn ...") and ended up active
 *   - no horizontal overflow
 * plus case specific checks (no three.js downloaded for T1, posters visible,
 * context loss -> posters, static pose under reduced motion, ...), and saves a
 * screenshot per case. Exit code 1 when any case fails.
 */
import { chromium, firefox, webkit, devices } from "playwright";
import { mkdirSync } from "node:fs";
import path from "node:path";

const DEFAULT_OUT =
  "/private/tmp/claude-501/-Users-ashmitkhurana-Development-studio-portfolio/428f1961-b6ad-4758-ba30-ff5eb1800006/scratchpad/resilience";
function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}
const base = arg("base", "http://localhost:3500").replace(/\/$/, "");
const out = arg("out", DEFAULT_OUT);
const only = arg("only", "").split(",").filter(Boolean);
mkdirSync(out, { recursive: true });

/** Chromium with the real GPU (Metal ANGLE): new headless mode, not the software-only headless shell */
const GPU = { channel: "chromium", args: ["--use-angle=metal", "--ignore-gpu-blocklist"] };
/** old headless shell: SwiftShader software GL unless told otherwise */
const SOFT = { args: ["--disable-gpu"] };
const SWIFT = { args: ["--use-gl=swiftshader"] };

const D = { w: 1280, h: 800 };

/**
 * expect.tier: number | number[] (final tier), expect.phase: "live" | "poster" | "off"
 * (null = no JS, the checks are DOM based).
 */
const CASES = [
  { id: "chromium-gpu", engine: chromium, launch: GPU, expect: { tier: [3, 4], phase: "live" } },
  { id: "chromium-disable-gpu", engine: chromium, launch: SOFT, expect: { tier: 1, phase: "poster", noEngine: true } },
  { id: "chromium-swiftshader", engine: chromium, launch: SWIFT, expect: { tier: 1, phase: "poster", noEngine: true } },
  { id: "webkit", engine: webkit, launch: {}, expect: { tier: [1, 2, 3, 4], phase: ["live", "poster"] } },
  { id: "firefox", engine: firefox, launch: {}, expect: { tier: [1, 2, 3, 4], phase: ["live", "poster"] } },
  {
    id: "iphone13", engine: webkit, launch: {}, device: "iPhone 13",
    expect: { tier: [1, 2, 3, 4], phase: ["live", "poster"] },
  },
  {
    id: "pixel7", engine: chromium, launch: GPU, device: "Pixel 7",
    expect: { tier: [2, 3], phase: "live", touch: true },
  },
  {
    id: "cpu-throttle-4x", engine: chromium, launch: GPU, throttle: 4,
    expect: { tier: 2, phase: "live", settle: 12000 },
  },
  { id: "nojs", engine: chromium, launch: GPU, context: { javaScriptEnabled: false }, expect: { tier: null, phase: null, noJs: true } },
  { id: "tier0", engine: chromium, launch: GPU, query: "?tier=0", expect: { tier: 0, phase: "poster", noEngine: true } },
  { id: "tier1", engine: chromium, launch: GPU, query: "?tier=1", expect: { tier: 1, phase: "poster", noEngine: true } },
  {
    id: "phone-poster", engine: chromium, launch: GPU, device: "Pixel 7", query: "?tier=1",
    expect: { tier: 1, phase: "poster", noEngine: true },
  },
  { id: "tier2", engine: chromium, launch: GPU, query: "?tier=2", expect: { tier: 2, phase: "live" } },
  { id: "tier3", engine: chromium, launch: GPU, query: "?tier=3", expect: { tier: 3, phase: "live" } },
  { id: "tier4", engine: chromium, launch: GPU, query: "?tier=4", expect: { tier: 4, phase: "live" } },
  {
    id: "context-loss", engine: chromium, launch: GPU,
    expect: { tier: 1, phase: "poster", warns: 1 },
    run: async (page) => {
      await page.evaluate(() => window.__ribbonState.loseContext());
      await page.waitForFunction(() => window.__ribbonState?.phase === "poster", null, { timeout: 8000 });
      await page.waitForTimeout(1200);
    },
  },
  {
    id: "reduced-motion", engine: chromium, launch: GPU, context: { reducedMotion: "reduce" },
    expect: { tier: [2, 3, 4], phase: "live" },
    run: async (page, c) => {
      await page.waitForTimeout(2500); // startup window (probe) is over: the pose is now idle-static
      const a = await page.screenshot();
      await page.waitForTimeout(1500);
      const b = await page.screenshot();
      c.check("static pose: two frames 1.5 s apart are identical", a.equals(b));
      // live toggle: switching to no-preference must not break anything
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await page.waitForTimeout(600);
    },
  },
  {
    id: "forced-colors", engine: chromium, launch: GPU, context: { forcedColors: "active" },
    expect: { tier: 1, phase: "off", noEngine: true, layersHidden: true },
  },
  {
    id: "no-offscreencanvas", engine: chromium, launch: GPU,
    init: () => { delete window.OffscreenCanvas; },
    expect: { tier: 1, phase: "poster", noEngine: true },
  },
  {
    id: "save-data", engine: chromium, launch: GPU,
    init: () => {
      Object.defineProperty(navigator, "connection", { get: () => ({ saveData: true, effectiveType: "4g" }) });
    },
    expect: { tier: 1, phase: "poster", noEngine: true },
  },
  {
    id: "webgl-context-failure", engine: chromium, launch: GPU,
    init: () => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (t, ...r) {
        return t === "webgl2" || t === "webgl" ? null : orig.call(this, t, ...r);
      };
    },
    expect: { tier: 1, phase: "poster", noEngine: true },
  },
  {
    id: "engine-timeout", engine: chromium, launch: GPU,
    // every lazily loaded chunk takes 6 s: the 4 s deadline must give up on live rendering
    delayLazyChunks: 6000,
    expect: { tier: 1, phase: "poster", warns: 1, settle: 9000 },
  },
  {
    id: "engine-throws", engine: chromium, launch: GPU,
    init: () => {
      const orig = OffscreenCanvas.prototype.getContext;
      let n = 0;
      // the engine's own renderer fails on its first real use; the probe contexts are unaffected
      OffscreenCanvas.prototype.getContext = function (t, ...r) {
        if (t === "webgl2" && ++n > 1) throw new Error("boom (simulated engine failure)");
        return orig.call(this, t, ...r);
      };
    },
    expect: { tier: 1, phase: "poster", warns: 1 },
  },
  {
    id: "tier-cache", engine: chromium, launch: GPU, throttle: 4, persistent: true,
    expect: { tier: 2, phase: "live", settle: 12000 },
    run: async (page, c, ctx) => {
      // second visit, no throttle: starts at the cached tier
      await page.close();
      const p2 = await ctx.newPage();
      const logs = [];
      p2.on("console", (m) => logs.push(m.text()));
      await p2.goto(`${base}/`, { waitUntil: "load" });
      await p2.waitForFunction(() => window.__ribbonState?.phase === "live", null, { timeout: 15000 });
      c.check(
        "cache: next visit starts at the cached tier",
        logs.some((l) => /\[ribbon\] tier T2 .*\[cache\]/.test(l)),
        logs.filter((l) => l.includes("[ribbon]")).join(" | "),
      );
      c.swap(p2);
    },
  },
];

const results = [];

async function runCase(cfg) {
  const checks = [];
  const check = (name, ok, detail = "") => checks.push({ name, ok: !!ok, detail });
  const logs = [];
  const errors = [];
  const warns = [];
  let page;
  const swapRef = { page: null };
  const t0 = Date.now();
  const browserOpts = { headless: true, ...cfg.launch };
  let browser;
  try {
    browser = await cfg.engine.launch(browserOpts);
  } catch (err) {
    // an environment problem (browser binary cannot start here), not a site failure
    results.push({ id: cfg.id, ok: true, skipped: true, checks, tierLine: "SKIPPED: browser failed to launch", ms: 0 });
    console.log(`SKIP  ${cfg.id.padEnd(22)} browser failed to launch: ${String(err.message).split("\n")[0]}`);
    return;
  }
  try {
    const dev = cfg.device ? devices[cfg.device] : null;
    const ctxOpts = {
      ...(dev ?? { viewport: { width: D.w, height: D.h }, deviceScaleFactor: 1 }),
      ...(cfg.context ?? {}),
    };
    const ctx = await browser.newContext(ctxOpts);
    if (cfg.init) await ctx.addInitScript(cfg.init);
    page = await ctx.newPage();
    let enginePulled = false;
    page.on("console", (m) => {
      const t = m.text();
      logs.push(`${m.type()}: ${t}`);
      if (m.type() === "error") errors.push(`console.error: ${t}`);
      if (m.type() === "warning" && /\[ribbon\]/.test(t)) warns.push(t);
    });
    page.on("pageerror", (e) => errors.push(`uncaught: ${e.message}`));
    page.on("response", async (r) => {
      try {
        if (r.url().endsWith(".js") && (await r.text()).includes("MeshPhysicalMaterial")) enginePulled = true;
      } catch {}
    });
    if (cfg.delayLazyChunks) {
      let loaded = false;
      page.on("load", () => { loaded = true; });
      await page.route("**/_next/static/chunks/**", async (route) => {
        if (loaded) await new Promise((r) => setTimeout(r, cfg.delayLazyChunks));
        await route.continue().catch(() => {});
      });
    }
    if (cfg.throttle) {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: cfg.throttle });
    }

    await page.goto(`${base}/${cfg.query ?? ""}`, { waitUntil: "load" });

    const ex = cfg.expect;
    if (ex.phase !== null) {
      const want = Array.isArray(ex.phase) ? ex.phase : [ex.phase];
      // wait for the final phase (+ probe lock for live tiers)
      const settle = ex.settle ?? 9000;
      await page
        .waitForFunction(
          (w) => w.includes(window.__ribbonState?.phase),
          want,
          { timeout: settle + 6000 },
        )
        .catch(() => {});
      if (want.includes("live")) {
        await page
          .waitForFunction(() => document.documentElement.dataset.ribbon === "live", null, { timeout: 4000 })
          .catch(() => {});
        // let the 1.5 s probe lock (or settle on the downgrade)
        const until = Date.now() + settle;
        let lastTier = null;
        let stableSince = Date.now();
        while (Date.now() < until) {
          const t = await page.evaluate(() => window.__ribbonState?.tier ?? null);
          if (t !== lastTier) { lastTier = t; stableSince = Date.now(); }
          const locked = logs.some((l) => /\[ribbon\] tier T\d \(\w+\) (locked|downgraded)/.test(l));
          if (cfg.expect.noLockWait || ((locked || /override|cache/.test(logs.join("\n"))) && Date.now() - stableSince > 2500)) break;
          await page.waitForTimeout(300);
        }
      } else {
        await page.waitForTimeout(1300); // poster fade
      }
    } else {
      await page.waitForTimeout(1500);
    }

    const run = cfg.run;
    if (run) {
      const api = { check, swap: (p) => { swapRef.page = p; page = p; } };
      await run(page, api, ctx, cfg);
      page = swapRef.page ?? page;
    }

    // ---- common assertions
    const state = ex.phase === null ? null : await page.evaluate(() => {
      const s = window.__ribbonState;
      return s ? { tier: s.tier, phase: s.phase, reason: s.reason } : null;
    });
    const dom = await page.evaluate(() => {
      const h1 = document.querySelector("h1");
      const r = h1?.getBoundingClientRect();
      return {
        h1: !!h1 && (h1.textContent || "").trim().length > 0,
        h1w: r ? Math.round(r.width) : 0,
        h1vis: h1 ? getComputedStyle(h1).visibility !== "hidden" && getComputedStyle(h1).opacity !== "0" : false,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        iw: window.innerWidth,
        main: document.getElementById("content")?.getBoundingClientRect().height ?? 0,
        layersDisplay: [...document.querySelectorAll(".ribbon-layer")].map((l) => getComputedStyle(l).display),
        canvases: [...document.querySelectorAll(".ribbon-layer canvas")].map((c) => ({
          aria: c.getAttribute("aria-hidden"), role: c.getAttribute("role"), tab: c.tabIndex,
        })),
        posters: [...document.querySelectorAll(".ribbon-layer img")].map((i) => ({
          ok: i.complete && i.naturalWidth > 0,
          visible: getComputedStyle(i.closest(".ribbon-poster-wrap") ?? i).opacity,
          src: i.currentSrc.replace(location.origin, ""),
        })),
      };
    });
    check("content visible (hero heading rendered)", dom.h1 && dom.h1vis && dom.h1w > 100 && dom.main > 300, `h1w=${dom.h1w} main=${Math.round(dom.main)}`);
    check("no horizontal overflow", dom.overflow <= 0, `overflow=${dom.overflow}`);
    check("no uncaught errors / console errors", errors.length === 0, errors.slice(0, 2).join(" | "));

    if (ex.phase !== null) {
      const tiers = Array.isArray(ex.tier) ? ex.tier : [ex.tier];
      const phases = Array.isArray(ex.phase) ? ex.phase : [ex.phase];
      const logged = logs
        .map((l) => l.match(/\[ribbon\] tier T(\d)/))
        .filter(Boolean)
        .map((m) => Number(m[1]));
      check(
        `tier logged and final tier in [${tiers}]`,
        logged.length > 0 && tiers.includes(state?.tier) && tiers.some((t) => logged.includes(t) || (t === 1 && state?.tier === 1)),
        `logged=${logged} final=${state?.tier} (${state?.reason})`,
      );
      check(`phase in [${phases}]`, phases.includes(state?.phase), `phase=${state?.phase}`);
      if (ex.noEngine) check("three.js / engine chunk never downloaded", !enginePulled);
      if (ex.phase === "poster" || (Array.isArray(ex.phase) && state?.phase === "poster")) {
        check("posters visible and decoded", dom.posters.length >= 2 && dom.posters.every((p) => p.ok && p.visible === "1"), JSON.stringify(dom.posters));
      }
      if (ex.layersHidden) check("forced-colors: ribbon layers hidden", dom.layersDisplay.every((d) => d === "none"), dom.layersDisplay.join());
      if (ex.warns !== undefined) check(`exactly ${ex.warns} [ribbon] console.warn`, warns.length === ex.warns, warns.join(" | "));
      if (dom.canvases.length) {
        check("canvases aria-hidden / role=presentation / not focusable", dom.canvases.every((c) => c.aria === "true" && c.role === "presentation" && c.tab === -1), JSON.stringify(dom.canvases));
      }
      if (ex.touch) {
        const sc = await page.evaluate(async () => {
          window.scrollTo(0, 600);
          await new Promise((r) => setTimeout(r, 500));
          const s = window.__scrollState;
          return { y: window.scrollY, store: s?.y };
        });
        check("scroll store accurate on touch device", Math.abs(sc.y - (sc.store ?? -1)) < 2 && sc.y > 100, JSON.stringify(sc));
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(300);
      }
    }
    if (ex.noJs) {
      check(
        "no JS: <noscript> posters decoded and visible",
        dom.posters.length >= 2 && dom.posters.every((p) => p.ok),
        JSON.stringify(dom.posters),
      );
    }

    const shot = path.join(out, `${cfg.id}.png`);
    await page.screenshot({ path: shot });
    await ctx.close();
  } catch (err) {
    checks.push({ name: "case ran without throwing", ok: false, detail: String(err).slice(0, 300) });
  } finally {
    await browser?.close().catch(() => {});
  }
  const ok = checks.every((c) => c.ok);
  const tierLine = logs.filter((l) => /\[ribbon\] tier/.test(l)).slice(-1)[0] ?? "(no tier logged)";
  results.push({ id: cfg.id, ok, checks, tierLine, ms: Date.now() - t0 });
  console.log(`${ok ? "PASS" : "FAIL"}  ${cfg.id.padEnd(22)} ${tierLine.replace(/^log: |^info: /, "")}`);
  for (const c of checks) if (!c.ok) console.log(`        x ${c.name}${c.detail ? `  [${c.detail}]` : ""}`);
}

const list = CASES.filter((c) => !only.length || only.includes(c.id));
for (const c of list) await runCase(c);

console.log("\n| case | result | final tier line |");
console.log("|---|---|---|");
for (const r of results) console.log(`| ${r.id} | ${r.skipped ? "SKIP" : r.ok ? "PASS" : "FAIL"} | ${r.tierLine.replace(/^\w+: /, "").slice(0, 110)} |`);
const failed = results.filter((r) => !r.ok);
const skipped = results.filter((r) => r.skipped).length;
console.log(`\n${results.length - failed.length - skipped}/${results.length - skipped} cases passed${skipped ? `, ${skipped} skipped (browser cannot launch here)` : ""}. Screenshots: ${out}`);
process.exit(failed.length ? 1 : 0);
