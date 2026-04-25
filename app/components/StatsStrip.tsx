"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const stats = [
  { value: 100, suffix: "+", label: "On-chain transactions/day", color: "from-indigo-400 to-purple-400" },
  { value: 1000, suffix: "+", label: "Active users supported",   color: "from-purple-400 to-pink-400" },
  { value: 25,  suffix: "%", label: "Load time reduction",       color: "from-pink-400 to-rose-400" },
  { value: 7,   suffix: "%", label: "Conversion rate increase",  color: "from-rose-400 to-orange-400" },
];

function AnimatedCounter({
  value,
  suffix,
  color,
}: {
  value: number;
  suffix: string;
  color: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const counter = { val: 0 };

    ScrollTrigger.create({
      trigger: el,
      start: "top 85%",
      onEnter: () => {
        gsap.to(counter, {
          val: value,
          duration: 1.8,
          ease: "power2.out",
          onUpdate: () => {
            el.textContent = Math.round(counter.val) + suffix;
          },
        });
      },
    });
  }, [value, suffix]);

  return (
    <span
      ref={ref}
      className={`font-display font-bold text-5xl md:text-6xl text-transparent bg-clip-text bg-gradient-to-r ${color}`}
    >
      0{suffix}
    </span>
  );
}

export default function StatsStrip() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    gsap.fromTo(
      sectionRef.current?.querySelectorAll(".stat-item") ?? [],
      { opacity: 0, y: 30 },
      {
        opacity: 1,
        y: 0,
        duration: 0.6,
        stagger: 0.12,
        ease: "power2.out",
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 80%",
        },
      }
    );
  }, []);

  return (
    <section ref={sectionRef} className="py-20">
      <div className="section-container">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-4">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="stat-item flex flex-col items-center text-center gap-2 opacity-0"
            >
              <AnimatedCounter
                value={stat.value}
                suffix={stat.suffix}
                color={stat.color}
              />
              <p className="text-white/40 text-sm font-mono tracking-wide leading-tight">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
