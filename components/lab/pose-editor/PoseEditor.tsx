"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { formatPoseJson, parsePoseFile } from "@/lib/ribbon/poses/io";
import {
  resolveControlPoints,
  resolvePose,
  type ResolveContext,
} from "@/lib/ribbon/poses/resolve";
import type { PoseFile } from "@/lib/ribbon/poses/types";
import { autoTwist, type TwistMode } from "./autoTwist";
import { buildCurveView } from "./curveView";
import { DepthViews } from "./DepthViews";
import { runDiagnostics, type Issue } from "./diagnostics";
import { CheatSheet, Inspector, IssueList } from "./Inspector";
import { Overlay } from "./Overlay";
import { REFS, refPlacement } from "./refs";
import type { StageQuality } from "./stageApi";
import { FRAME_PRESETS, PoseEditorStore } from "./store";
import { useStage } from "./useStage";
import "./editor.css";

const DRAFT_KEY = (name: string) => `pose-editor:draft:${name}`;

async function fetchPose(name: string): Promise<PoseFile> {
  const res = await fetch(`/api/lab/poses?name=${encodeURIComponent(name)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`could not load "${name}" (${res.status})`);
  return parsePoseFile(await res.json());
}

export function PoseEditor() {
  const [store, setStore] = useState<PoseEditorStore | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const list = (await (await fetch("/api/lab/poses", { cache: "no-store" })).json()) as { names?: string[] };
        const all = list.names ?? [];
        if (dead) return;
        setNames(all);
        const first = all.includes("ak-hero") ? "ak-hero" : all[0];
        if (!first) throw new Error("no pose files in lib/ribbon/poses");
        const file = await fetchPose(first);
        if (!dead) setStore(new PoseEditorStore(file));
      } catch (e) {
        if (!dead) setError((e as Error).message);
      }
    })();
    return () => {
      dead = true;
    };
  }, []);

  if (error) return <div className="pe-boot">{error}</div>;
  if (!store) return <div className="pe-boot">Loading poses…</div>;
  return <Editor store={store} names={names} onNames={setNames} />;
}

function Editor({
  store,
  names,
  onNames,
}: {
  store: PoseEditorStore;
  names: string[];
  onNames: (n: string[]) => void;
}) {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const stage = useStage();
  const { layout, rings, api } = stage;

  const [showRef, setShowRef] = useState(false);
  const [refOpacity, setRefOpacity] = useState(0.5);
  const [showIssues, setShowIssues] = useState(true);
  const [showLabels, setShowLabels] = useState(false);
  const [showDepth, setShowDepth] = useState(true);
  const [focusIssue, setFocusIssue] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [zoomMode, setZoomMode] = useState<"fit" | "100">("fit");
  const [draft, setDraft] = useState<PoseFile | null>(null);

  const cur = store.current();
  const points = cur.points;
  const cls = store.cls;
  const { frame, selection, file } = state;

  // ---- stage scaling ------------------------------------------------------------
  const area = useRef<HTMLDivElement>(null);
  const [areaSize, setAreaSize] = useState({ w: 800, h: 600 });
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAreaSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setAreaSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const scale =
    zoomMode === "100" ? 1 : Math.min(1, (areaSize.w - 48) / frame.w, (areaSize.h - 48) / frame.h);

  // ---- resolve + push the pose into the stage -------------------------------------
  const anchor = layout?.anchors[file.anchor] ?? null;
  const ctx: ResolveContext | null = useMemo(
    () =>
      layout && anchor
        ? { viewW: layout.viewW, viewH: layout.viewH, fov: layout.fov, anchor }
        : null,
    [layout, anchor],
  );

  useEffect(() => {
    if (!api || !ctx || points.length < 2) return;
    api.setPose(resolvePose(points, ctx, api.count));
  }, [api, ctx, points]);

  // ---- derived views ----------------------------------------------------------------
  const control = useMemo(() => {
    if (!ctx || points.length < 2) return null;
    const c = resolveControlPoints(points, ctx);
    return { ...c, n: points.length };
  }, [ctx, points]);

  const curve = useMemo(
    () => (rings && layout && control ? buildCurveView(rings, layout, control.pos, control.n) : null),
    [rings, layout, control],
  );

  // diagnostics: debounced, on the rendered rings (and not while the idle preview moves them)
  const [issues, setIssues] = useState<Issue[]>([]);
  const [computing, setComputing] = useState(false);
  useEffect(() => {
    if (!rings || !layout || !control || stage.idle) return;
    setComputing(true);
    const t = window.setTimeout(() => {
      try {
        setIssues(runDiagnostics({ rings, layout, control }));
      } finally {
        setComputing(false);
      }
    }, 140);
    return () => window.clearTimeout(t);
  }, [rings, layout, control, stage.idle]);

  // ---- reference overlay --------------------------------------------------------------
  const refKind: "desktop" | "phone" =
    cls === "phone" || (cls === "tablet" && frame.h > frame.w) ? "phone" : "desktop";
  const refBox = anchor ? refPlacement(REFS[refKind], anchor) : null;

  // ---- toasts / draft -----------------------------------------------------------------
  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? "" : t)), 2400);
  }, []);

  useEffect(() => {
    // local draft: survives reloads / HMR between saves
    const t = window.setTimeout(() => {
      try {
        if (store.isDirty()) localStorage.setItem(DRAFT_KEY(file.name), formatPoseJson(file));
        else localStorage.removeItem(DRAFT_KEY(file.name));
      } catch {
        /* storage unavailable */
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [file, store]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY(file.name));
      if (raw && raw !== store.getState().savedJson) setDraft(parsePoseFile(JSON.parse(raw)));
    } catch {
      /* ignore */
    }
    // only when a pose is opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file.name]);

  const dirty = store.isDirty();
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (store.isDirty()) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [store]);

  // ---- file actions ------------------------------------------------------------------
  const save = useCallback(async () => {
    const json = formatPoseJson(store.getState().file);
    try {
      const res = await fetch("/api/lab/poses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: store.getState().file.name, json }),
      });
      const body = (await res.json()) as { error?: string; path?: string };
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      store.markSaved();
      try {
        localStorage.removeItem(DRAFT_KEY(store.getState().file.name));
      } catch {
        /* ignore */
      }
      flash(`Saved ${body.path}`);
      const list = (await (await fetch("/api/lab/poses", { cache: "no-store" })).json()) as { names?: string[] };
      onNames(list.names ?? []);
    } catch (e) {
      flash(`Save failed: ${(e as Error).message}`);
    }
  }, [store, flash, onNames]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatPoseJson(store.getState().file));
      flash("JSON copied");
    } catch {
      flash("Clipboard unavailable");
    }
  }, [store, flash]);

  const fileInput = useRef<HTMLInputElement>(null);
  const loadFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const parsed = parsePoseFile(JSON.parse(await f.text()));
      store.load(parsed, false);
      flash(`Loaded ${f.name} (unsaved)`);
    } catch (e) {
      flash(`Load failed: ${(e as Error).message}`);
    }
  };

  const openPose = async (name: string) => {
    if (name === file.name) return;
    if (store.isDirty() && !window.confirm("Discard unsaved changes?")) return;
    try {
      store.load(await fetchPose(name));
    } catch (e) {
      flash((e as Error).message);
    }
  };

  // ---- keyboard ---------------------------------------------------------------------------
  const keyState = useRef({ points, selection, anchor, issues });
  keyState.current = { points, selection, anchor, issues };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const inField = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
      const mod = e.metaKey || e.ctrlKey;
      const k = e.key;
      if (mod && k.toLowerCase() === "s") {
        e.preventDefault();
        void save();
        return;
      }
      if (inField) return;
      const { points: pts, selection: sel, anchor: a } = keyState.current;
      if (mod && k.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (mod && k.toLowerCase() === "a") {
        e.preventDefault();
        store.select(pts.map((_, i) => i));
        return;
      }
      if (mod) return;
      if (k === "Escape") store.select([]);
      else if (k === "Backspace" || k === "Delete") {
        e.preventDefault();
        store.deleteSelected();
      } else if (k === "Tab") {
        e.preventDefault();
        const n = pts.length;
        const base = sel.length ? (e.shiftKey ? sel[0] - 1 : sel[sel.length - 1] + 1) : 0;
        store.select([((base % n) + n) % n]);
      } else if (k.startsWith("Arrow") && sel.length && a) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = k === "ArrowLeft" ? -step : k === "ArrowRight" ? step : 0;
        const dy = k === "ArrowUp" ? -step : k === "ArrowDown" ? step : 0;
        store.editSelected((p) => ({ ...p, x: p.x + dx / a.width, y: p.y + dy / a.height }), "nudge");
      } else if ((k === "[" || k === "]") && sel.length && a) {
        e.preventDefault();
        const dz = ((k === "]" ? 1 : -1) * (e.shiftKey ? 10 : 1)) / a.height;
        store.editSelected((p) => ({ ...p, z: p.z + dz }), "nudge-z");
      } else if (k === "r" || k === "R") setShowRef((v) => !v);
      else if (k === "i" || k === "I") stage.setIdle(!stage.idle);
      else if (k === "d" || k === "D") setShowIssues((v) => !v);
      else if (k === "l" || k === "L") setShowLabels((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, save, stage]);

  // dev hook for scripted QA (headless screenshots, seeding)
  useEffect(() => {
    (window as unknown as { __pe?: unknown }).__pe = { store };
  }, [store]);

  const roll = (mode: TwistMode) => {
    if (!rings || !curve || !layout) return;
    const ids = selection.length ? selection : points.map((_, i) => i);
    const camZ = layout.viewH / 2 / Math.tan((layout.fov * Math.PI) / 360);
    store.setPoints(autoTwist(points, ids, rings, curve, camZ, mode));
  };

  // ---- UI ----------------------------------------------------------------------------------
  const frameLabel = `${frame.w} × ${frame.h}`;
  const pickIssue = (it: Issue) => {
    store.select([it.ctrl]);
  };
  const setFrame = (id: string, w: number, h: number) => store.setFrame({ id, w, h });

  return (
    <div className="pe">
      <header className="pe-bar">
        <div className="pe-bar__group">
          <strong className="pe-title">Pose Editor</strong>
          <select
            className="pe-select"
            value={file.name}
            onChange={(e) => void openPose(e.target.value)}
            aria-label="Pose"
          >
            {Array.from(new Set([...names, file.name])).map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
          {dirty ? <span className="pe-dot" title="Unsaved changes" /> : null}
        </div>

        <div className="pe-seg" role="group" aria-label="Screen class">
          {FRAME_PRESETS.map((f) => (
            <button
              key={f.id}
              className={frame.id === f.id ? "is-on" : ""}
              onClick={() => setFrame(f.id, f.w, f.h)}
              title={`${f.w} × ${f.h}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="pe-size">
          <input
            aria-label="Frame width"
            value={frame.w}
            onChange={(e) => setFrame("custom", Math.max(280, +e.target.value || 0), frame.h)}
          />
          <span>×</span>
          <input
            aria-label="Frame height"
            value={frame.h}
            onChange={(e) => setFrame("custom", frame.w, Math.max(280, +e.target.value || 0))}
          />
          <button className="pe-icon" title="Rotate" onClick={() => setFrame("custom", frame.h, frame.w)}>
            ⟳
          </button>
          <span className="pe-pill">{cls}</span>
        </div>

        <div className="pe-bar__group">
          <Toggle on={showRef} onClick={() => setShowRef(!showRef)} label="Reference" k="R" />
          {showRef ? (
            <input
              className="pe-range"
              type="range"
              min={0.05}
              max={1}
              step={0.01}
              value={refOpacity}
              onChange={(e) => setRefOpacity(parseFloat(e.target.value))}
              aria-label="Reference opacity"
            />
          ) : null}
          <Toggle on={stage.idle} onClick={() => stage.setIdle(!stage.idle)} label="Idle" k="I" />
          <Toggle on={showIssues} onClick={() => setShowIssues(!showIssues)} label="Diagnostics" k="D" />
          <Toggle on={showLabels} onClick={() => setShowLabels(!showLabels)} label="Labels" k="L" />
          <Toggle on={showDepth} onClick={() => setShowDepth(!showDepth)} label="Depth" />
          <div className="pe-seg pe-seg--small" role="group" aria-label="Quality">
            {(["low", "medium", "high"] as StageQuality[]).map((q) => (
              <button key={q} className={stage.quality === q ? "is-on" : ""} onClick={() => stage.setQuality(q)}>
                {q === "medium" ? "Med" : q[0].toUpperCase() + q.slice(1)}
              </button>
            ))}
          </div>
          <button
            className="pe-btn pe-btn--ghost"
            onClick={() => setZoomMode(zoomMode === "fit" ? "100" : "fit")}
            title="Zoom"
          >
            {zoomMode === "fit" ? `${Math.round(scale * 100)}%` : "100%"}
          </button>
        </div>

        <div className="pe-bar__group pe-bar__group--end">
          <button className="pe-icon" disabled={!state.canUndo} onClick={() => store.undo()} title="Undo (⌘Z)">
            ↶
          </button>
          <button className="pe-icon" disabled={!state.canRedo} onClick={() => store.redo()} title="Redo (⇧⌘Z)">
            ↷
          </button>
          <button className="pe-btn" onClick={() => fileInput.current?.click()}>
            Load
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              void loadFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button className="pe-btn" onClick={() => void copy()}>
            Copy JSON
          </button>
          <button className="pe-btn pe-btn--primary" onClick={() => void save()} title="⌘S">
            Save
          </button>
        </div>
      </header>

      {draft ? (
        <div className="pe-banner">
          <span>An unsaved draft of this pose was found.</span>
          <button
            className="pe-btn pe-btn--small"
            onClick={() => {
              store.load(draft, false);
              setDraft(null);
            }}
          >
            Restore
          </button>
          <button
            className="pe-btn pe-btn--small pe-btn--ghost"
            onClick={() => {
              try {
                localStorage.removeItem(DRAFT_KEY(file.name));
              } catch {
                /* ignore */
              }
              setDraft(null);
            }}
          >
            Discard
          </button>
        </div>
      ) : null}

      <div className="pe-main">
        <div className="pe-stage" ref={area}>
          <div className="pe-frame-wrap" style={{ width: frame.w * scale, height: frame.h * scale }}>
            <div className="pe-frame" style={{ width: frame.w, height: frame.h, transform: `scale(${scale})` }}>
              <iframe
                ref={stage.setIframe}
                className="pe-iframe"
                src="/lab/editor/stage"
                title="Stage"
                width={frame.w}
                height={frame.h}
              />
              {showRef && refBox ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="pe-ref"
                  src={REFS[refKind].src}
                  alt=""
                  draggable={false}
                  style={{ ...refBox, opacity: refOpacity }}
                />
              ) : null}
              {ctx && points.length > 1 ? (
                <div className={stage.idle ? "pe-overlay-wrap is-idle" : "pe-overlay-wrap"}>
                  <Overlay
                    store={store}
                    w={frame.w}
                    h={frame.h}
                    scale={scale}
                    ctx={ctx}
                    points={points}
                    selection={selection}
                    curve={curve}
                    rings={rings}
                    issues={issues}
                    showIssues={showIssues && !stage.idle}
                    showLabels={showLabels}
                    focusIssue={focusIssue}
                    onFocusIssue={setFocusIssue}
                  />
                </div>
              ) : null}
            </div>
          </div>
          {!api ? <div className="pe-loading">Starting the stage…</div> : null}
          <div className="pe-status">
            <span>
              {frameLabel} · {cls}
              {cur.derived ? ` (from ${cur.source})` : ""}
            </span>
            {anchor ? (
              <span>
                anchor {file.anchor} {Math.round(anchor.width)} × {Math.round(anchor.height)} @ {Math.round(anchor.left)},{" "}
                {Math.round(anchor.top)}
              </span>
            ) : null}
            <span>{points.length} points</span>
          </div>
        </div>

        <aside className="pe-side">
          {showDepth && ctx && layout ? (
            <section className="pe-card">
              <header className="pe-card__head">
                <h2>Depth</h2>
                <span className="pe-dim">drag handles here too</span>
              </header>
              <DepthViews
                store={store}
                points={points}
                selection={selection}
                ctx={ctx}
                layout={layout}
                rings={rings}
                fitKey={`${file.name}|${frame.w}x${frame.h}|${state.savedJson.length}`}
              />
            </section>
          ) : null}
          <Inspector
            store={store}
            points={points}
            selection={selection}
            derivedFrom={cur.derived ? cur.source : null}
            cls={cls}
            onAutoTwist={roll}
          />
          <IssueList
            issues={issues}
            focus={focusIssue}
            onFocus={setFocusIssue}
            onPick={pickIssue}
            computing={computing}
          />
          <CheatSheet />
        </aside>
      </div>
      {toast ? <div className="pe-toast">{toast}</div> : null}
    </div>
  );
}

function Toggle({ on, onClick, label, k }: { on: boolean; onClick: () => void; label: string; k?: string }) {
  return (
    <button className={on ? "pe-tog is-on" : "pe-tog"} onClick={onClick} title={k ? `${label} (${k})` : label}>
      {label}
    </button>
  );
}
