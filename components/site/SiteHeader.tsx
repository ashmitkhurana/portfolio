"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AKMark } from "@/components/brand/AKMark";
import { MobileMenu } from "@/components/site/MobileMenu";
import { identity, nav } from "@/data/site-content";
import "./header.css";

function isActive(pathname: string, href: string) {
  if (href.startsWith("/#")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** content that must never sit under the header (block-level boxes; the ribbon canvases are not content) */
const CONTENT = "h1,h2,h3,h4,h5,h6,p,li,img,figure,button,input,label,dt,dd,pre,blockquote,video,[data-header-avoid]";

/**
 * true when any visible content block of the page overlaps the header band. Uses each block's own box, not the
 * inline glyph boxes inside it (display type at 0.82 leading has glyph boxes that reach far above the letters).
 */
function contentUnder(header: HTMLElement): boolean {
  const bar = header.querySelector(".site-header__bar");
  const main = document.querySelector("main");
  if (!bar || !main) return false;
  const band = bar.getBoundingClientRect().bottom;
  for (const el of main.querySelectorAll<HTMLElement>(CONTENT)) {
    const r = el.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= band || r.width === 0 || r.height === 0) continue;
    if (el.closest("[hidden], [inert]")) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.opacity === "0") continue;
    return true;
  }
  return false;
}

/**
 * Fixed site header. Lives OUTSIDE the ribbon stage so it stays above both canvases. Transparent while nothing
 * is under it; a frosted backdrop fades in only when page content scrolls under the bar, so the logo and links
 * never sit on top of text.
 */
export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [covered, setCovered] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // close the menu on navigation
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // frosted backdrop only while content is under the bar (checked once per frame while scrolling/resizing)
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    let raf = 0;
    const check = () => {
      raf = 0;
      setCovered(contentUnder(header));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const t = window.setTimeout(schedule, 800); // after fonts/layout settle
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.clearTimeout(t);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [pathname]);

  const openTerminal = () => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent("terminal:open"));
  };

  return (
    <header
      ref={headerRef}
      className="site-header"
      data-open={open || undefined}
      data-covered={covered || undefined}
    >
      <div className="site-header__bar">
        <Link
          href="/"
          className="site-header__logo"
          aria-label={`${identity.name}, home`}
        >
          <AKMark className="site-header__mark" />
        </Link>

        <nav className="site-header__nav" aria-label="Primary">
          <ul>
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(pathname, item.href) ? "page" : undefined}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="site-header__actions">
          <button
            type="button"
            className="site-header__terminal"
            aria-label="Open terminal"
            onClick={openTerminal}
          >
            <span aria-hidden="true">&gt;_</span>
          </button>
          <button
            ref={toggleRef}
            type="button"
            className="site-header__burger"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((v) => !v)}
          >
            <span className="site-header__burger-lines" aria-hidden="true">
              <span />
              <span />
            </span>
          </button>
        </div>
      </div>

      <MobileMenu
        id="mobile-menu"
        open={open}
        onClose={close}
        containerRef={headerRef}
        toggleRef={toggleRef}
        pathname={pathname}
      />
    </header>
  );
}
