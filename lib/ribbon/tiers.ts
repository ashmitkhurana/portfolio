/**
 * Engine-side tier profiles (loaded with the engine chunk, never in the initial
 * bundle). The detection lives in capability.ts; the per-tier render settings
 * are QUALITY_TIERS in settings.ts; this adds the loop / memory policy.
 */
import type { Tier } from "./capability";
import type { QualityTier } from "./settings";

export interface TierProfile {
  quality: QualityTier;
  /**
   * Budget for the drawing-buffer pixel count (css w * css h * pr^2). The ribbon
   * target (MSAA colour + mask + depth, ~50 bytes/px) dominates GPU memory, so
   * this is also the GPU memory budget: ~110 MB (T2), ~225 MB (T3), ~375 MB (T4).
   */
  maxPixels: number;
  /** idle frame cap (fps) once the ribbon is settled and nothing scrolls; 0 = uncapped */
  idleFps: number;
}

/** iOS Safari refuses canvases above 16 777 216 px (and silently blanks them) */
export const MAX_CANVAS_PIXELS = 16_777_216;

export const TIER_PROFILES: Record<2 | 3 | 4, TierProfile> = {
  2: { quality: "low", maxPixels: 2_200_000, idleFps: 30 },
  3: { quality: "medium", maxPixels: 4_500_000, idleFps: 0 },
  4: { quality: "high", maxPixels: 7_500_000, idleFps: 0 },
};

export function profileFor(tier: Tier): TierProfile | null {
  return tier >= 2 ? TIER_PROFILES[tier as 2 | 3 | 4] : null;
}
