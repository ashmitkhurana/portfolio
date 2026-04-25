"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

export default function CustomCursor() {
  const dotRef  = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dot  = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    let mouseX = 0;
    let mouseY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;

      // Dot follows instantly
      gsap.set(dot, { x: mouseX, y: mouseY });

      // Ring follows with spring lag
      gsap.to(ring, {
        x: mouseX,
        y: mouseY,
        duration: 0.35,
        ease: "power2.out",
      });
    };

    // Grow ring on hoverable elements
    const handleMouseEnter = () => {
      gsap.to(ring, { scale: 2.5, opacity: 0.4, duration: 0.3 });
      gsap.to(dot,  { scale: 0,   duration: 0.2 });
    };

    const handleMouseLeave = () => {
      gsap.to(ring, { scale: 1, opacity: 0.6, duration: 0.3 });
      gsap.to(dot,  { scale: 1, duration: 0.2 });
    };

    // Hide cursor when leaving window
    const handleMouseOut = () => {
      gsap.to([dot, ring], { opacity: 0, duration: 0.2 });
    };
    const handleMouseIn = () => {
      gsap.to([dot, ring], { opacity: 1, duration: 0.2 });
    };

    window.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseOut);
    document.addEventListener("mouseenter", handleMouseIn);

    const hoverEls = document.querySelectorAll(
      "a, button, [data-cursor-hover], input, textarea, label, [role='button']"
    );
    hoverEls.forEach((el) => {
      el.addEventListener("mouseenter", handleMouseEnter);
      el.addEventListener("mouseleave", handleMouseLeave);
    });

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseOut);
      document.removeEventListener("mouseenter", handleMouseIn);
      hoverEls.forEach((el) => {
        el.removeEventListener("mouseenter", handleMouseEnter);
        el.removeEventListener("mouseleave", handleMouseLeave);
      });
    };
  }, []);

  return (
    <>
      {/* Dot */}
      <div
        ref={dotRef}
        className="fixed top-0 left-0 z-[9999] pointer-events-none mix-blend-difference"
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          backgroundColor: "#fff",
          transform: "translate(-50%, -50%)",
          willChange: "transform",
        }}
      />
      {/* Ring */}
      <div
        ref={ringRef}
        className="fixed top-0 left-0 z-[9998] pointer-events-none"
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: "1px solid rgba(255,255,255,0.6)",
          transform: "translate(-50%, -50%)",
          willChange: "transform",
          opacity: 0.6,
        }}
      />
    </>
  );
}
