/**
 * The ribbon camera, as plain maths (no three import). 1 world unit = 1 css px
 * at z = 0, origin at the viewport centre, +y up, perspective with a vertical
 * fov looking down -z from z = D = (H / 2) / tan(fov / 2).
 */

export const DEFAULT_FOV = 28;
const DEG = Math.PI / 180;

export function cameraDistance(viewH: number, fov = DEFAULT_FOV): number {
  return viewH / 2 / Math.tan((fov * DEG) / 2);
}

/** perspective scale at world depth z (1 at z = 0, > 1 closer to the camera) */
export function depthScale(z: number, viewH: number, fov = DEFAULT_FOV): number {
  const d = cameraDistance(viewH, fov);
  return d / Math.max(d - z, 1);
}

/** world (x, y up, z) -> viewport CSS px (y down) */
export function projectWorld(
  x: number,
  y: number,
  z: number,
  viewW: number,
  viewH: number,
  fov = DEFAULT_FOV,
): { x: number; y: number } {
  const k = depthScale(z, viewH, fov);
  return { x: viewW / 2 + x * k, y: viewH / 2 - y * k };
}

/** viewport CSS px (y down) at world depth z -> world x / y */
export function unprojectScreen(
  sx: number,
  sy: number,
  z: number,
  viewW: number,
  viewH: number,
  fov = DEFAULT_FOV,
): { x: number; y: number } {
  const k = depthScale(z, viewH, fov);
  return { x: (sx - viewW / 2) / k, y: (viewH / 2 - sy) / k };
}
