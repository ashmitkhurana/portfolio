/**
 * Ruled poses: the ribbon is given by its RULINGS (one straight line across the band per ring, edge L to
 * edge R in world space) instead of a centreline + frames. The sim carries the per-control-point ruling
 * direction B (unit) and half width; the geometry interpolates them to the rings with a natural cubic
 * spline (C2) over the centreline's arc fraction.
 */

export interface RuledData {
  /** per control point: bx, by, bz (unit, from edge L towards edge R), half width (world px) */
  data: Float32Array;
  /** +1 / -1: which side of the band is face A (N = sign * normalize(T x B)) */
  sign: number;
}

/** natural cubic spline through (x_k, y_k), x strictly increasing; evaluates at increasing queries cheaply */
export class NaturalSpline {
  private x: Float64Array;
  private y: Float64Array;
  private m: Float64Array; // second derivatives
  private n = 0;
  private readonly a: Float64Array;
  private readonly b: Float64Array;
  private readonly c: Float64Array;
  private readonly d: Float64Array;

  constructor(maxN: number) {
    this.x = new Float64Array(maxN);
    this.y = new Float64Array(maxN);
    this.m = new Float64Array(maxN);
    this.a = new Float64Array(maxN);
    this.b = new Float64Array(maxN);
    this.c = new Float64Array(maxN);
    this.d = new Float64Array(maxN);
  }

  set(x: ArrayLike<number>, y: ArrayLike<number>, n: number, yStride = 1, yOff = 0): void {
    this.n = n;
    for (let i = 0; i < n; i++) {
      this.x[i] = x[i];
      this.y[i] = y[i * yStride + yOff];
    }
    const X = this.x;
    const Y = this.y;
    const M = this.m;
    if (n < 3) {
      M.fill(0, 0, n);
      return;
    }
    // tridiagonal system for the interior second derivatives (natural: M0 = Mn-1 = 0)
    const a = this.a, b = this.b, c = this.c, d = this.d;
    for (let i = 1; i < n - 1; i++) {
      const h0 = X[i] - X[i - 1];
      const h1 = X[i + 1] - X[i];
      a[i] = h0;
      b[i] = 2 * (h0 + h1);
      c[i] = h1;
      d[i] = 6 * ((Y[i + 1] - Y[i]) / h1 - (Y[i] - Y[i - 1]) / h0);
    }
    for (let i = 2; i < n - 1; i++) {
      const w = a[i] / b[i - 1];
      b[i] -= w * c[i - 1];
      d[i] -= w * d[i - 1];
    }
    M[0] = 0;
    M[n - 1] = 0;
    M[n - 2] = d[n - 2] / b[n - 2];
    for (let i = n - 3; i >= 1; i--) M[i] = (d[i] - c[i] * M[i + 1]) / b[i];
  }

  /** value at q (clamped to the data range); `hint` is an in/out segment index for sequential queries */
  eval(q: number, hint: { i: number }): number {
    const n = this.n;
    const X = this.x;
    let i = hint.i;
    if (q <= X[0]) i = 0;
    else if (q >= X[n - 1]) i = n - 2;
    else {
      while (i > 0 && X[i] > q) i--;
      while (i < n - 2 && X[i + 1] < q) i++;
    }
    hint.i = i;
    const h = X[i + 1] - X[i];
    const qq = Math.min(Math.max(q, X[0]), X[n - 1]);
    const A = (X[i + 1] - qq) / h;
    const B = (qq - X[i]) / h;
    return (
      A * this.y[i] + B * this.y[i + 1] + (((A * A * A - A) * this.m[i] + (B * B * B - B) * this.m[i + 1]) * h * h) / 6
    );
  }
}
