/**
 * Final images / metrics and the parity check against the REAL engine.
 */
import { RibbonEngine } from "../engine";
import { resolvePose } from "../poses/resolve";
import { DEFAULT_SETTINGS } from "../settings";
import { FitData } from "./data";
import { FitRenderer, POSE_COUNT } from "./render";
import { Evaluator, WEIGHTS, type Terms } from "./loss";
import { ANCHOR, VIEW, toPosePoints, type FitState } from "./params";

export interface Images {
  /** our visible silhouette, white on black (visibility emulation applied) */
  silhouette: string;
  /** mockup + cyan outline + red (ours only) / blue (mockup only) */
  overlay: string;
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D];
}

/** our visible silhouette at full resolution, TOP-DOWN, 1 = visible, 0 = not (exclusion rects are not applied here) */
export function visibleMask(rend: FitRenderer, data: FitData): Uint8Array {
  const { px, w, h } = rend.draw(1);
  const m = data.scaled(1);
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const gy = h - 1 - y;
    for (let x = 0; x < w; x++) {
      const gi = gy * w + x;
      const o = gi * 4;
      const c = (px[o] + 32) >> 6;
      const vis = c > 0 && !(m.text[gi] === 1 && px[o + 1] === 0);
      out[y * w + x] = vis ? 1 : 0;
    }
  }
  return out;
}

export async function makeImages(rend: FitRenderer, data: FitData, state: FitState, mockupUrl: string): Promise<Images> {
  const ev = new Evaluator(data, rend);
  ev.evaluate({ ...state, x: [...state.x], y: [...state.y], z: [...state.z], twist: [...state.twist], foldSign: [...state.foldSign] }, 1, WEIGHTS);
  const vis = visibleMask(rend, data);
  const { W, H } = data;
  // silhouette
  const [sc, sctx] = canvas(W, H);
  const sImg = sctx.createImageData(W, H);
  for (let i = 0; i < W * H; i++) {
    const v = vis[i] ? 255 : 0;
    sImg.data[i * 4] = sImg.data[i * 4 + 1] = sImg.data[i * 4 + 2] = v;
    sImg.data[i * 4 + 3] = 255;
  }
  sctx.putImageData(sImg, 0, 0);
  // overlay
  const [oc, octx] = canvas(W, H);
  const img = new Image();
  img.src = mockupUrl;
  await img.decode();
  octx.drawImage(img, 0, 0, W, H);
  const base = octx.getImageData(0, 0, W, H);
  const d = base.data;
  for (let i = 0; i < W * H; i++) {
    if (data.excl[i]) continue;
    const a = vis[i];
    const b = data.ribbon[i];
    if (a === b) continue;
    const t = 0.55;
    const o = i * 4;
    const [r, g, bl] = a ? [255, 40, 40] : [40, 90, 255];
    d[o] = d[o] * (1 - t) + r * t;
    d[o + 1] = d[o + 1] * (1 - t) + g * t;
    d[o + 2] = d[o + 2] * (1 - t) + bl * t;
  }
  // cyan outline of our silhouette
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!vis[i]) continue;
      if (!vis[i - 1] || !vis[i + 1] || !vis[i - W] || !vis[i + W]) {
        const o = i * 4;
        d[o] = 0;
        d[o + 1] = 255;
        d[o + 2] = 255;
      }
    }
  }
  octx.putImageData(base, 0, 0);
  return { silhouette: sc.toDataURL("image/png"), overlay: oc.toDataURL("image/png") };
}

/** metrics per mismatch region: connected components of (ours xor mockup), largest first */
export function mismatchRegions(vis: Uint8Array, data: FitData, minArea = 600) {
  const { W, H } = data;
  const lab = new Int32Array(W * H);
  const regions: { kind: "ours-only" | "mockup-only"; area: number; bbox: number[]; cx: number; cy: number }[] = [];
  let next = 1;
  const stack: number[] = [];
  for (let s = 0; s < W * H; s++) {
    if (lab[s] || data.excl[s]) continue;
    const a = vis[s];
    const b = data.ribbon[s];
    if (a === b) continue;
    const kind = a ? 0 : 1;
    let area = 0;
    let x0 = W;
    let y0 = H;
    let x1 = 0;
    let y1 = 0;
    let sx = 0;
    let sy = 0;
    stack.push(s);
    lab[s] = next;
    while (stack.length) {
      const i = stack.pop() as number;
      const x = i % W;
      const y = (i / W) | 0;
      area++;
      sx += x;
      sy += y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j < 0 || j >= W * H || lab[j] || data.excl[j]) continue;
        if (Math.abs((j % W) - x) > 1) continue;
        if (vis[j] === a && data.ribbon[j] === b) {
          lab[j] = next;
          stack.push(j);
        }
      }
    }
    next++;
    if (area >= minArea) regions.push({ kind: kind ? "mockup-only" : "ours-only", area, bbox: [x0, y0, x1, y1], cx: Math.round(sx / area), cy: Math.round(sy / area) });
  }
  return regions.sort((p, q) => q.area - p.area).slice(0, 14);
}

// ---- parity with the real engine -------------------------------------------

async function dataUrlToRgba(url: string): Promise<{ w: number; h: number; d: Uint8ClampedArray }> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const [, ctx] = canvas(img.width, img.height);
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, img.width, img.height);
  return { w: img.width, h: img.height, d: id.data };
}

export interface Parity {
  iou: number;
  engineSize: [number, number];
  /** ring count / pose count the engine used */
  note: string;
  engineSilhouette: string;
  diff: string;
  oursOnly: number;
  engineOnly: number;
}

/**
 * Render the pose in the real site engine (RibbonEngine, 1672 x 941 at DPR 1, real defaults,
 * floor / wall shadows off) over black and over white (difference matting, as the poster
 * script does) and compare its alpha silhouette with the fit renderer's raw coverage.
 */
export async function parity(rend: FitRenderer, state: FitState): Promise<Parity> {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:0;top:0;width:${VIEW.w}px;height:${VIEW.h}px;opacity:0;pointer-events:none;z-index:-1`;
  const back = document.createElement("canvas");
  const front = document.createElement("canvas");
  for (const c of [back, front]) c.style.cssText = "position:absolute;inset:0;width:100%;height:100%";
  host.append(back, front);
  document.body.appendChild(host);
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  const engine = new RibbonEngine({
    back,
    front,
    controlPoints: POSE_COUNT,
    settings: { camera: { fov: state.fov }, shadows: { floor: false, wall: false, glow: false } },
  });
  try {
    if (engine.width !== VIEW.w || engine.height !== VIEW.h) throw new Error(`engine size ${engine.width}x${engine.height}`);
    const pose = resolvePose(
      toPosePoints(state),
      { viewW: engine.width, viewH: engine.height, anchor: { ...ANCHOR }, fov: engine.settings.camera.fov },
      engine.sim.count,
      "curvature",
    );
    engine.setPose(pose, true);
    const bl = engine.captureLayers({ matte: "black" });
    const wh = engine.captureLayers({ matte: "white" });
    const [k, w] = await Promise.all([dataUrlToRgba(bl.back), dataUrlToRgba(wh.back)]);
    const W = k.w;
    const H = k.h;
    // ours: raw coverage of the fit renderer (no text rule), top-down
    rend.build(state);
    const { px } = rend.draw(1);
    let inter = 0;
    let uni = 0;
    let oursOnly = 0;
    let engOnly = 0;
    const [ec, ectx] = canvas(W, H);
    const [dc, dctx] = canvas(W, H);
    const eImg = ectx.createImageData(W, H);
    const dImg = dctx.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const o = i * 4;
        const dd = (w.d[o] - k.d[o] + (w.d[o + 1] - k.d[o + 1]) + (w.d[o + 2] - k.d[o + 2])) / 3;
        const a = 1 - dd / 255;
        const e = a > 0.5 ? 1 : 0;
        const gi = (H - 1 - y) * W + x;
        const f = px[gi * 4] > 0 ? 1 : 0;
        if (e && f) {
          inter++;
          uni++;
        } else if (e) {
          uni++;
          engOnly++;
        } else if (f) {
          uni++;
          oursOnly++;
        }
        const v = e ? 255 : 0;
        eImg.data[o] = eImg.data[o + 1] = eImg.data[o + 2] = v;
        eImg.data[o + 3] = 255;
        dImg.data[o] = f && !e ? 255 : 0;
        dImg.data[o + 1] = e && f ? 90 : 0;
        dImg.data[o + 2] = e && !f ? 255 : 0;
        dImg.data[o + 3] = 255;
      }
    }
    ectx.putImageData(eImg, 0, 0);
    dctx.putImageData(dImg, 0, 0);
    return {
      iou: uni ? inter / uni : 0,
      engineSize: [W, H],
      note: `engine rings ${engine.ribbon.bodyRings}, width ${engine.settings.geometry.width}, control points ${POSE_COUNT}`,
      engineSilhouette: ec.toDataURL("image/png"),
      diff: dc.toDataURL("image/png"),
      oursOnly,
      engineOnly: engOnly,
    };
  } finally {
    engine.dispose();
    host.remove();
  }
}

export type { Terms };
export { DEFAULT_SETTINGS };
