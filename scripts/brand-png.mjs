// Renders the brand SVGs to transparent PNGs: favicon 32/48, apple-touch 180, icon 512, and the logo files at 2x.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const b = await chromium.launch();
const p = await b.newPage();
const shot = async (svgPath, out, w, h) => {
  const svg = readFileSync(svgPath, "utf8").replace(/^<svg([^>]*?) width="\d+" height="\d+"/, "<svg$1");
  await p.setViewportSize({ width: w, height: h });
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg.replace("<svg ", `<svg width="${w}" height="${h}" `)}</body></html>`);
  await p.screenshot({ path: out, omitBackground: true });
};
await shot("public/favicon.svg", "public/favicon-32.png", 32, 32);
await shot("public/favicon.svg", "public/favicon-48.png", 48, 48);
await shot("public/favicon.svg", "public/apple-touch-icon.png", 180, 180);
await shot("public/favicon.svg", "public/icon-512.png", 512, 512);
for (const n of ["ak-mark-light", "ak-mark-dark", "ak-mark-orange"]) await shot(`public/brand/${n}.svg`, `public/brand/${n}.png`, 1240, 640);
await b.close();
console.log("done");
