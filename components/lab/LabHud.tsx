"use client";

import { useEffect, useState } from "react";
import { RibbonEngine } from "@/lib/ribbon/engine";

export function LabHud({ engine }: { engine: RibbonEngine }) {
  const [text, setText] = useState("");
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = window.setInterval(() => {
      const s = engine.stats;
      setVisible(engine.settings.debug.hud);
      setText(
        `${s.fps.toFixed(0).padStart(3)} fps   ${(1000 / Math.max(s.fps, 1)).toFixed(1)} ms/frame   ${engine.settings.quality}   ${s.mode}\n` +
          `cpu  sim ${s.cpu.sim.toFixed(2)}  geo ${s.cpu.geometry.toFixed(2)}  scene ${s.cpu.scene.toFixed(2)}  post ${s.cpu.post.toFixed(2)} ms\n` +
          `gpu  ${engine.settings.debug.gpuTimer ? `scene ${s.gpu.scene.toFixed(2)}  post ${s.gpu.post.toFixed(2)} ms  [${Object.entries(s.gpu.stages).map(([k, v]) => `${k} ${v.toFixed(1)}`).join("  ")}] (timer queries on: perturbs perf)` : "timer off (debug.gpuTimer)"}\n` +
          `calls ${s.drawCalls}  tris ${(s.triangles / 1000).toFixed(1)}k  rings ${s.rings}  verts ${(s.vertices / 1000).toFixed(1)}k\n` +
          `engines ${RibbonEngine.live}  front ${s.frontActive ? "on" : "idle"}  dpr ${engine.pixelRatio}  ${engine.width}x${engine.height}  msaa ${engine.core.effectiveSamples}x  relax ${engine.ribbon.relaxIters}it`,
      );
    }, 250);
    return () => window.clearInterval(id);
  }, [engine]);

  if (!visible) return null;
  return <div className="lab-hud">{text}</div>;
}
