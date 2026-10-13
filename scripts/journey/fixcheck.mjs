import { chromium } from "playwright";
const base = "http://localhost:3100";
const out = process.argv[2];
const b = await chromium.launch({ args: ["--use-gl=angle"] });
const log = (...a) => console.log(...a);
// phone
{
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(base + "/", { waitUntil: "networkidle" });
  await p.waitForTimeout(3000);
  log("hint tag", await p.evaluate(() => document.querySelector(".hero__scroll")?.tagName), "opacity at top", await p.evaluate(() => getComputedStyle(document.querySelector(".hero__scroll")).opacity));
  await p.evaluate(() => scrollTo(0, 60)); await p.waitForTimeout(800);
  log("hint opacity after scroll", await p.evaluate(() => getComputedStyle(document.querySelector(".hero__scroll")).opacity));
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(800);
  // menu slide: frames
  await p.locator(".site-header button[aria-controls]").last().click();
  for (const t of [60, 180, 500]) { await p.waitForTimeout(t === 60 ? 60 : t - 60); await p.screenshot({ path: `${out}/menu_${t}.png` }); }
  log("menu transform open", await p.evaluate(() => getComputedStyle(document.querySelector(".mobile-menu")).transform));
  await p.locator(".site-header button[aria-controls]").last().click();
  await p.waitForTimeout(150); await p.screenshot({ path: `${out}/menu_close150.png` });
  await p.waitForTimeout(500);
  log("menu after close", await p.evaluate(() => { const m = document.querySelector(".mobile-menu"); return getComputedStyle(m).visibility + " " + m.inert; }));
  // terminal: help on phone, yellow keeps, red clears, green full
  await p.locator(".site-header button").first().click(); await p.waitForTimeout(500);
  const inp = () => p.locator(".term-overlay input").first();
  await inp().fill("help"); await inp().press("Enter"); await p.waitForTimeout(300);
  log("phone help has keyboard hint:", await p.evaluate(() => document.querySelector(".term-overlay .term__output").textContent.includes("Up/Down")));
  log("goto removed:", await p.evaluate(() => !document.querySelector(".term-overlay .term__output").textContent.includes("goto")));
  await p.locator(".term__light--full").click(); await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/term_full.png` });
  log("full panel", await p.evaluate(() => { const r = document.querySelector(".term-overlay__panel").getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)} at ${Math.round(r.top)}`; }));
  await p.locator(".term__light--min").click(); await p.waitForTimeout(400);
  log("after yellow overlay open:", await p.locator(".term-overlay").count());
  await p.locator(".site-header button").first().click(); await p.waitForTimeout(500);
  log("reopened keeps session:", await p.evaluate(() => document.querySelector(".term-overlay .term__output").textContent.includes("show this menu")), "full reset:", await p.evaluate(() => !document.querySelector(".term-overlay[data-full]")));
  await p.locator(".term__light--close").click(); await p.waitForTimeout(400);
  await p.locator(".site-header button").first().click(); await p.waitForTimeout(500);
  log("after red, session cleared:", await p.evaluate(() => !document.querySelector(".term-overlay .term__output").textContent.includes("show this menu")));
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  log("phone errors:", errs.length ? errs : "none");
  await p.close();
}
// /contact head
{
  const p = await b.newPage({ viewport: { width: 1512, height: 860 } });
  await p.goto(base + "/contact", { waitUntil: "networkidle" });
  log("contact h1:", await p.evaluate(() => document.querySelector("h1")?.getAttribute("aria-label")), "og:image:", await p.evaluate(() => document.querySelector('meta[property="og:image"]')?.content), "canonical:", await p.evaluate(() => document.querySelector('link[rel=canonical]')?.href));
  await p.goto(base + "/", { waitUntil: "networkidle" });
  log("home h2 contact:", await p.evaluate(() => document.getElementById("contact-title")?.tagName), "jsonld:", await p.evaluate(() => document.querySelector('script[type="application/ld+json"]')?.textContent?.slice(0, 160)));
  await p.close();
}
await b.close();
