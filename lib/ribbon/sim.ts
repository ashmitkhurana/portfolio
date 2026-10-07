/**
 * RibbonSim: per-control-point spring toward a target pose, plus layered
 * "idle life" (curl-noise displacement + twist wobble) applied to the OUTPUT
 * only, so it never fights the springs. Framework-agnostic.
 *
 * Phase 3 extends this with scroll-driven poses and richer follow-through.
 */
import { curl3, fbm3, snoise3 } from "./noise";
import { rlog } from "./debugLog";
import type { RuledData } from "./ruled";
import { DEFAULT_SLIDE_PARAMS, SlideMotion, type SlideParams } from "./slide";

/**
 * `frozen`: output = target pose, exactly (no springs, no noise, no idle); `live`: springs + idle life;
 * `slide`: the ruled pose is a fixed path and the ribbon a window sliding along it (see slide.ts)
 */
export type SimMode = "frozen" | "live" | "slide";

export interface SimParams {
  /** see SimMode */
  mode: SimMode;
  /** spring stiffness (1/s^2), e.g. 38 */
  stiffness: number;
  /** damping ratio, 1 = critical */
  damping: number;
  /** 0..1: stiffness falloff towards the tail (follow-through) */
  followLag: number;
  /** px */
  idleAmplitude: number;
  /** noise time scale (cycles/sec-ish) */
  idleSpeed: number;
  /** noise frequency per px */
  idleScale: number;
  /** 0..1 mix between curl (swirly) and plain fbm displacement */
  idleCurl: number;
  /** radians */
  twistWobble: number;
  /** 0..1 weight of the small, quicker detail layer relative to the large layer (0 = none: calm) */
  idleDetail: number;
  /** spatial frequency of the twist wobble along the ribbon (per control point) */
  twistWobbleScale: number;
  /** `slide` mode settings */
  slide: SlideParams;
}

/** Idle presets (lab: `idle.calm`, `idle.lively`). Calm is the default. */
export const IDLE_PRESETS: Record<string, Pick<SimParams, "idleAmplitude" | "idleSpeed" | "idleScale" | "idleCurl" | "twistWobble" | "idleDetail" | "twistWobbleScale">> = {
  // a gentle breath / drift only: ~60% less travel, slower, no twist churn
  "idle.calm": {
    idleAmplitude: 10,
    idleSpeed: 0.1,
    idleScale: 0.0013,
    idleCurl: 1,
    twistWobble: 0.025,
    idleDetail: 0.08,
    twistWobbleScale: 0.04,
  },
  // the previous (Phase 1) idle
  "idle.lively": {
    idleAmplitude: 26,
    idleSpeed: 0.22,
    idleScale: 0.0016,
    idleCurl: 1,
    twistWobble: 0.18,
    idleDetail: 0.25,
    twistWobbleScale: 0.13,
  },
};

export const DEFAULT_SIM_PARAMS: SimParams = {
  mode: "live",
  stiffness: 38,
  damping: 1,
  followLag: 0.45,
  ...IDLE_PRESETS["idle.calm"],
  slide: { ...DEFAULT_SLIDE_PARAMS },
};

export interface PoseInput {
  /** xyz triples (world px) or an array of {x,y,z} */
  points: ArrayLike<number> | ReadonlyArray<{ x: number; y: number; z: number }>;
  twists?: ArrayLike<number>;
  widths?: ArrayLike<number>;
}

const MAX_DT = 1 / 30;
const SUBSTEPS = 4;

export class RibbonSim {
  readonly count: number;
  params: SimParams = { ...DEFAULT_SIM_PARAMS };
  /** 0..1 multiplier for idle motion (prefers-reduced-motion lowers it) */
  idleScale01 = 1;
  /** seconds of simulated time */
  time = 0;
  private lastMode: SimMode = "live";

  /** frozen: the output is the target pose, nothing moves (shorthand for `params.mode`) */
  get mode(): SimMode {
    return this.params.mode;
  }
  set mode(m: SimMode) {
    this.params = { ...this.params, mode: m };
    this.noteMode();
  }

  /** a mode change snaps the springs to the target so `live` never starts from a stale state */
  private noteMode(): void {
    if (this.params.mode === this.lastMode) return;
    rlog("sim-mode", { from: this.lastMode, to: this.params.mode });
    this.lastMode = this.params.mode;
    this.snapToTarget();
    if (this.params.mode === "slide" && this.slide.ready) this.slide.restart();
  }

  // targets
  readonly targetPos: Float32Array;
  readonly targetTwist: Float32Array;
  readonly targetWidth: Float32Array;
  // spring state
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly twist: Float32Array;
  private readonly twistVel: Float32Array;
  private readonly width: Float32Array;
  private readonly widthVel: Float32Array;
  // outputs consumed by the geometry
  readonly outPos: Float32Array;
  readonly outTwist: Float32Array;
  readonly outWidth: Float32Array;
  /** ruled pose (bx, by, bz, half width per control point + face sign); null for ordinary poses. Not simulated: carried as authored. */
  ruled: RuledData | null = null;
  /** slide mode: the window motion (always allocated; idle unless mode === "slide") */
  readonly slide: SlideMotion;
  /** css px of scroll, fed by the adapter every frame (slide mode) */
  slideScrollY = 0;
  private slideOut: RuledData | null = null;
  private slideDirty = true;
  /** the ruled data the geometry should use: the slide window's rings in slide mode, else the pose's */
  get ruledOut(): RuledData | null {
    if (this.params.mode === "slide" && this.ruled && this.slide.ready && this.slideOut) return this.slideOut;
    return this.ruled;
  }

  private readonly scratch = new Float32Array(3);
  private readonly scratch2 = new Float32Array(3);

  constructor(count = 48) {
    this.count = count;
    const n = count;
    this.targetPos = new Float32Array(n * 3);
    this.targetTwist = new Float32Array(n);
    this.targetWidth = new Float32Array(n).fill(1);
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.twist = new Float32Array(n);
    this.twistVel = new Float32Array(n);
    this.width = new Float32Array(n).fill(1);
    this.widthVel = new Float32Array(n);
    this.outPos = new Float32Array(n * 3);
    this.outTwist = new Float32Array(n);
    this.outWidth = new Float32Array(n).fill(1);
    this.slide = new SlideMotion(n);
  }

  /**
   * Set the pose to spring toward. If the input point count differs from
   * `count` it is resampled by arc length (linear). `snap` jumps immediately.
   */
  setRuled(r: RuledData | null | undefined): void {
    this.ruled = r ?? null;
    this.slideDirty = true;
  }

  setTargetPose(
    points: PoseInput["points"],
    twists?: ArrayLike<number>,
    widths?: ArrayLike<number>,
    snap = false,
  ): void {
    const n = this.count;
    const src = flatten(points);
    const m = src.length / 3;
    if (m === n) {
      this.targetPos.set(src);
      for (let i = 0; i < n; i++) {
        this.targetTwist[i] = twists ? twists[i] : 0;
        this.targetWidth[i] = widths ? widths[i] : 1;
      }
    } else {
      this.resample(src, m, twists, widths);
    }
    // a frozen sim has no springs to travel along: the target IS the pose
    this.slideDirty = true;
    if (snap || this.params.mode === "frozen") this.snapToTarget();
  }

  /** (re)build the slide path from the current pose when needed */
  private prepareSlide(): void {
    if (this.params.mode !== "slide") return;
    if (this.slideDirty) {
      this.slideDirty = false;
      this.slide.params = this.params.slide;
      if (this.ruled && this.ruled.data.length >= this.count * 4 && this.slide.setPath(this.targetPos, this.ruled.data, this.count)) {
        this.slideOut = { data: this.slide.outRuled, sign: this.ruled.sign };
      } else {
        this.slideOut = null;
        this.slide.ready = false;
      }
    }
    this.slide.params = this.params.slide;
  }

  private stepSlide(dt: number): void {
    this.prepareSlide();
    if (!this.slide.ready) {
      // no ruled pose to slide along: the pose as authored
      this.pos.set(this.targetPos);
      this.twist.set(this.targetTwist);
      this.width.set(this.targetWidth);
      this.compose();
      return;
    }
    this.time += Math.min(Math.max(dt, 0), 0.1);
    this.slide.step(dt, this.slideScrollY, this.idleScale01 === 0);
    this.pos.set(this.slide.outPos);
    this.twist.set(this.targetTwist);
    this.width.set(this.targetWidth);
    this.compose();
  }

  snapToTarget(): void {
    if (this.params.mode === "slide") {
      // a (re)start of the slide: the intro begins from the off-screen end
      this.slideDirty = true;
      this.prepareSlide();
      if (this.slide.ready) {
        this.slide.step(0, this.slideScrollY, this.idleScale01 === 0);
        this.pos.set(this.slide.outPos);
        this.vel.fill(0);
        this.twist.set(this.targetTwist);
        this.width.set(this.targetWidth);
        this.compose();
        return;
      }
    }
    this.pos.set(this.targetPos);
    this.vel.fill(0);
    this.twist.set(this.targetTwist);
    this.twistVel.fill(0);
    this.width.set(this.targetWidth);
    this.widthVel.fill(0);
    this.compose();
  }

  step(dtRaw: number): void {
    this.noteMode();
    if (this.params.mode === "frozen") {
      // exactly the target pose, every frame: no integration, no idle, no clock
      this.snapToTarget();
      return;
    }
    if (this.params.mode === "slide") {
      this.stepSlide(dtRaw);
      return;
    }
    const dt = Math.min(Math.max(dtRaw, 0), MAX_DT);
    this.time += dt;
    const n = this.count;
    const p = this.params;
    const h = dt / SUBSTEPS;
    const pos = this.pos;
    const vel = this.vel;
    const tp = this.targetPos;

    for (let s = 0; s < SUBSTEPS; s++) {
      for (let i = 0; i < n; i++) {
        const u = n > 1 ? i / (n - 1) : 0;
        const k = p.stiffness * (1 - p.followLag * u);
        const c = 2 * Math.sqrt(k) * p.damping;
        const o = i * 3;
        for (let a = 0; a < 3; a++) {
          const acc = k * (tp[o + a] - pos[o + a]) - c * vel[o + a];
          vel[o + a] += acc * h;
          pos[o + a] += vel[o + a] * h;
        }
        {
          const acc =
            k * (this.targetTwist[i] - this.twist[i]) - c * this.twistVel[i];
          this.twistVel[i] += acc * h;
          this.twist[i] += this.twistVel[i] * h;
        }
        {
          const acc =
            k * (this.targetWidth[i] - this.width[i]) - c * this.widthVel[i];
          this.widthVel[i] += acc * h;
          this.width[i] += this.widthVel[i] * h;
        }
      }
    }
    this.compose();
  }

  /** spring state + idle layers -> output arrays */
  private compose(): void {
    const n = this.count;
    const p = this.params;
    const live = p.mode === "live";
    const amp = live ? p.idleAmplitude * this.idleScale01 : 0;
    const wob = live ? p.twistWobble * this.idleScale01 : 0;
    const t = this.time * p.idleSpeed;
    const a = this.scratch;
    const b = this.scratch2;
    const sc = p.idleScale;

    for (let i = 0; i < n; i++) {
      const o = i * 3;
      const x = this.pos[o];
      const y = this.pos[o + 1];
      const z = this.pos[o + 2];
      const u = n > 1 ? i / (n - 1) : 0;
      const env = 0.45 + 0.55 * Math.sin(Math.PI * u);

      let dx = 0;
      let dy = 0;
      let dz = 0;
      if (amp > 1e-4) {
        // layer 1: large, slow
        if (p.idleCurl > 0) {
          curl3(x * sc, y * sc, z * sc + t, a, 0);
        } else {
          a[0] = a[1] = a[2] = 0;
        }
        const f = 1 - p.idleCurl;
        if (f > 0) {
          const q = sc * 0.8;
          a[0] += f * fbm3(x * q + t, y * q, z * q);
          a[1] += f * fbm3(x * q, y * q + t, z * q + 5.2);
          a[2] += f * fbm3(x * q, y * q + 9.1, z * q + t);
        }
        // layer 2: small, quicker detail (idleDetail x the large layer; ~0 when calm)
        curl3(x * sc * 2.4 + 3.7, y * sc * 2.4, z * sc * 2.4 - t * 1.7, b, 0);
        dx = a[0] + p.idleDetail * b[0];
        dy = a[1] + p.idleDetail * b[1];
        dz = a[2] + p.idleDetail * b[2];
        const e = amp * env;
        dx *= e;
        dy *= e;
        dz *= e * 1.35; // a bit more depth motion so the weave breathes
      }
      this.outPos[o] = x + dx;
      this.outPos[o + 1] = y + dy;
      this.outPos[o + 2] = z + dz;
      this.outTwist[i] =
        this.twist[i] + (wob > 1e-5 ? wob * snoise3(i * p.twistWobbleScale, t * 1.4, 3.3) : 0);
      this.outWidth[i] = this.width[i];
    }
  }

  private resample(
    src: Float32Array,
    m: number,
    twists?: ArrayLike<number>,
    widths?: ArrayLike<number>,
  ): void {
    const n = this.count;
    // cumulative arc length of the source polyline
    const cum = new Float32Array(m);
    for (let i = 1; i < m; i++) {
      const dx = src[i * 3] - src[(i - 1) * 3];
      const dy = src[i * 3 + 1] - src[(i - 1) * 3 + 1];
      const dz = src[i * 3 + 2] - src[(i - 1) * 3 + 2];
      cum[i] = cum[i - 1] + Math.hypot(dx, dy, dz);
    }
    const total = cum[m - 1] || 1;
    let j = 0;
    for (let i = 0; i < n; i++) {
      const s = (i / (n - 1)) * total;
      while (j < m - 2 && cum[j + 1] < s) j++;
      const span = cum[j + 1] - cum[j] || 1;
      const f = Math.min(Math.max((s - cum[j]) / span, 0), 1);
      for (let a = 0; a < 3; a++) {
        this.targetPos[i * 3 + a] =
          src[j * 3 + a] * (1 - f) + src[(j + 1) * 3 + a] * f;
      }
      this.targetTwist[i] = twists
        ? twists[j] * (1 - f) + twists[j + 1] * f
        : 0;
      this.targetWidth[i] = widths ? widths[j] * (1 - f) + widths[j + 1] * f : 1;
    }
  }
}

function flatten(points: PoseInput["points"]): Float32Array {
  const first = (points as ArrayLike<unknown>)[0];
  if (typeof first === "number") {
    return Float32Array.from(points as ArrayLike<number>);
  }
  const list = points as ReadonlyArray<{ x: number; y: number; z: number }>;
  const out = new Float32Array(list.length * 3);
  for (let i = 0; i < list.length; i++) {
    out[i * 3] = list[i].x;
    out[i * 3 + 1] = list[i].y;
    out[i * 3 + 2] = list[i].z;
  }
  return out;
}
