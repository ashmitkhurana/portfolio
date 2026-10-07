"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { setScrollLocked } from "@/components/scroll/SmoothScroll";
import { Terminal } from "./Terminal";
import "./terminal.css";

const CLOSE_MS = 160;

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return (
    t.isContentEditable ||
    t.tagName === "INPUT" ||
    t.tagName === "TEXTAREA" ||
    t.tagName === "SELECT"
  );
}

/**
 * The command-palette terminal. Opens from the header `>_` button (the
 * `terminal:open` window event), Cmd/Ctrl+K and the backtick key.
 * Focus is trapped while open and returned to the trigger on close; page
 * scrolling is locked through the shared Lenis lock.
 */
export function TerminalOverlay() {
  const [state, setState] = useState<"closed" | "open" | "closing">("closed");
  const stateRef = useRef(state);
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const lockedRef = useRef(false);
  const timerRef = useRef<number>(0);

  const set = useCallback((s: "closed" | "open" | "closing") => {
    stateRef.current = s;
    setState(s);
  }, []);

  const unlock = useCallback(() => {
    if (lockedRef.current) {
      lockedRef.current = false;
      setScrollLocked(false);
    }
  }, []);

  const open = useCallback(() => {
    if (stateRef.current !== "closed") return;
    const active = document.activeElement;
    triggerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
    if (!lockedRef.current) {
      lockedRef.current = true;
      setScrollLocked(true);
    }
    set("open");
  }, [set]);

  const close = useCallback(() => {
    if (stateRef.current !== "open") return;
    set("closing");
    unlock();
    const t = triggerRef.current;
    if (t && t.isConnected) t.focus({ preventScroll: true });
    triggerRef.current = null;
    timerRef.current = window.setTimeout(() => set("closed"), CLOSE_MS);
  }, [unlock, set]);

  useEffect(() => {
    const onOpen = () => open();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (stateRef.current === "open") close();
        else open();
        return;
      }
      if (e.key === "Escape" && stateRef.current === "open") {
        e.preventDefault();
        close();
        return;
      }
      if (
        e.key === "`" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.isComposing &&
        stateRef.current === "closed" &&
        !isTypingTarget(e.target)
      ) {
        e.preventDefault();
        open();
      }
    };
    window.addEventListener("terminal:open", onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("terminal:open", onOpen);
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timerRef.current);
      unlock();
    };
  }, [open, close, unlock]);

  const trap = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = Array.from(
      panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled])"),
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (!panel.contains(active)) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (state === "closed") return null;

  return (
    <div className="term-overlay" data-state={state}>
      <div className="term-overlay__backdrop" onClick={close} aria-hidden="true" />
      <div
        ref={panelRef}
        className="term-overlay__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Terminal"
        onKeyDown={trap}
      >
        <Terminal variant="overlay" onClose={close} />
      </div>
    </div>
  );
}
