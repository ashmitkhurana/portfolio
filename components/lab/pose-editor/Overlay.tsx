"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_FOV, projectWorld } from "@/lib/ribbon/poses/camera";
import {
  anchorToScreen,
  worldToPoint,
  type ResolveContext,
} from "@/lib/ribbon/poses/resolve";
import type { PosePoint } from "@/lib/ribbon/poses/types";
import type { CurveView } from "./curveView";
import type { Issue } from "./diagnostics";
import type { PoseEditorStore } from "./store";
import type { StageRings } from "./stageApi";

interface Props {
  store: PoseEditorStore;
  /** frame size (CSS px) and how much the frame is scaled on screen */
  w: number;
  h: number;
  scale: number;
  ctx: ResolveContext;
  points: PosePoint[];
  selection: number[];
  curve: CurveView | null;
  rings: StageRings | null;
  issues: Issue[];
  showIssues: boolean;
  showLabels: boolean;
  focusIssue: string | null;
  onFocusIssue: (id: string | null) => void;
}

type Mode = "move" | "depth" | "twist" | "roll";

interface Drag {
  mode: Mode;
  startX: number;
  startY: number;
  start: PosePoint[];
  ids: number[];
  moved: boolean;
  /** roll knob: the screen direction of increasing roll and the tick length (px) */
  roll?: { x: number; y: number; len: number };
  /** shift-pressed on an unselected handle: a plain click toggles it instead */
  toggleOnClick: number | null;
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  additive: boolean;
}

const ISSUE_COLOR = { crossing: "#ff453a", close: "#ffb340", curvature: "#ffd60a", fold: "#ff6bd6", wobble: "#7ad7ff" } as const;

/**
 * The handle layer. Lives in frame CSS px (the frame is scaled as a whole), so
 * every size is multiplied by u = 1 / scale to stay constant on screen.
 */
export function Overlay({
  store,
  w,
  h,
  scale,
  ctx,
  points,
  selection,
  curve,
  rings,
  issues,
  showIssues,
  showLabels,
  focusIssue,
  onFocusIssue,
}: Props) {
  const u = 1 / scale;
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [hud, setHud] = useState<string>("");
  const live = useRef({ points, ctx, selection });
  live.current = { points, ctx, selection };

  const toFrame = useCallback(
    (ev: { clientX: number; clientY: number }) => {
      const r = svg.current!.getBoundingClientRect();
      return { x: (ev.clientX - r.left) * u, y: (ev.clientY - r.top) * u };
    },
    [u],
  );

  // ---- wheel = depth of the selection (non-passive so the page does not scroll) ----
  useEffect(() => {
    const el = svg.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      if (!live.current.selection.length) return;
      ev.preventDefault();
      const dz = -ev.deltaY * (ev.shiftKey ? 0.0002 : 0.0008);
      store.editSelected((p) => ({ ...p, z: p.z + dz }), "wheel");
      setHud(`z ${fmtSigned(live.current.points[live.current.selection[0]]?.z + dz)}`);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [store]);

  // ---- pointer gestures ------------------------------------------------------
  const onHandleDown = (ev: React.PointerEvent, i: number) => {
    ev.stopPropagation();
    if (ev.button !== 0) return;
    (ev.currentTarget as Element).setPointerCapture?.(ev.pointerId);
    const f = toFrame(ev);
    const sel = new Set(live.current.selection);
    const toggleMod = ev.shiftKey || ev.metaKey || ev.ctrlKey;
    let toggleOnClick: number | null = null;
    if (toggleMod) {
      toggleOnClick = i;
      if (!sel.has(i)) sel.add(i);
    } else if (!sel.has(i)) {
      sel.clear();
      sel.add(i);
      store.select([i]);
    }
    const ids = [...sel].sort((a, b) => a - b);
    const mode: Mode = ev.altKey ? "twist" : ev.shiftKey ? "depth" : "move";
    drag.current = {
      mode,
      startX: f.x,
      startY: f.y,
      start: live.current.points.map((p) => ({ ...p })),
      ids,
      moved: false,
      toggleOnClick,
    };
    store.beginGesture();
  };

  const onRollDown = (ev: React.PointerEvent, i: number, len: number) => {
    ev.stopPropagation();
    if (ev.button !== 0) return;
    (ev.currentTarget as Element).setPointerCapture?.(ev.pointerId);
    const f = toFrame(ev);
    const sel = new Set(live.current.selection);
    if (!sel.has(i)) {
      sel.clear();
      sel.add(i);
      store.select([i]);
    }
    const rd = curve?.rollDir[i] ?? { x: 1, y: 0 };
    drag.current = {
      mode: "roll",
      startX: f.x,
      startY: f.y,
      start: live.current.points.map((p) => ({ ...p })),
      ids: [...sel].sort((a, b) => a - b),
      moved: false,
      toggleOnClick: null,
      roll: { x: rd.x, y: rd.y, len },
    };
    store.beginGesture();
  };

  const onBgDown = (ev: React.PointerEvent) => {
    if (ev.button !== 0) return;
    (ev.currentTarget as Element).setPointerCapture?.(ev.pointerId);
    const f = toFrame(ev);
    setBox({ x0: f.x, y0: f.y, x1: f.x, y1: f.y, additive: ev.shiftKey || ev.metaKey || ev.ctrlKey });
  };

  const onMove = (ev: React.PointerEvent) => {
    const d = drag.current;
    const f = toFrame(ev);
    if (box) {
      setBox({ ...box, x1: f.x, y1: f.y });
      return;
    }
    if (!d) return;
    const dxp = f.x - d.startX;
    const dyp = f.y - d.startY;
    if (!d.moved && Math.hypot(dxp, dyp) * scale < 3) return;
    d.moved = true;
    const a = live.current.ctx.anchor;
    const ids = new Set(d.ids);
    const next = d.start.map((p, i) => {
      if (!ids.has(i)) return p;
      if (d.mode === "move") {
        return { ...p, x: p.x + dxp / a.width, y: p.y + dyp / a.height };
      }
      if (d.mode === "depth") {
        return { ...p, z: p.z - dyp / a.height };
      }
      if (d.mode === "roll" && d.roll) {
        return { ...p, twist: p.twist + (dxp * d.roll.x + dyp * d.roll.y) / Math.max(d.roll.len, 14) };
      }
      return { ...p, twist: p.twist + dxp * 0.012 };
    });
    store.setPoints(next, { gesture: true });
    const lead = next[d.ids[0]];
    setHud(
      d.mode === "move"
        ? `x ${lead.x.toFixed(3)}   y ${lead.y.toFixed(3)}`
        : d.mode === "depth"
          ? `z ${fmtSigned(lead.z)}`
          : `roll ${Math.round((lead.twist * 180) / Math.PI)}°`,
    );
  };

  const onUp = (ev: React.PointerEvent) => {
    if (box) {
      const x0 = Math.min(box.x0, box.x1);
      const x1 = Math.max(box.x0, box.x1);
      const y0 = Math.min(box.y0, box.y1);
      const y1 = Math.max(box.y0, box.y1);
      const hit: number[] = [];
      points.forEach((p, i) => {
        const s = anchorToScreen(p, ctx.anchor);
        if (s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1) hit.push(i);
      });
      const tiny = Math.hypot(x1 - x0, y1 - y0) * scale < 4;
      if (tiny) {
        if (!box.additive) store.select([]);
      } else {
        store.select(box.additive ? [...selection, ...hit] : hit);
      }
      setBox(null);
      return;
    }
    const d = drag.current;
    drag.current = null;
    setHud("");
    (ev.currentTarget as Element).releasePointerCapture?.(ev.pointerId);
    if (d && !d.moved && d.toggleOnClick !== null) store.toggle(d.toggleOnClick);
  };

  // ---- insert a point on the centreline (double-click) --------------------------
  const onPathDouble = (ev: React.MouseEvent) => {
    if (!curve || !rings) return;
    ev.stopPropagation();
    const f = toFrame(ev);
    const M = rings.count;
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < M; i++) {
      const dx = curve.screen[i * 2] - f.x;
      const dy = curve.screen[i * 2 + 1] - f.y;
      const dd = dx * dx + dy * dy;
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    }
    // which control segment holds this ring
    const n = points.length;
    let seg = 0;
    for (let c = 0; c < n - 1; c++) if (curve.ctrlRing[c] <= best) seg = c;
    seg = Math.min(seg, n - 2);
    const r0 = curve.ctrlRing[seg];
    const r1 = curve.ctrlRing[seg + 1];
    const t = r1 > r0 ? Math.min(Math.max((best - r0) / (r1 - r0), 0), 1) : 0.5;
    const p0 = points[seg];
    const p1 = points[seg + 1];
    const pos = worldToPoint(
      rings.pos[best * 3],
      rings.pos[best * 3 + 1],
      rings.pos[best * 3 + 2],
      ctx,
    );
    store.insertAfter(seg, {
      x: pos.x,
      y: pos.y,
      z: pos.z,
      twist: p0.twist + (p1.twist - p0.twist) * t,
      width: p0.width + (p1.width - p0.width) * t,
    });
  };

  const sel = new Set(selection);
  const r = 6.5 * u;

  return (
    <svg
      ref={svg}
      className="pe-overlay"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <rect width={w} height={h} fill="transparent" onPointerDown={onBgDown} />

      {/* centreline, coloured by the face the camera sees */}
      {curve ? (
        <g fill="none" strokeLinecap="round" strokeLinejoin="round" pointerEvents="none">
          {curve.runs.map((run, i) => (
            <path
              key={i}
              d={run.d}
              stroke={run.faceA ? "#ffffff" : "#5ac8fa"}
              strokeOpacity={0.9}
              strokeWidth={1.6 * u}
            />
          ))}
        </g>
      ) : null}
      {curve ? (
        <path
          d={curve.runs.map((x) => x.d).join("")}
          fill="none"
          stroke="transparent"
          strokeWidth={16 * u}
          pointerEvents="stroke"
          onDoubleClick={onPathDouble}
          onPointerDown={onBgDown}
        />
      ) : null}

      {/* twist ticks: the strip's width direction at each control point */}
      {curve ? (
        <g pointerEvents="none" stroke="#ffffff" strokeOpacity={0.55} strokeWidth={1 * u}>
          {points.map((p, i) => {
            const s = anchorToScreen(p, ctx.anchor);
            const d = curve.widthDir[i];
            if (!d) return null;
            const L = Math.min(curve.halfWidth[i] || 20, 40 * u);
            return (
              <line
                key={i}
                x1={s.x - d.x * L}
                y1={s.y - d.y * L}
                x2={s.x + d.x * L}
                y2={s.y + d.y * L}
              />
            );
          })}
        </g>
      ) : null}

      {/* soft folds: the crease axis the engine built (dashed) and the radius of the roll */}
      {rings?.folds
        ? rings.folds.map((f) => {
            if (!f.built || !f.crease) return null;
            const c = f.crease;
            const a = projectWorld(c.cx - c.ax * c.half, c.cy - c.ay * c.half, c.cz - c.az * c.half, ctx.viewW, ctx.viewH, ctx.fov ?? DEFAULT_FOV);
            const b = projectWorld(c.cx + c.ax * c.half, c.cy + c.ay * c.half, c.cz + c.az * c.half, ctx.viewW, ctx.viewH, ctx.fov ?? DEFAULT_FOV);
            const bad = f.issues.some((it) => it.level === "error");
            const col = bad ? "#ff453a" : f.issues.length ? "#ffb340" : "#ff6bd6";
            return (
              <g key={`fold${f.index}`} pointerEvents="none">
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={col} strokeWidth={2 * u} strokeDasharray={`${7 * u} ${5 * u}`} strokeLinecap="round" />
                <circle cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} r={Math.max(f.rho * 0.35, 5 * u)} fill="none" stroke={col} strokeWidth={1.2 * u} strokeOpacity={0.7} />
                <text x={(a.x + b.x) / 2 + 10 * u} y={(a.y + b.y) / 2 - 8 * u} fill={col} fontSize={11 * u} fontFamily="ui-monospace, monospace">
                  fold {f.index + 1} {Math.round((f.theta * 180) / Math.PI)}°
                </text>
              </g>
            );
          })
        : null}

      {/* issue markers */}
      {showIssues
        ? issues.map((it) => {
            const col = it.level === "error" ? "#ff453a" : ISSUE_COLOR[it.kind];
            const on = focusIssue === it.id;
            return (
              <g
                key={it.id}
                transform={`translate(${it.x} ${it.y})`}
                onPointerEnter={() => onFocusIssue(it.id)}
                onPointerLeave={() => onFocusIssue(null)}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  store.select([it.ctrl]);
                }}
                style={{ cursor: "pointer" }}
              >
                <circle r={(on ? 17 : 12) * u} fill={col} fillOpacity={0.18} stroke={col} strokeWidth={1.5 * u} />
                <path
                  d={`M${-4 * u} ${-4 * u}L${4 * u} ${4 * u}M${4 * u} ${-4 * u}L${-4 * u} ${4 * u}`}
                  stroke={col}
                  strokeWidth={1.8 * u}
                  strokeLinecap="round"
                />
              </g>
            );
          })
        : null}

      {/* handles */}
      {points.map((p, i) => {
        const s = anchorToScreen(p, ctx.anchor);
        const on = sel.has(i);
        const hv = hover === i;
        const front = p.z > 0.02;
        const back = p.z < -0.02;
        return (
          <g
            key={i}
            transform={`translate(${s.x} ${s.y})`}
            onPointerDown={(e) => onHandleDown(e, i)}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover((c) => (c === i ? null : c))}
            style={{ cursor: "grab" }}
          >
            <circle r={13 * u} fill="transparent" />
            <circle
              r={on ? r * 1.15 : hv ? r * 1.1 : r}
              fill={on ? "#0a84ff" : "rgba(20,20,22,0.92)"}
              stroke={on ? "#ffffff" : front ? "#ffffff" : back ? "#8e8e93" : "#d1d1d6"}
              strokeWidth={(on ? 2 : 1.6) * u}
              strokeDasharray={!on && back ? `${2.2 * u} ${2.2 * u}` : undefined}
            />
            {on || hv || showLabels ? (
              <text
                x={r + 5 * u}
                y={-r - 2 * u}
                fontSize={10.5 * u}
                fill="#ffffff"
                stroke="rgba(0,0,0,0.75)"
                strokeWidth={3 * u}
                paintOrder="stroke"
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                pointerEvents="none"
              >
                {i}
                {on || hv ? `  z ${fmtSigned(p.z)}` : ""}
              </text>
            ) : null}
          </g>
        );
      })}

      {/* roll knobs: drag the tip of a selected point's width tick to roll the strip about the curve */}
      {curve
        ? selection.map((i) => {
            const p = points[i];
            const d = curve.widthDir[i];
            if (!p || !d) return null;
            const s = anchorToScreen(p, ctx.anchor);
            const L = Math.min(curve.halfWidth[i] || 20, 40 * u);
            const kx = s.x + d.x * L;
            const ky = s.y + d.y * L;
            return (
              <g key={`roll${i}`} style={{ cursor: "ew-resize" }} onPointerDown={(e) => onRollDown(e, i, L)}>
                <line x1={s.x} y1={s.y} x2={kx} y2={ky} stroke="#ffd60a" strokeWidth={2 * u} pointerEvents="none" />
                <circle cx={kx} cy={ky} r={12 * u} fill="transparent" />
                <circle cx={kx} cy={ky} r={5.5 * u} fill="#ffd60a" stroke="#1c1c1e" strokeWidth={1.5 * u} />
              </g>
            );
          })
        : null}

      {box ? (
        <rect
          x={Math.min(box.x0, box.x1)}
          y={Math.min(box.y0, box.y1)}
          width={Math.abs(box.x1 - box.x0)}
          height={Math.abs(box.y1 - box.y0)}
          fill="rgba(10,132,255,0.12)"
          stroke="#0a84ff"
          strokeWidth={1 * u}
          pointerEvents="none"
        />
      ) : null}

      {hud ? (
        <g pointerEvents="none" transform={`translate(${12 * u} ${h - 14 * u})`}>
          <rect
            x={0}
            y={-18 * u}
            width={(hud.length * 6.8 + 16) * u}
            height={24 * u}
            rx={7 * u}
            fill="rgba(28,28,30,0.88)"
          />
          <text
            x={8 * u}
            y={-2 * u}
            fontSize={12 * u}
            fill="#fff"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          >
            {hud}
          </text>
        </g>
      ) : null}
    </svg>
  );
}

function fmtSigned(v: number): string {
  return (v >= 0 ? "+" : "") + v.toFixed(3);
}

