"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { worldToPoint, type ResolveContext } from "@/lib/ribbon/poses/resolve";
import type { PosePoint } from "@/lib/ribbon/poses/types";
import type { PoseEditorStore } from "./store";
import type { StageLayout, StageRings } from "./stageApi";

interface Props {
  store: PoseEditorStore;
  points: PosePoint[];
  selection: number[];
  ctx: ResolveContext;
  layout: StageLayout;
  rings: StageRings | null;
  /** change to refit the view (new frame / pose) */
  fitKey: string;
}

type Axis = "side" | "top";

const W = 296;
const H = 190;
const PAD = 14;

/** Orthographic depth views, in px of the live layout: side (z across, y down) and top (x across, z up). */
export function DepthViews(props: Props) {
  return (
    <div className="pe-depth">
      <DepthCanvas {...props} axis="side" />
      <DepthCanvas {...props} axis="top" />
    </div>
  );
}

interface Fit {
  a0: number;
  a1: number;
  b0: number;
  b1: number;
}

function DepthCanvas({ store, points, selection, ctx, layout, rings, fitKey, axis }: Props & { axis: Axis }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [fit, setFit] = useState<Fit | null>(null);
  const fitFor = useRef("");
  const dragRef = useRef<{ x: number; y: number; start: PosePoint[]; ids: number[]; moved: boolean; toggle: number | null } | null>(null);
  const A = ctx.anchor;

  // axes in px: side = (z, y), top = (x, z); a is horizontal, b vertical
  const toAB = useCallback(
    (x: number, y: number, z: number) =>
      axis === "side" ? { a: z * A.height, b: y * A.height } : { a: x * A.width, b: z * A.height },
    [axis, A.width, A.height],
  );

  const computeFit = useCallback((): Fit => {
    let a0 = Infinity;
    let a1 = -Infinity;
    let b0 = Infinity;
    let b1 = -Infinity;
    for (const p of points) {
      const q = toAB(p.x, p.y, p.z);
      a0 = Math.min(a0, q.a);
      a1 = Math.max(a1, q.a);
      b0 = Math.min(b0, q.b);
      b1 = Math.max(b1, q.b);
    }
    if (!isFinite(a0)) return { a0: -1, a1: 1, b0: -1, b1: 1 };
    // always include the text plane with some air
    if (axis === "side") {
      a0 = Math.min(a0, -A.height * 0.3);
      a1 = Math.max(a1, A.height * 0.3);
    } else {
      b0 = Math.min(b0, -A.height * 0.3);
      b1 = Math.max(b1, A.height * 0.3);
    }
    const ma = (a1 - a0) * 0.06 + 4;
    const mb = (b1 - b0) * 0.06 + 4;
    return { a0: a0 - ma, a1: a1 + ma, b0: b0 - mb, b1: b1 + mb };
  }, [points, toAB, axis, A.height]);

  // refit when the frame / loaded pose changes (never while dragging)
  useEffect(() => {
    const key = `${fitKey}|${axis}|${points.length > 0}`;
    if (fitFor.current !== key && points.length) {
      fitFor.current = key;
      setFit(computeFit());
    }
  }, [fitKey, axis, points, computeFit]);

  const geom = useCallback(
    (f: Fit) => {
      const sa = (W - PAD * 2) / (f.a1 - f.a0);
      const sb = (H - PAD * 2) / (f.b1 - f.b0);
      const s = Math.min(sa, sb);
      const ox = PAD + ((W - PAD * 2) - (f.a1 - f.a0) * s) / 2;
      const oy = PAD + ((H - PAD * 2) - (f.b1 - f.b0) * s) / 2;
      // top view: z up. side view: y down.
      const px = (a: number) => ox + (a - f.a0) * s;
      const py = (b: number) => (axis === "top" ? H - oy - (b - f.b0) * s : oy + (b - f.b0) * s);
      return { s, px, py };
    },
    [axis],
  );

  // ---- draw -------------------------------------------------------------------
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !fit) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr;
    cv.height = H * dpr;
    const c = cv.getContext("2d")!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);
    const { px, py } = geom(fit);
    const css = getComputedStyle(cv);
    const fg = css.getPropertyValue("--pe-fg").trim() || "#fff";
    const dim = css.getPropertyValue("--pe-dim").trim() || "#888";
    const acc = css.getPropertyValue("--pe-accent").trim() || "#0a84ff";

    // text plane (z = 0) and other proxy depths
    const depths = Array.from(new Set(layout.proxies.map((p) => p.depth)));
    if (!depths.includes(0)) depths.push(0);
    c.lineWidth = 1;
    c.font = "10px ui-monospace, Menlo, monospace";
    for (const d of depths) {
      c.strokeStyle = d === 0 ? "rgba(255,159,10,0.9)" : "rgba(255,159,10,0.5)";
      c.setLineDash(d === 0 ? [] : [4, 3]);
      c.beginPath();
      if (axis === "side") {
        const x = px(d);
        c.moveTo(x, 0);
        c.lineTo(x, H);
      } else {
        const y = py(d);
        c.moveTo(0, y);
        c.lineTo(W, y);
      }
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = "rgba(255,159,10,0.9)";
      c.fillText(d === 0 ? "text z=0" : `proxy z=${d}`, axis === "side" ? px(d) + 4 : 6, axis === "side" ? 11 : py(d) - 4);
    }

    // glyph ink (at z = 0): bars along the plane; gaps between them are where crossings are safe
    c.fillStyle = "rgba(244,239,231,0.5)";
    if (axis === "top") {
      const y = py(0);
      for (const g of layout.ink) {
        const x0 = px(((g.x0 - A.left) / A.width) * A.width);
        const x1 = px(((g.x1 - A.left) / A.width) * A.width);
        c.fillRect(x0, y - 3, Math.max(x1 - x0 - 0.5, 0.5), 6);
      }
    } else {
      const x = px(0);
      const lines = new Map<number, { y0: number; y1: number }>();
      for (const g of layout.ink) {
        const e = lines.get(g.line);
        if (!e) lines.set(g.line, { y0: g.y0, y1: g.y1 });
        else {
          e.y0 = Math.min(e.y0, g.y0);
          e.y1 = Math.max(e.y1, g.y1);
        }
      }
      for (const l of lines.values()) {
        const y0 = py(l.y0 - A.top);
        const y1 = py(l.y1 - A.top);
        c.fillRect(x - 3, y0, 6, y1 - y0);
      }
    }

    // centreline from the rendered rings
    if (rings && rings.count > 1) {
      c.strokeStyle = fg;
      c.globalAlpha = 0.85;
      c.lineWidth = 1.4;
      c.beginPath();
      const stride = Math.max(1, Math.floor(rings.count / 400));
      for (let i = 0; i < rings.count; i += stride) {
        const p = worldToPoint(rings.pos[i * 3], rings.pos[i * 3 + 1], rings.pos[i * 3 + 2], ctx);
        const q = toAB(p.x, p.y, p.z);
        const X = px(q.a);
        const Y = py(q.b);
        if (i === 0) c.moveTo(X, Y);
        else c.lineTo(X, Y);
      }
      c.stroke();
      c.globalAlpha = 1;
    }

    // control points
    const sel = new Set(selection);
    points.forEach((p, i) => {
      const q = toAB(p.x, p.y, p.z);
      const X = px(q.a);
      const Y = py(q.b);
      c.beginPath();
      c.arc(X, Y, sel.has(i) ? 5 : 3.5, 0, Math.PI * 2);
      c.fillStyle = sel.has(i) ? acc : "rgba(20,20,22,0.95)";
      c.fill();
      c.strokeStyle = sel.has(i) ? "#fff" : dim;
      c.lineWidth = 1.4;
      c.stroke();
    });

    // axis captions
    c.fillStyle = dim;
    c.textAlign = "right";
    c.fillText(axis === "side" ? "z → camera" : "x →", W - 6, H - 6);
    c.textAlign = "left";
    if (axis === "top") c.fillText("↑ camera", 6, 11);
    else c.fillText("↓ y", 6, H - 6);
  }, [fit, points, selection, rings, layout, ctx, axis, toAB, geom, A]);

  // ---- interaction ----------------------------------------------------------------
  const local = (ev: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: ((ev.clientX - r.left) / r.width) * W, y: ((ev.clientY - r.top) / r.height) * H };
  };

  const onDown = (ev: React.PointerEvent) => {
    if (!fit || ev.button !== 0) return;
    const m = local(ev);
    const { px, py } = geom(fit);
    let best = -1;
    let bd = 11 * 11;
    points.forEach((p, i) => {
      const q = toAB(p.x, p.y, p.z);
      const dx = px(q.a) - m.x;
      const dy = py(q.b) - m.y;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (best < 0) {
      if (!(ev.shiftKey || ev.metaKey)) store.select([]);
      return;
    }
    (ev.currentTarget as Element).setPointerCapture(ev.pointerId);
    const sel = new Set(selection);
    let toggle: number | null = null;
    if (ev.shiftKey || ev.metaKey || ev.ctrlKey) {
      toggle = best;
      sel.add(best);
    } else if (!sel.has(best)) {
      sel.clear();
      sel.add(best);
      store.select([best]);
    }
    dragRef.current = {
      x: m.x,
      y: m.y,
      start: points.map((p) => ({ ...p })),
      ids: [...sel],
      moved: false,
      toggle,
    };
    store.beginGesture();
  };

  const onMove = (ev: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || !fit) return;
    const m = local(ev);
    if (!d.moved && Math.hypot(m.x - d.x, m.y - d.y) < 3) return;
    d.moved = true;
    const { s } = geom(fit);
    const da = (m.x - d.x) / s; // px along the horizontal axis
    const db = ((axis === "top" ? -(m.y - d.y) : m.y - d.y)) / s; // px along the vertical axis
    const ids = new Set(d.ids);
    const next = d.start.map((p, i) => {
      if (!ids.has(i)) return p;
      return axis === "side"
        ? { ...p, z: p.z + da / A.height, y: p.y + db / A.height }
        : { ...p, x: p.x + da / A.width, z: p.z + db / A.height };
    });
    store.setPoints(next, { gesture: true });
  };

  const onUp = (ev: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    (ev.currentTarget as Element).releasePointerCapture?.(ev.pointerId);
    if (d && !d.moved && d.toggle !== null) store.toggle(d.toggle);
  };

  return (
    <div className="pe-depth__cell">
      <div className="pe-depth__head">
        <span>{axis === "side" ? "Side view" : "Top view"}</span>
        <button className="pe-link" onClick={() => setFit(computeFit())}>
          Fit
        </button>
      </div>
      <canvas
        ref={ref}
        className="pe-depth__canvas"
        style={{ width: "100%", aspectRatio: `${W} / ${H}` }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      />
    </div>
  );
}
