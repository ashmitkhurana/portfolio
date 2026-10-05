"use client";

import { useCallback, useEffect, useRef } from "react";
import { RibbonStage } from "@/components/ribbon/RibbonStage";
import { SiteHeader } from "@/components/site/SiteHeader";
import { HeroSection } from "@/components/site/sections/HeroSection";
import type { RibbonEngine } from "@/lib/ribbon/engine";
import { QUALITY_TIERS } from "@/lib/ribbon/settings";
import { findAnchor, measureAnchor, measureInk } from "@/lib/ribbon/poses/anchors";
import type { PoseStageApi, StageLayout, StageMessage, StageRings } from "./stageApi";

const CONTROL_POINTS = 96;

function post(type: StageMessage["type"]) {
  const msg: StageMessage = { source: "pose-stage", type };
  window.parent?.postMessage(msg, window.location.origin);
}

/**
 * Runs inside the editor's iframe: the real hero (real fonts and layout) with the
 * live ribbon, the sim frozen on the pose it is given. Poses and measurements go
 * through `window.__poseStage`.
 */
export function StageClient() {
  const engineRef = useRef<RibbonEngine | null>(null);

  const onEngine = useCallback((e: RibbonEngine | null) => {
    engineRef.current = e;
    if (!e) {
      window.__poseStage = undefined;
      return;
    }
    e.sim.idleScale01 = 0;
    const api: PoseStageApi = {
      engine: e,
      count: e.sim.count,
      layout(): StageLayout {
        const anchors: StageLayout["anchors"] = {};
        let ink: StageLayout["ink"] = [];
        document.querySelectorAll<HTMLElement>("[data-ribbon-anchor]").forEach((el) => {
          const name = el.dataset.ribbonAnchor as string;
          const r = measureAnchor(el);
          if (r) anchors[name] = r;
          ink = ink.concat(measureInk(el));
        });
        const proxies = Array.from(document.querySelectorAll<HTMLElement>("[data-ribbon-proxy]")).map((el) => {
          const r = el.getBoundingClientRect();
          return {
            x: r.left + window.scrollX,
            y: r.top + window.scrollY,
            w: r.width,
            h: r.height,
            depth: parseFloat(el.dataset.ribbonDepth ?? "0") || 0,
          };
        });
        const k = Math.min(Math.max(e.width / 1440, 0.5), 1.4);
        const g = e.settings.geometry;
        return {
          viewW: e.width,
          viewH: e.height,
          fov: e.settings.camera.fov,
          ribbonWidth: g.width * k,
          ribbonThickness: g.width * k * g.thicknessRatio,
          anchors,
          ink,
          proxies,
        };
      },
      rings(): StageRings {
        const rb = e.ribbon;
        const R = rb.totalRings;
        const M = rb.bodyRings;
        const E = (R - M) >> 1;
        const data = (rb.sweep.uRingTex.value.image as unknown as { data: Float32Array }).data;
        const row = R * 4;
        const pos = new Float32Array(M * 3);
        const B = new Float32Array(M * 3);
        const N = new Float32Array(M * 3);
        const T = new Float32Array(M * 3);
        const hw = new Float32Array(M);
        for (let i = 0; i < M; i++) {
          const o = (E + i) * 4;
          for (let a = 0; a < 3; a++) {
            pos[i * 3 + a] = data[o + a];
            B[i * 3 + a] = data[row + o + a];
            N[i * 3 + a] = data[2 * row + o + a];
            T[i * 3 + a] = data[3 * row + o + a];
          }
          hw[i] = data[o + 3];
        }
        return { count: M, pos, B, N, T, hw };
      },
      setPose(pose) {
        e.setPose(pose, true);
        // the rings are rebuilt by the next rendered frame; tell the editor after two
        requestAnimationFrame(() => requestAnimationFrame(() => post("rings")));
      },
      setIdle(on) {
        e.sim.idleScale01 = on ? 1 : 0;
        if (!on) e.sim.snapToTarget();
        e.markActive(1000);
      },
      setQuality(q) {
        const t = QUALITY_TIERS[q];
        e.patchSettings({ quality: q, post: t.post, geometry: t.geometry, shadows: t.shadows, contact: t.contact });
        requestAnimationFrame(() => requestAnimationFrame(() => post("rings")));
      },
    };
    window.__poseStage = api;
    post("ready");
  }, []);

  // anything that moves the name (viewport, font swap, reflow) -> the editor re-resolves
  useEffect(() => {
    let t = 0;
    const later = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => post("layout"), 50);
    };
    window.addEventListener("resize", later);
    document.fonts?.addEventListener?.("loadingdone", later);
    document.fonts?.ready.then(later).catch(() => {});
    const el = findAnchor("hero-name");
    const ro = new ResizeObserver(later);
    if (el) ro.observe(el);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", later);
      document.fonts?.removeEventListener?.("loadingdone", later);
      ro.disconnect();
    };
  }, []);

  return (
    <>
      {/* the stage is embedded in the editor: no Next.js dev badge inside the frame */}
      <style>{"nextjs-portal{display:none!important}"}</style>
      <SiteHeader />
      <RibbonStage lab onEngine={onEngine} controlPoints={CONTROL_POINTS}>
        <main id="content">
          <HeroSection />
        </main>
      </RibbonStage>
    </>
  );
}
