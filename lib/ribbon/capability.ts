/**
 * Capability tiers for the live ribbon. This file must stay tiny and must NOT
 * import three.js (or anything that does): it runs BEFORE the engine chunk is
 * downloaded and decides whether that chunk is loaded at all.
 *
 *   T0  no JS          SSR site + <noscript> posters (nothing here runs)
 *   T1  poster         no live rendering: posters only (no WebGL2 / software
 *                      renderer / context failure / save-data / forced-colors ...)
 *   T2  low            weak devices: DPR <= 1.25, ~360 rings, no contact shadows,
 *                      512 shadow map, 30 fps when idle
 *   T3  medium         the default
 *   T4  high           strong desktops (bloom, 900 rings, DPR up to 2)
 *
 * Detection is layered:
 *   1. static   (this file, before importing three): WebGL2 probe on a throwaway
 *               canvas, renderer string, deviceMemory, hardwareConcurrency,
 *               saveData, forced-colors, OffscreenCanvas weave support.
 *   2. cache    last tier a catastrophic downgrade settled on (versioned, 14 day TTL).
 *   3. runtime  `TierGovernor`: nothing is re-decided after first paint (a visible quality
 *               change is a glitch). Only sustained catastrophic slowness (< 20 fps for 5 s)
 *               steps the tier DOWN, crossfaded by the engine. Never up.
 *   4. override `?tier=0..4` (debug; skips cache and the watchdog).
 */

export type Tier = 0 | 1 | 2 | 3 | 4;

export const TIER_NAMES = ["none", "poster", "low", "medium", "high"] as const;

export type TierSource = "override" | "static" | "cache";

export interface CapabilitySignals {
  webgl2: boolean;
  /** UNMASKED_RENDERER_WEBGL (may be empty when the browser hides it) */
  renderer: string;
  software: boolean;
  weave: boolean;
  deviceMemory: number | null;
  cores: number;
  /** cpuScoreMs() (0 = not measured) */
  cpuMs: number;
  saveData: boolean;
  slowNetwork: boolean;
  forcedColors: boolean;
  coarse: boolean;
  dpr: number;
}

export interface TierDecision {
  tier: Tier;
  /** highest tier the static signals allow */
  ceiling: Tier;
  reason: string;
  source: TierSource;
  /** informational: the decision came from an override or a cached verdict (no static signals were weighed) */
  locked: boolean;
  signals: CapabilitySignals;
}

const CACHE_KEY = "ribbon:tier";
const CACHE_VERSION = 3; // 3: the 1.5 s runtime probe is gone (its cached verdicts must not stick)
const CACHE_TTL_MS = 14 * 24 * 3600 * 1000;
const CACHE_TTL_POSTER_MS = 24 * 3600 * 1000;

const SOFTWARE_RE =
  /swiftshader|llvmpipe|softpipe|lavapipe|software|basic render|mesa offscreen|microsoft basic|gdi generic/i;

/** `?tier=0..4`, or null */
export function readTierOverride(): Tier | null {
  try {
    const v = new URLSearchParams(window.location.search).get("tier");
    if (v === null || !/^[0-4]$/.test(v)) return null;
    return Number(v) as Tier;
  } catch {
    return null;
  }
}

function readCache(): Tier | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as { v?: number; tier?: number; ts?: number };
    if (c.v !== CACHE_VERSION || typeof c.tier !== "number" || typeof c.ts !== "number") return null;
    if (c.tier < 1 || c.tier > 4) return null;
    const ttl = c.tier === 1 ? CACHE_TTL_POSTER_MS : CACHE_TTL_MS;
    if (Date.now() - c.ts > ttl) return null;
    return c.tier as Tier;
  } catch {
    return null;
  }
}

/** Remember the tier the runtime locked / downgraded to (storage may be unavailable). */
export function writeTierCache(tier: Tier): void {
  try {
    window.localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ v: CACHE_VERSION, tier, ts: Date.now() }),
    );
  } catch {
    /* private mode / blocked storage: next visit just probes again */
  }
}

/** OffscreenCanvas WebGL2 + bitmaprenderer: needed for the two-layer weave. */
function probeWeave(): boolean {
  try {
    if (
      typeof OffscreenCanvas === "undefined" ||
      typeof ImageBitmapRenderingContext === "undefined" ||
      typeof OffscreenCanvas.prototype.transferToImageBitmap !== "function"
    ) {
      return false;
    }
    const gl = new OffscreenCanvas(1, 1).getContext("webgl2");
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

interface GlProbe {
  ok: boolean;
  renderer: string;
  /** a context only exists as a software / "major performance caveat" one */
  caveat: boolean;
  missing: string;
}

/** Throwaway WebGL2 context: capabilities + renderer string, then lose it. */
function probeWebGL2(): GlProbe {
  const out: GlProbe = { ok: false, renderer: "", caveat: false, missing: "" };
  try {
    const canvas = document.createElement("canvas");
    let gl = canvas.getContext("webgl2", {
      failIfMajorPerformanceCaveat: true,
      powerPreference: "high-performance",
    }) as WebGL2RenderingContext | null;
    if (!gl) {
      // distinguish "no WebGL2" from "only a software WebGL2"
      const c2 = document.createElement("canvas");
      gl = c2.getContext("webgl2") as WebGL2RenderingContext | null;
      if (!gl) return out;
      out.caveat = true;
    }
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    out.renderer = String(
      (ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || "",
    );
    const missing: string[] = [];
    if ((gl.getParameter(gl.MAX_DRAW_BUFFERS) as number) < 2) missing.push("MRT");
    if ((gl.getParameter(gl.MAX_SAMPLES) as number) < 2) missing.push("MSAA");
    if (!gl.getExtension("EXT_color_buffer_float") && !gl.getExtension("EXT_color_buffer_half_float")) {
      missing.push("float render targets");
    }
    out.missing = missing.join(", ");
    out.ok = true;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    out.ok = false;
  }
  return out;
}

/**
 * Device CPU speed index: min of a few runs of a fixed float workload (the same
 * flavour of math as the ribbon's per-frame sim + sweep). Min-of-N ignores
 * noise from other work on the page. ~3 ms on an Apple M2 laptop, ~12 ms under
 * Chrome's 4x CPU throttle (a mid-range phone), so the thresholds in
 * `decideTier` read as "x times slower than a fast laptop".
 */
export function cpuScoreMs(): number {
  try {
    const buf = new Float32Array(1024);
    let sink = 0;
    let best = Infinity;
    const start = performance.now();
    for (let r = 0; r < 6; r++) {
      const t = performance.now();
      let a = 0.5;
      for (let i = 0; i < 240000; i++) {
        a = a * 1.0000001 + Math.sin(i * 0.013) * 0.5;
        const j = i & 1023;
        buf[j] = buf[j] * 0.99 + Math.sqrt(a * a + 1.0) * 0.01;
        sink += buf[(j * 7) & 1023];
      }
      best = Math.min(best, performance.now() - t);
      if (performance.now() - start > 150) break; // very slow device: no need to prove it harder
    }
    return sink === Infinity ? 0 : best;
  } catch {
    return 0;
  }
}

/** cpuScoreMs above this: a weak CPU (T2 ceiling) / not a fast one (T3 ceiling) */
const CPU_WEAK_MS = 8.5;
const CPU_NOT_FAST_MS = 5.5;

interface NavigatorExtras {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
}

/**
 * Static tier decision (sync, ~5-20 ms because of the WebGL2 probe, so call it
 * from an idle callback, never during render).
 */
export function decideTier(): TierDecision {
  const nav = navigator as Navigator & NavigatorExtras;
  const mq = (q: string) => {
    try {
      return window.matchMedia(q).matches;
    } catch {
      return false;
    }
  };
  const forcedColors = mq("(forced-colors: active)");
  const saveData = nav.connection?.saveData === true;
  const slowNetwork = /(^|-)2g$/.test(nav.connection?.effectiveType ?? "");
  const cores = nav.hardwareConcurrency || 4;
  const memory = typeof nav.deviceMemory === "number" ? nav.deviceMemory : null;
  const coarse = mq("(pointer: coarse)");
  const dpr = window.devicePixelRatio || 1;

  const signals: CapabilitySignals = {
    webgl2: false,
    renderer: "",
    software: false,
    weave: false,
    deviceMemory: memory,
    cores,
    cpuMs: 0,
    saveData,
    slowNetwork,
    forcedColors,
    coarse,
    dpr,
  };
  const make = (
    tier: Tier,
    ceiling: Tier,
    reason: string,
    source: TierSource,
    locked: boolean,
  ): TierDecision => ({ tier, ceiling, reason, source, locked, signals });

  const override = readTierOverride();
  // forced-colors wins even over the override: posters would be unreadable noise
  if (forcedColors) return make(1, 1, "forced-colors", override !== null ? "override" : "static", true);
  if (override !== null) {
    const ceiling = override;
    if (override >= 2) {
      const gl = probeWebGL2();
      signals.webgl2 = gl.ok;
      signals.renderer = gl.renderer;
      signals.weave = probeWeave();
      if (!gl.ok) return make(1, 1, "?tier override but no WebGL2", "override", true);
    }
    return make(override, ceiling, `?tier=${override} override`, "override", true);
  }

  if (saveData) return make(1, 1, "save-data", "static", true);
  if (slowNetwork) return make(1, 1, `slow network (${nav.connection?.effectiveType})`, "static", true);

  const gl = probeWebGL2();
  signals.webgl2 = gl.ok;
  signals.renderer = gl.renderer;
  if (!gl.ok) return make(1, 1, "WebGL2 unavailable or context creation failed", "static", true);
  signals.software = gl.caveat || SOFTWARE_RE.test(gl.renderer);
  if (signals.software) {
    return make(1, 1, `software renderer (${gl.renderer || "performance caveat"})`, "static", true);
  }
  if (gl.missing) return make(1, 1, `missing GL features: ${gl.missing}`, "static", true);
  signals.weave = probeWeave();
  if (!signals.weave) {
    // The single-canvas fallback draws the ribbon OVER the text. The poster weave
    // (ribbon behind / in front of the HTML, frozen) reads much better, so posters win.
    return make(1, 1, "no OffscreenCanvas WebGL2 / bitmaprenderer (poster weave beats the single-canvas fallback)", "static", true);
  }

  // ---- ceiling from hardware hints
  let ceiling: Tier = 3;
  let why = "default";
  if ((memory !== null && memory <= 2) || cores <= 2) {
    ceiling = 2;
    why = `weak device (memory ${memory ?? "?"} GB, ${cores} cores)`;
  } else if (!coarse && cores >= 8 && (memory === null || memory >= 8)) {
    ceiling = 4;
    why = `strong desktop (memory ${memory ?? "?"} GB, ${cores} cores)`;
  } else if (coarse && (memory !== null && memory <= 3)) {
    ceiling = 2;
    why = `low-memory touch device (${memory} GB)`;
  }

  // measured CPU speed can only lower the ceiling
  const cpuMs = cpuScoreMs();
  signals.cpuMs = cpuMs;
  if (cpuMs > CPU_WEAK_MS && ceiling > 2) {
    ceiling = 2;
    why = `slow CPU (${cpuMs.toFixed(1)} ms benchmark); ${why}`;
  } else if (cpuMs > CPU_NOT_FAST_MS && ceiling > 3) {
    ceiling = 3;
    why = `CPU not fast (${cpuMs.toFixed(1)} ms benchmark); ${why}`;
  }

  const cached = readCache();
  if (cached !== null) {
    if (cached === 1) {
      return make(1, 1, "cached: this device could not hold live rendering", "cache", true);
    }
    const tier = Math.min(cached, ceiling) as Tier;
    return make(tier, ceiling, `cached tier ${cached}; ${why}`, "cache", true);
  }
  return make(ceiling, ceiling, why, "static", false);
}

// ---------------------------------------------------------------------------
// runtime governor

export interface FrameSample {
  /** ms between two rendered frames at full rate (rAF interval) */
  dt: number;
  /** ms of pure CPU work per frame (sim + geometry) */
  work: number;
}

/**
 * The tier is decided ONCE, before the first live frame (static signals + cache, see `decideTier`),
 * and never re-decided: a visible quality change after first paint reads as a glitch. The only
 * runtime action left is the catastrophic one: frames slower than 50 ms (< 20 fps) for 5 s steps
 * one tier down (crossfaded by the engine), and at the lowest live tier gives up live rendering
 * (posters, crossfaded).
 */
export const GOVERNOR = {
  /** frames ignored at the start (shader compilation, first uploads) */
  warmupFrames: 30,
  /** sustained slowness (EMA of the frame interval) above this ms = < 20 fps ... */
  downDt: 50,
  /** ... EMA below this resets the slow timer (hysteresis) */
  recoverDt: 40,
  /** ... for this long */
  downMs: 5000,
  /** quiet time after a step before the next may happen */
  cooldownMs: 8000,
} as const;

export type GovernorEvent = { type: "down"; tier: Tier; reason: string };

/**
 * Catastrophic-slowness watchdog. Frames must be fed only when the loop runs at full rate (not
 * when the idle 30 fps cap or reduced-motion pauses are active), and never while hidden.
 */
export class TierGovernor {
  private frames = 0;
  private ema = 16.7;
  private slowFor = 0;
  private cooldown = 0;

  constructor(public tier: Tier) {}

  /** drop partial windows after a pause (hidden tab, bfcache, resize hitch) */
  resetWindow(): void {
    this.frames = 0;
    this.ema = 16.7;
    this.slowFor = 0;
  }

  push(s: FrameSample): GovernorEvent | null {
    if (s.dt > 250) return null; // tab switch / debugger, not a measurement
    if (++this.frames <= GOVERNOR.warmupFrames) return null;
    this.ema += (s.dt - this.ema) * 0.05;
    if (this.cooldown > 0) {
      this.cooldown -= s.dt;
      return null;
    }
    if (this.ema > GOVERNOR.downDt) {
      this.slowFor += s.dt;
    } else if (this.ema < GOVERNOR.recoverDt) {
      this.slowFor = 0;
    }
    if (this.slowFor < GOVERNOR.downMs) return null;
    this.slowFor = 0;
    this.cooldown = GOVERNOR.cooldownMs;
    const reason = `sustained slowness (${this.ema.toFixed(1)} ms/frame for ${GOVERNOR.downMs / 1000} s)`;
    this.tier = (this.tier - 1) as Tier;
    return { type: "down", tier: this.tier, reason };
  }
}
