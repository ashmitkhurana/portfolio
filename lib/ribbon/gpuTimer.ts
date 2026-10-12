/**
 * Tiny GPU timer around EXT_disjoint_timer_query_webgl2 (HUD diagnostics).
 * Results arrive a few frames late; `ms` is an exponential moving average.
 */
export class GpuTimer {
  private ext: {
    TIME_ELAPSED_EXT: number;
    GPU_DISJOINT_EXT: number;
  } | null;
  private gl: WebGL2RenderingContext;
  private pending: WebGLQuery[] = [];
  private active: WebGLQuery | null = null;
  ms = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  }

  get supported(): boolean {
    return this.ext !== null;
  }

  begin(): void {
    if (!this.ext || this.active || this.pending.length > 4) return;
    const q = this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }

  end(): void {
    if (!this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  poll(): void {
    if (!this.ext) return;
    const gl = this.gl;
    while (this.pending.length) {
      const q = this.pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      this.pending.shift();
      const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
      if (!disjoint) {
        const ms = (gl.getQueryParameter(q, gl.QUERY_RESULT) as number) / 1e6;
        this.ms = this.ms === 0 ? ms : this.ms + (ms - this.ms) * 0.1;
      }
      gl.deleteQuery(q);
    }
  }

  dispose(): void {
    for (const q of this.pending) this.gl.deleteQuery(q);
    this.pending.length = 0;
  }
}
