"use client";

import { useCallback, useEffect, useRef } from "react";
import { RibbonStage } from "@/components/ribbon/RibbonStage";
import type { RibbonEngine } from "@/lib/ribbon/engine";
import { makeTestPose } from "@/lib/ribbon/testPoses";

/**
 * INTERIM ribbon mount for the real site: the lab's `sweep` test pose, default
 * settings, idle motion only, fixed in the viewport (no scroll linkage, no route
 * choreography). Replaced once the AK / per-route choreography exists.
 *
 * The ribbon only draws behind/in front of elements marked `data-ribbon-proxy`;
 * the proxy registry re-applies the scroll offset every frame, so the weave
 * follows the page while the ribbon itself stays put.
 */
const POSE = "sweep";

export function SiteRibbon({ children }: { children: React.ReactNode }) {
  const engineRef = useRef<RibbonEngine | null>(null);

  const applyPose = useCallback((snap: boolean) => {
    const e = engineRef.current;
    if (!e) return;
    e.setPose(makeTestPose(POSE, e.width, e.height, e.sim.count), snap);
  }, []);

  const onEngine = useCallback(
    (e: RibbonEngine | null) => {
      engineRef.current = e;
      applyPose(true);
    },
    [applyPose],
  );

  // re-aim the spring when the viewport changes (rotation, window resize)
  useEffect(() => {
    let t = 0;
    const onResize = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => applyPose(false), 120);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
  }, [applyPose]);

  return <RibbonStage onEngine={onEngine}>{children}</RibbonStage>;
}
