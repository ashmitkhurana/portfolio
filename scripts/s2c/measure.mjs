import { chromium } from "/Users/ashmitkhurana/Development/studio/portfolio/node_modules/playwright/index.mjs";
const base = process.argv[2] ?? "http://localhost:3961";
const [w,h]=(process.argv[3]??"1672x941").split("x").map(Number);
const browser = await chromium.launch({ channel: "chromium", headless: true, args: ["--use-angle=metal", "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 })).newPage();
await page.goto(`${base}/?tier=3`, { waitUntil: "load" });
await page.waitForFunction(() => window.__ribbonState && window.__ribbonState.engine, null, { timeout: 120000 });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(1500);
const r = await page.evaluate(() => {
  const el=document.querySelector('[data-ribbon-anchor="hero-name"]');
  const lines=[...el.querySelectorAll('.display__line')];
  const out={size:parseFloat(getComputedStyle(lines[0]).fontSize), wdth:getComputedStyle(el).fontVariationSettings, lines:[]};
  const c=document.createElement('canvas').getContext('2d');
  lines.forEach((line,li)=>{
    const cs=getComputedStyle(line); const size=parseFloat(cs.fontSize); const lr=line.getBoundingClientRect();
    const probe=document.createElement('span'); probe.style.cssText='display:inline-block;width:0;height:0;overflow:hidden;vertical-align:baseline'; line.appendChild(probe); const pr=probe.getBoundingClientRect(); line.removeChild(probe);
    c.font=`${cs.fontWeight} ${size}px ${cs.fontFamily}`; const m=c.measureText('H');
    const g=[...line.querySelectorAll('.glyph')]; const gb=g.map(x=>x.getBoundingClientRect());
    out.lines.push({left:lr.left,right:lr.right,top:lr.top,bottom:lr.bottom,baseline:pr.bottom,cap:m.actualBoundingBoxAscent,
      firstGlyphLeft:gb[0].left,lastGlyphRight:gb[gb.length-1].right});
  });
  out.view=[innerWidth,innerHeight];
  return out;
});
console.log(JSON.stringify(r,null,1));
await browser.close();
