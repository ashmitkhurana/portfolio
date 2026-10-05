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

/** Fixed, transparent site header. Lives OUTSIDE the ribbon stage so it stays above both canvases. */
export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // close the menu on navigation
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const openTerminal = () => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent("terminal:open"));
  };

  return (
    <header ref={headerRef} className="site-header" data-open={open || undefined}>
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
