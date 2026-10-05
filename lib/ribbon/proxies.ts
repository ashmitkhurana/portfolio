/**
 * Depth-proxy registry.
 *
 * DOM elements marked `data-ribbon-proxy` (+ optional `data-ribbon-depth`,
 * world z, default 0; `data-ribbon-radius`, px, default 0) tell the shader
 * which screen rectangles contain real HTML at which depth. Rects are measured
 * once (cached), re-measured on resize / font load / `invalidate()`, and the
 * scroll offset is applied per frame from window.scrollY.
 */
import * as THREE from "three";

export const MAX_PROXIES = 16;

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
  /** uniform arrays: viewport-space CSS px rects (x, y, w, h; y down) */
  readonly rects: THREE.Vector4[] = Array.from(
    { length: MAX_PROXIES },
    () => new THREE.Vector4(0, 0, 0, 0),
  );
  readonly depth: number[] = new Array(MAX_PROXIES).fill(0);
  readonly radius: number[] = new Array(MAX_PROXIES).fill(0);
  count = 0;
  /** smallest proxy depth (Infinity when none) */
  minDepth = Infinity;

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
    ).slice(0, MAX_PROXIES);
    const same =
      list.length === this.elements.length &&
      list.every((el, i) => el === this.elements[i]);
    if (!same) {
      this.ro?.disconnect();
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
      return {
        el,
        pageX: r.left + sx,
        pageY: r.top + sy,
        w: r.width,
        h: r.height,
        depth: Number.isFinite(d) ? d : 0,
        radius: Number.isFinite(rad) ? rad : 0,
      };
    });
    this.dirty = false;
  }

  /** Per-frame: apply scroll to cached rects and fill the uniform arrays. */
  update(): void {
    if (this.dirty) this.measure();
    const sx = window.scrollX;
    const sy = window.scrollY;
    const n = this.entries.length;
    this.count = n;
    let minD = Infinity;
    for (let i = 0; i < n; i++) {
      const e = this.entries[i];
      this.rects[i].set(e.pageX - sx, e.pageY - sy, e.w, e.h);
      this.depth[i] = e.depth;
      this.radius[i] = e.radius;
      if (e.depth < minD) minD = e.depth;
    }
    this.minDepth = minD;
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
