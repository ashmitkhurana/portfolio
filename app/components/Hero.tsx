"use client";

import { useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import Link from "next/link";

const ROLES = [
  "Frontend Engineer",
  "React Developer",
  "Web3 Builder",
  "Code Conjurer",
];

// ── Typewriter text hook ──────────────────────────────────────────
function useTypewriter(texts: string[], trigger: boolean) {
  const [display, setDisplay] = useState("");
  const [textIndex, setTextIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!trigger) return;

    let timer: NodeJS.Timeout;
    const currentText = texts[textIndex];

    if (!isDeleting && display === currentText) {
      timer = setTimeout(() => setIsDeleting(true), 2000);
    } else if (isDeleting && display === "") {
      setIsDeleting(false);
      setTextIndex((prev) => (prev + 1) % texts.length);
    } else {
      const nextDelay = isDeleting ? 30 : 60;
      timer = setTimeout(() => {
        setDisplay(
          currentText.substring(0, display.length + (isDeleting ? -1 : 1))
        );
      }, nextDelay);
    }

    return () => clearTimeout(timer);
  }, [display, isDeleting, textIndex, trigger, texts]);

  return display;
}

// ── Three.js particle field ───────────────────────────────────────
function ParticleField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let THREE: typeof import("three");
    let renderer: import("three").WebGLRenderer;
    let scene: import("three").Scene;
    let camera: import("three").PerspectiveCamera;
    let particles: import("three").Points;
    let animId: number;
    let mouseX = 0;
    let mouseY = 0;

    import("three").then((mod) => {
      THREE = mod;

      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
      renderer.setSize(window.innerWidth, window.innerHeight);

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.z = 5;

      // Create particle geometry
      const count = 900;
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        positions[i * 3]     = (Math.random() - 0.5) * 18;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 18;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 8;
      }

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));

      const mat = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.028,
        transparent: true,
        opacity: 0.35,
        sizeAttenuation: true,
      });

      particles = new THREE.Points(geo, mat);
      scene.add(particles);

      // Mouse influence
      const onMouseMove = (e: MouseEvent) => {
        mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
        mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
      };
      window.addEventListener("mousemove", onMouseMove);

      const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener("resize", onResize);

      let t = 0;
      const animate = () => {
        animId = requestAnimationFrame(animate);
        t += 0.0003;

        particles.rotation.y = t + mouseX * 0.08;
        particles.rotation.x = mouseY * 0.04;

        renderer.render(scene, camera);
      };
      animate();

      // cleanup
      (canvasRef.current as any).__cleanup = () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("resize", onResize);
        cancelAnimationFrame(animId);
        renderer.dispose();
      };
    });

    return () => {
      (canvas as any).__cleanup?.();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: "none" }}
    />
  );
}

// ── Magnetic button ───────────────────────────────────────────────
function MagneticBtn({
  children,
  href,
  onClick,
  variant = "outline",
  download,
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  variant?: "solid" | "outline";
  download?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    gsap.to(el, { x: x * 0.3, y: y * 0.3, duration: 0.3, ease: "power2.out" });
  };

  const handleMouseLeave = () => {
    gsap.to(ref.current, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1, 0.4)" });
  };

  const cls =
    variant === "solid"
      ? "px-8 py-3.5 rounded-full bg-white text-black font-semibold text-sm tracking-wide hover:bg-white/90 transition-colors"
      : "px-8 py-3.5 rounded-full border border-white/25 text-white font-semibold text-sm tracking-wide hover:border-white/60 hover:bg-white/5 transition-all";

  const inner = (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="magnetic"
    >
      {href ? (
        download ? (
          <a href={href} download className={cls}>
            {children}
          </a>
        ) : (
          <a href={href} className={cls}>
            {children}
          </a>
        )
      ) : (
        <button onClick={onClick} className={cls}>
          {children}
        </button>
      )}
    </div>
  );

  return inner;
}

// ── Hero ──────────────────────────────────────────────────────────
export default function Hero() {
  const headingRef   = useRef<HTMLHeadingElement>(null);
  const subtitleRef  = useRef<HTMLDivElement>(null);
  const ctaRef       = useRef<HTMLDivElement>(null);
  const arrowRef     = useRef<HTMLDivElement>(null);

  const [trigger, setTrigger] = useState(false);
  const typedRole = useTypewriter(ROLES, trigger);

  // Intro animation
  useEffect(() => {
    const tl = gsap.timeline({ delay: 0.2 });

    tl.fromTo(
      headingRef.current,
      { opacity: 0, y: 60, skewY: 4 },
      { opacity: 1, y: 0, skewY: 0, duration: 1, ease: "power3.out" }
    )
      .fromTo(
        subtitleRef.current,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" },
        "-=0.4"
      )
      .fromTo(
        ctaRef.current,
        { opacity: 0, y: 16 },
        { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" },
        "-=0.3"
      )
      .fromTo(
        arrowRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.4 },
        "-=0.1"
      );

    // Start typing after intro
    tl.call(() => setTrigger(true));
  }, []);

  // Role rotation now handled completely within the hook

  return (
    <section
      id="home"
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-background text-center px-4"
    >
      {/* Particle field */}
      <ParticleField />

      {/* Radial glow behind text */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(99,102,241,0.08) 0%, transparent 70%)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-8 max-w-5xl w-full">
        {/* Name */}
        <h1
          ref={headingRef}
          className="font-display font-bold leading-none tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-white via-white/90 to-white/60 animate-gradient-x px-6 pb-4 text-center"
          style={{
            fontSize: "clamp(4rem, 13vw, 10rem)",
            backgroundSize: "300% auto",
          }}
        >
          ASHMIT
          <br />
          KHURANA
        </h1>

        {/* Terminal typing role line */}
        <div ref={subtitleRef} className="flex items-center gap-3 opacity-0 font-mono text-base md:text-lg">
          <span className="text-[#3b82f6] font-bold">~</span>
          <span className="text-white">❯</span>
          <span className="text-white/80 tracking-widest uppercase text-left">
            {typedRole}
            <span className="animate-blink inline-block w-2.5 h-[1.1em] bg-white/70 ml-1.5 align-middle rounded-sm"></span>
          </span>
        </div>

        {/* CTAs */}
        <div ref={ctaRef} className="flex items-center gap-4 opacity-0">
          <MagneticBtn href="#work" variant="solid">
            View My Work ↗
          </MagneticBtn>
          <MagneticBtn href="/AshmitKhuranaResume.pdf" variant="outline" download>
            Download Resume ↓
          </MagneticBtn>
        </div>
      </div>

      {/* Scroll arrow */}
      <div
        ref={arrowRef}
        className="absolute bottom-10 left-1/2 -translate-x-1/2 opacity-0 animate-float"
      >
        <div className="flex flex-col items-center gap-2 text-white/30">
          <span className="text-xs tracking-widest uppercase font-mono">scroll</span>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 5v14M5 12l7 7 7-7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
    </section>
  );
}