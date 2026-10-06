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
    faceB: { color: "#ff7a12", roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.3 },
    edge: { mode: "gradient" },
    anisotropy: 0.6,
    envDiffuse: 0.42,
  },
  // strong form shading as in the sculpture: key from the upper left front, little fill / ambient, so inner and away-facing surfaces go deep
  env: {
    intensity: 1.0,
    autoRotate: false,
    key: { intensity: 15, azimuth: -35, elevation: 28 },
    fill: { intensity: 0.2 },
    top: { intensity: 0.45 },
    bounce: { intensity: 0.12 },
  },
  light: { intensity: 1.15, azimuth: -45, elevation: 40 },
  sim: { mode: "frozen" },
  post: { adaptive: false },
  background: { grainFps: 0 },
  shadows: { moveThreshold: 0 },
  contact: { moveThreshold: 0 },
};
