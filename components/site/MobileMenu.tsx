"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { setScrollLocked } from "@/components/scroll/SmoothScroll";
import { identity, nav, socials } from "@/data/site-content";

const FOCUSABLE = 'a[href], button:not([disabled])';

interface MobileMenuProps {
  id: string;
  open: boolean;
  onClose: () => void;
  /** the header element: the focus trap cycles through everything in it */
  containerRef: React.RefObject<HTMLElement | null>;
  toggleRef: React.RefObject<HTMLButtonElement | null>;
  pathname: string;
}

/**
 * Full-screen menu for < 768px. While open: page scroll is locked (via Lenis
 * stop), the page content is inert, focus is trapped in the header + menu,
 * and Esc closes it and returns focus to the toggle.
 */
export function MobileMenu({
  id,
  open,
  onClose,
  containerRef,
  toggleRef,
  pathname,
}: MobileMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const main = document.getElementById("content");
    const toggle = toggleRef.current;
    setScrollLocked(true);
    main?.setAttribute("inert", "");
    menuRef.current?.querySelector<HTMLElement>("a[href]")?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const root = containerRef.current;
      if (!root) return;
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };

    // leaving the mobile breakpoint with the menu open: close it
    const mq = window.matchMedia("(min-width: 768px)");
    const onMq = () => {
      if (mq.matches) onClose();
    };
    mq.addEventListener("change", onMq);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      mq.removeEventListener("change", onMq);
      main?.removeAttribute("inert");
      setScrollLocked(false);
      toggle?.focus({ preventScroll: true });
    };
  }, [open, onClose, containerRef, toggleRef]);

  return (
    <div
      ref={menuRef}
      id={id}
      className="mobile-menu"
      data-open={open || undefined}
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      hidden={!open}
    >
      <nav className="mobile-menu__nav" aria-label="Mobile">
        <ul>
          {nav.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="mobile-menu__link"
                aria-current={pathname === item.href ? "page" : undefined}
                onClick={onClose}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="mobile-menu__foot">
        <a className="mobile-menu__email" href={`mailto:${identity.email}`}>
          {identity.email}
        </a>
        <ul className="mobile-menu__socials">
          {socials.map((s) => (
            <li key={s.href}>
              <a className="label" href={s.href} target="_blank" rel="noopener noreferrer">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
