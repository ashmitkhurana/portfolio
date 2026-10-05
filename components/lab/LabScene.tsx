"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RibbonStage } from "@/components/ribbon/RibbonStage";
import type { RibbonEngine } from "@/lib/ribbon/engine";
import { makeTestPose } from "@/lib/ribbon/testPoses";
import { LAB_STORAGE_KEY, LabPanel, type LabState } from "./LabPanel";
import { LabHud } from "./LabHud";

const DEFAULT_LAB: LabState = { pose: "sweep", refMode: "off", refOpacity: 0.5 };

export function LabScene() {
  const [engine, setEngine] = useState<RibbonEngine | null>(null);
  const [lab, setLab] = useState<LabState>(DEFAULT_LAB);
  const [narrow, setNarrow] = useState(false);
  const engineRef = useRef<RibbonEngine | null>(null);
  const labRef = useRef(lab);
  labRef.current = lab;

  const applyPose = useCallback((name: string, snap: boolean) => {
    const e = engineRef.current;
    if (!e) return;
    e.setPose(makeTestPose(name, e.width, e.height, e.sim.count), snap);
  }, []);

  const onEngine = useCallback(
    (e: RibbonEngine | null) => {
      engineRef.current = e;
      (window as unknown as { __ribbon?: RibbonEngine | null }).__ribbon = e;
      if (!e) {
        setEngine(null);
        return;
      }
      let initial = DEFAULT_LAB;
      try {
        const raw = localStorage.getItem(LAB_STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw) as { settings?: object; lab?: Partial<LabState> };
          if (saved.settings) {
            // calm idle (Step 1b) replaced the old idle defaults: drop saved idle values once
            const { sim, ...rest } = saved.settings as { sim?: object };
            const keep = (saved as { idleV?: number }).idleV === 2 ? { sim, ...rest } : rest;
            e.patchSettings(keep);
          }
          if (saved.lab) initial = { ...DEFAULT_LAB, ...saved.lab };
        }
      } catch {
        /* ignore bad / unavailable storage */
      }
      setLab(initial);
      labRef.current = initial;
      applyPose(initial.pose, true);
      setEngine(e);
    },
    [applyPose],
  );

  // re-aim the spring when the viewport changes
  useEffect(() => {
    let t = 0;
    const onResize = () => {
      setNarrow(window.innerWidth < 700);
      window.clearTimeout(t);
      t = window.setTimeout(() => applyPose(labRef.current.pose, false), 120);
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
  }, [applyPose]);

  const refSrc = narrow ? "/lab/ref/hero-mobile.webp" : "/lab/ref/hero-desktop.webp";

  return (
    <RibbonStage lab onEngine={onEngine}>
      <main className="lab-hero">
        <header className="lab-nav">
          <span className="lab-logo">AK</span>
          <nav>
            <span>Work</span>
            <span>About</span>
            <span>Contact</span>
          </nav>
        </header>

        <h1 className="lab-headline" aria-label="Ashmit Khurana">
          <span className="lab-line" data-ribbon-proxy data-ribbon-depth="0" data-ribbon-pad="24">
            ASHMIT
          </span>
          <span className="lab-line" data-ribbon-proxy data-ribbon-depth="0" data-ribbon-pad="24">
            KHURANA
          </span>
        </h1>

        <div className="lab-sub">
          <p className="lab-role">Full-Stack Developer</p>
          <p className="lab-tagline">Building across interfaces, systems, and AI.</p>
        </div>

        <article
          className="lab-card"
          data-ribbon-proxy
          data-ribbon-depth="-40"
          data-ribbon-radius="20"
        >
          <span>Project 01</span>
          <small>Dummy card, proxy depth -40</small>
        </article>
      </main>

      {engine ? (
        <>
          <LabHud engine={engine} />
          <LabPanel
            engine={engine}
            lab={lab}
            onLabChange={setLab}
            onPose={(name) => {
              setLab((l) => ({ ...l, pose: name }));
              applyPose(name, false);
            }}
          />
        </>
      ) : null}

      {lab.refMode !== "off" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="lab-ref"
          src={refSrc}
          alt=""
          style={{
            opacity: lab.refMode === "split" ? 1 : lab.refOpacity,
            clipPath: lab.refMode === "split" ? "inset(0 0 0 50%)" : undefined,
          }}
        />
      ) : null}
    </RibbonStage>
  );
}
