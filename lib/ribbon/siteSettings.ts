/**
 * Settings of the REAL site. Type-only imports: this file is part of the initial bundle (SiteRibbon),
 * nothing here may pull in three.js or the engine.
 */
import type { DeepPartial, RibbonSettings } from "./settings";

/**
 * What the real site runs (RibbonStage `settings`): nothing that moves or re-decides after the
 * first paint. The hero is frozen on its authored pose, the grain is a static pattern, the
 * environment never rotates, adaptive resolution is off (it stays a /lab toggle), and the shadow
 * map / contact catcher are never motion-gated by a threshold (a frozen pose renders them once
 * and keeps them; a moving ribbon renders them every frame). Idle motion comes back in a later stage.
 */
export const SITE_SETTINGS: DeepPartial<RibbonSettings> = {
  // the AK desktop pose was fitted to the mockup with this fov (scripts/fit)
  camera: { fov: 26.4 },
  // the sculpture's satin golden orange (face A the bright face, face B the darker inner face); the anisotropy streaks the
  // highlights along the band like brushed metal
  material: {
    faceA: { color: "#ff8418", roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.28 },
    faceB: { color: "#c4560f", roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.3 },
    edge: { mode: "gradient" },
    anisotropy: 0.6,
  },
  env: { intensity: 1.3, autoRotate: false },
  sim: { mode: "frozen" },
  post: { adaptive: false },
  background: { grainFps: 0 },
  shadows: { moveThreshold: 0 },
  contact: { moveThreshold: 0 },
};
