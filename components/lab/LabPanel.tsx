"use client";

import { useEffect, useRef } from "react";
import type { FolderApi } from "@tweakpane/core";
import type { RibbonEngine } from "@/lib/ribbon/engine";
import {
  DEFAULT_SETTINGS,
  FACE_PRESETS,
  applyQualityTier,
  assignSettings,
  type QualityTier,
} from "@/lib/ribbon/settings";
import { IDLE_PRESETS } from "@/lib/ribbon/sim";
import { TEST_POSE_NAMES } from "@/lib/ribbon/testPoses";

export const LAB_STORAGE_KEY = "ribbon-lab-settings-v3";

export interface LabState {
  pose: string;
  refMode: "off" | "overlay" | "split";
  refOpacity: number;
}

interface Props {
  engine: RibbonEngine;
  lab: LabState;
  onLabChange: (lab: LabState) => void;
  onPose: (name: string) => void;
}

type Opts = Record<string, unknown>;
type Row = [path: string, opts?: Opts];

const num = (min: number, max: number, step: number): Opts => ({ min, max, step });

const STRIP_ROWS = (p: string): Row[] => [
  [`${p}.intensity`, num(0, 30, 0.1)],
  [`${p}.azimuth`, num(-180, 180, 1)],
  [`${p}.elevation`, num(-80, 89, 1)],
  [`${p}.length`, num(1, 30, 0.1)],
  [`${p}.width`, num(0.1, 10, 0.05)],
  [`${p}.roll`, num(-90, 90, 1)],
  [`${p}.softness`, num(0, 1, 0.01)],
  [`${p}.color`],
];

const FOLDERS: Array<{ title: string; open?: boolean; rows: Row[]; sub?: Array<{ title: string; rows: Row[] }> }> = [
  {
    title: "Material (shared)",
    rows: [
      ["material.metalness", num(0, 1, 0.01)],
      ["material.anisotropy", num(0, 1, 0.01)],
      ["material.anisotropyRotation", num(0, 180, 1)],
      ["material.specularIntensity", num(0, 1, 0.01)],
      ["material.ior", num(1, 2.333, 0.01)],
      ["material.sheen", num(0, 1, 0.01)],
      ["material.sheenRoughness", num(0, 1, 0.01)],
      ["material.sheenColor"],
      ["material.depthShade", num(0, 1, 0.01)],
      ["material.highlightTint", num(0, 1, 0.01)],
      ["material.lightSpecular", num(0, 1, 0.01)],
      ["material.envDiffuse", num(0, 3, 0.01)],
      ["material.rim", num(0, 4, 0.01)],
      ["material.rimPower", num(0.5, 8, 0.1)],
    ],
  },
  {
    title: "Environment & Light",
    rows: [
      ["env.intensity", num(0, 4, 0.01)],
      ["env.ambient", num(0, 1, 0.005)],
      ["env.rotationX", num(-90, 90, 1)],
      ["env.rotationY", num(-180, 180, 1)],
      ["env.autoRotate"],
      ["env.autoRotateSpeed", num(-30, 30, 0.1)],
      ["env.top.intensity", num(0, 10, 0.05)],
      ["env.top.color"],
      ["env.bounce.intensity", num(0, 4, 0.01)],
      ["env.bounce.followFace"],
      ["env.bounce.color"],
      ["env.tint"],
      ["light.intensity", num(0, 8, 0.05)],
      ["light.color"],
      ["light.temperature", num(2000, 12000, 50)],
      ["light.azimuth", num(-180, 180, 1)],
      ["light.elevation", num(5, 89, 1)],
    ],
    sub: [
      { title: "Key strip", rows: STRIP_ROWS("env.key") },
      { title: "Fill strip", rows: STRIP_ROWS("env.fill") },
      { title: "Rim strip", rows: STRIP_ROWS("env.rim") },
    ],
  },
  {
    title: "Geometry",
    rows: [
      ["geometry.width", num(20, 220, 1)],
      ["geometry.rings", num(200, 2000, 50)],
      ["geometry.bevelSegments", num(1, 8, 1)],
      ["geometry.widthSegments", num(1, 24, 1)],
      ["geometry.thicknessRatio", num(0.03, 0.4, 0.005)],
      ["geometry.edgeBevel", num(0, 8, 0.05)],
      ["geometry.capRings", num(4, 28, 1)],
      ["geometry.capLengthRatio", num(0.2, 1, 0.01)],
      ["geometry.taperLength", num(0.01, 0.5, 0.01)],
      ["geometry.taperAmount", num(0, 0.95, 0.01)],
    ],
  },
  {
    title: "Post",
    rows: [
      [
        "post.toneMapping",
        { options: { AgX: "AgX", ACES: "ACES", Neutral: "Neutral", Linear: "Linear", Reinhard: "Reinhard", Cineon: "Cineon" } },
      ],
      ["post.exposure", num(0.1, 4, 0.01)],
      ["post.samples", { options: { off: 0, "2x": 2, "4x": 4, "8x": 8 } }],
      ["post.samplesRetina", { options: { "same as samples": -1, off: 0, "2x": 2, "4x": 4 } }],
      ["post.scissor"],
      ["post.pixelRatioCap", num(1, 3, 0.25)],
      ["post.adaptive"],
      ["post.bloom"],
      ["post.bloomThreshold", num(0, 2, 0.01)],
      ["post.bloomIntensity", num(0, 2, 0.01)],
      ["post.bloomRadius", num(2, 60, 1)],
      ["post.dither"],
      ["background.color"],
      ["background.vignette", num(0, 1, 0.01)],
      ["background.gradient", num(0, 1, 0.01)],
      ["background.grain", num(0, 0.1, 0.002)],
      ["background.grainFps", num(0, 60, 1)],
    ],
  },
  {
    title: "Shadows",
    rows: [
      ["shadows.self"],
      ["shadows.mapSize", { options: { "1024": 1024, "2048": 2048, "4096": 4096 } }],
      ["shadows.updateEvery", num(1, 6, 1)],
      ["shadows.moveThreshold", num(0, 2, 0.05)],
      ["shadows.radius", num(0, 12, 0.1)],
      ["shadows.bias", num(-0.01, 0.01, 0.0001)],
      ["shadows.normalBias", num(0, 6, 0.05)],
      ["shadows.floor"],
      ["shadows.floorOpacity", num(0, 1, 0.01)],
      ["shadows.floorLevel", num(0, 1.2, 0.01)],
      ["shadows.wall"],
      ["shadows.wallOpacity", num(0, 1, 0.01)],
      ["shadows.wallDepth", num(50, 1500, 10)],
      ["shadows.glow"],
      ["shadows.glowIntensity", num(0, 1.5, 0.01)],
      ["shadows.glowRadius", num(0.02, 1.0, 0.01)],
      ["shadows.glowFollowFace"],
      ["shadows.glowColor"],
      ["shadows.glowDrop", num(-200, 300, 1)],
    ],
  },
  {
    title: "Contact shadows (on HTML)",
    open: true,
    rows: [
      ["contact.enabled"],
      ["contact.strength", num(0, 0.8, 0.01)],
      ["contact.falloff", num(10, 300, 1)],
      ["contact.offset", num(0, 1.5, 0.01)],
      ["contact.blurContact", num(0.5, 40, 0.5)],
      ["contact.blurHigh", num(1, 120, 0.5)],
      ["contact.pad", num(1, 60, 1)],
      ["contact.resolution", num(0.1, 1, 0.05)],
      ["contact.moveThreshold", num(0, 4, 0.05)],
    ],
  },
  {
    title: "Sim / Idle",
    rows: [
      ["sim.mode", { options: { live: "live", frozen: "frozen" } }],
      ["sim.stiffness", num(2, 300, 1)],
      ["sim.damping", num(0.1, 2, 0.01)],
      ["sim.followLag", num(0, 0.95, 0.01)],
      ["sim.idleAmplitude", num(0, 120, 1)],
      ["sim.idleSpeed", num(0, 2, 0.01)],
      ["sim.idleScale", num(0.0002, 0.006, 0.0001)],
      ["sim.idleCurl", num(0, 1, 0.01)],
      ["sim.idleDetail", num(0, 1, 0.01)],
      ["sim.twistWobble", num(0, 1.5, 0.01)],
      ["sim.twistWobbleScale", num(0, 0.5, 0.005)],
    ],
  },
  { title: "Camera", rows: [["camera.fov", num(8, 60, 0.5)]] },
  {
    title: "Debug",
    rows: [
      ["debug.view", { options: { off: "off", "mask (front/back)": "mask", "ribbon RT only": "ribbon", "shadow catcher": "catcher" } }],
      ["debug.proxyOutlines"],
      ["debug.hud"],
      ["debug.gpuTimer"],
      ["debug.wireframe"],
    ],
  },
];

function resolve(obj: Record<string, unknown>, path: string): [Record<string, unknown>, string] {
  const parts = path.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) cur = cur[parts[i]] as Record<string, unknown>;
  return [cur, parts[parts.length - 1]];
}

export function LabPanel({ engine, lab, onLabChange, onPose }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const labRef = useRef(lab);
  labRef.current = lab;
  const cbRef = useRef({ onLabChange, onPose });
  cbRef.current = { onLabChange, onPose };

  useEffect(() => {
    let disposed = false;
    let pane: { dispose(): void } | null = null;

    const save = () => {
      try {
        localStorage.setItem(
          LAB_STORAGE_KEY,
          JSON.stringify({ settings: engine.settings, lab: labRef.current, idleV: 2 }),
        );
      } catch {
        /* storage unavailable */
      }
    };

    import("tweakpane").then(({ Pane }) => {
      if (disposed || !host.current) return;
      const p = new Pane({ title: "Ribbon Lab", container: host.current });
      pane = p;
      const settings = engine.settings as unknown as Record<string, unknown>;
      const onChange = () => {
        engine.applySettings();
        save();
      };

      const addRows = (folder: FolderApi, rows: Row[]) => {
        for (const [path, opts] of rows) {
          const [parent, key] = resolve(settings, path);
          const label = path.split(".").slice(-1)[0];
          folder.addBinding(parent, key, { label, ...opts }).on("change", onChange);
        }
      };

      // lab controls
      const labFolder = p.addFolder({ title: "Lab", expanded: true });
      const labObj = { ...labRef.current };
      labFolder
        .addBinding(labObj, "pose", { options: Object.fromEntries(TEST_POSE_NAMES.map((n) => [n, n])) })
        .on("change", (ev: { value: string }) => {
          cbRef.current.onPose(ev.value);
          save();
        });
      const pushLab = () => {
        const next = { ...labObj } as LabState;
        labRef.current = next;
        cbRef.current.onLabChange(next);
        save();
      };
      labFolder
        .addBinding(labObj, "refMode", { label: "reference", options: { off: "off", overlay: "overlay", split: "split" } })
        .on("change", pushLab);
      labFolder.addBinding(labObj, "refOpacity", { label: "ref opacity", min: 0, max: 1, step: 0.01 }).on("change", pushLab);

      labFolder
        .addBinding(settings, "quality", { options: { low: "low", medium: "medium", high: "high" } })
        .on("change", (ev) => {
          applyQualityTier(engine.settings, ev.value as QualityTier);
          engine.applySettings();
          p.refresh();
          save();
        });

      // ---- idle presets (calm is the default; lively = the Phase 1 idle)
      const idleObj = { preset: "idle.calm" };
      labFolder
        .addBinding(idleObj, "preset", {
          label: "idle",
          options: Object.fromEntries(Object.keys(IDLE_PRESETS).map((n) => [n, n])),
        })
        .on("change", (ev: { value: string }) => {
          const preset = IDLE_PRESETS[ev.value];
          if (!preset) return;
          assignSettings(
            engine.settings.sim as unknown as Record<string, unknown>,
            { ...preset } as Record<string, unknown>,
          );
          engine.applySettings();
          (p as unknown as { refresh(): void }).refresh();
          save();
        });

      // ---- Faces: independent surfaces + presets
      const faces = p.addFolder({ title: "Faces", expanded: true });
      const presetObj = { preset: "Mockup" };
      faces
        .addBinding(presetObj, "preset", { options: Object.fromEntries(Object.keys(FACE_PRESETS).map((n) => [n, n])) })
        .on("change", (ev: { value: string }) => {
          const preset = FACE_PRESETS[ev.value];
          if (!preset) return;
          assignSettings(
            engine.settings.material as unknown as Record<string, unknown>,
            JSON.parse(JSON.stringify(preset)) as Record<string, unknown>,
          );
          engine.applySettings();
          (p as unknown as { refresh(): void }).refresh();
          save();
        });
      for (const [title, key] of [["Face A", "faceA"], ["Face B", "faceB"]] as const) {
        const f = faces.addFolder({ title, expanded: key === "faceA" });
        addRows(f, [
          [`material.${key}.color`],
          [`material.${key}.roughness`, num(0, 1, 0.01)],
          [`material.${key}.clearcoat`, num(0, 1, 0.01)],
          [`material.${key}.clearcoatRoughness`, num(0, 1, 0.005)],
          [`material.${key}.specularColor`],
        ]);
      }
      const edgeF = faces.addFolder({ title: "Edge strip", expanded: true });
      addRows(edgeF, [
        ["material.edge.mode", { options: { gradient: "gradient", "face A": "faceA", "face B": "faceB", custom: "custom" } }],
        ["material.edge.color"],
      ]);

      for (const f of FOLDERS) {
        const folder = p.addFolder({ title: f.title, expanded: !!f.open });
        addRows(folder, f.rows);
        for (const s of f.sub ?? []) {
          const sub = folder.addFolder({ title: s.title, expanded: false });
          addRows(sub, s.rows);
        }
      }

      p.addButton({ title: "Copy settings JSON" }).on("click", () => {
        const json = JSON.stringify(engine.settings, null, 2);
        navigator.clipboard?.writeText(json).catch(() => console.log(json));
      });
      p.addButton({ title: "Reset defaults" }).on("click", () => {
        assignSettings(settings, DEFAULT_SETTINGS as unknown as Record<string, unknown>);
        engine.applySettings();
        (p as unknown as { refresh(): void }).refresh();
        save();
      });
    });

    return () => {
      disposed = true;
      pane?.dispose();
    };
  }, [engine]);

  return <div ref={host} className="lab-pane" />;
}
