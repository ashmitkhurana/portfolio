// print the phone wrap's rings (screen x/y rel. the terminal screen, z) from captured inputs
import fs from "fs";
import { buildJourneyPathDesktop } from "../../lib/ribbon/journeyPathDesktop";
const inp = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const out = buildJourneyPathDesktop(inp);
const x = out.exP!;
const { W, H } = inp, yE = inp.exP.yE, D = inp.camZ;
console.log("win", JSON.stringify(inp.exP.win), "sEnd", x.sEnd.toFixed(0), "sWrapOut", x.sWrapOut.toFixed(0));
let j0 = 0;
for (let j = 0; j < out.k; j++) { const sy = H / 2 - yE - out.pos[j * 3 + 1] - H; if (sy > -140 && sy < 0 && Math.abs(out.pos[j * 3] + W / 2 - (inp.exP.textR + 34 + inp.end.hw)) < 30) { j0 = j; break; } }
const j1 = j0 + 120;
for (let j = j0; j <= j1; j += 4) {
  const px = out.pos[j * 3], py = out.pos[j * 3 + 1], pz = out.pos[j * 3 + 2];
  const sx = W / 2 + (px * D) / (D - pz), sy = H / 2 - yE - py; // y without perspective (rel. Experience top)
  console.log(j - j0, sx.toFixed(0), (sy - H).toFixed(0), pz.toFixed(0));
}
