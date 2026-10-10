"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { RibbonStage } from "@/components/ribbon/RibbonStage";
import { rlog } from "@/lib/ribbon/debugLog";
import { SITE_SETTINGS } from "@/lib/ribbon/siteSettings";
import type { RibbonEngine } from "@/lib/ribbon/engine";
import { createJourney } from "@/components/site/journey";

/**
 * Ribbon mount for the real site. The home route shows the authored AK pose
 * (`lib/ribbon/poses/ak-hero.json`), resolved against the hero name's measured
 * box (re-resolved on resize, font load and route change); every other route
 * keeps the interim lab `sweep` pose. Idle motion only, fixed in the viewport
 * (no scroll linkage, no route choreography yet).
 *
 * The ribbon only draws behind/in front of elements marked `data-ribbon-proxy`;
 * the proxy registry re-applies the scroll offset every frame, so the weave
 * follows the page while the ribbon itself stays put.
 *
 * Nothing 3D is imported here: the pose modules are loaded together with the
 * engine chunk (RibbonStage `prepare`), after first paint and only when the
 * capability tier allows live rendering.
 */
type PoseModules = {
  test: typeof import("@/lib/ribbon/testPoses");
  site: typeof import("@/lib/ribbon/poses/site");
};

/** the AK is a long, tightly bent strip: give the sim more control points */
const CONTROL_POINTS = 320;

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
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const engineRef = useRef<RibbonEngine | null>(null);
  const mods = useRef<PoseModules | null>(null);
  /** what the current pose was resolved for */
  const posed = useRef({ w: 0, h: 0, sig: "" });

  const applyPose = useCallback((snap: boolean, force = false) => {
    const e = engineRef.current;
    const m = mods.current;
    if (!e || !m) return;
    const name = m.site.poseNameForRoute(pathRef.current);
    const authored = name === "sweep" ? null : m.site.resolveNamedPose(name, e);
    const sig = authored ? `${name}|${authored.signature}` : `${name}|${e.width},${e.height}`;
    if (!force && sig === posed.current.sig) return;
    const { w: pw, h: ph } = posed.current;
    // an orientation flip is a new composition: jump instead of springing across
    const flipped = pw > 0 && pw > ph !== e.width > e.height;
    rlog("pose-apply", { name, sig, snap, flipped });
    posed.current = { w: e.width, h: e.height, sig };
    const pose = authored?.pose ?? m.test.makeTestPose("sweep", e.width, e.height, e.sim.count);
    e.setPose(pose, snap || flipped);
  }, []);

  const prepare = useCallback(
    () =>
      Promise.all([
        import("@/lib/ribbon/testPoses"),
        import("@/lib/ribbon/poses/site"),
        // the pose is resolved against the name's measured box: wait for the real fonts (bounded), so
        // the first live frame is already the final composition (a late font swap would re-aim it)
        Promise.race([
          document.fonts?.ready ?? Promise.resolve(),
          new Promise((r) => window.setTimeout(r, 2000)),
        ]),
      ]).then(([test, site]) => {
        mods.current = { test, site };
      }),
    [],
  );

  const onEngine = useCallback(
    (e: RibbonEngine | null) => {
      engineRef.current = e;
      if (e) e.beforeFrame = createJourney(e);
      posed.current = { w: 0, h: 0, sig: "" };
      applyPose(true, true);
    },
    [applyPose],
  );

  // re-aim only when something that shapes the pose really changed (viewport size,
  // the name's box after a font swap / reflow, the route): a window resize event
  // alone (mobile URL bars) does nothing
  useEffect(() => {
    let t = 0;
    const later = (ms: number) => {
      window.clearTimeout(t);
      t = window.setTimeout(() => applyPose(false), ms);
    };
    const onResize = () => {
      rlog("window-resize", { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio });
      later(120);
    };
    const onFonts = () => {
      rlog("fonts");
      later(30);
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    document.fonts?.addEventListener?.("loadingdone", onFonts);
    document.fonts?.ready.then(onFonts).catch(() => {});
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
      document.fonts?.removeEventListener?.("loadingdone", onFonts);
    };
  }, [applyPose]);

  // route change: the anchor appears / disappears with the page
  useEffect(() => {
    const t = window.setTimeout(() => applyPose(false), 60);
    return () => window.clearTimeout(t);
  }, [pathname, applyPose]);

  return (
    <RibbonStage
      onEngine={onEngine}
      prepare={prepare}
      controlPoints={CONTROL_POINTS}
      settings={SITE_SETTINGS}
    >
      {children}
    </RibbonStage>
  );
}
