/**
 * Compact CMA-ES (Hansen's (mu/mu_w, lambda) with rank-one + rank-mu updates).
 * Minimisation, full covariance, warm-started Jacobi eigen decomposition (the
 * eigenbasis moves slowly between generations, so 2-3 sweeps are enough).
 * No dependencies; a seeded RNG keeps runs reproducible.
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CMAOptions {
  popsize?: number;
  seed?: number;
}

export class CMAES {
  readonly n: number;
  readonly lambda: number;
  readonly mu: number;
  readonly mean: Float64Array;
  sigma: number;
  gen = 0;
  /** covariance, eigenvectors (columns of B, row-major n*n), sqrt eigenvalues */
  readonly C: Float64Array;
  readonly B: Float64Array;
  readonly D: Float64Array;
  private readonly weights: Float64Array;
  private readonly mueff: number;
  private readonly cc: number;
  private readonly cs: number;
  private readonly c1: number;
  private readonly cmu: number;
  private readonly damps: number;
  private readonly chiN: number;
  private readonly pc: Float64Array;
  private readonly ps: Float64Array;
  private readonly rnd: () => number;
  private spare: number | null = null;
  private eigenGen = 0;
  private readonly eigenEvery: number;
  // last ask(): z (standard normal) and y = B D z
  private zs: Float64Array[] = [];
  private ys: Float64Array[] = [];
  private readonly tmp: Float64Array;
  private readonly tmp2: Float64Array;
  /** smallest / largest axis of the sampling distribution (sigma * D) */
  get maxAxis(): number {
    let m = 0;
    for (let i = 0; i < this.n; i++) m = Math.max(m, this.D[i]);
    return this.sigma * m;
  }
  get condition(): number {
    let lo = Infinity;
    let hi = 0;
    for (let i = 0; i < this.n; i++) {
      lo = Math.min(lo, this.D[i]);
      hi = Math.max(hi, this.D[i]);
    }
    return (hi / Math.max(lo, 1e-300)) ** 2;
  }

  constructor(x0: ArrayLike<number>, sigma0: number, opts: CMAOptions = {}) {
    const n = x0.length;
    this.n = n;
    this.mean = Float64Array.from(x0);
    this.sigma = sigma0;
    this.lambda = opts.popsize ?? 4 + Math.floor(3 * Math.log(n));
    this.mu = Math.floor(this.lambda / 2);
    this.rnd = mulberry32(opts.seed ?? 1);
    const w = new Float64Array(this.mu);
    let sum = 0;
    for (let i = 0; i < this.mu; i++) {
      w[i] = Math.log(this.mu + 0.5) - Math.log(i + 1);
      sum += w[i];
    }
    let sq = 0;
    for (let i = 0; i < this.mu; i++) {
      w[i] /= sum;
      sq += w[i] * w[i];
    }
    this.weights = w;
    this.mueff = 1 / sq;
    const me = this.mueff;
    this.cc = (4 + me / n) / (n + 4 + (2 * me) / n);
    this.cs = (me + 2) / (n + me + 5);
    this.c1 = 2 / ((n + 1.3) ** 2 + me);
    this.cmu = Math.min(1 - this.c1, (2 * (me - 2 + 1 / me)) / ((n + 2) ** 2 + me));
    this.damps = 1 + 2 * Math.max(0, Math.sqrt((me - 1) / (n + 1)) - 1) + this.cs;
    this.chiN = Math.sqrt(n) * (1 - 1 / (4 * n) + 1 / (21 * n * n));
    this.pc = new Float64Array(n);
    this.ps = new Float64Array(n);
    this.C = new Float64Array(n * n);
    this.B = new Float64Array(n * n);
    this.D = new Float64Array(n).fill(1);
    for (let i = 0; i < n; i++) {
      this.C[i * n + i] = 1;
      this.B[i * n + i] = 1;
    }
    this.tmp = new Float64Array(n);
    this.tmp2 = new Float64Array(n);
    this.eigenEvery = Math.max(1, Math.round(0.3 / ((this.c1 + this.cmu) * n)));
  }

  private gauss(): number {
    if (this.spare !== null) {
      const s = this.spare;
      this.spare = null;
      return s;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = this.rnd();
    v = this.rnd();
    const r = Math.sqrt(-2 * Math.log(u));
    this.spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  }

  /** sample `lambda` candidates */
  ask(): Float64Array[] {
    const n = this.n;
    const out: Float64Array[] = [];
    this.zs = [];
    this.ys = [];
    for (let k = 0; k < this.lambda; k++) {
      const z = new Float64Array(n);
      for (let i = 0; i < n; i++) z[i] = this.gauss();
      // y = B (D z)
      const y = new Float64Array(n);
      const dz = this.tmp;
      for (let i = 0; i < n; i++) dz[i] = this.D[i] * z[i];
      for (let r = 0; r < n; r++) {
        let s = 0;
        const row = r * n;
        for (let c = 0; c < n; c++) s += this.B[row + c] * dz[c];
        y[r] = s;
      }
      const x = new Float64Array(n);
      for (let i = 0; i < n; i++) x[i] = this.mean[i] + this.sigma * y[i];
      this.zs.push(z);
      this.ys.push(y);
      out.push(x);
    }
    return out;
  }

  /** `fitness[k]` is the value of candidate k from the last ask(); `x` may have been repaired in place */
  tell(xs: Float64Array[], fitness: ArrayLike<number>): void {
    const n = this.n;
    const lam = this.lambda;
    const idx = Array.from({ length: lam }, (_, i) => i).sort((a, b) => fitness[a] - fitness[b]);
    // y_k from the (possibly repaired) x
    const yw = new Float64Array(n);
    const old = Float64Array.from(this.mean);
    for (let j = 0; j < this.mu; j++) {
      const x = xs[idx[j]];
      for (let i = 0; i < n; i++) yw[i] += this.weights[j] * ((x[i] - old[i]) / this.sigma);
    }
    for (let i = 0; i < n; i++) this.mean[i] = old[i] + this.sigma * yw[i];
    // C^-1/2 yw = B D^-1 B^T yw
    const bty = this.tmp;
    for (let c = 0; c < n; c++) {
      let s = 0;
      for (let r = 0; r < n; r++) s += this.B[r * n + c] * yw[r];
      bty[c] = s / this.D[c];
    }
    const invsq = this.tmp2;
    for (let r = 0; r < n; r++) {
      let s = 0;
      const row = r * n;
      for (let c = 0; c < n; c++) s += this.B[row + c] * bty[c];
      invsq[r] = s;
    }
    const cs = this.cs;
    const csn = Math.sqrt(cs * (2 - cs) * this.mueff);
    let psn = 0;
    for (let i = 0; i < n; i++) {
      this.ps[i] = (1 - cs) * this.ps[i] + csn * invsq[i];
      psn += this.ps[i] * this.ps[i];
    }
    psn = Math.sqrt(psn);
    const hsig =
      psn / Math.sqrt(1 - (1 - cs) ** (2 * (this.gen + 1))) / this.chiN < 1.4 + 2 / (n + 1) ? 1 : 0;
    const ccn = Math.sqrt(this.cc * (2 - this.cc) * this.mueff);
    for (let i = 0; i < n; i++) this.pc[i] = (1 - this.cc) * this.pc[i] + hsig * ccn * yw[i];
    // covariance update
    const c1 = this.c1;
    const cmu = this.cmu;
    const decay = 1 - c1 - cmu + (1 - hsig) * c1 * this.cc * (2 - this.cc);
    const C = this.C;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c <= r; c++) {
        let v = decay * C[r * n + c] + c1 * this.pc[r] * this.pc[c];
        let rm = 0;
        for (let j = 0; j < this.mu; j++) {
          const x = xs[idx[j]];
          rm += this.weights[j] * ((x[r] - old[r]) / this.sigma) * ((x[c] - old[c]) / this.sigma);
        }
        v += cmu * rm;
        C[r * n + c] = v;
        C[c * n + r] = v;
      }
    }
    this.sigma *= Math.exp((cs / this.damps) * (psn / this.chiN - 1));
    this.gen++;
    if (this.gen - this.eigenGen >= this.eigenEvery) {
      this.eigenGen = this.gen;
      this.decompose();
    }
  }

  /** Jacobi eigen decomposition of C, warm-started from the current B */
  private decompose(): void {
    const n = this.n;
    const B = this.B;
    const C = this.C;
    // A = B^T C B (nearly diagonal)
    const CB = new Float64Array(n * n);
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        let s = 0;
        for (let k = 0; k < n; k++) s += C[r * n + k] * B[k * n + c];
        CB[r * n + c] = s;
      }
    const A = new Float64Array(n * n);
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) {
        let s = 0;
        for (let k = 0; k < n; k++) s += B[k * n + r] * CB[k * n + c];
        A[r * n + c] = s;
      }
    for (let sweep = 0; sweep < 12; sweep++) {
      let off = 0;
      for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p * n + q] * A[p * n + q];
      let diag = 0;
      for (let p = 0; p < n; p++) diag += A[p * n + p] * A[p * n + p];
      if (off <= 1e-22 * (diag + 1e-300)) break;
      for (let p = 0; p < n - 1; p++) {
        for (let q = p + 1; q < n; q++) {
          const apq = A[p * n + q];
          if (Math.abs(apq) < 1e-30) continue;
          const app = A[p * n + p];
          const aqq = A[q * n + q];
          const theta = (aqq - app) / (2 * apq);
          const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          const c = 1 / Math.sqrt(t * t + 1);
          const s = t * c;
          for (let k = 0; k < n; k++) {
            const akp = A[k * n + p];
            const akq = A[k * n + q];
            A[k * n + p] = c * akp - s * akq;
            A[k * n + q] = s * akp + c * akq;
          }
          for (let k = 0; k < n; k++) {
            const apk = A[p * n + k];
            const aqk = A[q * n + k];
            A[p * n + k] = c * apk - s * aqk;
            A[q * n + k] = s * apk + c * aqk;
          }
          for (let k = 0; k < n; k++) {
            const bkp = B[k * n + p];
            const bkq = B[k * n + q];
            B[k * n + p] = c * bkp - s * bkq;
            B[k * n + q] = s * bkp + c * bkq;
          }
        }
      }
    }
    for (let i = 0; i < n; i++) this.D[i] = Math.sqrt(Math.max(A[i * n + i], 1e-20));
  }
}
