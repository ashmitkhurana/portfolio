#!/usr/bin/env node
/**
 * Contact sheet: lays slice screenshots (from qa-screens.mjs --slices) side by side in one PNG.
 *   node scripts/qa-sheet.mjs home__390x844 [columns=5] [scale=1]
 * Reads <out>/<prefix>__sNN.png, writes <out>/<prefix>__sheet.png
 */
import { chromium } from "playwright";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const out =
  process.env.QA_OUT ||
  "/private/tmp/claude-501/-Users-ashmitkhurana-Development-studio-portfolio/428f1961-b6ad-4758-ba30-ff5eb1800006/scratchpad/layout";
const prefix = process.argv[2];
const cols = Number(process.argv[3] || 5);
const scale = Number(process.argv[4] || 1);
const files = readdirSync(out).filter((f) => f.startsWith(prefix + "__s") && /__s\d+\.png$/.test(f)).sort();
const imgs = files.map((f) => `<img src="data:image/png;base64,${readFileSync(path.join(out, f)).toString("base64")}">`);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
await page.setContent(
  `<body style="margin:0;background:#444"><div style="display:grid;grid-template-columns:repeat(${cols},max-content);gap:8px;padding:8px;align-items:start">${imgs
    .map((i) => i.replace("<img", `<img style="display:block;zoom:${scale}"`))
    .join("")}</div></body>`,
);
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(out, `${prefix}__sheet.png`), fullPage: true });
await browser.close();
console.log(path.join(out, `${prefix}__sheet.png`));
