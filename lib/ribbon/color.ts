/**
 * Colour helpers for the (neutral-by-default) lighting rig.
 *
 * The lights, the environment and the tone map carry NO colour of their own:
 * the ribbon's colour comes from the material only. Warmth is an explicit,
 * optional control (`light.temperature`, `env.tint`), neutral by default.
 */
import * as THREE from "three";

export const NEUTRAL_KELVIN = 6500;

/** Tanner Helland's black-body approximation, 0..255 per channel */
function blackBody(kelvin: number): [number, number, number] {
  const t = THREE.MathUtils.clamp(kelvin, 1000, 40000) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g =
    t <= 66
      ? 99.4708025861 * Math.log(t) - 161.1195681661
      : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = (v: number) => THREE.MathUtils.clamp(v, 0, 255);
  return [c(r), c(g), c(b)];
}

const REF = blackBody(NEUTRAL_KELVIN);

/**
 * Linear multiplier for a colour temperature, exactly (1, 1, 1) at 6500 K, scaled so the
 * largest channel is 1 (changing the temperature changes the hue, not the brightness).
 */
export function temperatureColor(kelvin: number, out = new THREE.Color()): THREE.Color {
  if (Math.abs(kelvin - NEUTRAL_KELVIN) < 1) return out.setRGB(1, 1, 1);
  const c = blackBody(kelvin);
  const r = c[0] / REF[0];
  const g = c[1] / REF[1];
  const b = c[2] / REF[2];
  const m = Math.max(r, g, b, 1e-6);
  return out.setRGB(r / m, g / m, b / m);
}
