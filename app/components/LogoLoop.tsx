"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

export interface LogoItem {
  default: string;
  color: string;
}

export interface LogoLoopProps {
  logos: LogoItem[];
  speed?: number;
  direction?: "left" | "right";
  className?: string;
}

const LogoLoop = ({
  logos = [],
  speed = 20,
  direction = "left",
  className = ""
}: LogoLoopProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const tweenRef = useRef<gsap.core.Tween | null>(null);

  // Four copies ensure we can smoothly offset by 50% without reaching the empty end.
  const displayLogos = [...logos, ...logos, ...logos, ...logos];

  useEffect(() => {
    if (!trackRef.current) return;

    const distance = direction === "left" ? "-50%" : "50%";
    
    tweenRef.current = gsap.fromTo(trackRef.current, 
      { x: "0%" },
      {
        x: distance,
        duration: speed,
        ease: "none",
        repeat: -1,
      }
    );

    return () => {
      tweenRef.current?.kill();
    };
  }, [speed, direction]);

  return (
    <div
      ref={containerRef}
      className={`relative flex overflow-hidden ${className}`}
      style={{
        maskImage: "linear-gradient(to right, transparent, black 15%, black 85%, transparent)",
        WebkitMaskImage: "linear-gradient(to right, transparent, black 15%, black 85%, transparent)"
      }}
    >
      <div ref={trackRef} className="flex flex-nowrap gap-10 w-max items-center px-4 hover:pause">
        {displayLogos.map((logo, index) => (
          <div
            key={index}
            className="flex-shrink-0 relative flex items-center justify-center h-16 w-20 group/logo cursor-auto"
          >
            {/* Default monotone logo */}
            <img
              src={logo.default}
              alt={`Logo`}
              className="absolute inset-0 w-12 h-12 m-auto object-contain brightness-0 invert opacity-40 group-hover/logo:opacity-0 transition-opacity duration-300"
            />
            {/* Full color hover logo */}
            <img
              src={logo.color}
              alt={`Logo Full`}
              className="absolute inset-0 w-12 h-12 m-auto object-contain opacity-0 group-hover/logo:opacity-100 transition-opacity duration-300 group-hover/logo:scale-110"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default LogoLoop;