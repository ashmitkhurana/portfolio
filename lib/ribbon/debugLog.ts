/**
 * Ribbon debug event log. Enabled by `?debug=1` (checked once, at module load);
 * otherwise `rlog` is an empty function call (no allocation, no array).
 *
 * Every state change that can alter pixels is recorded with a timestamp
 * (performance.now, ms since navigation): tier changes, quality / setting
 * changes, DPR changes, render-target (MSAA) re-creation, shadow-map and
 * contact-catcher renders, environment (PMREM) rebuilds, poster / live swaps,
 * resizes and sim state changes. Read it from the console:
 *
 *   window.__ribbonLog            // RibbonLogEntry[]
 *   window.__ribbonLog.summary()  // counts per event type
 *
 * This file must stay free of three.js (it is imported before the engine chunk).
 */

export interface RibbonLogEntry {
  /** ms since navigation start */
  t: number;
  /** renderer frame counter at the time (-1 before the first frame) */
  f: number;
  type: string;
  data?: unknown;
}

export type RibbonLog = RibbonLogEntry[] & { summary: () => Record<string, number> };

declare global {
  interface Window {
    __ribbonLog?: RibbonLog;
  }
}

let log: RibbonLog | null = null;
let frame = -1;

function enabled(): boolean {
  try {
    return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("debug") === "1";
  } catch {
    return false;
  }
}

if (enabled()) {
  const arr = [] as unknown as RibbonLog;
  arr.summary = () => {
    const out: Record<string, number> = {};
    for (const e of arr) out[e.type] = (out[e.type] ?? 0) + 1;
    return out;
  };
  // survive module re-evaluation (HMR / a second chunk copy): one log per page
  log = window.__ribbonLog ?? arr;
  window.__ribbonLog = log;
}

/** is the log on? (guard expensive argument construction with this) */
export const ribbonLogOn = (): boolean => log !== null;

/** the core reports its frame counter so entries can be tied to frames */
export function ribbonLogFrame(f: number): void {
  frame = f;
}

/** record an event (no-op unless `?debug=1`) */
export function rlog(type: string, data?: unknown): void {
  if (!log) return;
  log.push({ t: Math.round(performance.now() * 10) / 10, f: frame, type, data });
}
