"use client";

import { useEffect, useRef, useState } from "react";
import {
  decideTier,
  TIER_NAMES,
  writeTierCache,
  type GovernorEvent,
  type Tier,
  type TierDecision,
} from "@/lib/ribbon/capability";
import { rlog } from "@/lib/ribbon/debugLog";
import type { RibbonEngine } from "@/lib/ribbon/engine";
import type { DeepPartial, RibbonSettings } from "@/lib/ribbon/settings";
import { PosterPicture, RibbonPoster } from "./RibbonPoster";
import "./ribbon.css";

export interface RibbonStageProps {
  children?: React.ReactNode;
  /** initial settings override (production uses the defaults) */
  settings?: DeepPartial<RibbonSettings>;
  /** called once the engine exists (and with null on teardown / when it is given up) */
  onEngine?: (engine: RibbonEngine | null) => void;
  /** awaited together with the engine chunk (e.g. a lazy pose module) */
  prepare?: () => Promise<unknown>;
  /** sim control points (default 64); long, tightly bent poses (the AK) want more */
  controlPoints?: number;
  /**
   * Lab: no capability tiers, no idle deferral, no poster fallback; the engine is
   * created as soon as the stage mounts, with the plain settings.
   */
  lab?: boolean;
}

/** the engine must be rendering this long after its import started, or we give up on it */
const ENGINE_DEADLINE_MS = 4000;
/** crossfade between live canvases and posters */
const FADE_MS = 700;

type Phase = "pending" | "live" | "poster" | "off";

type CaptureFn = (o: {
  /** pose to pose the ribbon with first: an authored pose name (lib/ribbon/poses) or a lab test pose (default: keep the current pose) */
  pose?: string;
  time?: number;
  idle?: number;
  matte?: "black" | "white" | null;
}) => Promise<{ back: string; front: string }>;

/** Debug / QA surface (never required by the site). */
export interface RibbonRuntimeState {
  tier: Tier | null;
  reason: string;
  phase: Phase;
  source: string;
  decision: TierDecision | null;
  engine: RibbonEngine | null;
  /** slide motion (`?motion=slide`): the intro has settled (event also fired as `ribbon:intro-settled`) */
  introSettled?: boolean;
  loseContext: () => void;
}

declare global {
  interface Window {
    __ribbonState?: RibbonRuntimeState;
    __ribbonCapture?: CaptureFn;
  }
}

/** after first paint, when the main thread is idle */
function afterPaintIdle(cb: () => void): () => void {
  let cancelled = false;
  let raf = 0;
  let idle = 0;
  let timer = 0;
  const run = () => {
    if (!cancelled) cb();
  };
  // Safari < 18 has no requestIdleCallback
  const ric = (window as { requestIdleCallback?: Window["requestIdleCallback"] }).requestIdleCallback;
  raf = requestAnimationFrame(() => {
    if (cancelled) return;
    if (ric) idle = ric.call(window, run, { timeout: 1500 });
    else timer = window.setTimeout(run, 200);
  });
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
    if (idle) window.cancelIdleCallback?.(idle);
    window.clearTimeout(timer);
  };
}

function logTier(tier: Tier, reason: string, extra = ""): void {
  console.info(`[ribbon] tier T${tier} (${TIER_NAMES[tier]})${extra}: ${reason}`);
}

/**
 * Mounts the two ribbon layers around transparent HTML content:
 *   back layer (opaque bg, z0) < children (z2) < front layer (transparent, z3).
 *
 * The HTML always renders and paints first. Nothing 3D is in the initial
 * bundle: after first paint (idle) the capability tier is decided; for T2+ the
 * engine chunk (three.js) is dynamically imported and mounted, otherwise (or on
 * any failure / context loss / missed 4 s deadline) the posters take over.
 *
 *   JS off      -> <noscript> posters (T0)
 *   T1          -> posters, no three.js download at all
 *   T2..T4      -> live canvases (ImageBitmapRenderingContext, one offscreen GL renderer)
 *
 * Canvases are created inside the effect so React 19 StrictMode's
 * mount/unmount/mount never reuses a context-lost canvas.
 */
export function RibbonStage({
  children,
  settings,
  onEngine,
  prepare,
  controlPoints,
  lab = false,
}: RibbonStageProps) {
  const backHost = useRef<HTMLDivElement>(null);
  const frontHost = useRef<HTMLDivElement>(null);
  const settingsRef = useRef(settings);
  const onEngineRef = useRef(onEngine);
  onEngineRef.current = onEngine;
  const prepareRef = useRef(prepare);
  prepareRef.current = prepare;
  const controlPointsRef = useRef(controlPoints);
  const [phase, setPhase] = useState<Phase>("pending");

  useEffect(() => {
    const backEl = backHost.current;
    const frontEl = frontHost.current;
    if (!backEl || !frontEl) return;

    let cancelled = false;
    let settled = false; // the outcome (live or poster) is final for this page view
    let engine: RibbonEngine | null = null;
    let back: HTMLCanvasElement | null = null;
    let front: HTMLCanvasElement | null = null;
    let deadline = 0;
    let removeTimer = 0;
    let decision: TierDecision | null = null;
    const url = new URLSearchParams(window.location.search);
    const capture = !lab && url.get("capture") === "1";
    // `?motion=slide`: the slide motion (intro + scroll slide along the pose path), for testing; the site default stays frozen
    const motionSlide = !lab && url.get("motion") === "slide";
    let introSettled = false;

    const publish = (p: Phase) => {
      rlog("phase", { phase: p, tier: decision?.tier ?? null });
      window.__ribbonState = {
        tier: decision?.tier ?? null,
        reason: decision?.reason ?? "",
        source: decision?.source ?? "",
        decision,
        phase: p,
        engine,
        introSettled,
        loseContext: () => engine?.debugLoseContext(),
      };
      if (decision) document.documentElement.dataset.ribbonTier = String(decision.tier);
      document.documentElement.dataset.ribbon = p;
    };

    const dropEngine = () => {
      const e = engine;
      engine = null;
      if (e) {
        onEngineRef.current?.(null);
        try {
          e.dispose();
        } catch {
          /* already broken: the canvases are discarded anyway */
        }
      }
    };

    /** swap in the posters (crossfading over whatever canvases are showing) and stop live rendering */
    const toPosters = (why: string, err?: unknown) => {
      if (cancelled || (settled && !engine)) return;
      settled = true;
      window.clearTimeout(deadline);
      if (err !== undefined) console.warn(`[ribbon] live rendering stopped (${why}); showing posters`, err);
      else console.warn(`[ribbon] live rendering stopped (${why}); showing posters`);
      if (decision) decision = { ...decision, tier: 1, reason: why };
      dropEngine();
      const forced = decision?.signals.forcedColors === true;
      setPhase(forced ? "off" : "poster");
      publish(forced ? "off" : "poster");
      // the canvases keep their last bitmap while they fade out
      removeTimer = window.setTimeout(() => {
        back?.remove();
        front?.remove();
      }, FADE_MS + 100);
    };

    const onTier = (ev: GovernorEvent) => {
      if (!decision) return;
      decision = { ...decision, tier: ev.tier, reason: ev.reason };
      rlog("tier-event", ev);
      logTier(ev.tier, ev.reason, " downgraded");
      if (decision.source !== "override") writeTierCache(ev.tier);
      publish("live");
    };

    const start = async () => {
      let mod: typeof import("@/lib/ribbon/engine");
      let tier: 2 | 3 | 4 | null = null;
      let watchdog = false;

      if (!lab) {
        decision = decideTier();
        rlog("tier-decision", { tier: decision.tier, source: decision.source, locked: decision.locked, reason: decision.reason });
        logTier(decision.tier, decision.reason, ` [${decision.source}]`);
        publish("pending");
        if (decision.tier < 2) {
          settled = true;
          const forced = decision.signals.forcedColors;
          setPhase(forced ? "off" : "poster");
          publish(forced ? "off" : "poster");
          return;
        }
        tier = decision.tier as 2 | 3 | 4;
        // the tier is final before the first live frame; only the catastrophic-slowness watchdog may
        // ever lower it (never for a `?tier=` override)
        watchdog = decision.source !== "override";
      }

      if (!capture) {
        deadline = window.setTimeout(
          () => toPosters(`engine not rendering within ${ENGINE_DEADLINE_MS / 1000} s`),
          ENGINE_DEADLINE_MS,
        );
      }
      try {
        [mod] = await Promise.all([import("@/lib/ribbon/engine"), prepareRef.current?.()]);
      } catch (err) {
        toPosters("engine chunk failed to load", err);
        return;
      }
      if (cancelled || settled) return;

      try {
        const weave = mod.RibbonEngine.supportsWeave();
        back = weave ? document.createElement("canvas") : null;
        front = document.createElement("canvas");
        for (const c of [back, front]) {
          if (!c) continue;
          c.setAttribute("aria-hidden", "true");
          c.setAttribute("role", "presentation");
          c.tabIndex = -1;
        }
        if (back) backEl.appendChild(back);
        frontEl.appendChild(front);
        engine = new mod.RibbonEngine({
          back,
          front,
          settings: motionSlide
            ? { ...settingsRef.current, sim: { ...settingsRef.current?.sim, mode: "slide" } }
            : settingsRef.current,
          controlPoints: controlPointsRef.current,
          tier,
          watchdog,
          // alive (frames are being produced): the 4 s deadline is met
          onRendering: () => window.clearTimeout(deadline),
          // fully ready (shadow map, contact catcher and environment rendered): fade the canvases in
          onFirstFrame: () => {
            if (cancelled || settled) return;
            settled = true;
            window.clearTimeout(deadline);
            setPhase("live");
            publish("live");
          },
          onTier,
          onFatal: (err, kind) => {
            // a lost context is final for this visit: never restart mid-visit
            toPosters(kind === "context-lost" ? "WebGL context lost" : "render error", err);
          },
        });
        publish("pending");
        if (motionSlide) {
          engine.sim.slide.onIntroSettled(() => {
            introSettled = true;
            document.documentElement.dataset.ribbonIntro = "settled";
            window.dispatchEvent(new CustomEvent("ribbon:intro-settled"));
            if (window.__ribbonState) window.__ribbonState.introSettled = true;
          });
        }
        onEngineRef.current?.(engine);
        if (capture) {
          // poster rendering (scripts/render-posters.mjs, `?capture=1`): frozen pose, both layers
          const e = engine;
          window.__ribbonCapture = async (o) => {
            if (o.pose) {
              // an authored pose (lib/ribbon/poses) is resolved against the real layout
              const site = await import("@/lib/ribbon/poses/site");
              const authored = o.pose === "sweep" ? null : site.resolveNamedPose(o.pose, e);
              if (authored) {
                e.setPose(authored.pose, true);
              } else {
                const m = await import("@/lib/ribbon/testPoses");
                e.setPose(m.makeTestPose(o.pose, e.width, e.height, e.sim.count), true);
              }
            }
            return e.captureLayers(o);
          };
        }
      } catch (err) {
        back?.remove();
        front?.remove();
        toPosters("engine failed to start", err);
      }
    };

    // the lab starts immediately; the site only after first paint, when idle
    const cancelStart = lab
      ? (() => {
          void start();
          return () => {};
        })()
      : afterPaintIdle(() => void start());

    return () => {
      cancelled = true;
      cancelStart();
      window.clearTimeout(deadline);
      window.clearTimeout(removeTimer);
      dropEngine();
      back?.remove();
      front?.remove();
    };
  }, [lab]);

  return (
    <div className="ribbon-stage" data-ribbon={phase}>
      <div className="ribbon-layer ribbon-layer--back">
        <div ref={backHost} className="ribbon-canvas-host" />
        {phase === "poster" ? <RibbonPoster layer="back" /> : null}
        <noscript>
          <PosterPicture layer="back" className="ribbon-poster--static" />
        </noscript>
      </div>
      <div className="ribbon-content">{children}</div>
      <div className="ribbon-layer ribbon-layer--front">
        <div ref={frontHost} className="ribbon-canvas-host" />
        {phase === "poster" ? <RibbonPoster layer="front" /> : null}
        <noscript>
          <PosterPicture layer="front" className="ribbon-poster--static" />
        </noscript>
      </div>
    </div>
  );
}
