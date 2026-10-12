"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, CopyIcon } from "@/components/site/icons";
import { contact, identity } from "@/data/site-content";

type Status = "idle" | "copied" | "failed";

/** The email as a big mailto link plus a copy button with polite live feedback. */
export function CopyEmail() {
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    let next: Status = "copied";
    try {
      await navigator.clipboard.writeText(identity.email);
    } catch {
      next = "failed";
    }
    setStatus(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), 2200);
  };

  return (
    <div className="copy-email">
      <a className="copy-email__link" href={`mailto:${identity.email}`}>
        {identity.email}
      </a>
      <button
        type="button"
        className="copy-email__button"
        onClick={copy}
        aria-label={contact.copyLabel}
      >
        {status === "copied" ? <CheckIcon /> : <CopyIcon />}
      </button>
      <span className="copy-email__status label" role="status" aria-live="polite">
        {status === "copied" ? "Copied" : status === "failed" ? "Copy failed" : ""}
      </span>
    </div>
  );
}
