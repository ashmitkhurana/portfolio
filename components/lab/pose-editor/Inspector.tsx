"use client";

import { useEffect, useState } from "react";
import type { PosePoint } from "@/lib/ribbon/poses/types";
import type { Issue } from "./diagnostics";
import type { PoseEditorStore } from "./store";

const DEG = 180 / Math.PI;

function NumField({
  label,
  value,
  step,
  digits = 3,
  suffix,
  onCommit,
}: {
  label: string;
  /** null = mixed selection */
  value: number | null;
  step: number;
  digits?: number;
  suffix?: string;
  onCommit: (v: number) => void;
}) {
  const [text, setText] = useState("");
  const [focus, setFocus] = useState(false);
  const shown = value === null ? "" : value.toFixed(digits);
  useEffect(() => {
    if (!focus) setText(shown);
  }, [shown, focus]);
  const commit = (raw: string) => {
    const v = parseFloat(raw);
    if (Number.isFinite(v)) onCommit(v);
  };
  return (
    <label className="pe-field">
      <span>{label}</span>
      <input
        value={focus ? text : shown}
        placeholder={value === null ? "mixed" : ""}
        inputMode="decimal"
        spellCheck={false}
        onFocus={(e) => {
          setFocus(true);
          setText(shown);
          e.currentTarget.select();
        }}
        onBlur={() => {
          setFocus(false);
          commit(text);
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setText(shown);
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            e.stopPropagation();
            const base = parseFloat(focus ? text : shown);
            const k = (e.shiftKey ? 10 : e.altKey ? 0.1 : 1) * (e.key === "ArrowUp" ? 1 : -1);
            if (Number.isFinite(base)) {
              const v = base + k * step;
              setText(v.toFixed(digits));
              onCommit(v);
            }
          }
        }}
      />
      {suffix ? <em>{suffix}</em> : null}
    </label>
  );
}

function agg(points: PosePoint[], sel: number[], f: (p: PosePoint) => number): number | null {
  if (!sel.length) return null;
  const v = f(points[sel[0]]);
  return sel.every((i) => Math.abs(f(points[i]) - v) < 1e-6) ? v : null;
}

export function Inspector({
  store,
  points,
  selection,
  derivedFrom,
  cls,
  onAutoTwist,
}: {
  store: PoseEditorStore;
  points: PosePoint[];
  selection: number[];
  /** roll the strip so a face looks at the camera (selection, or every point when nothing is selected) */
  onAutoTwist: (mode: "keep" | "A" | "B" | "level") => void;
  /** non-null when this class shows another class's points */
  derivedFrom: string | null;
  cls: string;
}) {
  const n = selection.length;
  const set = (k: keyof PosePoint, v: number, key: string) =>
    store.editSelected((p) => ({ ...p, [k]: v }), `f-${key}`);
  return (
    <section className="pe-card">
      <header className="pe-card__head">
        <h2>{n === 0 ? "No selection" : n === 1 ? `Point ${selection[0]}` : `${n} points`}</h2>
        <span className="pe-dim">{points.length} total</span>
      </header>
      {derivedFrom ? (
        <div className="pe-note">
          <span>
            {cls} uses the <b>{derivedFrom}</b> pose. Any edit creates a {cls} override.
          </span>
          <button className="pe-btn pe-btn--small" onClick={() => store.createOverride()}>
            Create override
          </button>
        </div>
      ) : null}
      <div className="pe-row pe-row--tight">
        <span className="pe-dim">Face camera{n ? "" : " (all)"}</span>
        <button className="pe-btn pe-btn--small" onClick={() => onAutoTwist("keep")} title="Correct the roll, keep the visible face">
          Keep face
        </button>
        <button className="pe-btn pe-btn--small" onClick={() => onAutoTwist("A")} title="Lit face towards the camera">
          Face A
        </button>
        <button className="pe-btn pe-btn--small" onClick={() => onAutoTwist("B")} title="Shaded face towards the camera">
          Face B
        </button>
        <button
          className="pe-btn pe-btn--small"
          onClick={() => onAutoTwist("level")}
          title="Roll the strip so its width runs along screen x: a front/back cut then follows a line gap"
        >
          Level
        </button>
      </div>
      {n === 0 ? (
        <p className="pe-hint">
          Click a handle to select it, drag on empty space to box-select, double-click the centreline to insert a point.
        </p>
      ) : (
        <>
          <div className="pe-grid3">
            <NumField label="x" step={0.002} value={agg(points, selection, (p) => p.x)} onCommit={(v) => set("x", v, "x")} />
            <NumField label="y" step={0.002} value={agg(points, selection, (p) => p.y)} onCommit={(v) => set("y", v, "y")} />
            <NumField label="z" step={0.005} value={agg(points, selection, (p) => p.z)} onCommit={(v) => set("z", v, "z")} />
          </div>
          <div className="pe-grid3">
            <NumField
              label="twist"
              suffix="°"
              step={5}
              digits={1}
              value={(() => {
                const t = agg(points, selection, (p) => p.twist);
                return t === null ? null : t * DEG;
              })()}
              onCommit={(v) => set("twist", v / DEG, "twist")}
            />
            <NumField
              label="width"
              step={0.05}
              digits={2}
              suffix="×"
              value={agg(points, selection, (p) => p.width)}
              onCommit={(v) => set("width", Math.max(0.1, v), "width")}
            />
          </div>
          <label className="pe-slider">
            <span>Width</span>
            <input
              type="range"
              min={0.2}
              max={2.5}
              step={0.01}
              value={agg(points, selection, (p) => p.width) ?? 1}
              onChange={(e) => set("width", parseFloat(e.target.value), "width-s")}
            />
          </label>
          <div className="pe-row">
            <button className="pe-btn pe-btn--small" onClick={() => store.editSelected((p) => ({ ...p, twist: p.twist + Math.PI }))}>
              Flip face
            </button>
            <button className="pe-btn pe-btn--small" onClick={() => store.editSelected((p) => ({ ...p, z: 0 }))}>
              Zero z
            </button>
            <button className="pe-btn pe-btn--small" onClick={() => store.editSelected((p) => ({ ...p, twist: 0 }))}>
              Reset twist
            </button>
            <button className="pe-btn pe-btn--small pe-btn--danger" onClick={() => store.deleteSelected()}>
              Delete
            </button>
          </div>
        </>
      )}
    </section>
  );
}

const LEVEL_DOT = { error: "#ff453a", warn: "#ffb340" } as const;

export function IssueList({
  issues,
  focus,
  onFocus,
  onPick,
  computing,
}: {
  issues: Issue[];
  focus: string | null;
  onFocus: (id: string | null) => void;
  onPick: (i: Issue) => void;
  computing: boolean;
}) {
  const errors = issues.filter((i) => i.level === "error").length;
  return (
    <section className="pe-card">
      <header className="pe-card__head">
        <h2>Diagnostics</h2>
        <span className={errors ? "pe-badge pe-badge--err" : issues.length ? "pe-badge pe-badge--warn" : "pe-badge pe-badge--ok"}>
          {computing ? "…" : issues.length === 0 ? "Clean" : `${errors} red · ${issues.length - errors} amber`}
        </span>
      </header>
      {issues.length === 0 ? (
        <p className="pe-hint">No glyph crossings, intersections or tight bends.</p>
      ) : (
        <ul className="pe-issues">
          {issues.map((it) => (
            <li key={it.id}>
              <button
                className={focus === it.id ? "is-on" : ""}
                onClick={() => onPick(it)}
                onPointerEnter={() => onFocus(it.id)}
                onPointerLeave={() => onFocus(null)}
              >
                <i style={{ background: LEVEL_DOT[it.level] }} />
                <span>
                  <b>{it.kind === "crossing" ? "Glyph crossing" : it.kind === "close" ? "Strands close" : "Tight bend"}</b>
                  {it.message}
                </span>
                <em>#{it.ctrl}</em>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const KEYS: [string, string][] = [
  ["Click / drag", "select / move in the screen plane"],
  ["Shift + drag", "depth (up = towards camera)"],
  ["Scroll wheel", "depth of the selection"],
  ["Alt + drag", "twist (horizontal)"],
  ["Drag empty space", "box select (Shift adds)"],
  ["Shift / ⌘ + click", "add / remove from selection"],
  ["Double-click path", "insert a point"],
  ["Backspace", "delete selected"],
  ["Arrows", "nudge 1 px (Shift = 10)"],
  ["[  ]", "nudge depth"],
  ["Tab / Shift+Tab", "next / previous point"],
  ["⌘A · Esc", "select all · none"],
  ["⌘Z · ⇧⌘Z", "undo · redo"],
  ["⌘S", "save"],
  ["R · I · D · L", "reference · idle · diagnostics · labels"],
];

export function CheatSheet() {
  return (
    <section className="pe-card pe-keys">
      <header className="pe-card__head">
        <h2>Controls</h2>
      </header>
      <dl>
        {KEYS.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
