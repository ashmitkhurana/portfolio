/**
 * The optimisation session: stages of CMA-ES over the FitState, restarts,
 * persistence hooks and the final images / metrics. Runs in the page
 * (`/lab/fit`), driven by `scripts/fit/run.mjs` through `window.__fit`.
 */
import { CMAES, mulberry32 } from "./cmaes";
import { FitData } from "./data";
import { Evaluator, WEIGHTS, WEIGHTS_S1, type LossWeights, type Terms } from "./loss";
import {
  DIMS,
  activeDims,
  setFovLock,
  cloneState,
  getDim,
  setDim,
  type FitState,
  type StageDims,
} from "./params";
import { FitRenderer } from "./render";

export interface StageCfg {
  name: string;
  dims: StageDims;
  /** render scale of the fit frame (1/4, 1/2, 1) */
  scale: number;
  weights: LossWeights;
  maxGens: number;
  /** stop after this many generations without a (1e-4) improvement */
  patience: number;
  popsize?: number;
  sigma: number;
}

export const STAGES: StageCfg[] = [
  { name: "s1-xy", dims: "xy", scale: 0.25, weights: WEIGHTS_S1, maxGens: 220, patience: 60, sigma: 0.5 },
  { name: "s2-z-twist-fov", dims: "xyz-tw-fov", scale: 0.25, weights: WEIGHTS, maxGens: 700, patience: 160, sigma: 0.4 },
  { name: "s3-width-fold", dims: "all", scale: 0.25, weights: WEIGHTS, maxGens: 700, patience: 160, sigma: 0.3 },
  { name: "s4-half-res", dims: "all", scale: 0.5, weights: WEIGHTS, maxGens: 250, patience: 60, sigma: 0.15 },
];
export const FINAL_STAGE: StageCfg = {
  name: "s5-full-res",
  dims: "all",
  scale: 1,
  weights: WEIGHTS,
  maxGens: 80,
  patience: 30,
  sigma: 0.06,
};

export interface Snapshot {
  state: FitState;
  terms: Terms;
  stage: string;
  scale: number;
  gen: number;
  evals: number;
  restart: number;
  seconds: number;
}

export interface RunConfig {
  /** wall-clock budget for the whole run (s) */
  budget: number;
  seed: number;
  /** IoU the restarts try to reach */
  target: number;
  /** skip the stages before this one (resume) */
  fromStage?: string;
  maxRestarts: number;
  /** fix the camera fov (degrees) instead of fitting it */
  fovLock?: number | null;
  /** stage list override (defaults to STAGES) */
  stages?: StageCfg[];
}

export type GenHook = (snap: Snapshot, improved: boolean, info: { sigma: number; popsize: number; condition: number }) => void | Promise<void>;

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export class FitSession {
  data!: FitData;
  rend!: FitRenderer;
  ev!: Evaluator;
  best!: FitState;
  bestTerms!: Terms;
  evals = 0;
  stopFlag = false;
  private t0 = 0;
  private restart = 0;
  onGen: GenHook | null = null;
  /** called whenever the global best (after a full pass) improves */
  onBest: ((b: { state: FitState; terms: Terms; restart: number }) => void | Promise<void>) | null = null;
  log: (msg: string) => void = (m) => console.log(m);

  async init(canvas?: HTMLCanvasElement, rings?: number): Promise<void> {
    this.data = await FitData.load();
    this.rend = new FitRenderer({ canvas, rings });
    this.ev = new Evaluator(this.data, this.rend);
  }

  private snap(stage: string, scale: number, gen: number, state: FitState, terms: Terms): Snapshot {
    return {
      state: cloneState(state),
      terms,
      stage,
      scale,
      gen,
      evals: this.evals,
      restart: this.restart,
      seconds: (performance.now() - this.t0) / 1000,
    };
  }

  evaluate(state: FitState, scale: number, w: LossWeights): Terms {
    this.evals++;
    const s = cloneState(state);
    return this.ev.evaluate(s, scale, w);
  }

  /** one CMA-ES stage starting from `start`; returns the best state found (at this stage's scale / weights) */
  async runStage(cfg: StageCfg, start: FitState, seed: number, popScale = 1, sigmaScale = 1): Promise<{ state: FitState; terms: Terms }> {
    const act = activeDims(cfg.dims);
    const center = cloneState(start);
    let bestState = cloneState(start);
    let bestTerms = this.evaluate(bestState, cfg.scale, cfg.weights);
    const n = act.length;
    const lambda = Math.max(8, Math.round((4 + Math.floor(3 * Math.log(n))) * 1.4 * popScale));
    const cma = new CMAES(new Float64Array(n), cfg.sigma * sigmaScale, { popsize: cfg.popsize ?? lambda, seed });
    let sinceImp = 0;
    const tmp = cloneState(start);
    for (let g = 0; g < cfg.maxGens && !this.stopFlag; g++) {
      const xs = cma.ask();
      const fit = new Float64Array(xs.length);
      let genBest = Infinity;
      let genBestTerms: Terms | null = null;
      let genBestState: FitState | null = null;
      for (let k = 0; k < xs.length; k++) {
        const x = xs[k];
        // decode into a copy of the stage's centre state
        for (let i = 0; i < n; i++) {
          const d = DIMS[act[i]];
          setDim(tmp, d, getDim(center, d) + x[i] * d.scale);
        }
        const terms = this.ev.evaluate(tmp, cfg.scale, cfg.weights); // clamps `tmp` in place
        this.evals++;
        // write the repaired point back so CMA sees what was evaluated
        for (let i = 0; i < n; i++) {
          const d = DIMS[act[i]];
          x[i] = (getDim(tmp, d) - getDim(center, d)) / d.scale;
        }
        fit[k] = terms.total;
        if (terms.total < genBest) {
          genBest = terms.total;
          genBestTerms = terms;
          genBestState = cloneState(tmp);
        }
      }
      cma.tell(xs, fit);
      let improved = false;
      if (genBestTerms && genBestState && genBest < bestTerms.total - 1e-4) {
        bestTerms = genBestTerms;
        bestState = genBestState;
        sinceImp = 0;
        improved = true;
      } else sinceImp++;
      if (this.onGen) {
        await this.onGen(this.snap(cfg.name, cfg.scale, g, bestState, bestTerms), improved, {
          sigma: cma.sigma,
          popsize: cma.lambda,
          condition: cma.condition,
        });
      }
      await tick();
      if (sinceImp >= cfg.patience) break;
      if (cma.maxAxis < 2e-3) break;
    }
    return { state: bestState, terms: bestTerms };
  }

  /** the full schedule: stages, then restarts until the IoU target / budget */
  async run(start: FitState, cfg: RunConfig): Promise<{ state: FitState; terms: Terms }> {
    this.t0 = performance.now();
    this.stopFlag = false;
    setFovLock(cfg.fovLock ?? null);
    if (cfg.fovLock != null) start = { ...cloneState(start), fov: cfg.fovLock };
    const rnd = mulberry32(cfg.seed);
    const stages = cfg.stages ?? STAGES;
    const startIdx = cfg.fromStage ? Math.max(0, stages.findIndex((s) => s.name === cfg.fromStage)) : 0;
    let cur = cloneState(start);
    let globalBest: { state: FitState; terms: Terms } | null = null;
    const elapsed = () => (performance.now() - this.t0) / 1000;

    const pass = async (from: number, popScale: number, sigmaScale: number, seed: number) => {
      let s = cur;
      let res: { state: FitState; terms: Terms } = { state: s, terms: this.evaluate(s, 0.25, WEIGHTS) };
      for (let i = from; i < stages.length && !this.stopFlag; i++) {
        if (elapsed() > cfg.budget) break;
        res = await this.runStage(stages[i], s, seed + i, popScale, i === from ? sigmaScale : 1);
        s = res.state;
        this.log(
          `[${stages[i].name}] iou ${res.terms.iou.toFixed(4)} chamfer ${res.terms.chamfer.toFixed(3)} total ${res.terms.total.toFixed(4)} evals ${this.evals} t ${elapsed().toFixed(0)}s`,
        );
      }
      return res;
    };

    let res = await pass(startIdx, 1, 1, cfg.seed);
    globalBest = { state: cloneState(res.state), terms: res.terms };
    await this.onBest?.({ ...globalBest, restart: 0 });
    // restarts: IPOP-style (bigger population, wider step) or a structured perturbation of the best
    while (
      !this.stopFlag &&
      globalBest.terms.iou < cfg.target &&
      this.restart < cfg.maxRestarts &&
      elapsed() < cfg.budget
    ) {
      this.restart++;
      const base = cloneState(globalBest.state);
      const rs = mulberry32(cfg.seed * 7919 + this.restart * 104729);
      const j = (a: number) => (rs() - 0.5) * 2 * a;
      // structured perturbations of the best (different seed each): xy / depth + roll / camera + width + hairpin radii
      const mode = this.restart % 3;
      for (let i = 0; i < base.x.length; i++) {
        base.x[i] += j(mode === 0 ? 30 : 14);
        base.y[i] += j(mode === 0 ? 30 : 14);
        base.z[i] += j(mode === 1 ? 110 : 50);
        base.twist[i] += j(mode === 1 ? 0.9 : 0.35);
      }
      if (mode === 2) {
        base.fov = Math.min(36, Math.max(22, base.fov + j(4)));
        base.width *= 1 + j(0.08);
        for (let h = 0; h < base.hairR.length; h++) base.hairR[h] = Math.min(2, Math.max(0.4, base.hairR[h] + j(0.5)));
        base.foldR = Math.min(1.6, Math.max(0.55, base.foldR + j(0.3)));
      }
      cur = base;
      res = await pass(0, 1.5, 1, cfg.seed + 100 * this.restart);
      this.log(`restart ${this.restart} (mode ${mode}): iou ${res.terms.iou.toFixed(4)} total ${res.terms.total.toFixed(4)}`);
      if (res.terms.total < globalBest.terms.total) {
        globalBest = { state: cloneState(res.state), terms: res.terms };
        await this.onBest?.({ ...globalBest, restart: this.restart });
      }
    }
    // refine at the final resolutions
    this.best = globalBest.state;
    for (const st of [stages[stages.length - 1], FINAL_STAGE]) {
      if (this.stopFlag) break;
      const r = await this.runStage(st, this.best, cfg.seed + 999, 1, 1);
      if (r.terms.total <= this.evaluate(this.best, st.scale, st.weights).total) this.best = r.state;
      this.log(`[final ${st.name}] iou ${r.terms.iou.toFixed(4)}`);
    }
    this.bestTerms = this.evaluate(this.best, 1, WEIGHTS);
    return { state: this.best, terms: this.bestTerms };
  }
}
