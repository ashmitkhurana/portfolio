"use client";

import { useEffect } from "react";

/**
 * Publishes the footer's height (--footer-h) and the contact body's height (--contact-body-h) on :root, so the
 * last screen (contact + footer) fits exactly one viewport and the contact heading takes the height that is left.
 */
export function FooterHeight() {
  useEffect(() => {
    const footer = document.querySelector<HTMLElement>(".site-footer");
    if (!footer) return;
    const body = document.querySelector<HTMLElement>(".contact__body");
    const root = document.documentElement;
    const set = () => {
      root.style.setProperty("--footer-h", `${footer.offsetHeight}px`);
      if (body) root.style.setProperty("--contact-body-h", `${body.offsetHeight}px`);
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(footer);
    if (body) ro.observe(body);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--footer-h");
      root.style.removeProperty("--contact-body-h");
    };
  }, []);
  return null;
}
