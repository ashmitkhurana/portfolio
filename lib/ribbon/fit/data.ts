/**
 * Mockup data for the fit, loaded in the page. `scripts/fit/run.mjs` serves two
 * files under /fit-assets/: `data.bin` (RGBA per pixel, row 0 = top: R ribbon mask,
 * G text mask, B exclusion mask, A shading class 0 none / 1 bright / 2 mid / 3 dark)
 * and `graph.json` (skeleton branches).
 *
 * Masks are held in GL row order (row 0 = bottom) at 1, 1/2 and 1/4 scale so they
 * line up with `readRenderTargetPixels` without a per-pixel flip.
 */
import { VIEW } from "./params";

export interface ScaledMasks {
  scale: number;
  w: number;
  h: number;
  /** 1 where the mockup ribbon is visible */
  ribbon: Uint8Array;
  text: Uint8Array;
  excl: Uint8Array;
  /** 0 none, 1 bright, 2 mid, 3 dark (majority of the ribbon pixels in the block) */
  cls: Uint8Array;
  /** 1 inside the K loop boxes (dark-face hint) */
  kzone: Uint8Array;
}

export interface Graph {
  branches: { id: number; points: [number, number][]; mean_width: number; T: string }[];
  topology_regions: Record<string, number[][]>;
  exclusion_rects: Record<string, number[]>;
}

export class FitData {
  readonly W: number = VIEW.w;
  readonly H: number = VIEW.h;
  /** top-down full-res arrays */
  ribbon!: Uint8Array;
  text!: Uint8Array;
  excl!: Uint8Array;
  cls!: Uint8Array;
  graph!: Graph;
  /** distance (px, full res, top-down) to the nearest skeleton pixel */
  dt!: Float32Array;
  skeleton!: Uint8Array;
  private cache = new Map<number, ScaledMasks>();
  /** K loop boxes (T4 / T5 topology regions) */
  kBoxes: number[][] = [];

  static async load(base = "/fit-assets"): Promise<FitData> {
    const d = new FitData();
    const [bin, graph] = await Promise.all([
      fetch(`${base}/data.bin`).then((r) => {
        if (!r.ok) throw new Error(`data.bin: ${r.status}`);
        return r.arrayBuffer();
      }),
      fetch(`${base}/graph.json`).then((r) => {
        if (!r.ok) throw new Error(`graph.json: ${r.status}`);
        return r.json() as Promise<Graph>;
      }),
    ]);
    const px = new Uint8Array(bin);
    const n = d.W * d.H;
    if (px.length !== n * 4) throw new Error(`data.bin size ${px.length} != ${n * 4}`);
    d.ribbon = new Uint8Array(n);
    d.text = new Uint8Array(n);
    d.excl = new Uint8Array(n);
    d.cls = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      d.ribbon[i] = px[i * 4] ? 1 : 0;
      d.text[i] = px[i * 4 + 1] ? 1 : 0;
      d.excl[i] = px[i * 4 + 2] ? 1 : 0;
      d.cls[i] = px[i * 4 + 3];
    }
    d.graph = graph;
    d.kBoxes = [...(graph.topology_regions.T4 ?? []), ...(graph.topology_regions.T5 ?? [])];
    d.buildSkeleton();
    return d;
  }

  private buildSkeleton(): void {
    const { W, H } = this;
    const sk = new Uint8Array(W * H);
    const put = (x: number, y: number) => {
      const xi = Math.round(x);
      const yi = Math.round(y);
      if (xi >= 0 && xi < W && yi >= 0 && yi < H) sk[yi * W + xi] = 1;
    };
    for (const b of this.graph.branches) {
      for (let i = 0; i < b.points.length - 1; i++) {
        const [x0, y0] = b.points[i];
        const [x1, y1] = b.points[i + 1];
        const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))) * 2 + 1;
        for (let s = 0; s <= steps; s++) put(x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps);
      }
    }
    this.skeleton = sk;
    // two-pass 3-4 chamfer distance transform (scaled back to px)
    const INF = 1e9;
    const d = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) d[i] = sk[i] ? 0 : INF;
    const a = 1;
    const b = Math.SQRT2;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        let v = d[i];
        if (x > 0) v = Math.min(v, d[i - 1] + a);
        if (y > 0) {
          v = Math.min(v, d[i - W] + a);
          if (x > 0) v = Math.min(v, d[i - W - 1] + b);
          if (x < W - 1) v = Math.min(v, d[i - W + 1] + b);
        }
        d[i] = v;
      }
    }
    for (let y = H - 1; y >= 0; y--) {
      for (let x = W - 1; x >= 0; x--) {
        const i = y * W + x;
        let v = d[i];
        if (x < W - 1) v = Math.min(v, d[i + 1] + a);
        if (y < H - 1) {
          v = Math.min(v, d[i + W] + a);
          if (x < W - 1) v = Math.min(v, d[i + W + 1] + b);
          if (x > 0) v = Math.min(v, d[i + W - 1] + b);
        }
        d[i] = v;
      }
    }
    this.dt = d;
  }

  /** distance to the skeleton at (x, y) in full-res px (bilinear, clamped) */
  dtAt(x: number, y: number): number {
    const { W, H } = this;
    const cx = Math.min(Math.max(x, 0), W - 1.001);
    const cy = Math.min(Math.max(y, 0), H - 1.001);
    const x0 = Math.floor(cx);
    const y0 = Math.floor(cy);
    const fx = cx - x0;
    const fy = cy - y0;
    const i = y0 * W + x0;
    const d = this.dt;
    return (
      d[i] * (1 - fx) * (1 - fy) + d[i + 1] * fx * (1 - fy) + d[i + W] * (1 - fx) * fy + d[i + W + 1] * fx * fy
    );
  }

  /** the masks at `scale` (1, 1/2, 1/4 ...) in GL row order */
  scaled(scale: number): ScaledMasks {
    const hit = this.cache.get(scale);
    if (hit) return hit;
    const { W, H } = this;
    const w = Math.round(W * scale);
    const h = Math.round(H * scale);
    const ribbon = new Uint8Array(w * h);
    const text = new Uint8Array(w * h);
    const excl = new Uint8Array(w * h);
    const cls = new Uint8Array(w * h);
    const kzone = new Uint8Array(w * h);
    const bw = W / w;
    const bh = H / h;
    for (let y = 0; y < h; y++) {
      const gy = h - 1 - y; // GL row y <-> top-down row gy
      const y0 = Math.floor(gy * bh);
      const y1 = Math.max(y0 + 1, Math.floor((gy + 1) * bh));
      for (let x = 0; x < w; x++) {
        const x0 = Math.floor(x * bw);
        const x1 = Math.max(x0 + 1, Math.floor((x + 1) * bw));
        let nr = 0;
        let nt = 0;
        let ne = 0;
        let nk = 0;
        const c = [0, 0, 0, 0];
        let cnt = 0;
        for (let yy = y0; yy < y1; yy++) {
          for (let xx = x0; xx < x1; xx++) {
            const i = yy * W + xx;
            cnt++;
            if (this.ribbon[i]) {
              nr++;
              c[this.cls[i]]++;
            }
            if (this.text[i]) nt++;
            if (this.excl[i]) ne++;
            for (const bx of this.kBoxes) if (xx >= bx[0] && xx < bx[2] && yy >= bx[1] && yy < bx[3]) nk++;
          }
        }
        const o = y * w + x;
        ribbon[o] = nr * 2 >= cnt ? 1 : 0;
        text[o] = nt * 2 >= cnt ? 1 : 0;
        excl[o] = ne * 2 >= cnt ? 1 : 0;
        kzone[o] = nk * 2 >= cnt ? 1 : 0;
        if (nr) cls[o] = c[1] >= c[2] && c[1] >= c[3] ? 1 : c[3] >= c[2] ? 3 : 2;
      }
    }
    const m: ScaledMasks = { scale, w, h, ribbon, text, excl, cls, kzone };
    this.cache.set(scale, m);
    return m;
  }
}
