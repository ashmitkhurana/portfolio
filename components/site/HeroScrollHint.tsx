"use client";

import { useEffect } from "react";
import { ArrowDown } from "@/components/site/icons";

/**
 * "Scroll to explore" in the hero: a hint, not a link. It fades out as soon as the journey begins (the first scroll)
 * and back in at the very top.
 */
export function HeroScrollHint({ label }: { label: string }) {
  useEffect(() => {
    const root = document.documentElement;
    const update = () => root.toggleAttribute("data-journey-started", window.scrollY > 4);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      root.removeAttribute("data-journey-started");
    };
  }, []);
  return (
    <p className="hero__scroll label">
      <span>{label}</span>
      <ArrowDown />
    </p>
  );
}
