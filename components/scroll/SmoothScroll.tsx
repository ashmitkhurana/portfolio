"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

/**
 * Smooth-scroll provider + a tiny module-level scroll store.
 *
 * The ribbon engine (and anything else that animates per frame) reads
 * `scrollState` directly and/or `subscribe()`s to updates; it never goes
 * through React state, so scrolling causes zero re-renders.
 *
 *   y         smoothed scroll offset in CSS px (Lenis' animated value)
 *   velocity  px/frame-ish velocity reported by Lenis (0 when reduced motion)
 *   progress  0..1 along the page
 *   limit     max scroll offset (scrollHeight - innerHeight)
 *
 * With `prefers-reduced-motion: reduce` Lenis is not created: native scrolling
 * is used and the store is fed from the window scroll event instead.
 */
export interface ScrollState {
  y: number;
  velocity: number;
  progress: number;
  limit: number;
}

export const scrollState: ScrollState = {
  y: 0,
  velocity: 0,
  progress: 0,
  limit: 0,
};

type Listener = (state: ScrollState) => void;
const listeners = new Set<Listener>();

/** Subscribe to scroll updates. Returns an unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let lenis: Lenis | null = null;
let locks = 0;

/** The live Lenis instance (null on the server or with reduced motion). */
export function getLenis(): Lenis | null {
  return lenis;
}

function emit() {
  for (const l of listeners) l(scrollState);
}

function readNative() {
  const el = document.documentElement;
  const limit = Math.max(0, el.scrollHeight - window.innerHeight);
  scrollState.y = window.scrollY;
  scrollState.limit = limit;
  scrollState.progress = limit > 0 ? Math.min(1, Math.max(0, scrollState.y / limit)) : 0;
}

/**
 * Lock/unlock page scrolling (menu, dialogs). Reference counted so nested
 * overlays are safe. Works with and without Lenis.
 */
export function setScrollLocked(locked: boolean) {
  locks = Math.max(0, locks + (locked ? 1 : -1));
  const shouldLock = locks > 0;
  if (lenis) {
    if (shouldLock) lenis.stop();
    else lenis.start();
  }
  document.documentElement.style.overflow = shouldLock ? "hidden" : "";
}

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let instance: Lenis | null = null;
    let onNativeScroll: (() => void) | null = null;

    const onResize = () => {
      if (instance) {
        scrollState.limit = instance.limit;
      } else {
        readNative();
      }
      emit();
    };

    const setup = () => {
      teardown();
      if (reduce.matches) {
        onNativeScroll = () => {
          readNative();
          scrollState.velocity = 0;
          emit();
        };
        window.addEventListener("scroll", onNativeScroll, { passive: true });
        readNative();
        emit();
        return;
      }

      instance = new Lenis({
        anchors: true,
        smoothWheel: true,
        lerp: 0.1,
      });
      lenis = instance;
      if (locks > 0) instance.stop();

      instance.on("scroll", (l: Lenis) => {
        scrollState.y = l.animatedScroll;
        scrollState.velocity = l.velocity;
        scrollState.limit = l.limit;
        scrollState.progress = l.progress;
        emit();
      });

      const frame = (time: number) => {
        instance?.raf(time);
        raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);

      scrollState.y = instance.animatedScroll;
      scrollState.limit = instance.limit;
      scrollState.progress = instance.progress;
      scrollState.velocity = 0;
      emit();
    };

    const teardown = () => {
      cancelAnimationFrame(raf);
      if (onNativeScroll) window.removeEventListener("scroll", onNativeScroll);
      onNativeScroll = null;
      instance?.destroy();
      if (lenis === instance) lenis = null;
      instance = null;
    };

    setup();
    reduce.addEventListener("change", setup);
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(onResize);
    ro.observe(document.documentElement);

    return () => {
      reduce.removeEventListener("change", setup);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      teardown();
    };
  }, []);

  // New route: start at the top (hash links are handled by Lenis `anchors`
  // and by the browser).
  useEffect(() => {
    if (window.location.hash) return;
    if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
    else window.scrollTo(0, 0);
  }, [pathname]);

  return <>{children}</>;
}
