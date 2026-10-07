#!/usr/bin/env node
/**
 * Terminal QA (headless). Usage:
 *   NEXT_DIST_DIR=.next-term npm run build && NEXT_DIST_DIR=.next-term npx next start -p 4200 &
 *   node scripts/qa-terminal.mjs [--base http://localhost:4200] [--out docs/terminal/qa]
 * Fails on any failed assertion or console error.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i > -1 ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://localhost:4200");
const OUT = arg("out", "docs/terminal/qa");
mkdirSync(OUT, { recursive: true });

const SIZES = [
  ["phone", 390, 844],
  ["desktop", 1512, 982],
];
const failures = [];
const ok = (cond, msg) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures.push(msg);
};

const browser = await chromium.launch();
for (const [label, width, height] of SIZES) {
  console.log(`\n== ${label} ${width}x${height}`);
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(`${BASE}/?ribbon=0`, { waitUntil: "networkidle" });
  const btn = page.getByRole("button", { name: "Open terminal" });
  const dialog = page.getByRole("dialog", { name: "Terminal" });
  const input = dialog.getByLabel("Terminal command");
  const type = async (t) => {
    await input.fill(t);
    await input.press("Enter");
  };

  // (a)
  await btn.click();
  await dialog.waitFor({ state: "visible" });
  await page.waitForTimeout(350);
  ok(await input.evaluate((el) => el === document.activeElement), "(a) overlay opens, input focused");
  const locked = await page.evaluate(() => document.documentElement.style.overflow === "hidden");
  ok(locked, "(a) page scroll locked while open");
  await page.screenshot({ path: `${OUT}/${label}-a-overlay.png` });

  // (b)
  await type("help");
  await page.waitForTimeout(150);
  ok((await dialog.innerText()).includes("sudo ask-me-anything"), "(b) help lists commands");
  await page.screenshot({ path: `${OUT}/${label}-b-help.png` });

  // (c)
  await type("ls projects/");
  ok((await dialog.innerText()).includes("alpha-block.txt"), "(c) ls projects/ lists alpha-block.txt");
  await type("cat about.txt");
  ok((await dialog.innerText()).includes("Full-Stack Developer"), "(c) cat about.txt");
  await type("cat nope.txt");
  ok((await dialog.innerText()).includes("No such file"), "(c) cat missing file errors");
  await type("frobnicate");
  ok((await dialog.innerText()).includes("command not found: frobnicate. Try 'help'."), "(c) unknown command");
  await input.press("ArrowUp");
  ok((await input.inputValue()) === "frobnicate", "(c) history up recalls last command");
  await input.press("ArrowUp");
  ok((await input.inputValue()) === "cat nope.txt", "(c) history up x2");
  await input.press("ArrowDown");
  await input.press("ArrowDown");
  ok((await input.inputValue()) === "", "(c) history down returns to empty draft");
  await input.fill("go");
  await input.press("Tab");
  ok((await input.inputValue()) === "goto ", "(c) Tab completes 'go' -> 'goto '");
  await input.fill("cat al");
  await input.press("Tab");
  ok((await input.inputValue()) === "cat alpha-block.txt", "(c) Tab completes cat file");
  await input.fill("");
  await type("contact");
  ok((await dialog.innerText()).includes("itsme@ashmitkhurana.com"), "(c) contact shows email");
  ok(!/bellarisse|gamorite/i.test(await dialog.innerText()), "(c) no banned names");
  await page.screenshot({ path: `${OUT}/${label}-c-commands.png` });

  // hack + nuke
  await type("hack");
  await page.waitForTimeout(900);
  ok(await page.locator(".term__matrix").isVisible(), "hack: matrix canvas visible");
  await page.screenshot({ path: `${OUT}/${label}-hack.png` });
  await page.keyboard.press("x");
  await page.waitForTimeout(200);
  ok((await page.locator(".term__matrix").count()) === 0, "hack: any key stops it");
  await input.fill("");
  await type("nuke");
  ok((await dialog.innerText()).includes("nuke confirm"), "nuke asks for confirmation");
  await type("nuke confirm");
  await page.waitForTimeout(700);
  ok(await page.evaluate(() => document.documentElement.classList.contains("term-nuke")), "nuke: shake class applied");
  await page.screenshot({ path: `${OUT}/${label}-nuke.png` });
  await page.waitForTimeout(1300);
  ok(await page.evaluate(() => !document.documentElement.classList.contains("term-nuke") && !document.querySelector(".term-nuke-flash")), "nuke: cleaned up");

  // (d)
  const y0 = await page.evaluate(() => window.scrollY);
  await type("goto contact");
  await page.waitForTimeout(2500);
  const y1 = await page.evaluate(() => window.scrollY);
  ok(y1 > y0 + 100, `(d) goto contact scrolled (${y0} -> ${y1})`);
  ok(await dialog.isHidden(), "(d) goto closes the overlay");

  // (e)
  await btn.focus();
  await page.keyboard.press("Enter");
  await dialog.waitFor({ state: "visible" });
  await page.waitForTimeout(300);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  ok(await dialog.evaluate((d) => d.contains(document.activeElement)), "(e) focus trapped in overlay");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  ok(await btn.evaluate((el) => el === document.activeElement), "(e) Esc closes, focus returns to >_ button");
  ok(await page.evaluate(() => document.documentElement.style.overflow === ""), "(e) scroll unlocked");
  await page.keyboard.press("Control+k");
  await dialog.waitFor({ state: "visible" });
  ok(true, "(e) Ctrl+K opens");
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  await page.keyboard.press("`");
  await dialog.waitFor({ state: "visible" });
  ok(true, "(e) backtick opens");
  await type("exit");
  await dialog.waitFor({ state: "hidden" });
  ok(true, "(e) exit closes");

  // (f)
  await page.evaluate(() => document.getElementById("terminal").scrollIntoView());
  await page.waitForTimeout(600);
  const inline = page.locator("#terminal .term");
  ok(await inline.isVisible(), "(f) inline terminal visible in section 05");
  ok(
    (await page.locator("#terminal .terminal-window[data-ribbon-proxy]").count()) === 1,
    "(f) ribbon proxy attributes preserved",
  );
  await inline.locator(".term__output").click();
  ok(await page.locator("#terminal input").evaluate((el) => el === document.activeElement), "(f) click focuses inline input");
  await page.locator("#terminal input").fill("ls");
  await page.locator("#terminal input").press("Enter");
  ok((await inline.innerText()).includes("projects/"), "(f) inline runs commands");
  await page.screenshot({ path: `${OUT}/${label}-f-inline.png` });

  ok(errors.length === 0, `no console errors${errors.length ? ": " + errors.join(" | ") : ""}`);
  await ctx.close();
}
await browser.close();
if (failures.length) {
  console.error(`\n${failures.length} FAILED`);
  process.exit(1);
}
console.log("\nALL PASSED");
