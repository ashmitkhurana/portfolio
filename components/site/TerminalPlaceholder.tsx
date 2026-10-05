"use client";

import { useEffect, useRef } from "react";
import { setScrollLocked } from "@/components/scroll/SmoothScroll";
import "./terminal-placeholder.css";

/**
 * Placeholder for the terminal overlay (a later phase). Listens for the
 * `terminal:open` window event dispatched by the header's `>_` button and
 * shows a minimal accessible modal. Uses the native <dialog>, which provides
 * the focus trap, Esc-to-close, inert background and focus restoration.
 * Replace this component with the real terminal; keep the event contract.
 */
export function TerminalPlaceholder() {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    const open = () => {
      if (!dialog.open) {
        dialog.showModal();
        setScrollLocked(true);
      }
    };
    const onClose = () => setScrollLocked(false);

    window.addEventListener("terminal:open", open);
    dialog.addEventListener("close", onClose);
    return () => {
      window.removeEventListener("terminal:open", open);
      dialog.removeEventListener("close", onClose);
      if (dialog.open) {
        dialog.close();
      }
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="terminal-dialog"
      aria-labelledby="terminal-dialog-title"
      onClick={(e) => {
        // click on the backdrop closes
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="terminal-dialog__window">
        <div className="terminal-dialog__bar">
          <span className="terminal-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className="label">terminal</span>
          <button
            type="button"
            className="terminal-dialog__close"
            onClick={() => ref.current?.close()}
          >
            Close
          </button>
        </div>
        <div className="terminal-dialog__body">
          <p className="terminal-dialog__prompt" aria-hidden="true">
            &gt; explore
          </p>
          <h2 id="terminal-dialog-title" className="terminal-dialog__title">
            Terminal coming soon
          </h2>
          <p className="muted">
            A command line for getting around this site is on its way.
          </p>
        </div>
      </div>
    </dialog>
  );
}
