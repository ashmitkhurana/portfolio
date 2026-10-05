"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { RibbonStage } from "@/components/ribbon/RibbonStage";
import type { RibbonEngine } from "@/lib/ribbon/engine";

/**
 * INTERIM ribbon mount for the real site: the lab's `sweep` test pose, default
 * settings, idle motion only, fixed in the viewport (no scroll linkage, no route
 * choreography). Replaced once the AK / per-route choreography exists.
 *
 * The ribbon only draws behind/in front of elements marked `data-ribbon-proxy`;
 * the proxy registry re-applies the scroll offset every frame, so the weave
 * follows the page while the ribbon itself stays put.
 *
 * Nothing 3D is imported here: the pose module is loaded together with the
 * engine chunk (RibbonStage `prepare`), after first paint and only when the
 * capability tier allows live rendering.
 */
const POSE = "sweep";

type PoseModule = typeof import("@/lib/ribbon/testPoses");

/** `?ribbon=0` skips the ribbon entirely (clean layout screenshots, QA). */
const noop = () => () => {};
function useRibbonEnabled() {
  return useSyncExternalStore(
    noop,
    () => new URLSearchParams(window.location.search).get("ribbon") !== "0",
    () => true,
  );
}

export function SiteRibbon({ children }: { children: React.ReactNode }) {
  const enabled = useRibbonEnabled();
  if (!enabled) return <div className="ribbon-content">{children}</div>;
  return <RibbonMount>{children}</RibbonMount>;
}

function RibbonMount({ children }: { children: React.ReactNode }) {
  const engineRef = useRef<RibbonEngine | null>(null);
  const poses = useRef<PoseModule | null>(null);
  /** viewport the current pose was authored for (CSS px) */
  const posedFor = useRef({ w: 0, h: 0 });

  const applyPose = useCallback((snap: boolean) => {
    const e = engineRef.current;
    const m = poses.current;
    if (!e || !m) return;
    const { w: pw, h: ph } = posedFor.current;
    // an orientation flip is a new composition: jump instead of springing across
    const flipped = pw > 0 && pw > ph !== e.width > e.height;
    posedFor.current = { w: e.width, h: e.height };
    e.setPose(m.makeTestPose(POSE, e.width, e.height, e.sim.count), snap || flipped);
  }, []);

  const prepare = useCallback(
    () =>
      import("@/lib/ribbon/testPoses").then((m) => {
        poses.current = m;
      }),
    [],
  );

  const onEngine = useCallback(
    (e: RibbonEngine | null) => {
      engineRef.current = e;
      posedFor.current = { w: 0, h: 0 };
      applyPose(true);
    },
    [applyPose],
  );

  // re-aim the spring only when the engine's own size really changed (a width
  // change or a rotation; mobile URL bars never change it) - not on every window resize event
  useEffect(() => {
    let t = 0;
    const onResize = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        const e = engineRef.current;
        if (!e) return;
        const { w, h } = posedFor.current;
        if (e.width === w && e.height === h) return;
        applyPose(false);
      }, 120);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [applyPose]);

  return (
    <RibbonStage onEngine={onEngine} prepare={prepare}>
      {children}
    </RibbonStage>
  );
}
