"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/** a phone held sideways (the same query the ribbon engine uses for its still mode) */
const QUERY = "(orientation: landscape) and (max-height: 540px) and (hover: none)";
const KEY = "landscape-notice-ok";

/**
 * Phones held sideways: the scroll story is built for portrait, so the page runs without it there (a still AK in the
 * hero) and a full-screen notice suggests turning the phone upright; OKAY dismisses it for the visit.
 */
export function LandscapeNotice() {
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const update = () => {
      let ok = false;
      try {
        ok = sessionStorage.getItem(KEY) === "1";
      } catch {
        /* storage blocked: show it once per page view */
      }
      setShow(mq.matches && !ok && (pathname === "/" || pathname === "/contact"));
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [pathname]);
  if (!show) return null;
  const close = () => {
    try {
      sessionStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  };
  return (
    <div className="landscape-notice" role="dialog" aria-modal="true" aria-labelledby="landscape-notice-title">
      <div className="landscape-notice__inner">
        <svg className="landscape-notice__icon" viewBox="0 0 48 48" aria-hidden="true">
          <rect x="15" y="6" width="18" height="32" rx="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M8 30a16 16 0 0 0 10 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M14 43l4-1-1-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p id="landscape-notice-title" className="landscape-notice__title">Best experienced upright</p>
        <p className="landscape-notice__text">Turn your phone to portrait for the full experience.</p>
        <button type="button" className="landscape-notice__button label" onClick={close} autoFocus>
          Okay
        </button>
      </div>
    </div>
  );
}
