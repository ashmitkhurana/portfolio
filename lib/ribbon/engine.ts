/**
 * RibbonEngine: the thin DOM adapter around the DOM-free RibbonCore.
 *
 * It owns everything that needs a document: the visible canvases, resize
 * observation, the depth-proxy registry (DOM measuring), visibility /
 * reduced-motion, the rAF loop, adaptive resolution and the HUD stats. The core
 * renders both layers from ONE WebGL context on an OffscreenCanvas; each frame
 * this adapter moves the two outputs into the two visible canvases:
 *
 *   core renders back  -> offscreen.transferToImageBitmap() -> back.transferFromImageBitmap()
 *   core renders front -> offscreen.transferToImageBitmap() -> front.transferFromImageBitmap()
 *
 * both inside the same rAF, so the layers are always in sync. If OffscreenCanvas
 * WebGL2 or bitmaprenderer is unavailable it falls back to a single normal
 * canvas ABOVE the HTML (no weaving, ribbon over everything).
 */
import * as THREE from "three";
import { RibbonCore, type CoreStats, type OutputKind } from "./core";
import { ProxyRegistry } from "./proxies";
import type { DeepPartial, RibbonSettings } from "./settings";
import type { RibbonPose } from "./types";

export type { RibbonPose };

export interface RibbonStats {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  rings: number;
  vertices: number;
  frontActive: boolean;
  /** CPU submit time per stage, ms (EMA) */
  cpu: CoreStats["cpu"];
  /** GPU time per stage, ms (EMA; 0 unless debug.gpuTimer) */
  gpu: CoreStats["gpu"];
  mode: "weave" | "single";
}

export interface RibbonEngineOptions {
  /** back (below the HTML) canvas; null forces the single-canvas fallback */
  back: HTMLCanvasElement | null;
  /** front (above the HTML) canvas; in the fallback it is the only canvas */
  front: HTMLCanvasElement;
  settings?: DeepPartial<RibbonSettings>;
  /** control points in the sim */
  controlPoints?: number;
}

let weaveSupport: boolean | null = null;
let infoLogged = false;

export class RibbonEngine {
  /** number of live (constructed, not disposed) engines; should be 1 */
  static live = 0;

  /** OffscreenCanvas WebGL2 + bitmaprenderer available? (cached) */
  static supportsWeave(): boolean {
    if (weaveSupport !== null) return weaveSupport;
    let ok = false;
    try {
      if (
        typeof OffscreenCanvas !== "undefined" &&
        typeof ImageBitmapRenderingContext !== "undefined" &&
        typeof OffscreenCanvas.prototype.transferToImageBitmap === "function"
      ) {
        const gl = new OffscreenCanvas(1, 1).getContext("webgl2");
        if (gl) {
          ok = true;
          gl.getExtension("WEBGL_lose_context")?.loseContext();
        }
      }
    } catch {
      ok = false;
    }
    weaveSupport = ok;
    return ok;
  }

  readonly core: RibbonCore;
  readonly settings: RibbonSettings;
  readonly camera: THREE.PerspectiveCamera;
  readonly sim: RibbonCore["sim"];
  readonly ribbon: RibbonCore["ribbon"];
  readonly proxies: ProxyRegistry;
  readonly mode: "weave" | "single";
  readonly stats: RibbonStats;

  /** CSS px size of the viewport */
  width = 1;
  height = 1;
  pixelRatio = 1;
  private prCeil = Infinity;
  private slowFrames = 0;
  private adaptFrames = 0;
  private refDt = 16.7;
  private okSeconds = 0;
  private postKey = "";

  private raf = 0;
  private running = false;
  private lastT = 0;
  private emaMs = 16.7;
  private disposed = false;
  private ro: ResizeObserver;
  private mqReduce: MediaQueryList | null = null;
  private backCtx: ImageBitmapRenderingContext | null = null;
  private frontCtx: ImageBitmapRenderingContext | null = null;
  private offscreen: OffscreenCanvas | null = null;
  private readonly onVisibility = () => {
    if (document.hidden) this.stop();
    else this.start();
  };
  private readonly onReduce = () => this.applyReducedMotion();
  private readonly emit = (which: OutputKind) => {
    if (which === "single") return;
    const bmp = this.core.transfer();
    if (!bmp) return;
    const ctx = which === "back" ? this.backCtx : this.frontCtx;
    if (ctx) ctx.transferFromImageBitmap(bmp);
    else bmp.close();
  };

  constructor(private opts: RibbonEngineOptions) {
    RibbonEngine.live++;
    let weave = !!opts.back && RibbonEngine.supportsWeave();
    if (weave) {
      this.backCtx = opts.back!.getContext("bitmaprenderer", { alpha: false });
      this.frontCtx = opts.front.getContext("bitmaprenderer", { alpha: true });
      if (!this.backCtx || !this.frontCtx) weave = false;
    }
    if (!weave && !infoLogged) {
      infoLogged = true;
      console.info(
        "[ribbon] OffscreenCanvas WebGL2 / ImageBitmapRenderingContext unavailable: " +
          "using a single canvas above the HTML (no weaving, ribbon over everything).",
      );
    }
    this.mode = weave ? "weave" : "single";
    if (weave) {
      this.offscreen = new OffscreenCanvas(1, 1);
      this.core = new RibbonCore(this.offscreen, {
        settings: opts.settings,
        controlPoints: opts.controlPoints,
        weave: true,
      });
    } else {
      this.core = new RibbonCore(opts.front, {
        settings: opts.settings,
        controlPoints: opts.controlPoints,
        weave: false,
      });
    }
    this.settings = this.core.settings;
    this.camera = this.core.camera;
    this.sim = this.core.sim;
    this.ribbon = this.core.ribbon;
    this.proxies = new ProxyRegistry();
    this.stats = {
      fps: 0,
      frameMs: 0,
      drawCalls: 0,
      triangles: 0,
      rings: 0,
      vertices: 0,
      frontActive: false,
      cpu: this.core.stats.cpu,
      gpu: this.core.stats.gpu,
      mode: this.mode,
    };

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(opts.front);
    document.addEventListener("visibilitychange", this.onVisibility);
    this.mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.mqReduce.addEventListener("change", this.onReduce);
    this.applyReducedMotion();

    this.resize();
    this.applySettings(true);
    this.start();
  }

  // ---- public API -------------------------------------------------------

  /** Convert a viewport CSS-px position (y down) to world coords at z = 0. */
  domToWorld(x: number, y: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(x - this.width / 2, this.height / 2 - y, 0);
  }

  setPose(pose: RibbonPose, snap = false): void {
    this.core.setPose(pose, snap);
  }

  applySettings(force = false): void {
    const s = this.settings;
    const pKey = JSON.stringify([s.post.pixelRatioCap, s.post.adaptive]);
    if (force || pKey !== this.postKey) {
      this.postKey = pKey;
      this.prCeil = Infinity;
      if (this.targetPixelRatio() !== this.pixelRatio) this.resize();
    }
    this.core.applySettings(force);
    document.documentElement.toggleAttribute(
      "data-ribbon-debug",
      s.debug.proxyOutlines || s.debug.view === "mask",
    );
  }

  patchSettings(patch: DeepPartial<RibbonSettings>): void {
    this.core.patchSettings(patch);
    this.applySettings();
  }

  snapshotSettings(): RibbonSettings {
    return this.core.snapshotSettings();
  }

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /**
   * Diagnostic: run `frames` synchronous frames with a GL finish after each and
   * return the mean wall time per frame in ms (independent of rAF/visibility).
   */
  benchmark(frames = 60): { msPerFrame: number; cpuMs: number } {
    const wasRunning = this.running;
    this.stop();
    let cpu = 0;
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) {
      const c0 = performance.now();
      this.core.frame(1 / 60, c0, this.proxies.update(), this.emit);
      cpu += performance.now() - c0;
      this.core.finish();
    }
    const total = performance.now() - t0;
    if (wasRunning) this.start();
    return { msPerFrame: total / frames, cpuMs: cpu / frames };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    RibbonEngine.live--;
    this.stop();
    this.ro.disconnect();
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.mqReduce?.removeEventListener("change", this.onReduce);
    document.documentElement.removeAttribute("data-ribbon-debug");
    this.proxies.dispose();
    this.core.dispose();
  }

  // ---- internals --------------------------------------------------------

  private applyReducedMotion(): void {
    this.core.setReducedMotion(this.mqReduce?.matches ?? false);
  }

  private resize(): void {
    const w = Math.max(this.opts.front.clientWidth, 1);
    const h = Math.max(this.opts.front.clientHeight, 1);
    const pr = this.targetPixelRatio();
    this.width = w;
    this.height = h;
    this.pixelRatio = pr;
    this.core.setSize(w, h, pr);
    if (this.mode === "weave") {
      // both visible canvases get exactly the offscreen drawing-buffer size
      for (const c of [this.opts.back, this.opts.front]) {
        if (c && (c.width !== this.core.bufW || c.height !== this.core.bufH)) {
          c.width = this.core.bufW;
          c.height = this.core.bufH;
        }
      }
    }
    this.proxies.invalidate();
  }

  private targetPixelRatio(): number {
    return Math.max(
      1,
      Math.min(
        window.devicePixelRatio || 1,
        this.settings.post.pixelRatioCap,
        this.prCeil,
      ),
    );
  }

  /**
   * Adaptive resolution: if frames stay clearly longer than the best interval
   * the display has delivered, step the pixel ratio down by 0.25 (floor 1).
   * After ~20 s of smooth frames it probes one step back up.
   */
  private adapt(dtMs: number): void {
    if (!this.settings.post.adaptive) return;
    this.adaptFrames++;
    if (this.adaptFrames < 90) return; // ignore shader-compile / warm-up hitches
    this.refDt = Math.min(this.refDt * 1.0004, this.emaMs);
    const slow = this.emaMs > Math.max(this.refDt * 1.6, 10);
    if (slow) {
      this.slowFrames++;
      this.okSeconds = 0;
    } else {
      this.slowFrames = 0;
      this.okSeconds += dtMs / 1000;
    }
    const cur = this.pixelRatio;
    if (this.slowFrames > 40 && cur > 1) {
      this.prCeil = Math.max(1, cur - 0.25);
      this.slowFrames = 0;
      this.resize();
    } else if (this.okSeconds > 20 && this.prCeil !== Infinity) {
      const up = cur + 0.25;
      if (up <= Math.min(window.devicePixelRatio || 1, this.settings.post.pixelRatioCap)) {
        this.prCeil = up;
        this.okSeconds = 0;
        this.resize();
      }
    }
  }

  private tick = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
    const dtMs = Math.min(now - this.lastT, 100);
    this.lastT = now;
    const t0 = performance.now();
    this.core.frame(dtMs / 1000, now, this.proxies.update(), this.emit);
    this.adapt(dtMs);
    const cpu = performance.now() - t0;
    this.emaMs += (dtMs - this.emaMs) * 0.08;
    const st = this.stats;
    const cs = this.core.stats;
    st.fps = 1000 / Math.max(this.emaMs, 0.001);
    st.frameMs = cpu;
    st.drawCalls = cs.drawCalls;
    st.triangles = cs.triangles;
    st.rings = cs.rings;
    st.vertices = cs.vertices;
    st.frontActive = cs.frontActive;
  };
}
