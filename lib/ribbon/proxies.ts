/**
 * Depth-proxy registry.
 *
 * DOM elements marked `data-ribbon-proxy` (+ optional `data-ribbon-depth`,
 * world z, default 0; `data-ribbon-radius`, px, default 0; `data-ribbon-pad`, px the
 * rect is grown by on every side, default 0, for glyph overhang) tell the shader
 * which screen rectangles contain real HTML at which depth. Rects are measured
 * once (cached), re-measured on resize / font load / document height change /
 * `invalidate()`, and the scroll offset is applied per frame from window.scrollY.
 * The shader only has MAX_PROXIES slots and the ribbon canvas is viewport-fixed,
 * so a long page may register many more proxies than that: every frame only the
 * ones whose rect intersects the viewport (plus a margin) are handed to the core.
 */
import { MAX_PROXIES, type ProxyData } from "./types";

export { MAX_PROXIES };

/** how many proxies are tracked in the DOM (only MAX_PROXIES reach the shader) */
const MAX_TRACKED = 256;
/** px beyond the viewport edges within which a proxy is still sent to the shader */
const CULL_MARGIN = 200;

interface Entry {
  el: HTMLElement;
  pageX: number;
  pageY: number;
  w: number;
  h: number;
  depth: number;
  radius: number;
}

export class ProxyRegistry {
  /** plain data handed to the render core (viewport CSS px, y down) */
  readonly data: ProxyData = {
    count: 0,
    rects: new Float32Array(MAX_PROXIES * 4),
    depth: new Float32Array(MAX_PROXIES),
    radius: new Float32Array(MAX_PROXIES),
    minDepth: Infinity,
  };

  private entries: Entry[] = [];
  private elements: HTMLElement[] = [];
  private dirty = true;
  private ro: ResizeObserver | null = null;
  private mo: MutationObserver | null = null;
  private scanQueued = false;
  private disposed = false;
  private readonly onResize = () => this.invalidate();

  constructor(private root: ParentNode = document) {
    if (typeof window === "undefined") return;
    this.ro = new ResizeObserver(() => this.invalidate());
    window.addEventListener("resize", this.onResize);
    // content above a proxy growing/shrinking (images, fonts, accordions) moves it
    // without resizing it, so watch the document height too
    this.ro.observe(document.body);
    this.mo = new MutationObserver((records) => {
      if (records.some((r) => r.type === "attributes")) this.dirty = true;
      this.queueScan();
    });
    this.mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "data-ribbon-proxy",
        "data-ribbon-depth",
        "data-ribbon-radius",
        "data-ribbon-pad",
      ],
    });
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => this.invalidate()).catch(() => {});
    }
    this.scan();
  }

  /** Find proxies in the DOM (call after layout changes that add/remove any). */
  scan(): void {
    const list = Array.from(
      this.root.querySelectorAll<HTMLElement>("[data-ribbon-proxy]"),
    ).slice(0, MAX_TRACKED);
    const same =
      list.length === this.elements.length &&
      list.every((el, i) => el === this.elements[i]);
    if (!same) {
      this.ro?.disconnect();
      this.ro?.observe(document.body);
      this.elements = list;
      for (const el of list) this.ro?.observe(el);
      this.dirty = true; // only re-measure when the set of proxies changed
    }
  }

  private queueScan(): void {
    if (this.scanQueued || this.disposed) return;
    this.scanQueued = true;
    requestAnimationFrame(() => {
      this.scanQueued = false;
      if (!this.disposed) this.scan();
    });
  }

  /** Force a re-measure on the next frame. */
  invalidate(): void {
    this.dirty = true;
  }

  private measure(): void {
    const sx = window.scrollX;
    const sy = window.scrollY;
    this.entries = this.elements.map((el) => {
      const r = el.getBoundingClientRect();
      const d = parseFloat(el.dataset.ribbonDepth ?? "0");
      const rad = parseFloat(el.dataset.ribbonRadius ?? "0");
      const pd = parseFloat(el.dataset.ribbonPad ?? "0");
      const pad = Number.isFinite(pd) ? pd : 0;
      return {
        el,
        pageX: r.left + sx - pad,
        pageY: r.top + sy - pad,
        w: r.width + pad * 2,
        h: r.height + pad * 2,
        depth: Number.isFinite(d) ? d : 0,
        radius: Number.isFinite(rad) ? rad : 0,
      };
    });
    this.dirty = false;
  }

  /**
   * Per-frame: apply scroll to cached rects and fill the uniform arrays with the
   * (at most MAX_PROXIES) proxies that are on or near the viewport.
   */
  update(): ProxyData {
    if (this.dirty) this.measure();
    const sx = window.scrollX;
    const sy = window.scrollY;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const d = this.data;
    let n = 0;
    let minD = Infinity;
    for (let i = 0; i < this.entries.length && n < MAX_PROXIES; i++) {
      const e = this.entries[i];
      const x = e.pageX - sx;
      const y = e.pageY - sy;
      if (
        x > vw + CULL_MARGIN ||
        x + e.w < -CULL_MARGIN ||
        y > vh + CULL_MARGIN ||
        y + e.h < -CULL_MARGIN
      ) {
        continue;
      }
      d.rects[n * 4] = x;
      d.rects[n * 4 + 1] = y;
      d.rects[n * 4 + 2] = e.w;
      d.rects[n * 4 + 3] = e.h;
      d.depth[n] = e.depth;
      d.radius[n] = e.radius;
      if (e.depth < minD) minD = e.depth;
      n++;
    }
    d.count = n;
    d.minDepth = minD;
    return d;
  }

  dispose(): void {
    this.disposed = true;
    this.ro?.disconnect();
    this.mo?.disconnect();
    window.removeEventListener("resize", this.onResize);
    this.ro = null;
    this.mo = null;
  }
}
