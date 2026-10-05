"use client";

import { useEffect, useRef } from "react";
import { RibbonEngine } from "@/lib/ribbon/engine";
import type { DeepPartial, RibbonSettings } from "@/lib/ribbon/settings";
import "./ribbon.css";

export interface RibbonStageProps {
  children?: React.ReactNode;
  /** initial settings override (production uses the defaults) */
  settings?: DeepPartial<RibbonSettings>;
  /** called once the engine exists (and with null on teardown) */
  onEngine?: (engine: RibbonEngine | null) => void;
}

/**
 * Mounts the two ribbon canvases around transparent HTML content:
 *   back canvas (opaque, z0) < children (z2) < front canvas (transparent, z3).
 * Both are ImageBitmapRenderingContext targets fed from ONE offscreen WebGL
 * renderer. Without OffscreenCanvas WebGL2 only the front canvas is created and
 * used as a plain WebGL canvas above the HTML (no weaving).
 * Canvases are created inside the effect so React 19 StrictMode's
 * mount/unmount/mount never reuses a context-lost canvas.
 */
export function RibbonStage({
  children,
  settings,
  onEngine,
}: RibbonStageProps) {
  const backHost = useRef<HTMLDivElement>(null);
  const frontHost = useRef<HTMLDivElement>(null);
  const settingsRef = useRef(settings);
  const onEngineRef = useRef(onEngine);
  onEngineRef.current = onEngine;

  useEffect(() => {
    const backEl = backHost.current;
    const frontEl = frontHost.current;
    if (!backEl || !frontEl) return;

    const weave = RibbonEngine.supportsWeave();
    const back = weave ? document.createElement("canvas") : null;
    const front = document.createElement("canvas");
    back?.setAttribute("aria-hidden", "true");
    front.setAttribute("aria-hidden", "true");
    if (back) backEl.appendChild(back);
    frontEl.appendChild(front);

    let engine: RibbonEngine | null = null;
    try {
      engine = new RibbonEngine({
        back,
        front,
        settings: settingsRef.current,
      });
      onEngineRef.current?.(engine);
    } catch (err) {
      // no WebGL2: leave the plain background + HTML
      console.warn("Ribbon disabled:", err);
      document.documentElement.dataset.ribbon = "unsupported";
    }

    return () => {
      onEngineRef.current?.(null);
      engine?.dispose();
      back?.remove();
      front.remove();
    };
  }, []);

  return (
    <div className="ribbon-stage">
      <div ref={backHost} className="ribbon-layer ribbon-layer--back" />
      <div className="ribbon-content">{children}</div>
      <div ref={frontHost} className="ribbon-layer ribbon-layer--front" />
    </div>
  );
}
