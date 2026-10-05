/** Pose registry + typed loader. Poses are JSON files next to this module. */
import ak from "./ak-hero.json";
import { parsePoseFile } from "./io";
import type { PoseFile } from "./types";

export * from "./types";
export * from "./camera";
export * from "./resolve";
export * from "./io";
export * from "./anchors";

const RAW: Record<string, unknown> = {
  "ak-hero": ak,
};

export const POSE_NAMES = Object.keys(RAW);

const cache = new Map<string, PoseFile>();

/** Load a pose by name (validated + normalised; cached). */
export function loadPose(name: string): PoseFile {
  const hit = cache.get(name);
  if (hit) return hit;
  const raw = RAW[name];
  if (!raw) throw new Error(`unknown pose "${name}"`);
  const file = parsePoseFile(raw);
  cache.set(name, file);
  return file;
}
