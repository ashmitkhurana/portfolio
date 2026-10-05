/**
 * The contract between the editor window and the stage iframe (same origin).
 * The stage page (real HeroSection, real fonts, live ribbon) exposes
 * `window.__poseStage`; the editor reads measurements from it and pushes
 * resolved poses into it. Types only, no runtime code.
 */
import type { RibbonEngine } from "@/lib/ribbon/engine";
import type { RibbonPose } from "@/lib/ribbon/types";
import type { AnchorRect, InkBox } from "@/lib/ribbon/poses/types";

export interface StageProxy {
  x: number;
  y: number;
  w: number;
  h: number;
  depth: number;
}

export interface StageLayout {
  viewW: number;
  viewH: number;
  fov: number;
  /** ribbon width at this view size, world px (geometry.width scaled) */
  ribbonWidth: number;
  ribbonThickness: number;
  anchors: Record<string, AnchorRect>;
  ink: InkBox[];
  proxies: StageProxy[];
}

/** body rings of the swept ribbon as the engine renders it (after path relaxation) */
export interface StageRings {
  count: number;
  /** xyz world px */
  pos: Float32Array;
  /** width direction, thickness normal, tangent (unit) */
  B: Float32Array;
  N: Float32Array;
  T: Float32Array;
  /** half width per ring, world px */
  hw: Float32Array;
}

export type StageQuality = "low" | "medium" | "high";

export interface PoseStageApi {
  engine: RibbonEngine;
  layout(): StageLayout;
  rings(): StageRings;
  setPose(pose: RibbonPose): void;
  setIdle(on: boolean): void;
  setQuality(q: StageQuality): void;
  /** number of sim control points the pose must be resolved to */
  count: number;
}

export interface StageMessage {
  source: "pose-stage";
  type: "ready" | "layout" | "rings";
}

declare global {
  interface Window {
    __poseStage?: PoseStageApi;
  }
}
