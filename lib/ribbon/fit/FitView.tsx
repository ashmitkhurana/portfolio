"use client";

/**
 * /lab/fit: the live view of the pose fit (mockup at 50 %, our silhouette over it, IoU
 * and the per-term losses) and the `window.__fit` API that scripts/fit/run.mjs drives.
 */
import { useEffect, useRef } from "react";
import { FitSession, STAGES, type RunConfig, type Snapshot } from "./fit";
import { cloneState, initialState, migrateState, toPosePoints, type FitState } from "./params";
import type { PosePoint } from "../poses/types";
import { imagesFromVis, makeImages, materialRender, mismatchRegions, parity, visibleMask, type Parity } from "./report";
import { S2c, cloneS2c, zeroState, type S2cInput, type S2cState } from "./s2c";
import { WEIGHTS, type Terms } from "./loss";

export interface FitApi {
  ready: Promise<void>;
  session: FitSession;
  run(state: FitState | null, cfg: Partial<RunConfig>): Promise<{ state: FitState; terms: Terms }>;
  evalState(state: FitState, scale: number): Terms;
  finalize(state: FitState): Promise<{
    terms: Terms;
    images: { silhouette: string; overlay: string };
    regions: ReturnType<typeof mismatchRegions>;
    posePoints: PosePoint[];
    state: FitState;
  }>;
  /** the engine with the real material / site defaults at the mockup framing, text of the mockup composited where the ribbon is behind it */
  material(state: FitState): Promise<string>;
  parity(state: FitState): Promise<Parity>;
  benchmark(state: FitState | null, n: number): { ms: number; evalsPerSec: number };
  stop(): void;
  initial(): FitState;
}

declare global {
  interface Window {
    __fit?: FitApi;
    __fitPersist?: (json: string) => Promise<void> | void;
    /** S2c direct reconstruction + refinement (scripts/s2c/run.mjs drives it) */
    __s2c?: {
      ready: Promise<void>;
      load(input: S2cInput): void;
      calibrate(): ReturnType<S2c["calibrate"]>;
      lockCentreline(iters?: number): ReturnType<S2c["lockCentreline"]>;
      refineLocal(passes?: number, stepPx?: number, stepZ?: number, maxOff?: number): ReturnType<S2c["refineLocal"]>;
      smoothTwist(sigma: number): void;
      parityScan(spots: number[]): ReturnType<S2c["parityScan"]>;
      controlAt(arc: number): number;
      classMap(state: S2cState): string;
      setDarkW(w: number): void;
      fixKink(maxIter?: number): ReturnType<S2c["fixKink"]>;
      calibrateReal(): ReturnType<S2c["calibrateReal"]>;
      calibrateSilhouette(p?: number, span?: number, steps?: number, cont?: number, radius?: number, pinchW?: number, globalPen?: boolean): ReturnType<S2c["calibrateSilhouette"]>;
      zero(): S2cState;
      evaluate(state: S2cState, scale: number): ReturnType<S2c["evaluate"]>;
      refine(state: S2cState, cfg: { stages: { scale: number; gens: number; sigma: number }[]; seed?: number }): ReturnType<S2c["refine"]>;
      pose(state: S2cState): ReturnType<S2c["pose"]>;
      twist(): number[];
      probeTwist(th: number): ReturnType<S2c["probeTwist"]>;
      images(state: S2cState): Promise<{ silhouette: string; overlay: string; regions: ReturnType<typeof mismatchRegions> }>;
      stop(): void;
    };
  }
}

const MOCKUP = "/lab/ref/hero-desktop.webp";

export function FitView() {
  const hud = useRef<HTMLPreElement>(null);
  const over = useRef<HTMLCanvasElement>(null);
  const bg = useRef<HTMLCanvasElement>(null);
  const gl = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let dead = false;
    const session = new FitSession();
    let lastDraw = 0;
    const draw = (state: FitState) => {
      const c = over.current;
      if (!c) return;
      session.ev.evaluate(cloneState(state), 0.5, WEIGHTS);
      const vis = visibleMask(session.rend, session.data);
      // visibleMask renders at full res; downsample by 2 for the 50 % view
      const { W, H } = session.data;
      const w = c.width;
      const h = c.height;
      const ctx = c.getContext("2d") as CanvasRenderingContext2D;
      const img = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * 2 * W + x * 2;
          if (session.data.excl[i]) continue;
          const a = vis[i];
          const b = session.data.ribbon[i];
          const o = (y * w + x) * 4;
          if (a && b) {
            img.data[o + 1] = 255;
            img.data[o + 3] = 60;
          } else if (a) {
            img.data[o] = 255;
            img.data[o + 3] = 170;
          } else if (b) {
            img.data[o + 2] = 255;
            img.data[o + 1] = 90;
            img.data[o + 3] = 170;
          }
        }
      }
      void H;
      ctx.putImageData(img, 0, 0);
    };
    const show = (s: Snapshot, info?: { sigma: number; popsize: number; condition: number }) => {
      const t = s.terms;
      if (hud.current)
        hud.current.textContent =
          `stage ${s.stage}  gen ${s.gen}  evals ${s.evals}  restart ${s.restart}  ${s.seconds.toFixed(0)}s\n` +
          `IoU ${t.iou.toFixed(4)}   total ${t.total.toFixed(4)}\n` +
          `chamfer ${t.chamfer.toFixed(3)}  smooth ${t.smooth.toFixed(3)} (bend ${t.bend.toFixed(2)} hard ${t.hardBend.toFixed(3)} twist ${t.twistRate.toFixed(3)})\n` +
          `self ${t.self.toFixed(3)}  cross ${t.cross.toFixed(3)}  darkIoU ${t.darkIoU.toFixed(3)}  corner xor ${t.cornerXor.toFixed(4)} arc ${t.cornerArc.toFixed(2)}  kink ${t.kink.toFixed(1)}  bounds ${t.bounds.toFixed(3)}\n` +
          `crossing: leg>bar ${t.crossing.legOverCrossbar}  K ${t.crossing.kJunctionOrder}  bar/text ${t.crossing.crossbarVsText}  leftLeg<T ${t.crossing.leftLegBehindT}\n` +
          `width ${s.state.width.toFixed(1)}  fov ${s.state.fov.toFixed(1)}  foldR ${s.state.foldR.toFixed(2)}  hairR ${s.state.hairR.map((v) => v.toFixed(2)).join("/")}` +
          (info ? `\nsigma ${info.sigma.toFixed(3)}  pop ${info.popsize}  cond ${info.condition.toExponential(1)}` : "");
    };

    const api: FitApi = {
      session,
      ready: (async () => {
        const c = bg.current;
        if (c) {
          const img = new Image();
          img.src = MOCKUP;
          await img.decode();
          (c.getContext("2d") as CanvasRenderingContext2D).drawImage(img, 0, 0, c.width, c.height);
        }
        await session.init(gl.current ?? undefined);
        if (dead) return;
        session.onGen = async (snap, improved, info) => {
          show(snap, info);
          const now = performance.now();
          if (now - lastDraw > 900) {
            lastDraw = now;
            draw(snap.state);
          }
          if (window.__fitPersist) await window.__fitPersist(JSON.stringify({ snap, improved, info }));
        };
        session.onBest = async (b) => {
          if (window.__fitPersist) await window.__fitPersist(JSON.stringify({ best: b }));
        };
        session.log = (m) => {
          console.log(m);
          if (window.__fitPersist) void window.__fitPersist(JSON.stringify({ log: m }));
        };
        const s0 = initialState();
        const t = session.evaluate(s0, 0.25, WEIGHTS);
        show({ state: s0, terms: t, stage: "init", scale: 0.25, gen: 0, evals: 1, restart: 0, seconds: 0 });
        draw(s0);
      })(),
      async run(state, cfg) {
        await api.ready;
        const full: RunConfig = { budget: 3600, seed: 1, target: 0.85, maxRestarts: 6, stages: STAGES, ...cfg };
        const r = await session.run(state ? migrateState(state) : initialState(), full);
        draw(r.state);
        return r;
      },
      evalState(state, scale) {
        return session.evaluate(migrateState(state), scale, WEIGHTS);
      },
      async finalize(inState) {
        await api.ready;
        const state = migrateState(inState);
        const terms = session.evaluate(state, 1, WEIGHTS);
        const images = await makeImages(session.rend, session.data, state, MOCKUP);
        session.ev.evaluate(cloneState(state), 1, WEIGHTS);
        const vis = visibleMask(session.rend, session.data);
        return { terms, images, regions: mismatchRegions(vis, session.data), posePoints: toPosePoints(state), state };
      },
      async material(state) {
        await api.ready;
        return materialRender(session.rend, session.data, migrateState(state));
      },
      async parity(state) {
        await api.ready;
        return parity(session.rend, migrateState(state));
      },
      benchmark(state, n) {
        const s = state ? migrateState(state) : initialState();
        const t0 = performance.now();
        for (let i = 0; i < n; i++) session.evaluate(s, 0.25, WEIGHTS);
        const ms = performance.now() - t0;
        return { ms: ms / n, evalsPerSec: (n / ms) * 1000 };
      },
      stop() {
        session.stopFlag = true;
      },
      initial() {
        return initialState();
      },
    };
    window.__fit = api;
    let s2c: S2c | null = null;
    window.__s2c = {
      ready: api.ready.then(() => {
        s2c = new S2c(session.rend, session.data);
        s2c.log = (m) => {
          console.log(m);
          if (window.__fitPersist) void window.__fitPersist(JSON.stringify({ log: m }));
        };
      }),
      load: (i) => (s2c as S2c).load(i),
      calibrate: () => (s2c as S2c).calibrate(),
      lockCentreline: (n) => (s2c as S2c).lockCentreline(n),
      refineLocal: (a, b, c, d) => (s2c as S2c).refineLocal(a, b, c, d),
      setDarkW: (w) => ((s2c as S2c).darkW = w),
      classMap: (st) => {
        const a = (s2c as S2c).classMap(st);
        let bin = "";
        for (let i = 0; i < a.length; i += 32768) bin += String.fromCharCode(...a.subarray(i, i + 32768));
        return btoa(bin);
      },
      parityScan: (sp) => (s2c as S2c).parityScan(sp),
      controlAt: (arc) => {
        const kn = (s2c as S2c).input.knots;
        let b = 0;
        for (let i = 1; i < kn.length; i++) if (Math.abs(kn[i] - arc) < Math.abs(kn[b] - arc)) b = i;
        return b;
      },
      smoothTwist: (sg) => (s2c as S2c).smoothTwist(sg),
      fixKink: (n) => (s2c as S2c).fixKink(n),
      calibrateReal: () => (s2c as S2c).calibrateReal(),
      calibrateSilhouette: (p, sp, st, c, r, pw, gp) => (s2c as S2c).calibrateSilhouette(p, sp, st, c, r, pw, gp),
      zero: () => zeroState((s2c as S2c).input),
      evaluate: (st, sc) => (s2c as S2c).evaluate(st, sc),
      refine: (st, cfg) => (s2c as S2c).refine(cloneS2c(st), cfg),
      pose: (st) => (s2c as S2c).pose(st),
      twist: () => [...(s2c as S2c).twist0],
      probeTwist: (th) => (s2c as S2c).probeTwist(th),
      images: async (st) => {
        const c = s2c as S2c;
        const vis = c.visibleMask(st);
        const im = await imagesFromVis(vis, session.data, MOCKUP);
        return { ...im, regions: mismatchRegions(vis, session.data) };
      },
      stop: () => {
        if (s2c) s2c.stop = true;
      },
    };
    api.ready.catch((e) => {
      console.error("fit init failed", e);
      if (hud.current) hud.current.textContent = `init failed: ${String(e)}`;
    });
    return () => {
      dead = true;
      session.stopFlag = true;
    };
  }, []);

  return (
    <div style={{ background: "#111", color: "#ddd", minHeight: "100vh", font: "12px ui-monospace, monospace", padding: 12 }}>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <div style={{ position: "relative", width: 836, height: 470, flex: "none" }}>
          <canvas ref={bg} width={836} height={470} style={{ position: "absolute", inset: 0 }} />
          <canvas ref={over} width={836} height={470} style={{ position: "absolute", inset: 0 }} />
        </div>
        <pre ref={hud} style={{ margin: 0, whiteSpace: "pre-wrap" }}>loading...</pre>
      </div>
      <canvas ref={gl} width={64} height={36} style={{ width: 64, height: 36, marginTop: 8 }} />
    </div>
  );
}
