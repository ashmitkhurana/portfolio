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
// 2026-10-09: metallic orange + baked env AO (sweep docs/ribbon/turns/ao4, variant u4); key raised to el 40 / az -50 to remove the tail glare (docs/ribbon/turns/glare, h6); rimNormalMix 0.85 turns the dark edge line into a bright rim (docs/ribbon/turns/rim); golden highlights: clearcoat 0, base #ff7a0a, specular tint #ffd060, key 17 (docs/ribbon/turns/gold2, z6); aoSpec 4 deepens inner faces (docs/ribbon/turns/ao5, w2); fill = large soft box from upper-front-left (docs/ribbon/turns/soft, f1)
// 2026-10-10c: the see-through folds were back-face culling of inside-out band parts -> material side DoubleSide (material.ts); thick band restored (0.147).
// 2026-10-10b: (superseded) translucent folds (docs/ribbon/turns/scratch/N7/mat e4): thinner band 0.07 so the edge wall reads as a thin solid line, edge solid faceA, rimNormalMix 0, bloom off, key width 6, env 1.8.
// 2026-10-10: material M1 (docs/ribbon/turns/scratch/N7/mat): rimNormalMix 0.85 -> 0.35 and metalness 0.7 -> 0.35 remove the translucent look at folds; deeper #ff6200, roughness 0.2, broader/stronger key, weaker fill/bounce. prev: docs/ribbon/turns/live/siteSettings.prev3.ts.txt
export const SITE_SETTINGS: DeepPartial<RibbonSettings> = {
  // the AK desktop pose was fitted to the mockup with this fov (scripts/fit)
  camera: { fov: 26.4 },
  // the sculpture's satin golden orange (face A the bright face, face B the darker inner face); the anisotropy streaks the
  // highlights along the band like brushed metal
  material: {
    faceA: { color: "#ff6200", roughness: 0.2, clearcoat: 0, clearcoatRoughness: 0.14, specularColor: "#ffd060" },
    faceB: { color: "#ff6200", roughness: 0.2, clearcoat: 0, clearcoatRoughness: 0.15, specularColor: "#ffd060" },
    edge: { mode: "faceA" },
    anisotropy: 0.6,
    envDiffuse: 0.45,
    metalness: 0.35,
    ao: 1.0,
    aoSpec: 4,
    rimNormalMix: 0,
  },
  // thick satin band (the AK pose renders were judged with this profile)
  geometry: { thicknessRatio: 0.147, edgeBevel: 2.4, capLengthRatio: 0 },
  // strong form shading as in the sculpture: key from the upper left front, little fill / ambient, so inner and away-facing surfaces go deep
  env: {
    intensity: 1.8,
    autoRotate: false,
    key: { intensity: 24, azimuth: -50, elevation: 40, width: 6, softness: 0.7 },
    fill: { azimuth: -20, elevation: 50, width: 20, length: 40, softness: 1, roll: 0, intensity: 0.3 },
    top: { intensity: 0.45 },
    bounce: { intensity: 0.03 },
  },
  light: { intensity: 1.15, azimuth: -45, elevation: 40 },
  // intro (2026-10-10, owner): the pose stays locked; the ribbon grows out of its hidden end (behind the A's right leg)
  // and slides along the whole flow until the leading end reaches the bottom (slide.ts, critically damped, no scroll/sway)
  sim: { mode: "slide", slide: { intro: true, scroll: false, hiddenEntry: true, introStiffness: 3, introDamping: 1, introMaxSeconds: 7, swayDeg: 0 } },
  post: { adaptive: false, exposure: 1.2, bloom: false, bloomIntensity: 0 },
  background: { grainFps: 0 },
  shadows: { moveThreshold: 0 },
  contact: { moveThreshold: 0 },
};
