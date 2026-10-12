"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { CANDIDATES, type FontCandidate } from "@/app/lab/fonts/candidates";

type Kind = "desktop" | "mobile";

const FRAME = {
  desktop: { w: 1440, h: 900 },
  mobile: { w: 390, h: 844 },
} as const;

/** KHURANA width as a fraction of the frame width, measured from the mockups */
const MOCK_FIT = { desktop: 0.7165, mobile: 0.9155 } as const;
const MOCK_SRC = {
  desktop: { src: "/lab/ref/hero-desktop.webp", w: 1672, h: 941 },
  mobile: { src: "/lab/ref/hero-mobile.webp", w: 852, h: 1846 },
} as const;
const GAP = 16;
const ASPECT_SUM = FRAME.desktop.w / FRAME.desktop.h + FRAME.mobile.w / FRAME.mobile.h; // frames' widths in units of H

interface Params {
  tracking: number;
  leading: number;
  /** global wdth request (percent); clamped per font, ignored by fonts without the axis */
  wdth: number;
  fit: boolean;
  overlay: number; // 0 = off
}

function clampWdth(c: FontCandidate, wdth: number): number | null {
  if (!c.wdth) return null;
  return Math.min(c.wdth[1], Math.max(c.wdth[0], wdth));
}

/** one hero frame, laid out by the site's hero rules in container units */
function HeroFrame({
  kind,
  cand,
  params,
  H,
}: {
  kind: Kind;
  cand: FontCandidate;
  params: Params;
  H: number;
}) {
  const { w, h } = FRAME[kind];
  const s = H / h;
  const measRef = useRef<HTMLSpanElement>(null);
  const [k, setK] = useState(1);
  const [kw, setKw] = useState(0); // measured KHURANA width at k = 1 (frame px)
  const wd = clampWdth(cand, params.wdth);
  const target = MOCK_FIT[kind] * w;
  const baseSize = kind === "desktop" ? Math.min(0.15 * w, 0.32 * h) : Math.min(0.192 * w, 0.36 * h);

  useLayoutEffect(() => {
    const el = measRef.current;
    if (!el) return;
    const run = () => {
      const m = el.offsetWidth;
      if (m > 0) {
        setKw(m);
        setK(target / m);
      }
    };
    run();
    const fonts = document.fonts;
    fonts?.ready.then(run).catch(() => {});
    fonts?.addEventListener?.("loadingdone", run);
    return () => fonts?.removeEventListener?.("loadingdone", run);
  }, [cand, wd, params.tracking, target]);

  const style = {
    "--ff-family": cand.family,
    "--ff-weight": cand.weight,
    "--ff-wdth": wd ?? 100,
    "--ff-tracking": `${params.tracking}em`,
    "--ff-leading": params.leading,
    "--ff-k": params.fit ? k : 1,
    width: w,
    height: h,
    transform: `scale(${s})`,
  } as CSSProperties;

  const size = baseSize * (params.fit ? k : 1);
  const pct = ((kw ? kw : baseSize * 3.6) * (params.fit ? k : 1)) / w;
  const mock = MOCK_SRC[kind];

  return (
    <figure className="ff-wrap" style={{ width: w * s, height: h * s }}>
      <div className={`ff ff--${kind}`} style={style}>
        <div className="ff__inner">
          <h2 className="ff__name" aria-label="Ashmit Khurana">
            <span className="ff__line">ASHMIT</span>
            <span className="ff__line">KHURANA</span>
          </h2>
          <div className="ff__intro">
            <p className="ff__role">Full-Stack Developer</p>
            <p className="ff__tag">Building across interfaces, systems, and AI.</p>
          </div>
        </div>
        <span ref={measRef} className="ff__line ff__measure" aria-hidden="true">
          KHURANA
        </span>
        {params.overlay > 0 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            className="ff__overlay"
            src={mock.src}
            alt=""
            style={{ opacity: params.overlay, width: w, height: (w * mock.h) / mock.w }}
          />
        ) : null}
      </div>
      <figcaption className="ff-cap" style={{ top: h * s + 4, maxWidth: w * s }}>
        {Math.round(size)}px · {(pct * 100).toFixed(1)}%
      </figcaption>
    </figure>
  );
}

function MockFrame({ kind, H }: { kind: Kind; H: number }) {
  const { w, h } = FRAME[kind];
  const s = H / h;
  const mock = MOCK_SRC[kind];
  const dw = w * s;
  return (
    <figure className="ff-wrap" style={{ width: dw, height: H }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="ff-mock" src={mock.src} alt={`${kind} mockup`} style={{ width: dw, height: (dw * mock.h) / mock.w }} />
      <figcaption className="ff-cap" style={{ top: H + 4 }}>
        mockup ({kind})
      </figcaption>
    </figure>
  );
}

/** a row measures its own width and sizes both frames to the same height */
function Row({
  cand,
  params,
  maxH = 560,
}: {
  cand: FontCandidate | null;
  params: Params;
  maxH?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [H, setH] = useState(240);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const wpx = el.clientWidth;
      setH(Math.max(120, Math.min(maxH, (wpx - GAP) / ASPECT_SUM)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [maxH]);
  return (
    <div ref={ref} className="ff-row" style={{ minHeight: H + 26 }}>
      {(["desktop", "mobile"] as const).map((kind) =>
        cand ? (
          <HeroFrame key={kind} kind={kind} cand={cand} params={params} H={H} />
        ) : (
          <MockFrame key={kind} kind={kind} H={H} />
        ),
      )}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  disabled,
  fmt,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  fmt?: (v: number) => string;
}) {
  return (
    <label className={`fl-ctl${disabled ? " is-off" : ""}`}>
      <span className="fl-ctl__label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <output>{disabled ? "n/a" : fmt ? fmt(value) : value}</output>
    </label>
  );
}

export function FontLab() {
  const [view, setView] = useState<"single" | "grid">("single");
  const [fontId, setFontId] = useState(CANDIDATES[0].id);
  const [tracking, setTracking] = useState(-0.035);
  const [leading, setLeading] = useState(0.82);
  const [wdth, setWdth] = useState(100);
  const [fit, setFit] = useState(false);
  const [overlay, setOverlay] = useState(0);

  // ?view=grid&font=mona&tracking=-0.04&leading=0.85&wdth=90&fit=1&overlay=0.5 (handy for sharing/screenshots)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const num = (key: string) => {
      const v = parseFloat(q.get(key) ?? "");
      return Number.isFinite(v) ? v : null;
    };
    if (q.get("view") === "grid") setView("grid");
    const f = q.get("font");
    if (f && CANDIDATES.some((c) => c.id === f)) setFontId(f);
    const t = num("tracking");
    if (t !== null) setTracking(Math.max(-0.06, Math.min(0, t)));
    const l = num("leading");
    if (l !== null) setLeading(Math.max(0.7, Math.min(1.1, l)));
    const wv = num("wdth");
    if (wv !== null) setWdth(wv);
    if (q.get("fit") === "1") setFit(true);
    const o = num("overlay");
    if (o !== null) setOverlay(Math.max(0, Math.min(1, o)));
  }, []);

  const cand = useMemo(() => CANDIDATES.find((c) => c.id === fontId) ?? CANDIDATES[0], [fontId]);
  const params: Params = { tracking, leading, wdth, fit, overlay };
  const cw = clampWdth(cand, wdth);
  const pick = useCallback((id: string) => {
    setFontId(id);
    setView("single");
  }, []);

  return (
    <div className="fl">
      <header className="fl-bar">
        <div className="fl-bar__row">
          <strong className="fl-title">Font lab</strong>
          <label className="fl-pick">
            <span className="fl-ctl__label">Font</span>
            <select value={fontId} onChange={(e) => setFontId(e.target.value)} disabled={view === "grid"}>
              {CANDIDATES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.weight}
                  {c.wdth ? ` [wdth ${c.wdth[0]}-${c.wdth[1]}]` : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="fl-seg" role="group" aria-label="View">
            <button type="button" aria-pressed={view === "single"} onClick={() => setView("single")}>
              Single
            </button>
            <button type="button" aria-pressed={view === "grid"} onClick={() => setView("grid")}>
              Show all
            </button>
          </div>
          <label className="fl-check">
            <input type="checkbox" checked={fit} onChange={(e) => setFit(e.target.checked)} />
            Fit KHURANA to mockup width
          </label>
        </div>
        <div className="fl-bar__row">
          <Slider
            label="Width (wdth)"
            value={view === "single" ? (cw ?? 100) : wdth}
            min={view === "single" && cand.wdth ? cand.wdth[0] : 25}
            max={view === "single" && cand.wdth ? cand.wdth[1] : 151}
            step={1}
            disabled={view === "single" && !cand.wdth}
            onChange={setWdth}
            fmt={(v) => `${v}`}
          />
          <Slider label="Tracking" value={tracking} min={-0.06} max={0} step={0.0025} onChange={setTracking} fmt={(v) => `${v.toFixed(4)}em`} />
          <Slider label="Line-height" value={leading} min={0.7} max={1.1} step={0.01} onChange={setLeading} fmt={(v) => v.toFixed(2)} />
          <Slider label="Mockup overlay" value={overlay} min={0} max={1} step={0.05} onChange={setOverlay} fmt={(v) => (v === 0 ? "off" : `${Math.round(v * 100)}%`)} />
        </div>
        <p className="fl-hint">
          Frames follow the site hero rules (desktop: min(15vw, 32svh) · mobile: min(19.2vw, 36svh), uppercase, tracking and
          leading from the sliders). Caption = font-size and KHURANA width as a share of the frame (mockup: 71.7% desktop, 91.5% mobile). In grid view the width slider applies to every font that has a wdth axis.
        </p>
      </header>

      <section className="fl-sect">
        <h3 className="fl-h">Mockup</h3>
        <Row cand={null} params={params} maxH={view === "grid" ? 300 : 440} />
      </section>

      {view === "single" ? (
        <section className="fl-sect">
          <h3 className="fl-h">
            {cand.name} <small>{cand.weight}</small>
            {cand.wdth ? <em className="fl-badge">wdth {cand.wdth[0]}–{cand.wdth[1]}</em> : <em className="fl-badge fl-badge--no">no wdth axis</em>}
          </h3>
          <p className="fl-note">{cand.note}</p>
          <Row cand={cand} params={params} maxH={440} />
        </section>
      ) : (
        <section className="fl-grid">
          {CANDIDATES.map((c) => (
            <article className="fl-card" key={c.id}>
              <button type="button" className="fl-card__head" onClick={() => pick(c.id)} title="Open in single view">
                <span className="fl-card__name">
                  {c.name} <small>{c.weight}</small>
                </span>
                {c.wdth ? <em className="fl-badge">wdth {c.wdth[0]}–{c.wdth[1]}</em> : <em className="fl-badge fl-badge--no">no wdth</em>}
              </button>
              <Row cand={c} params={params} maxH={320} />
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
