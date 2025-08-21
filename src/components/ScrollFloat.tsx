import React, { useEffect, useMemo, useRef, ReactNode, RefObject } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import "./ScrollFloat.css";

gsap.registerPlugin(ScrollTrigger);

interface ScrollFloatProps {
  children: ReactNode;
  scrollContainerRef?: RefObject<HTMLElement>;
  triggerRef?: RefObject<HTMLElement>;
  containerClassName?: string;
  textClassName?: string;
  animationDuration?: number;
  ease?: string;
  scrollStart?: string;
  scrollEnd?: string;
  stagger?: number;
}

const ScrollFloat: React.FC<ScrollFloatProps> = ({
  children,
  scrollContainerRef,
  triggerRef,
  containerClassName = "",
  textClassName = "",
  animationDuration = 1,
  ease = "back.inOut(2)",
  scrollStart = "center bottom+=50%",
  scrollEnd = "bottom bottom-=40%",
  stagger = 0.03
}) => {
  const containerRef = useRef<HTMLHeadingElement>(null);

  const splitText = useMemo(() => {
    const text = typeof children === "string" ? children : "";
    return text.split("").map((char, index) => (
      <span className="char" key={index}>
        {char === " " ? "\u00A0" : char}
      </span>
    ));
  }, [children]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const scroller =
      scrollContainerRef && scrollContainerRef.current
        ? scrollContainerRef.current
        : window;

    const charElements = el.querySelectorAll(".char");
    const triggerEl = triggerRef && triggerRef.current ? triggerRef.current : el;

    // Ensure elements are visible in the DOM
    gsap.set(charElements, {
      visibility: "visible",
      display: "inline-block",
    });

    const fromState = {
      willChange: "opacity, transform",
      opacity: 0,
      yPercent: 200,
      scaleY: 3,
      scaleX: 0.5,
      transformOrigin: "50% 0%",
      filter: "blur(10px)",
    } as gsap.TweenVars;

    const toState = {
      opacity: 1,
      yPercent: 0,
      scaleY: 1,
      scaleX: 1,
      filter: "blur(0px)",
      ease,
      duration: animationDuration,
      stagger,
    } as gsap.TweenVars;

    // Ensure the characters start hidden, avoiding any pre-scroll flicker or partial animation.
    gsap.set(charElements, fromState);

    // Build a scrubbed timeline that reveals the characters as the section scrolls.
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: triggerEl,
        scroller,
        start: scrollStart,
        end: scrollEnd,
        scrub: 0.8,
        markers: false,
      },
    });

    tl.to(charElements, toState, 0);

    return () => {
      tl.scrollTrigger?.kill();
      tl.kill();
    };
  }, [
    scrollContainerRef,
    triggerRef,
    animationDuration,
    ease,
    scrollStart,
    scrollEnd,
    stagger,
  ]);

  return (
    <h2 ref={containerRef} className={`scroll-float ${containerClassName}`}>
      <span className={`scroll-float-text ${textClassName}`}>{splitText}</span>
    </h2>
  );
};

export default ScrollFloat;
