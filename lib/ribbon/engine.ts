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
import { TierGovernor, type GovernorEvent, type Tier } from "./capability";
import { RibbonCore, type CoreStats, type OutputKind } from "./core";
import { rlog } from "./debugLog";
import { ProxyRegistry } from "./proxies";
import {
  applyQualityTier,
  mergeSettings,
  QUALITY_TIERS,
  type DeepPartial,
  type RibbonSettings,
} from "./settings";
import { MAX_CANVAS_PIXELS, profileFor, type TierProfile } from "./tiers";
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
  /**
   * Capability tier (2 low, 3 medium, 4 high). Applies that tier's render
   * settings, pixel budget and idle frame cap, and enables the runtime probe /
   * downgrade governor. Omit (the lab) for the plain settings with no governance.
   */
  tier?: 2 | 3 | 4 | null;
  /** run the catastrophic-slowness watchdog (default true when `tier` is set; off for `?tier=` overrides) */
  watchdog?: boolean;
  /** an unrecoverable problem (thrown error, shader error, WebGL context loss) */
  onFatal?: (err: unknown, kind: "error" | "context-lost") => void;
  /**
   * The first frame that is FULLY ready (shadow map, contact catcher and environment rendered at
   * least once) was handed to the visible canvases. Reveal the live layers from here.
   */
  onFirstFrame?: () => void;
  /** the first back composite was handed over (ready or not): the engine is alive */
  onRendering?: () => void;
  /** sustained catastrophic slowness stepped the tier down */
  onTier?: (e: GovernorEvent) => void;
}

/** idle cap: how long after the last scroll / resize / pose change the ribbon counts as "moving" */
const ACTIVE_MS = 1500;
/** crossfade of a (catastrophic) tier downgrade */
const CROSSFADE_MS = 400;
/** the probe window (1.5 s + warm-up) always runs at full rate */
const STARTUP_ACTIVE_MS = 3200;
/** a touch device keeps the URL bar showing/hiding without any resize: ignore height-only changes this small */
const TOUCH_RESIZE_SLOP = 160;

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
  private clock = 0;
  private lastProbeAt = -1e9;
  private probeWait = 20;
  private postKey = "";

  /** current capability tier (null: lab / ungoverned) */
  tier: Tier | null = null;
  private profile: TierProfile | null = null;
  private governor: TierGovernor | null = null;
  private coarse = false;
  private staticMode = false;
  private activeUntil = 0;
  private lastRenderAt = 0;
  private resumeSkip = 0;
  private firstFrame = false;
  private rendering = false;
  private waitFrames = 0;
  private fatalFired = false;

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
  // back/forward cache: the page is frozen, then resumed without a reload
  private readonly onPageHide = () => this.stop();
  private readonly onPageShow = (e: PageTransitionEvent) => {
    if (this.disposed) return;
    if (e.persisted && this.contextLost()) {
      this.fatal(new Error("WebGL context lost while the page was in the back/forward cache"), "context-lost");
      return;
    }
    this.proxies.invalidate();
    if (!document.hidden) this.start();
  };
  private readonly onActivity = () => this.markActive();
  private readonly onReduce = () => this.applyReducedMotion();
  private readonly onContextLost = () => {
    this.fatal(new Error("WebGL context lost"), "context-lost");
  };
  private readonly emit = (which: OutputKind) => {
    if (which === "single") return;
    const bmp = this.core.transfer();
    if (!bmp) return;
    const ctx = which === "back" ? this.backCtx : this.frontCtx;
    if (ctx) ctx.transferFromImageBitmap(bmp);
    else bmp.close();
    if (which === "back" && !this.rendering) {
      this.rendering = true;
      this.opts.onRendering?.();
    }
    // normally ready on the first frame; a stuck core must not keep the layers hidden for ever
    if (!this.firstFrame && which === "back" && (this.core.ready || ++this.waitFrames > 30)) {
      this.firstFrame = true;
      rlog("first-frame", { tier: this.tier, pixelRatio: this.pixelRatio, samples: this.core.effectiveSamples });
      this.opts.onFirstFrame?.();
    }
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
    this.tier = opts.tier ?? null;
    this.profile = this.tier ? profileFor(this.tier) : null;
    // tier render settings first, explicit overrides on top
    let initial: DeepPartial<RibbonSettings> | undefined = opts.settings;
    if (this.profile) {
      const base = mergeSettings(opts.settings);
      applyQualityTier(base, this.profile.quality);
      initial = base;
    }
    try {
      if (weave) {
        this.offscreen = new OffscreenCanvas(1, 1);
        this.core = new RibbonCore(this.offscreen, {
          settings: initial,
          controlPoints: opts.controlPoints,
          weave: true,
        });
      } else {
        this.core = new RibbonCore(opts.front, {
          settings: initial,
          controlPoints: opts.controlPoints,
          weave: false,
        });
      }
    } catch (err) {
      RibbonEngine.live--;
      throw err;
    }
    // a shader that fails to compile does not throw in three.js: it logs and draws nothing
    this.core.renderer.debug.onShaderError = () => {
      this.fatal(new Error("shader compile / link error"), "error");
    };
    (this.offscreen ?? opts.front).addEventListener("webglcontextlost", this.onContextLost);
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

    this.coarse = window.matchMedia("(pointer: coarse)").matches;
    if (this.tier !== null && opts.watchdog !== false) {
      this.governor = new TierGovernor(this.tier);
    }

    this.ro = new ResizeObserver(() => {
      rlog("resize-observer", { w: opts.front.clientWidth, h: opts.front.clientHeight, dpr: window.devicePixelRatio });
      // resizing a canvas clears it: repaint in the same task so there is no blank frame
      if (this.resize()) this.renderNow();
    });
    this.ro.observe(opts.front);
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("pagehide", this.onPageHide);
    window.addEventListener("pageshow", this.onPageShow);
    window.addEventListener("scroll", this.onActivity, { passive: true });
    window.addEventListener("touchmove", this.onActivity, { passive: true });
    this.mqReduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.mqReduce.addEventListener("change", this.onReduce);
    this.applyReducedMotion();

    this.resize(true);
    this.applySettings(true);
    this.markActive(STARTUP_ACTIVE_MS);
    this.start();
  }

  // ---- public API -------------------------------------------------------

  /** called every rendered frame before the sim steps (the page's scroll journey drives the slide from here) */
  beforeFrame: (() => void) | null = null;

  /** Convert a viewport CSS-px position (y down) to world coords at z = 0. */
  domToWorld(x: number, y: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(x - this.width / 2, this.height / 2 - y, 0);
  }

  setPose(pose: RibbonPose, snap = false): void {
    this.core.setPose(pose, snap);
    if (!snap) this.markActive(2500);
  }

  /** Keep rendering at full rate for a while (scroll, resize, pose change ...). */
  markActive(ms = ACTIVE_MS): void {
    this.activeUntil = Math.max(this.activeUntil, performance.now() + ms);
  }

  /** the idle cap policy of the current tier (null = never capped) */
  get idleFps(): number {
    if (this.profile) return this.coarse ? 30 : this.profile.idleFps;
    return 0;
  }

  /** WebGL context lost? (also a backup for browsers that never fire the event) */
  contextLost(): boolean {
    try {
      return (this.core.renderer.getContext() as WebGL2RenderingContext).isContextLost();
    } catch {
      return true;
    }
  }

  /**
   * Re-apply a (lower) tier at runtime: render settings + pixel budget. Never
   * called with a higher tier than the current one.
   */
  setTier(tier: 2 | 3 | 4): void {
    const profile = profileFor(tier);
    if (!profile) return;
    rlog("tier-set", { from: this.tier, to: tier });
    this.tier = tier;
    this.profile = profile;
    const t = QUALITY_TIERS[profile.quality];
    this.core.patchSettings({
      quality: profile.quality,
      post: t.post,
      geometry: t.geometry,
      shadows: t.shadows,
      contact: t.contact,
    });
    this.applySettings();
    this.prCeil = Infinity;
    this.resize(true);
    this.markActive(STARTUP_ACTIVE_MS);
  }

  /**
   * Step down to a lower tier WITHOUT a visible pop: the current frames are copied into overlay
   * canvases, the new tier renders underneath at once, and the overlays fade out over 400 ms.
   */
  downgradeTo(tier: 2 | 3 | 4): void {
    const overlays: HTMLCanvasElement[] = [];
    if (this.mode === "weave") {
      for (const c of [this.opts.back, this.opts.front]) {
        const host = c?.parentElement;
        if (!c || !host || c.width === 0 || c.height === 0) continue;
        try {
          const o = document.createElement("canvas");
          o.width = c.width;
          o.height = c.height;
          o.getContext("2d")?.drawImage(c, 0, 0);
          o.setAttribute("aria-hidden", "true");
          o.style.cssText =
            "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:1;" +
            `transition:opacity ${CROSSFADE_MS}ms ease`;
          host.appendChild(o);
          overlays.push(o);
        } catch {
          /* no overlay: the downgrade then happens without a fade (rare, and still correct) */
        }
      }
    }
    rlog("downgrade-crossfade", { to: tier, overlays: overlays.length, ms: CROSSFADE_MS });
    this.setTier(tier);
    this.renderNow(); // the new quality is on the canvases before the overlays start to fade
    if (overlays.length) {
      requestAnimationFrame(() => {
        for (const o of overlays) o.style.opacity = "0";
      });
      window.setTimeout(() => overlays.forEach((o) => o.remove()), CROSSFADE_MS + 100);
    }
  }

  /** Test hook: lose the GL context like a GPU reset would. */
  debugLoseContext(): void {
    this.core.renderer.getContext().getExtension("WEBGL_lose_context")?.loseContext();
  }

  /**
   * Poster capture (scripts/render-posters.mjs): render the CURRENT pose at a
   * frozen time (+ optional idle amount) and return both layers as PNG data
   * URLs. `matte` renders the opaque back layer over a pure black / white
   * background with no vignette, grain, dither or glow so the script can
   * recover a transparent layer by difference matting.
   */
  captureLayers(opts: { time?: number; idle?: number; matte?: "black" | "white" | null }): {
    back: string;
    front: string;
  } {
    this.stop();
    // full device resolution, no adaptive drop (posters are rendered once, offline)
    this.patchSettings({ post: { pixelRatioCap: 4, adaptive: false, samples: 4, samplesRetina: 4 } });
    if (opts.matte) {
      const c = opts.matte === "white" ? "#ffffff" : "#000000";
      this.patchSettings({
        background: { color: c, vignette: 0, gradient: 0, grain: 0 },
        post: { dither: false },
        shadows: { glow: false },
      });
    }
    this.core.setReducedMotion(false);
    this.core.sim.idleScale01 = opts.idle ?? 0;
    this.core.sim.time = opts.time ?? 0;
    this.core.sim.snapToTarget();
    this.proxies.invalidate();
    for (let i = 0; i < 3; i++) {
      this.core.frame(0, opts.time ?? 0, this.proxies.update(), this.emit);
    }
    const back = this.opts.back?.toDataURL("image/png") ?? "";
    const front = this.opts.front.toDataURL("image/png");
    return { back, front };
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
    if (this.running || this.disposed || this.fatalFired) return;
    rlog("loop-start");
    this.running = true;
    this.lastT = performance.now();
    this.lastRenderAt = this.lastT;
    this.resumeSkip = 3;
    this.governor?.resetWindow();
    this.markActive(ACTIVE_MS);
    this.raf = requestAnimationFrame(this.tick);
  }

  stop(): void {
    if (this.running) rlog("loop-stop");
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
    window.removeEventListener("pagehide", this.onPageHide);
    window.removeEventListener("pageshow", this.onPageShow);
    window.removeEventListener("scroll", this.onActivity);
    window.removeEventListener("touchmove", this.onActivity);
    (this.offscreen ?? this.opts.front).removeEventListener("webglcontextlost", this.onContextLost);
    this.mqReduce?.removeEventListener("change", this.onReduce);
    document.documentElement.removeAttribute("data-ribbon-debug");
    this.proxies.dispose();
    this.core.dispose();
  }

  // ---- internals --------------------------------------------------------

  private applyReducedMotion(): void {
    // reduced motion: static pose (no idle, no flying), re-rendered only when something moves
    this.staticMode = this.mqReduce?.matches ?? false;
    this.core.setReducedMotion(this.staticMode);
    this.markActive(ACTIVE_MS);
  }

  /** Report an unrecoverable problem once; the owner swaps in the posters. */
  private fatal(err: unknown, kind: "error" | "context-lost"): void {
    if (this.fatalFired || this.disposed) return;
    this.fatalFired = true;
    this.stop();
    if (this.opts.onFatal) this.opts.onFatal(err, kind);
    else console.warn("[ribbon] stopped:", err);
  }

  /** Render one frame right now (after a canvas resize cleared the canvases). */
  private renderNow(): void {
    if (!this.running || this.disposed || this.fatalFired) return;
    try {
      const now = performance.now();
      this.core.frame(0.0001, now, this.proxies.update(), this.emit);
      this.lastRenderAt = now;
    } catch (err) {
      this.fatal(err, "error");
    }
  }

  /** @returns whether the drawing buffers were resized */
  private resize(force = false): boolean {
    const w = Math.max(this.opts.front.clientWidth, 1);
    const h = Math.max(this.opts.front.clientHeight, 1);
    // Layers are 100lvh tall, so mobile URL bars never resize them. As a second
    // line of defence a touch device ignores small height-only changes.
    if (
      !force &&
      this.coarse &&
      w === this.width &&
      Math.abs(h - this.height) <= TOUCH_RESIZE_SLOP
    ) {
      return false;
    }
    const pr = this.targetPixelRatio(w, h);
    if (!force && w === this.width && h === this.height && pr === this.pixelRatio) return false;
    rlog("resize", {
      css: [w, h],
      prev: [this.width, this.height],
      pixelRatio: pr,
      prevPixelRatio: this.pixelRatio,
      devicePixelRatio: window.devicePixelRatio,
      ceil: this.prCeil,
    });
    this.width = w;
    this.height = h;
    this.pixelRatio = pr;
    this.markActive(ACTIVE_MS);
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
    return true;
  }

  /**
   * Pixel ratio: device ratio, capped by the tier, the adaptive ceiling and the
   * pixel budget (iOS canvas limit + GPU memory), never below 0.6.
   */
  private targetPixelRatio(w = this.width, h = this.height): number {
    let pr = Math.max(
      1,
      Math.min(
        window.devicePixelRatio || 1,
        this.settings.post.pixelRatioCap,
        this.prCeil,
      ),
    );
    const budget = Math.min(this.profile?.maxPixels ?? MAX_CANVAS_PIXELS, MAX_CANVAS_PIXELS);
    const px = Math.max(w * h, 1);
    if (px * pr * pr > budget) pr = Math.max(0.6, Math.sqrt(budget / px));
    return pr;
  }

  /**
   * Adaptive resolution with hysteresis. The reference interval is the best the
   * display has delivered (a 120 Hz panel keeps 8.3 ms, so we only trade pixels
   * when frames are clearly longer than that). Steps the pixel ratio down by
   * 0.25 (floor 1) after ~0.7 s of slow frames, and probes one step back up
   * only after a quiet period. Probes that fail (we have to drop again soon
   * after) back the wait off exponentially (20 s -> 40 s -> ... 10 min), so a
   * panel/GPU that cannot hold the higher ratio settles instead of oscillating.
   */
  private adapt(dtMs: number): void {
    if (!this.settings.post.adaptive) return;
    this.adaptFrames++;
    if (this.adaptFrames < 90) return; // ignore shader-compile / warm-up hitches
    this.refDt = Math.min(this.refDt * 1.0004, this.emaMs);
    const slow = this.emaMs > Math.max(this.refDt * 1.5, 10);
    // clearly healthy: within 20 % of the reference (the probe-up gate)
    const healthy = this.emaMs < this.refDt * 1.2;
    this.clock += dtMs / 1000;
    if (slow) {
      this.slowFrames++;
      this.okSeconds = 0;
    } else {
      this.slowFrames = 0;
      this.okSeconds = healthy ? this.okSeconds + dtMs / 1000 : 0;
    }
    const cur = this.pixelRatio;
    if (this.slowFrames > 40 && cur > 1) {
      // a drop soon after a probe means the higher ratio does not fit: back off
      if (this.clock - this.lastProbeAt < 15) this.probeWait = Math.min(this.probeWait * 2, 600);
      rlog("adaptive-dpr-down", { from: cur, ema: this.emaMs });
      this.prCeil = Math.max(1, cur - 0.25);
      this.slowFrames = 0;
      this.okSeconds = 0;
      this.resize();
      this.emaMs = this.refDt;
    } else if (this.okSeconds > this.probeWait && this.prCeil !== Infinity) {
      const up = cur + 0.25;
      if (up <= Math.min(window.devicePixelRatio || 1, this.settings.post.pixelRatioCap)) {
        rlog("adaptive-dpr-up", { from: cur, to: up });
        this.prCeil = up;
        this.okSeconds = 0;
        this.lastProbeAt = this.clock;
        this.resize();
        this.emaMs = this.refDt;
      }
    }
  }

  private tick = (now: number) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
    try {
      this.step(now);
    } catch (err) {
      this.fatal(err, "error");
    }
  };

  private step(now: number): void {
    if (this.contextLost()) {
      this.fatal(new Error("WebGL context lost"), "context-lost");
      return;
    }
    const active = now < this.activeUntil;
    const since = now - this.lastRenderAt;
    if (!active) {
      // reduced motion: a static pose only needs a frame when something moved
      if (this.staticMode) {
        this.lastT = now;
        return;
      }
      // settled and idle: cap the frame rate (T2, and any touch device: battery)
      const fps = this.idleFps;
      if (fps > 0 && since < 1000 / fps - 4) return;
    }
    const dtMs = Math.min(now - this.lastT, 100);
    this.lastT = now;
    this.lastRenderAt = now;
    // the first frames after a (re)start or a capped stretch are not measurements
    const measure = active && this.resumeSkip === 0;
    if (this.resumeSkip > 0) this.resumeSkip--;
    if (measure) this.adapt(dtMs);
    const t0 = performance.now();
    const sim = this.core.sim;
    if (sim.params.mode === "slide") {
      sim.slideScrollY = window.__scrollState?.y ?? window.scrollY;
      try {
        this.beforeFrame?.();
      } catch {
        /* the journey must never break the render loop */
      }
      // the intro / the scroll follow-through must run at full rate and never be capped as "idle"
      if (sim.slide.animating) this.markActive(ACTIVE_MS);
    }
    this.core.frame(dtMs / 1000, now, this.proxies.update(), this.emit);
    const cpu = performance.now() - t0;
    if (measure) {
      this.emaMs += (dtMs - this.emaMs) * 0.08;
      this.govern(dtMs, this.core.stats.logicMs);
    }
    const st = this.stats;
    const cs = this.core.stats;
    st.fps = 1000 / Math.max(this.emaMs, 0.001);
    st.frameMs = cpu;
    st.drawCalls = cs.drawCalls;
    st.triangles = cs.triangles;
    st.rings = cs.rings;
    st.vertices = cs.vertices;
    st.frontActive = cs.frontActive;
  }

  /** Feed the capability governor; apply a step down immediately. */
  private govern(dtMs: number, logic: number): void {
    const g = this.governor;
    if (!g || document.hidden) return;
    const ev = g.push({ dt: dtMs, work: logic });
    if (!ev) return;
    rlog("governor", ev);
    this.opts.onTier?.(ev);
    if (ev.tier >= 2) this.downgradeTo(ev.tier as 2 | 3 | 4);
    else this.fatal(new Error(ev.reason), "error");
  }
}
