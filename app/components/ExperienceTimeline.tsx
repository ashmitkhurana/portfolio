"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const experiences = [
  {
    period: "Oct 2025 — Dec 2025",
    company: "Alpha Block",
    role: "Front End Lead",
    type: "Remote",
    url: "https://app.alpha-block.ai/",
    bullets: [
      "Engineered real-time crypto platform analyzing whale & KOL wallet activity across multichain ecosystems",
      "Processed 100+ on-chain transactions daily; sub-second Telegram alert delivery",
      "Integrated Phantom wallet for non-custodial Web3 auth",
      "Supported 1,000+ active users in production",
    ],
  },
  {
    period: "Jul 2025 — Sept 2025",
    company: "Bruxford Digital",
    role: "React-Next Intern",
    type: "Remote",
    url: "https://sleepara.com/",
    bullets: [
      "Built responsive web apps (React + Next.js) focused on performance and UX",
      "Reduced page load times by 25% through optimized rendering & asset handling",
      "Increased conversion rate by 7%",
    ],
  },
  {
    period: "Aug 2024 — Sept 2024",
    company: "Arcadia Designs Inc.",
    role: "Frontend Developer",
    type: "Remote",
    url: "https://www.arcadiadesignsinc.com/",
    bullets: [
      "Designed & developed high-conversion portfolio for a Canadian architecture firm",
      "Implemented modern UI/UX with fluid animations",
      "Increased form submission rate by 12%",
    ],
  },
  {
    period: "Dec 2023 — Jan 2024",
    company: "MonkT",
    role: "Web Development Intern",
    type: "Remote",
    url: "https://monktechnology.net/",
    bullets: [
      "Designed & launched fully responsive business website end-to-end",
      "Focused on UX optimization and cross-device compatibility",
    ],
  },
];

export default function ExperienceTimeline() {
  const sectionRef = useRef<HTMLElement>(null);
  const lineRef    = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Animate the vertical stem line drawing down
    gsap.fromTo(
      lineRef.current,
      { scaleY: 0, transformOrigin: "top center" },
      {
        scaleY: 1,
        duration: 1.2,
        ease: "power2.out",
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top 70%",
        },
      }
    );

    // Stagger each entry
    const items = sectionRef.current?.querySelectorAll(".exp-item");
    if (items) {
      gsap.fromTo(
        items,
        { opacity: 0, x: -24 },
        {
          opacity: 1,
          x: 0,
          duration: 0.6,
          stagger: 0.15,
          ease: "power2.out",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top 72%",
          },
        }
      );
    }
  }, []);

  return (
    <section id="experience" ref={sectionRef} className="py-24">
      <div className="section-container">
        <h2 className="font-display font-bold text-4xl md:text-5xl text-white mb-16">
          Experience
        </h2>

        <div className="relative flex flex-col gap-0">
          {/* Vertical stem */}
          <div
            ref={lineRef}
            className="absolute left-[7px] top-2 bottom-0 w-px bg-gradient-to-b from-indigo-500 via-purple-500 to-transparent"
          />

          {experiences.map((exp, i) => (
            <div key={i} className="exp-item relative pl-10 pb-12 opacity-0">
              {/* Dot */}
              <div className="absolute left-0 top-1.5 w-[15px] h-[15px] rounded-full border-2 border-indigo-500 bg-background" />

              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-1 md:gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <a
                      href={exp.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-display font-bold text-xl md:text-2xl text-white hover:text-gradient transition-all"
                    >
                      {exp.company}
                    </a>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-white/30 border border-white/10 px-2 py-0.5 rounded-full">
                      {exp.type}
                    </span>
                  </div>
                  <p className="text-white/50 text-sm font-medium mb-3">{exp.role}</p>
                  <ul className="flex flex-col gap-1.5">
                    {exp.bullets.map((b, j) => (
                      <li key={j} className="text-white/40 text-sm flex gap-2">
                        <span className="text-indigo-500 shrink-0 mt-0.5">›</span>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
                <span className="font-mono text-xs text-white/25 shrink-0 mt-1 md:text-right">
                  {exp.period}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
