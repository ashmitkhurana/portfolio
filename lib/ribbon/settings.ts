/**
 * Ribbon settings: one nested, JSON-serialisable object. The lab tweak panel
 * edits it live; production uses DEFAULT_SETTINGS as-is.
 */

import { IDLE_PRESETS } from "./sim";

export type ToneMapName =
  | "AgX"
  | "ACES"
  | "Neutral"
  | "Linear"
  | "Reinhard"
  | "Cineon";

export interface StripSettings {
  intensity: number;
  /** degrees, 0 = behind the camera (+Z), positive = towards +X */
  azimuth: number;
  /** degrees above the horizon */
  elevation: number;
  /** long side, env units (env radius is 10) */
  length: number;
  /** short side */
  width: number;
  /** degrees roll around the view axis of the strip */
  roll: number;
  /** 0 = hard edge, 1 = fully gradient across the width */
  softness: number;
  color: string;
}

export type QualityTier = "low" | "medium" | "high";

export type EdgeMode = "faceA" | "faceB" | "custom" | "gradient";

/** Fully independent surface parameters of one face of the ribbon. */
export interface FaceSettings {
  color: string;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  /** tint of the dielectric specular (and sheen-free highlight) */
  specularColor: string;
}

export type DebugView = "off" | "mask" | "ribbon" | "catcher";

export interface RibbonSettings {
  /** preset bundle, see QUALITY_TIERS / applyQualityTier */
  quality: QualityTier;
  material: {
    /** the two faces are independent; the hard boundary sits on the rim */
    faceA: FaceSettings;
    faceB: FaceSettings;
    /**
     * the thin side strip (flat edge + bevels). `gradient`: across the thickness the colour (and
     * the gloss parameters) blend face A -> face B along a soft S-curve, so the two faces look
     * like they emerge from each other.
     */
    edge: { mode: EdgeMode; color: string };
    metalness: number;
    anisotropy: number;
    /** degrees, relative to the ribbon tangent */
    anisotropyRotation: number;
    specularIntensity: number;
    ior: number;
    sheen: number;
    sheenRoughness: number;
    sheenColor: string;
    /** 0..1 subtle darkening of ribbon far behind the content plane (depth cue) */
    depthShade: number;
    /**
     * 0..1 tints the hot highlights towards the face's OWN hue (derived from its colour, so a
     * white / grey face never gets a tint). 0 = pure light colour (neutral).
     */
    highlightTint: number;
    /** 0..1 how much of the direct light's specular is kept (the softboxes carry the highlights; a punctual light only makes hard dots) */
    lightSpecular: number;
    /** multiplier of the environment's diffuse light (the highlights come from reflections; this sets the base shading depth) */
    envDiffuse: number;
    /** Fresnel rim: environment / clearcoat reflections are boosted by 1 + rim * (1 - N.V)^rimPower */
    rim: number;
    rimPower: number;
  };
  env: {
    intensity: number;
    key: StripSettings;
    fill: StripSettings;
    rim: StripSettings;
    top: { intensity: number; color: string };
    /** floor bounce; `followFace` derives its colour from the face A colour (else `color`) */
    bounce: { intensity: number; color: string; followFace: boolean };
    /** optional colour of ALL the environment light (white = neutral) */
    tint: string;
    ambient: number;
    /** degrees */
    rotationY: number;
    rotationX: number;
    autoRotate: boolean;
    /** degrees / second */
    autoRotateSpeed: number;
  };
  light: {
    intensity: number;
    color: string;
    /** optional warmth, Kelvin-ish; 6500 = neutral (applies to this light and the environment) */
    temperature: number;
    azimuth: number;
    elevation: number;
  };
  geometry: {
    /** world px at a 1440-wide viewport; scales with viewport width */
    width: number;
    rings: number;
    /** segments per corner bevel (the profile is a flat rectangle + bevels) */
    bevelSegments: number;
    /** subdivisions across each flat face (keeps twisted faces smooth) */
    widthSegments: number;
    thicknessRatio: number;
    /** corner bevel radius, px at a 1440 viewport (0 .. T/2; max = fully rounded edge) */
    edgeBevel: number;
    capRings: number;
    capLengthRatio: number;
    taperLength: number;
    taperAmount: number;
  };
  post: {
    toneMapping: ToneMapName;
    exposure: number;
    /** MSAA samples of the ribbon render target (0 = off) */
    samples: number;
    /** MSAA samples used instead when the pixel ratio is >= 1.75 (retina density hides edges; -1 = same as `samples`) */
    samplesRetina: number;
    /** render / clear / resolve the ribbon target only inside the ribbon's screen rect (off when bloom is on) */
    scissor: boolean;
    pixelRatioCap: number;
    /** drop resolution automatically when frames run long */
    adaptive: boolean;
    /** half-res bloom of the ribbon (high tier) */
    bloom: boolean;
    bloomThreshold: number;
    bloomIntensity: number;
    bloomRadius: number;
    dither: boolean;
  };
  shadows: {
    self: boolean;
    mapSize: number;
    /** re-render the shadow map every N frames */
    updateEvery: number;
    /** ...but only once the ribbon has moved this fraction of a shadow-map texel (0 = every time) */
    moveThreshold: number;
    radius: number;
    bias: number;
    normalBias: number;
    floor: boolean;
    floorOpacity: number;
    /** 0..1 of half viewport height below centre */
    floorLevel: number;
    wall: boolean;
    wallOpacity: number;
    wallDepth: number;
    glow: boolean;
    glowIntensity: number;
    glowRadius: number;
    glowColor: string;
    /** derive the glow colour from the face A colour (else `glowColor`) */
    glowFollowFace: boolean;
    /** px below the ribbon's lowest visible point */
    glowDrop: number;
  };
  /** soft contact shadows of the ribbon on the HTML content (shadow catcher) */
  contact: {
    enabled: boolean;
    /** maximum shadow alpha */
    strength: number;
    /** px of height above the content plane over which occlusion decays e^-1 */
    falloff: number;
    /** fraction of the physical light-direction offset (0 = straight below) */
    offset: number;
    /** gaussian sigma (css px) for ribbon close to the content */
    blurContact: number;
    /** gaussian sigma (css px) for ribbon far above the content */
    blurHigh: number;
    /** fade-out distance inside the proxy rect edge (css px) */
    pad: number;
    /** catcher resolution relative to the drawing buffer */
    resolution: number;
    /** re-render the catcher + blur only after the ribbon moved this many px (0 = every frame) */
    moveThreshold: number;
  };
  background: {
    color: string;
    vignette: number;
    gradient: number;
    /** film grain on the background only (display-referred amplitude, 0..0.1) */
    grain: number;
  };
  sim: {
    stiffness: number;
    damping: number;
    /** 0..1 stiffness falloff towards the tail (follow-through) */
    followLag: number;
    idleAmplitude: number;
    idleSpeed: number;
    idleScale: number;
    idleCurl: number;
    twistWobble: number;
    idleDetail: number;
    twistWobbleScale: number;
  };
  camera: {
    fov: number;
  };
  debug: {
    /** inspect intermediate buffers (lab) */
    view: DebugView;
    proxyOutlines: boolean;
    hud: boolean;
    /** EXT_disjoint_timer_query GPU timing (can force pass splits; off by default) */
    gpuTimer: boolean;
    wireframe: boolean;
  };
}

const strip = (s: StripSettings): StripSettings => s;

/**
 * Face presets (lab). Mockup = orange / burnt orange (default).
 *
 * The lighting is colour-neutral, so ALL the colour lives here. The orange faces are the old
 * #ff6200 / #b8420c pre-multiplied by the amber light they used to sit under (the base is a
 * redder #ff4000 and the specular tints a warm amber); `highlightTint` slides the hot
 * highlights towards each face's own hue, which reproduces the old amber glints.
 */
export const FACE_PRESETS: Record<
  string,
  Pick<RibbonSettings["material"], "faceA" | "faceB" | "edge" | "highlightTint">
> = {
  Mockup: {
    faceA: {
      color: "#ff6414",
      roughness: 0.22,
      clearcoat: 1,
      clearcoatRoughness: 0.075,
      specularColor: "#ffd880",
    },
    faceB: {
      color: "#5a2410",
      roughness: 0.34,
      clearcoat: 0.9,
      clearcoatRoughness: 0.09,
      specularColor: "#ffa060",
    },
    edge: { mode: "gradient", color: "#ffffff" },
    highlightTint: 1,
  },
  Duotone: {
    faceA: {
      color: "#ff4000",
      roughness: 0.34,
      clearcoat: 0.75,
      clearcoatRoughness: 0.08,
      specularColor: "#ffa535",
    },
    faceB: {
      color: "#f3e6d3",
      roughness: 0.42,
      clearcoat: 0.5,
      clearcoatRoughness: 0.12,
      specularColor: "#ffffff",
    },
    edge: { mode: "gradient", color: "#ffffff" },
    highlightTint: 1,
  },
  Ember: {
    faceA: {
      color: "#ff4000",
      roughness: 0.32,
      clearcoat: 0.8,
      clearcoatRoughness: 0.07,
      specularColor: "#ffa535",
    },
    faceB: {
      color: "#4a0f0c",
      roughness: 0.3,
      clearcoat: 0.9,
      clearcoatRoughness: 0.06,
      specularColor: "#ff6a28",
    },
    edge: { mode: "gradient", color: "#ffffff" },
    highlightTint: 1,
  },
  Mono: {
    faceA: {
      color: "#ff4000",
      roughness: 0.34,
      clearcoat: 0.75,
      clearcoatRoughness: 0.08,
      specularColor: "#ffa535",
    },
    faceB: {
      color: "#ff4000",
      roughness: 0.34,
      clearcoat: 0.75,
      clearcoatRoughness: 0.08,
      specularColor: "#ffa535",
    },
    edge: { mode: "gradient", color: "#ffffff" },
    highlightTint: 1,
  },
};

export const DEFAULT_SETTINGS: RibbonSettings = {
  quality: "medium",
  material: {
    ...FACE_PRESETS.Mockup,
    metalness: 0,
    anisotropy: 0.1,
    anisotropyRotation: 0,
    specularIntensity: 1,
    lightSpecular: 0.2,
    envDiffuse: 0.7,
    rim: 1.8,
    rimPower: 3,
    ior: 1.5,
    sheen: 0,
    sheenRoughness: 0.5,
    sheenColor: "#ffffff",
    depthShade: 0.1,
  },
  env: {
    intensity: 1.2,
    key: strip({
      intensity: 11,
      azimuth: -30,
      elevation: 22,
      length: 46,
      width: 8,
      roll: 42,
      softness: 1,
      color: "#ffffff",
    }),
    fill: strip({
      intensity: 0.8,
      azimuth: 80,
      elevation: 2,
      length: 30,
      width: 12,
      roll: 0,
      softness: 1,
      color: "#ffffff",
    }),
    rim: strip({
      intensity: 11,
      azimuth: 148,
      elevation: 10,
      length: 30,
      width: 3,
      roll: -10,
      softness: 0.9,
      color: "#ffffff",
    }),
    top: { intensity: 1.0, color: "#ffffff" },
    bounce: { intensity: 0.22, color: "#ffffff", followFace: true },
    tint: "#ffffff",
    ambient: 0.002,
    rotationY: 0,
    rotationX: 0,
    autoRotate: true,
    autoRotateSpeed: 1.6,
  },
  light: {
    intensity: 1.0,
    color: "#ffffff",
    temperature: 6500,
    azimuth: -38,
    elevation: 44,
  },
  geometry: {
    width: 68,
    rings: 1000,
    bevelSegments: 3,
    widthSegments: 10,
    thicknessRatio: 1 / 11,
    edgeBevel: 0.6,
    capRings: 14,
    capLengthRatio: 0.55,
    taperLength: 0.08,
    taperAmount: 0,
  },
  post: {
    toneMapping: "Neutral",
    exposure: 1,
    samples: 4,
    samplesRetina: 2,
    scissor: true,
    pixelRatioCap: 1.5,
    adaptive: true,
    bloom: false,
    bloomThreshold: 0.8,
    bloomIntensity: 0.25,
    bloomRadius: 18,
    dither: true,
  },
  shadows: {
    self: true,
    mapSize: 1024,
    updateEvery: 1,
    moveThreshold: 0.35,
    radius: 2.5,
    bias: -0.0004,
    normalBias: 1.4,
    floor: true,
    floorOpacity: 0.5,
    floorLevel: 0.62,
    wall: false,
    wallOpacity: 0.35,
    wallDepth: 420,
    glow: true,
    glowIntensity: 0.07,
    glowRadius: 0.16,
    glowColor: "#ffffff",
    glowFollowFace: true,
    glowDrop: 40,
  },
  contact: {
    enabled: true,
    strength: 0.28,
    falloff: 80,
    offset: 0.28,
    blurContact: 5,
    blurHigh: 26,
    pad: 8,
    resolution: 0.25,
    moveThreshold: 0.75,
  },
  background: {
    color: "#0c0c0c",
    vignette: 0,
    gradient: 0,
    grain: 0.03,
  },
  // calm idle (see IDLE_PRESETS in sim.ts): gentle breathing/drift, no twist churn
  sim: {
    stiffness: 38,
    damping: 1.0,
    followLag: 0.45,
    ...IDLE_PRESETS["idle.calm"],
  },
  camera: {
    fov: 28,
  },
  debug: {
    view: "off",
    proxyOutlines: false,
    hud: true,
    gpuTimer: false,
    wireframe: false,
  },
};

export function cloneSettings(s: RibbonSettings): RibbonSettings {
  return JSON.parse(JSON.stringify(s)) as RibbonSettings;
}

type Plain = Record<string, unknown>;

function isPlain(v: unknown): v is Plain {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Deep-assign `patch` into `target` in place (only keys that already exist). */
export function assignSettings(target: Plain, patch: Plain): void {
  for (const key of Object.keys(patch)) {
    if (!(key in target)) continue;
    const pv = patch[key];
    const tv = target[key];
    if (isPlain(tv) && isPlain(pv)) assignSettings(tv, pv);
    else if (typeof tv === typeof pv) target[key] = pv;
  }
}

export function mergeSettings(
  patch?: DeepPartial<RibbonSettings> | null,
): RibbonSettings {
  const out = cloneSettings(DEFAULT_SETTINGS);
  if (patch) assignSettings(out as unknown as Plain, patch as Plain);
  return out;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};


/**
 * Quality tiers. All tiers render the ribbon once into an MSAA HalfFloat target
 * and composite it twice (behind / in front of the HTML). They differ in
 * resolution, MSAA, geometry density, shadow resolution and bloom.
 */
export const QUALITY_TIERS: Record<
  QualityTier,
  {
    post: Partial<RibbonSettings["post"]>;
    geometry: Partial<RibbonSettings["geometry"]>;
    shadows: Partial<RibbonSettings["shadows"]>;
    contact: Partial<RibbonSettings["contact"]>;
  }
> = {
  // T2 (weak devices): DPR <= 1.25, ~360 rings, no contact shadows, 512 shadow map
  // (the engine also caps the idle frame rate to 30 fps on this tier)
  low: {
    post: { samples: 2, samplesRetina: -1, pixelRatioCap: 1.25, bloom: false },
    geometry: { rings: 560, bevelSegments: 2, widthSegments: 6, capRings: 10 },
    shadows: { mapSize: 512, updateEvery: 1 },
    contact: { enabled: false },
  },
  medium: {
    post: { samples: 4, pixelRatioCap: 1.5, bloom: false },
    geometry: { rings: 1000, bevelSegments: 3, widthSegments: 10, capRings: 14 },
    shadows: { mapSize: 1024, updateEvery: 1 },
    contact: { enabled: true, resolution: 0.25 },
  },
  high: {
    post: { samples: 4, pixelRatioCap: 2, bloom: true },
    geometry: { rings: 1500, bevelSegments: 4, widthSegments: 14, capRings: 18 },
    shadows: { mapSize: 2048, updateEvery: 1 },
    contact: { enabled: true, resolution: 0.35 },
  },
};

export function applyQualityTier(s: RibbonSettings, tier: QualityTier): void {
  const t = QUALITY_TIERS[tier];
  s.quality = tier;
  Object.assign(s.post, t.post);
  Object.assign(s.geometry, t.geometry);
  Object.assign(s.shadows, t.shadows);
  Object.assign(s.contact, t.contact);
}
