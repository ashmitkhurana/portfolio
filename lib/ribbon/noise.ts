/**
 * Dependency-free 3D simplex noise (Gustavson), plus a divergence-free curl
 * field built from three decorrelated noise lookups. Framework-agnostic.
 */

const GRAD3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0,
  -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

const F3 = 1 / 3;
const G3 = 1 / 6;

function buildPerm(seed: number): { perm: Uint8Array; permMod12: Uint8Array } {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  // mulberry32
  let a = seed >>> 0;
  const rnd = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = p[i];
    p[i] = p[j];
    p[j] = tmp;
  }
  const perm = new Uint8Array(512);
  const permMod12 = new Uint8Array(512);
  for (let i = 0; i < 512; i++) {
    perm[i] = p[i & 255];
    permMod12[i] = perm[i] % 12;
  }
  return { perm, permMod12 };
}

const { perm, permMod12 } = buildPerm(1337);

/** Simplex noise in [-1, 1]. */
export function snoise3(xin: number, yin: number, zin: number): number {
  const s = (xin + yin + zin) * F3;
  const i = Math.floor(xin + s);
  const j = Math.floor(yin + s);
  const k = Math.floor(zin + s);
  const t = (i + j + k) * G3;
  const x0 = xin - (i - t);
  const y0 = yin - (j - t);
  const z0 = zin - (k - t);

  let i1: number, j1: number, k1: number, i2: number, j2: number, k2: number;
  if (x0 >= y0) {
    if (y0 >= z0) {
      i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
    } else if (x0 >= z0) {
      i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
    } else {
      i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
    }
  } else if (y0 < z0) {
    i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
  } else if (x0 < z0) {
    i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
  } else {
    i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
  }

  const x1 = x0 - i1 + G3;
  const y1 = y0 - j1 + G3;
  const z1 = z0 - k1 + G3;
  const x2 = x0 - i2 + 2 * G3;
  const y2 = y0 - j2 + 2 * G3;
  const z2 = z0 - k2 + 2 * G3;
  const x3 = x0 - 1 + 3 * G3;
  const y3 = y0 - 1 + 3 * G3;
  const z3 = z0 - 1 + 3 * G3;

  const ii = i & 255;
  const jj = j & 255;
  const kk = k & 255;

  let n0 = 0, n1 = 0, n2 = 0, n3 = 0;

  let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
  if (t0 > 0) {
    const gi = permMod12[ii + perm[jj + perm[kk]]] * 3;
    t0 *= t0;
    n0 = t0 * t0 * (GRAD3[gi] * x0 + GRAD3[gi + 1] * y0 + GRAD3[gi + 2] * z0);
  }
  let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
  if (t1 > 0) {
    const gi = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
    t1 *= t1;
    n1 = t1 * t1 * (GRAD3[gi] * x1 + GRAD3[gi + 1] * y1 + GRAD3[gi + 2] * z1);
  }
  let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
  if (t2 > 0) {
    const gi = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
    t2 *= t2;
    n2 = t2 * t2 * (GRAD3[gi] * x2 + GRAD3[gi + 1] * y2 + GRAD3[gi + 2] * z2);
  }
  let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
  if (t3 > 0) {
    const gi = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;
    t3 *= t3;
    n3 = t3 * t3 * (GRAD3[gi] * x3 + GRAD3[gi + 1] * y3 + GRAD3[gi + 2] * z3);
  }
  return 32 * (n0 + n1 + n2 + n3);
}

/** Two-octave fractal noise in roughly [-1, 1]. */
export function fbm3(x: number, y: number, z: number): number {
  return (
    snoise3(x, y, z) * 0.65 +
    snoise3(x * 2.03 + 11.7, y * 2.03 - 4.3, z * 2.03 + 7.1) * 0.35
  );
}

const EPS = 0.35;

/**
 * Curl of a vector potential (fbm in three decorrelated channels). Divergence
 * free, so displacement swirls instead of clumping. Output is roughly in
 * [-1, 1] per axis; written into `out[o..o+2]`.
 */
export function curl3(
  x: number,
  y: number,
  z: number,
  out: Float32Array,
  o: number,
): void {
  // Potential components A = (a, b, c): offsets decorrelate the channels.
  const dbdz =
    (fbm3(x + 31.4, y - 9.2, z + EPS) - fbm3(x + 31.4, y - 9.2, z - EPS)) /
    (2 * EPS);
  const dcdy =
    (fbm3(x - 17.9, y + EPS + 5.5, z + 3.3) -
      fbm3(x - 17.9, y - EPS + 5.5, z + 3.3)) /
    (2 * EPS);
  const dcdx =
    (fbm3(x + EPS - 17.9, y + 5.5, z + 3.3) -
      fbm3(x - EPS - 17.9, y + 5.5, z + 3.3)) /
    (2 * EPS);
  const dadz =
    (fbm3(x, y, z + EPS) - fbm3(x, y, z - EPS)) / (2 * EPS);
  const dady =
    (fbm3(x, y + EPS, z) - fbm3(x, y - EPS, z)) / (2 * EPS);
  const dbdx =
    (fbm3(x + EPS + 31.4, y - 9.2, z) - fbm3(x - EPS + 31.4, y - 9.2, z)) /
    (2 * EPS);
  out[o] = (dcdy - dbdz) * 0.9;
  out[o + 1] = (dadz - dcdx) * 0.9;
  out[o + 2] = (dbdx - dady) * 0.9;
}
