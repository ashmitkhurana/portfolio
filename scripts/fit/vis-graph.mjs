// debug: draw skeleton branches with ids over the mockup
import sharp from "sharp";
import { readFileSync } from "node:fs";
const D = "/private/tmp/claude-501/-Users-ashmitkhurana-Development-studio-portfolio/428f1961-b6ad-4758-ba30-ff5eb1800006/scratchpad/fit";
const g = JSON.parse(readFileSync(`${D}/desktop/graph.json`, "utf8"));
let s = `<svg xmlns="http://www.w3.org/2000/svg" width="1672" height="941">`;
for (const b of g.branches) {
  const c = `hsl(${(b.id * 49) % 360},100%,60%)`;
  s += `<polyline fill="none" stroke="${c}" stroke-width="3" points="${b.points.map((p) => p.join(",")).join(" ")}"/>`;
  const m = b.points[b.points.length >> 1];
  s += `<text x="${m[0] + 4}" y="${m[1] - 4}" fill="#fff" font-size="16" font-family="sans-serif" stroke="#000" stroke-width="3" paint-order="stroke">${b.id}</text>`;
}
for (const n of g.nodes) s += `<circle cx="${n.xy[0]}" cy="${n.xy[1]}" r="5" fill="none" stroke="#0ff"/><text x="${n.xy[0] + 6}" y="${n.xy[1] + 14}" fill="#0ff" font-size="12" font-family="sans-serif">${n.id}</text>`;
s += "</svg>";
await sharp("public/lab/ref/hero-desktop.webp").composite([{ input: Buffer.from(s) }]).png().toFile(`${D}/graph_vis.png`);
