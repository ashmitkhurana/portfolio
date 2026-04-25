"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Github, Linkedin, Instagram, Mail } from "lucide-react";

gsap.registerPlugin(ScrollTrigger);

const AVAILABILITY_TEXT = "AVAILABLE FOR WORK · 2026 · LET'S CONNECT · FRONTEND ENGINEER · ";
const SOCIAL_LINKS = [
  { label: "GitHub",    href: "https://github.com/ashmitkhurana",           icon: Github },
  { label: "LinkedIn",  href: "https://linkedin.com/in/ashmitkhurana",      icon: Linkedin },
  { label: "Instagram", href: "https://www.instagram.com/ashmitkhurana_/",  icon: Instagram },
];

// ── Hover-gradient word ───────────────────────────────────────────
function GradientWord({ word, delay = 0 }: { word: string; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  const handleMouseEnter = () => {
    gsap.fromTo(
      ref.current,
      { backgroundPosition: "200% center" },
      {
        backgroundPosition: "-200% center",
        duration: 0.7,
        ease: "power2.out",
      }
    );
  };

  return (
    <span
      ref={ref}
      onMouseEnter={handleMouseEnter}
      className="inline-block cursor-default select-none transition-opacity"
      style={{
        background:
          "linear-gradient(90deg, #fff 0%, #818cf8 25%, #c084fc 50%, #f472b6 75%, #fff 100%)",
        backgroundSize: "200% auto",
        backgroundPosition: "200% center",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        willChange: "background-position",
      }}
    >
      {word}
    </span>
  );
}

// ── Magnetic email button ─────────────────────────────────────────
function MagneticEmail() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const handleMouseMove = (e: React.MouseEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    gsap.to(el, { x: x * 0.35, y: y * 0.35, duration: 0.4, ease: "power2.out" });
  };

  const handleMouseLeave = () => {
    gsap.to(containerRef.current, {
      x: 0,
      y: 0,
      duration: 0.6,
      ease: "elastic.out(1, 0.4)",
    });
  };

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText("ashmit.khu@gmail.com");
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      window.open("mailto:ashmit.khu@gmail.com");
    }
  };

  return (
    <div
      ref={containerRef}
      className="magnetic"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <button
        onClick={handleClick}
        className="group relative flex items-center gap-4 border border-white/20 rounded-full px-8 py-4 md:px-12 md:py-6 hover:border-white/50 transition-colors duration-300 overflow-hidden"
      >
        {/* Background fill on hover */}
        <span className="absolute inset-0 bg-white scale-x-0 group-hover:scale-x-100 origin-left transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] rounded-full" />

        <span className="relative z-10 font-mono text-sm md:text-base tracking-widest text-white group-hover:text-black transition-colors duration-300">
          {copied ? "COPIED TO CLIPBOARD ✓" : "ashmit.khu@gmail.com"}
        </span>
        <Mail
          size={16}
          className="relative z-10 text-white group-hover:text-black transition-colors duration-300 shrink-0"
        />
      </button>
    </div>
  );
}

// ── Cursor spotlight inside footer ───────────────────────────────
function FooterSpotlight() {
  const ref = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    sectionRef.current = ref.current?.closest("section") as HTMLElement;
    const el = ref.current;
    if (!el || !sectionRef.current) return;

    const onMouseMove = (e: MouseEvent) => {
      const rect = sectionRef.current!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      gsap.to(el, { x, y, duration: 0.4, ease: "power2.out" });
    };

    sectionRef.current.addEventListener("mousemove", onMouseMove);
    return () => sectionRef.current?.removeEventListener("mousemove", onMouseMove);
  }, []);

  return (
    <div
      ref={ref}
      className="absolute pointer-events-none"
      style={{
        width: 400,
        height: 400,
        borderRadius: "50%",
        background:
          "radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)",
        transform: "translate(-50%, -50%)",
        top: "50%",
        left: "50%",
        willChange: "transform",
      }}
    />
  );
}

// ── Main Footer ───────────────────────────────────────────────────
export default function Footer() {
  const sectionRef  = useRef<HTMLElement>(null);
  const socialsRef  = useRef<HTMLDivElement>(null);
  const headingRef  = useRef<HTMLDivElement>(null);
  const emailRef    = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: sectionRef.current,
        start: "top 85%",
      },
    });

    tl.fromTo(
      headingRef.current,
      { opacity: 0, y: 60 },
      { opacity: 1, y: 0, duration: 0.8, ease: "power2.out" }
    )
      .fromTo(
        emailRef.current,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" },
        "-=0.3"
      )
      .fromTo(
        socialsRef.current?.querySelectorAll(".social-link") ?? [],
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.4, stagger: 0.08, ease: "power2.out" },
        "-=0.2"
      );
  }, []);

  return (
    <section
      id="contact"
      ref={sectionRef}
      className="relative min-h-screen flex flex-col justify-between overflow-hidden bg-background noise"
    >
      {/* Spotlight */}
      <FooterSpotlight />

      {/* Availability marquee */}
      <div className="relative z-10 py-3 overflow-hidden flex items-center gap-4">
        <div className="flex items-center gap-2 shrink-0 pr-4">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse-dot" />
          <span className="font-mono text-xs text-white/40 uppercase tracking-widest">
            Status
          </span>
        </div>
        {/* Infinite marquee */}
        <div className="overflow-hidden flex-1">
          <div className="animate-marquee whitespace-nowrap">
            {[AVAILABILITY_TEXT, AVAILABILITY_TEXT].map((t, i) => (
              <span
                key={i}
                className="font-mono text-xs text-white/25 uppercase tracking-[0.2em] mr-0"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-10 px-4 py-24">
        {/* Headline */}
        <div
          ref={headingRef}
          className="font-display font-bold text-center leading-none tracking-tight opacity-0"
          style={{ fontSize: "clamp(3.5rem, 10vw, 9rem)" }}
        >
          <div className="flex flex-wrap justify-center gap-4 md:gap-6">
            {["LET'S", "BUILD", "SOMETHING."].map((word, i) => (
              <GradientWord key={word} word={word} delay={i * 0.1} />
            ))}
          </div>
        </div>

        {/* Subline */}
        <p className="text-white/30 font-mono text-sm tracking-widest text-center max-w-md">
          Have a project, idea, or opportunity? Let&apos;s make it happen.
        </p>

        {/* Email CTA */}
        <div ref={emailRef} className="opacity-0">
          <MagneticEmail />
        </div>
      </div>

      {/* Bottom bar */}
      <div
        ref={socialsRef}
        className="relative z-10 px-6 py-6"
      >
        <div className="section-container flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Social links */}
          <div className="flex items-center gap-6">
            {SOCIAL_LINKS.map(({ label, href, icon: Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="social-link group flex items-center gap-2 text-white/40 hover:text-white transition-colors duration-200 opacity-0"
              >
                <Icon size={16} />
                <span className="text-sm font-mono tracking-wide relative">
                  {label}
                  <span className="absolute bottom-0 left-0 w-0 h-px bg-white group-hover:w-full transition-all duration-300" />
                </span>
              </a>
            ))}
          </div>

          {/* Copyright */}
          <p className="text-white/20 text-xs font-mono tracking-widest">
            © {new Date().getFullYear()} ASHMIT KHURANA · BUILT WITH NEXT.JS
          </p>
        </div>
      </div>
    </section>
  );
}
