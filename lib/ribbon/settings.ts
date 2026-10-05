/**
 * Ribbon settings: one nested, JSON-serialisable object. The lab tweak panel
 * edits it live; production uses DEFAULT_SETTINGS as-is.
 */

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

export interface RibbonSettings {
  /** preset bundle, see QUALITY_TIERS / applyQualityTier */
  quality: QualityTier;
  material: {
    colorA: string;
    colorB: string;
    /** 0..1 transition softness between faces across the rim */
    faceBlend: number;
    roughness: number;
    metalness: number;
    clearcoat: number;
    clearcoatRoughness: number;
    anisotropy: number;
    /** degrees, relative to the ribbon tangent */
    anisotropyRotation: number;
    specularIntensity: number;
    ior: number;
    sheen: number;
    sheenRoughness: number;
    sheenColor: string;
    /** 0..1 darkening of ribbon far behind the content plane (depth cue / pseudo-AO) */
    depthShade: number;
  };
  env: {
    intensity: number;
    key: StripSettings;
    fill: StripSettings;
    rim: StripSettings;
    top: { intensity: number; color: string };
    bounce: { intensity: number; color: string };
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
    azimuth: number;
    elevation: number;
  };
  geometry: {
    /** world px at a 1440-wide viewport; scales with viewport width */
    width: number;
    rings: number;
    profileVerts: number;
    thicknessRatio: number;
    edgeRadiusRatio: number;
    capRings: number;
    capLengthRatio: number;
    taperLength: number;
    taperAmount: number;
  };
  post: {
    toneMapping: ToneMapName;
    exposure: number;
    /** use the postprocessing composer (MSAA HalfFloat + bloom). Heavy: high tier only */
    composer: boolean;
    multisampling: number;
    pixelRatioCap: number;
    /** drop resolution automatically when frames run long */
    adaptive: boolean;
    bloom: boolean;
    bloomFront: boolean;
    bloomThreshold: number;
    bloomSmoothing: number;
    bloomIntensity: number;
    bloomRadius: number;
    dither: boolean;
  };
  shadows: {
    self: boolean;
    mapSize: number;
    /** re-render the shadow map every N frames */
    updateEvery: number;
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
    contact: boolean;
    contactOpacity: number;
    contactPad: number;
    glow: boolean;
    glowIntensity: number;
    glowRadius: number;
    glowColor: string;
    /** px below the ribbon's lowest visible point */
    glowDrop: number;
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
  };
  camera: {
    fov: number;
  };
  debug: {
    partition: boolean;
    proxyOutlines: boolean;
    hud: boolean;
    /** EXT_disjoint_timer_query GPU timing (can force pass splits; off by default) */
    gpuTimer: boolean;
    wireframe: boolean;
  };
}

const strip = (s: StripSettings): StripSettings => s;

export const DEFAULT_SETTINGS: RibbonSettings = {
  quality: "medium",
  material: {
    colorA: "#ff5800",
    colorB: "#a63608",
    faceBlend: 0.3,
    roughness: 0.34,
    metalness: 0.35,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    anisotropy: 0.35,
    anisotropyRotation: 0,
    specularIntensity: 1,
    ior: 1.5,
    sheen: 0,
    sheenRoughness: 0.5,
    sheenColor: "#ffb070",
    depthShade: 0.45,
  },
  env: {
    intensity: 1,
    key: strip({
      intensity: 11,
      azimuth: -32,
      elevation: 38,
      length: 24,
      width: 8,
      roll: 14,
      softness: 1,
      color: "#ffae42",
    }),
    fill: strip({
      intensity: 1.4,
      azimuth: 78,
      elevation: 6,
      length: 22,
      width: 6,
      roll: 0,
      softness: 1,
      color: "#ffc99a",
    }),
    rim: strip({
      intensity: 14,
      azimuth: 152,
      elevation: 16,
      length: 22,
      width: 2.6,
      roll: -10,
      softness: 0.9,
      color: "#ff8a1f",
    }),
    top: { intensity: 0.7, color: "#ffe6cc" },
    bounce: { intensity: 0.22, color: "#ff5a10" },
    ambient: 0.006,
    rotationY: 0,
    rotationX: 0,
    autoRotate: true,
    autoRotateSpeed: 1.6,
  },
  light: {
    intensity: 0.9,
    color: "#ffb36b",
    azimuth: -38,
    elevation: 44,
  },
  geometry: {
    width: 110,
    rings: 600,
    profileVerts: 28,
    thicknessRatio: 1 / 9,
    edgeRadiusRatio: 0.5,
    capRings: 12,
    capLengthRatio: 0.55,
    taperLength: 0.08,
    taperAmount: 0,
  },
  post: {
    toneMapping: "Neutral",
    exposure: 1,
    composer: false,
    multisampling: 4,
    pixelRatioCap: 1.5,
    adaptive: true,
    bloom: true,
    bloomFront: false,
    bloomThreshold: 1.0,
    bloomSmoothing: 0.25,
    bloomIntensity: 0.22,
    bloomRadius: 0.7,
    dither: true,
  },
  shadows: {
    self: true,
    mapSize: 1024,
    updateEvery: 1,
    radius: 2.5,
    bias: -0.0004,
    normalBias: 1.4,
    floor: true,
    floorOpacity: 0.5,
    floorLevel: 0.62,
    wall: false,
    wallOpacity: 0.35,
    wallDepth: 420,
    contact: true,
    contactOpacity: 0.3,
    contactPad: 16,
    glow: true,
    glowIntensity: 0.07,
    glowRadius: 0.16,
    glowColor: "#ff5a10",
    glowDrop: 40,
  },
  background: {
    color: "#0d0c0b",
    vignette: 0,
    gradient: 0,
    grain: 0.03,
  },
  sim: {
    stiffness: 38,
    damping: 1.0,
    followLag: 0.45,
    idleAmplitude: 26,
    idleSpeed: 0.22,
    idleScale: 0.0016,
    idleCurl: 1,
    twistWobble: 0.18,
  },
  camera: {
    fov: 28,
  },
  debug: {
    partition: false,
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
 * Quality tiers. `medium` is the production default: direct rendering with
 * native MSAA, tone mapping in the renderer, no bloom. `high` switches on the
 * postprocessing composer (HalfFloat MSAA + bloom) and is expensive.
 */
export const QUALITY_TIERS: Record<
  QualityTier,
  {
    post: Partial<RibbonSettings["post"]>;
    geometry: Partial<RibbonSettings["geometry"]>;
    shadows: Partial<RibbonSettings["shadows"]>;
  }
> = {
  low: {
    post: { composer: false, pixelRatioCap: 1 },
    geometry: { rings: 400, profileVerts: 20, capRings: 8 },
    shadows: { mapSize: 1024, updateEvery: 1, contact: false },
  },
  medium: {
    post: { composer: false, pixelRatioCap: 1.5 },
    geometry: { rings: 600, profileVerts: 28, capRings: 12 },
    shadows: { mapSize: 1024, updateEvery: 1, contact: true },
  },
  high: {
    post: { composer: true, pixelRatioCap: 2, bloom: true },
    geometry: { rings: 900, profileVerts: 32, capRings: 14 },
    shadows: { mapSize: 2048, updateEvery: 1, contact: true },
  },
};

export function applyQualityTier(s: RibbonSettings, tier: QualityTier): void {
  const t = QUALITY_TIERS[tier];
  s.quality = tier;
  Object.assign(s.post, t.post);
  Object.assign(s.geometry, t.geometry);
  Object.assign(s.shadows, t.shadows);
}
