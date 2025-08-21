import React, { useEffect, useRef, useMemo, ReactNode, RefObject } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import "./ScrollReveal.css";

gsap.registerPlugin(ScrollTrigger);

interface ScrollRevealProps {
  children: ReactNode;
  scrollContainerRef?: RefObject<HTMLElement>;
  triggerRef?: RefObject<HTMLElement>;
  pinTriggerId?: string; // optional ScrollTrigger id to sync with
  reinitKey?: unknown; // change this to force re-init (e.g., when pin is created)
  enableBlur?: boolean;
  baseOpacity?: number;
  baseRotation?: number;
  blurStrength?: number;
  containerClassName?: string;
  textClassName?: string;
  rotationStart?: string;
  rotationEnd?: string;
  wordAnimationStart?: string;
  wordAnimationEnd?: string;
  startOffsetVh?: number;
  endOffsetVh?: number;
}

const ScrollReveal: React.FC<ScrollRevealProps> = ({
  children,
  scrollContainerRef,
  triggerRef,
  pinTriggerId,
  reinitKey,
  enableBlur = true,
  baseOpacity = 0.1,
  baseRotation = 3,
  blurStrength = 4,
  containerClassName = "",
  textClassName = "",
  rotationStart = "top bottom",
  rotationEnd = "bottom bottom",
  wordAnimationStart = "top bottom-=20%",
  wordAnimationEnd = "bottom bottom",
  startOffsetVh,
  endOffsetVh,
}) => {
  const containerRef = useRef<HTMLHeadingElement>(null);

  const splitText = useMemo(() => {
    const text = typeof children === "string" ? children : "";
    return text.split(/(\s+)/).map((word, index) => {
      if (word.match(/^\s+$/)) return word as unknown as ReactNode;
      return (
        <span className="word" key={index}>
          {word}
        </span>
      );
    });
  }, [children]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const scroller =
      scrollContainerRef && scrollContainerRef.current
        ? scrollContainerRef.current
        : window;

  const triggerEl = triggerRef && triggerRef.current ? triggerRef.current : el;

  // We'll keep references to GSAP instances and let killing them also kill their ScrollTriggers
  const instances: gsap.core.Tween[] = [];

    // Determine resolved numeric starts if syncing to a pin id via VH offsets
    let resolvedStart: string | number = rotationStart;
    let resolvedEnd: string | number = rotationEnd;
    let resolvedWordStart: string | number = wordAnimationStart;
    let resolvedWordEnd: string | number = wordAnimationEnd;

    if (pinTriggerId && startOffsetVh !== undefined && endOffsetVh !== undefined) {
      const pin = ScrollTrigger.getById(pinTriggerId);
      if (pin) {
        const base = pin.start || 0;
        const toPx = (vh: number) => (window.innerHeight * vh) / 100;
        resolvedStart = base + toPx(startOffsetVh);
        resolvedEnd = base + toPx(endOffsetVh);
        resolvedWordStart = resolvedStart;
        resolvedWordEnd = resolvedEnd;
      } else {
        // Pin not ready yet: keep words hidden and exit. When reinitKey changes, this effect will rerun.
        const wordEls = el.querySelectorAll<HTMLElement>(".word");
        gsap.set(wordEls, {
          opacity: baseOpacity,
          filter: enableBlur ? `blur(${blurStrength}px)` : "none",
        });
        return;
      }
    }

    // rotation of the whole block (skip if baseRotation is 0)
    let rot: gsap.core.Tween | null = null;
    if (baseRotation === 0) {
      gsap.set(el, { rotate: 0, transformOrigin: "0% 50%" });
    } else {
      rot = gsap.fromTo(
        el,
        { transformOrigin: "0% 50%", rotate: baseRotation },
        {
          ease: "none",
          rotate: 0,
          immediateRender: false,
          scrollTrigger: {
            trigger: triggerEl,
            scroller,
            start: resolvedStart,
            end: resolvedEnd,
            scrub: true,
            markers: false,
          },
        }
      );
      if (rot) instances.push(rot);
    }

    const wordElements = el.querySelectorAll<HTMLElement>(".word");
    // Ensure initial hidden state before animations
    gsap.set(wordElements, {
      opacity: baseOpacity,
      filter: enableBlur ? `blur(${blurStrength}px)` : "none",
    });

    const fade = gsap.fromTo(
      wordElements,
      { opacity: baseOpacity, willChange: "opacity" },
      {
        ease: "none",
        opacity: 1,
        stagger: 0.05,
        scrollTrigger: {
          trigger: triggerEl,
          scroller,
          start: resolvedWordStart,
          end: resolvedWordEnd,
          scrub: true,
          markers: false,
        },
      }
    );
    instances.push(fade);

    if (enableBlur) {
  const blur = gsap.fromTo(
        wordElements,
        { filter: `blur(${blurStrength}px)` },
        {
          ease: "none",
          filter: "blur(0px)",
          stagger: 0.05,
          scrollTrigger: {
            trigger: triggerEl,
            scroller,
            start: resolvedWordStart,
            end: resolvedWordEnd,
            scrub: true,
    markers: false,
          },
        }
      );
  instances.push(blur);
    }

    return () => {
  // Kill created tweens; this also disposes their ScrollTriggers safely without double-killing
  instances.forEach((i) => i.kill());
  rot?.kill();
    };
  }, [
    scrollContainerRef,
    triggerRef,
    pinTriggerId,
    reinitKey,
    enableBlur,
    baseRotation,
    baseOpacity,
    rotationStart,
    rotationEnd,
    wordAnimationStart,
    wordAnimationEnd,
    blurStrength,
    startOffsetVh,
    endOffsetVh,
  ]);

  return (
    <h2 ref={containerRef} className={`scroll-reveal ${containerClassName}`}>
      <p className={`scroll-reveal-text ${textClassName}`}>{splitText}</p>
    </h2>
  );
};

export default ScrollReveal;
