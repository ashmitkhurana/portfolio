"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import Link from "next/link";
import { getLenis } from "@/components/scroll/SmoothScroll";
import {
  FILES,
  FUN_FACTS,
  HELP_KEYS,
  HELP_LINES,
  PROMPT,
  RESUME,
  aboutLines,
  complete,
  contactLines,
  lsProjects,
  lsRoot,
  lsSkills,
  pagesLines,
  resolveFile,
  type Entry,
  type Line,
} from "./commands";
import { nukeEffect, prefersReducedMotion } from "./effects";
import "./terminal.css";

export interface TerminalProps {
  variant: "overlay" | "inline";
  /** overlay: close (Esc, backdrop, Close, yellow light: the session is kept for the next open) */
  onClose?: () => void;
  /** overlay: the green light (fill the whole window / back) */
  onToggleFull?: () => void;
  full?: boolean;
}

/** the overlay's session, kept while it is minimised (closed any way but the red light) */
let savedSession: { entries: Entry[]; nextId: number } | null = null;

const HISTORY_KEY = "terminal:history";
const HISTORY_MAX = 50;
const HACK_MS = 6000;

function loadHistory(): string[] {
  try {
    const raw = window.sessionStorage.getItem(HISTORY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function saveHistory(h: string[]) {
  try {
    window.sessionStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-HISTORY_MAX)));
  } catch {
    /* storage unavailable */
  }
}

/** a touch screen without a keyboard's Esc / Tab / arrows (the hints are keyboard-only) */
const isTouchOnly = () => typeof window !== "undefined" && window.matchMedia("(hover: none) and (pointer: coarse)").matches;

const WELCOME = (variant: TerminalProps["variant"]): Line[] =>
  // (the overlay only mounts in the browser, on open: no server render to mismatch)
  variant === "overlay" && isTouchOnly()
    ? ["Welcome. Type 'help' to see available commands."]
    : [
        "Welcome. Type 'help' to see available commands.",
        {
          text:
            variant === "overlay"
              ? "Esc closes this terminal. Tab completes, Up/Down recalls history."
              : "Tab completes, Up/Down recalls history.",
          tone: "muted",
        },
      ];

/* ── Matrix rain ──────────────────────────────────────── */

function MatrixRain({ onDone }: { onDone: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      doneRef.current();
      return;
    }
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*(){}[]<>/?=+-";
    const size = 15;
    let w = 0;
    let h = 0;
    let drops: number[] = [];
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#0d0c0b";
      ctx.fillRect(0, 0, w, h);
      const cols = Math.ceil(w / size);
      drops = Array.from({ length: cols }, () => -Math.random() * (h / size));
    };
    resize();

    let raf = 0;
    let last = 0;
    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (t - last < 40) return;
      last = t;
      ctx.fillStyle = "rgba(13, 12, 11, 0.16)";
      ctx.fillRect(0, 0, w, h);
      ctx.font = `${size}px ui-monospace, monospace`;
      for (let i = 0; i < drops.length; i++) {
        const ch = chars[Math.floor(Math.random() * chars.length)];
        const y = drops[i] * size;
        ctx.fillStyle = "#fff4e6";
        ctx.fillText(ch, i * size, y);
        ctx.fillStyle = "#ff7a12";
        ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * size, y - size);
        if (y > h && Math.random() > 0.975) drops[i] = 0;
        drops[i] += 1;
      }
    };
    raf = requestAnimationFrame(frame);

    const stop = () => doneRef.current();
    const timer = window.setTimeout(stop, HACK_MS);
    // attach slightly late so the Enter keystroke that started it does not stop it
    const arm = window.setTimeout(() => window.addEventListener("keydown", stop), 120);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
      window.clearTimeout(arm);
      window.removeEventListener("keydown", stop);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className="term__matrix" aria-hidden="true" />;
}

/* ── Output rendering ─────────────────────────────────── */

function LineView({ line, onNavigate }: { line: Line; onNavigate?: () => void }) {
  if (typeof line === "string") {
    return <div className="term__line">{line === "" ? " " : line}</div>;
  }
  if ("cmd" in line) {
    return (
      <div className="term__line term__line--cmd">
        <span className="term__cmdname">{line.cmd}</span>
        <span className="term__desc">{line.desc}</span>
      </div>
    );
  }
  const cls = `term__line${line.tone ? ` term__line--${line.tone}` : ""}`;
  if (line.href) {
    const internal = line.href.startsWith("/");
    return (
      <div className={cls}>
        {internal ? (
          <Link href={line.href} className="term__link" onClick={onNavigate}>
            {line.text}
          </Link>
        ) : (
          <a
            href={line.href}
            className="term__link"
            {...(line.href.startsWith("http")
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            {line.text}
          </a>
        )}
      </div>
    );
  }
  return <div className={cls}>{line.text}</div>;
}

/* ── Component ────────────────────────────────────────── */

export function Terminal({ variant, onClose, onToggleFull, full }: TerminalProps) {
  const uid = useId();
  const inputId = `${uid}-input`;

  const resumed = variant === "overlay" ? savedSession : null;
  const idRef = useRef(resumed?.nextId ?? 1);
  const [entries, setEntries] = useState<Entry[]>(() => resumed?.entries ?? [{ id: 0, lines: WELCOME(variant) }]);
  // overlay: the session survives a close (minimise) unless the red light discarded it
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const discardRef = useRef(false);
  useEffect(() => {
    if (variant !== "overlay") return;
    // (the latest values at close time, on purpose)
    const live = { entries: entriesRef, ids: idRef, discard: discardRef };
    return () => {
      savedSession = live.discard.current ? null : { entries: live.entries.current, nextId: live.ids.current };
    };
  }, [variant]);
  const [value, setValue] = useState("");
  const [matrix, setMatrix] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<string[]>([]);
  const histIdx = useRef(0);
  const draft = useRef("");

  useEffect(() => {
    historyRef.current = loadHistory();
    histIdx.current = historyRef.current.length;
  }, []);

  // keep the newest output in view
  useEffect(() => {
    const el = outputRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries]);

  // overlay: focus the input on open
  useEffect(() => {
    if (variant === "overlay") inputRef.current?.focus({ preventScroll: true });
  }, [variant]);

  // inline: wheel scrolls the page unless the output can still scroll in that direction
  useEffect(() => {
    if (variant !== "inline") return;
    const el = outputRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.deltaY === 0) return;
      const max = el.scrollHeight - el.clientHeight;
      const atStart = el.scrollTop <= 0 && e.deltaY < 0;
      const atEnd = el.scrollTop >= max - 1 && e.deltaY > 0;
      if (max > 1 && !atStart && !atEnd) return; // let the output scroll (natively: Lenis skips it, data-lenis-prevent)
      // not scrollable, or at its end in that direction: hand the page the delta
      e.preventDefault();
      const lenis = getLenis();
      if (lenis) lenis.scrollTo(lenis.targetScroll + e.deltaY, { lerp: 0.1 });
      else window.scrollBy({ top: e.deltaY });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [variant]);

  const push = useCallback((cmd: string | undefined, lines: Line[], tone?: Entry["tone"]) => {
    setEntries((prev) => [...prev, { id: idRef.current++, cmd, lines, tone }]);
  }, []);

  const finishHack = useCallback(() => {
    setMatrix(false);
    push(undefined, [
      "HACK TERMINATED.",
      "Don't worry, you didn't actually hack anything. But your security instincts are impressive.",
    ], "warn");
  }, [push]);

  const run = useCallback(
    (raw: string) => {
      const input = raw.trim();
      const [first, ...args] = input.split(/\s+/);
      const name = first.toLowerCase();
      const a0 = (args[0] ?? "").toLowerCase();
      const echo = (lines: Line[], tone?: Entry["tone"]) => push(input, lines, tone);

      switch (name) {
        case "help":
          return echo(isTouchOnly() ? HELP_LINES : [...HELP_LINES, ...HELP_KEYS]);
        case "about":
          return echo(aboutLines());
        case "contact":
          return echo(contactLines());
        case "pages":
          return echo(pagesLines());
        case "clear":
          setEntries([]);
          return;
        case "ls": {
          if (!args.length) return echo(lsRoot());
          const t = a0.replace(/\/$/, "");
          if (t === "skills") return echo(lsSkills());
          if (t === "projects") return echo(lsProjects());
          return echo([`ls: cannot access '${args[0]}': No such file or directory`], "error");
        }
        case "cat": {
          if (!args.length) return echo(["cat: missing file operand. Try 'ls'."], "error");
          const key = resolveFile(args[0]);
          if (!key) return echo([`cat: ${args[0]}: No such file or directory`], "error");
          return echo(FILES[key]);
        }
        case "exit":
          if (variant === "overlay" && onClose) {
            onClose();
          } else {
            echo(["This terminal is part of the page. Open the full one with the >_ button at the top."]);
          }
          return;
        case "download": {
          if (a0 !== "resume") return echo(["usage: download resume"], "error");
          const link = document.createElement("a");
          link.href = RESUME.href;
          link.download = RESUME.filename;
          document.body.appendChild(link);
          link.click();
          link.remove();
          return echo([`Downloading ${RESUME.filename}...`], "ok");
        }
        case "sudo": {
          if (a0 !== "ask-me-anything") {
            return echo(["sudo: try 'sudo ask-me-anything'"], "error");
          }
          const fact = FUN_FACTS[Math.floor(Math.random() * FUN_FACTS.length)];
          return echo(["[sudo] password for ashmit: ********", fact]);
        }
        case "hack": {
          if (prefersReducedMotion()) {
            return echo([
              "INITIATING HACK SEQUENCE... (animation skipped: reduced motion)",
              "HACK TERMINATED. You didn't actually hack anything.",
            ], "warn");
          }
          echo(["INITIATING HACK SEQUENCE... press any key to abort."], "warn");
          setMatrix(true);
          return;
        }
        case "nuke": {
          if (a0 !== "confirm") {
            return echo([
              "WARNING: this will shake the whole site and set off a very loud boom.",
              "Type 'nuke confirm' to proceed, or run any other command to cancel.",
            ], "warn");
          }
          echo(["NUCLEAR LAUNCH SEQUENCE INITIATED.", "TAKE COVER."], "error");
          if (!prefersReducedMotion()) window.setTimeout(nukeEffect, 350);
          else {
            push(undefined, ["(shake, flash and sound skipped: reduced motion)"]);
          }
          return;
        }
        default:
          return echo([`command not found: ${first}. Try 'help'.`], "error");
      }
    },
    [onClose, push, variant],
  );

  const submit = () => {
    const input = value.trim();
    setValue("");
    if (!input) return;
    const h = historyRef.current;
    if (h[h.length - 1] !== input) {
      h.push(input);
      if (h.length > HISTORY_MAX) h.splice(0, h.length - HISTORY_MAX);
      saveHistory(h);
    }
    histIdx.current = h.length;
    draft.current = "";
    run(input);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const h = historyRef.current;
      if (histIdx.current === h.length) draft.current = value;
      if (histIdx.current > 0) {
        histIdx.current -= 1;
        setValue(h[histIdx.current]);
      }
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const h = historyRef.current;
      if (histIdx.current < h.length) {
        histIdx.current += 1;
        setValue(histIdx.current === h.length ? draft.current : h[histIdx.current]);
      }
    } else if (e.key === "Tab" && !e.shiftKey) {
      const c = complete(value);
      if (c) {
        e.preventDefault();
        setValue(c.value);
        if (c.candidates.length > 1) push(value, [c.candidates.join("   ")]);
      } else if (variant === "inline") {
        return; // nothing to complete: let focus move on
      } else {
        e.preventDefault(); // overlay: the panel's focus trap handles Tab
      }
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      setEntries([]);
    }
  };

  const focusInput = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest("a, button")) return;
    if (window.getSelection()?.toString()) return;
    inputRef.current?.focus({ preventScroll: true });
  };

  return (
    <div
      className={`term term--${variant}`}
      onClick={focusInput}
      data-term-variant={variant}
    >
      <div className="term__bar">
        {variant === "overlay" && onClose ? (
          <span className="term__dots term__dots--live">
            <button
              type="button"
              className="term__light term__light--close"
              aria-label="Close and clear the terminal"
              onClick={() => {
                discardRef.current = true;
                onClose();
              }}
            />
            <button type="button" className="term__light term__light--min" aria-label="Minimise (keeps your session)" onClick={onClose} />
            <button
              type="button"
              className="term__light term__light--full"
              aria-label={full ? "Exit full screen" : "Full screen"}
              aria-pressed={!!full}
              onClick={onToggleFull}
            />
          </span>
        ) : (
          <span className="term__dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        )}
        <span className="term__title" aria-hidden="true">
          ashmit@portfolio:~
        </span>
        {onClose && (
          <button type="button" className="term__close" onClick={onClose}>
            Close<span className="term__kbd" aria-hidden="true">esc</span>
          </button>
        )}
      </div>

      <div className="term__body">
        <div
          ref={outputRef}
          className="term__output"
          data-lenis-prevent=""
          aria-live="polite"
          aria-label="Terminal output"
          role="log"
        >
          {entries.map((en) => (
            <div key={en.id} className={`term__entry${en.tone ? ` term__entry--${en.tone}` : ""}`}>
              {en.cmd !== undefined && (
                <div className="term__echo">
                  <span className="term__prompt" aria-hidden="true">{PROMPT}</span>
                  <span className="term__typed">{en.cmd}</span>
                </div>
              )}
              {en.lines.map((l, i) => (
                <LineView key={i} line={l} onNavigate={variant === "overlay" ? onClose : undefined} />
              ))}
            </div>
          ))}
        </div>
        {matrix && <MatrixRain onDone={finishHack} />}
      </div>

      <div className="term__inputrow">
        <label htmlFor={inputId} className="term__sr">
          Terminal command
        </label>
        <span className="term__prompt" aria-hidden="true">{PROMPT}</span>
        <input
          ref={inputRef}
          id={inputId}
          className="term__input"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="go"
          // browser extensions (password managers, autofill) inject inline styles here before hydration
          suppressHydrationWarning
        />
      </div>
    </div>
  );
}
