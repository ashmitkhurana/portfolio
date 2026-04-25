"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { projects } from "@/data/projects";

gsap.registerPlugin(ScrollTrigger);

export default function ProjectsSection() {
  const sectionRef = useRef<HTMLElement>(null);

  // Removed GSAP scrollTrigger on rows to allow smooth native CSS sticky stacking

  return (
    <section id="work" ref={sectionRef} className="py-24 relative">
      <div className="section-container">
        {/* Header */}
        <div className="flex items-end justify-between mb-16 relative z-[50]">
          <h2 className="font-display font-bold text-4xl md:text-5xl text-white">
            Featured Projects
          </h2>
          <Link
            href="/work"
            className="text-sm text-white/40 hover:text-white transition-colors font-mono tracking-widest uppercase"
          >
            All Projects →
          </Link>
        </div>

        {/* Project rows */}
        <div className="flex flex-col relative pb-32">
          {projects.slice(0, 3).map((project, i) => (
            <ProjectRow key={project.slug} project={project} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function ProjectRow({
  project,
  index,
}: {
  project: (typeof projects)[0];
  index: number;
}) {
  const rowRef     = useRef<HTMLAnchorElement>(null);
  const imageRef   = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    gsap.to(imageRef.current, {
      scale: 1.04,
      duration: 0.5,
      ease: "power2.out",
    });
    gsap.to(overlayRef.current, { opacity: 0.6, duration: 0.3 });
  };

  const handleMouseLeave = () => {
    gsap.to(imageRef.current, {
      scale: 1,
      duration: 0.5,
      ease: "power2.out",
    });
    gsap.to(overlayRef.current, { opacity: 0, duration: 0.3 });
  };

  return (
    <Link
      ref={rowRef}
      href={`/work/${project.slug}`}
      className="project-row group flex flex-col md:grid md:grid-cols-[50%_20%_30%] items-stretch pt-8 pb-8 md:pb-12 gap-6 md:gap-0 transition-colors duration-300 sticky bg-background min-h-[85vh] md:min-h-0"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        top: `96px`, // Sticky offset from top of viewport
        zIndex: index + 10, // Ascending z-index so next covering previous works naturally
      }}
    >
      {/* Left — cover image */}
      <div className="overflow-hidden rounded-lg bg-card relative w-full flex-1 md:flex-none md:aspect-[16/9]">
        <div
          ref={imageRef}
          className="absolute inset-0 w-full h-full bg-gradient-to-br from-indigo-900/40 to-purple-900/40 flex items-center justify-center"
          style={{ willChange: "transform" }}
        >
          {project.cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={project.cover}
              alt={project.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="font-display font-bold text-6xl md:text-6xl text-white/10 select-none">
              {String(index + 1).padStart(2, "0")}
            </span>
          )}
        </div>
        {/* Dark overlay on hover */}
        <div
          ref={overlayRef}
          className="absolute inset-0 bg-black rounded-lg"
          style={{ opacity: 0, pointerEvents: "none" }}
        />
      </div>

      {/* Middle — description + tags (Desktop only) */}
      <div className="hidden md:flex flex-col justify-start px-8 gap-3">
        <p className="text-white/50 text-sm leading-relaxed line-clamp-3">
          {project.tagline}
        </p>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {project.stack.slice(0, 3).map((tech) => (
            <span
              key={tech}
              className="font-mono text-[10px] uppercase tracking-widest text-white/30 border border-white/10 px-2 py-0.5 rounded-full"
            >
              {tech}
            </span>
          ))}
        </div>
      </div>

      {/* Right — project title (Desktop only) */}
      <div className="hidden md:flex flex-col justify-start pl-8">
        <div className="font-display font-bold text-right leading-tight">
          {/* Index number */}
          <span className="block text-xs font-mono text-white/20 mb-2 tracking-widest">
            {String(index + 1).padStart(2, "0")}
          </span>
          {/* Project title — wraps into multiple lines */}
          <span className="text-2xl lg:text-4xl text-white group-hover:text-blue-400 transition-all duration-300 leading-tight">
            {project.title.split("—")[0].trim()}
          </span>
          {/* Arrow */}
          <span className="block mt-3 text-white/20 text-xl group-hover:text-white group-hover:translate-x-1 transition-all duration-300">
            ↗
          </span>
        </div>
      </div>

      {/* Mobile fallback — footer text block */}
      <div className="flex md:hidden flex-col justify-end mt-auto pt-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-mono text-white/30 tracking-widest">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="text-blue-400 text-sm font-semibold">View Project →</span>
        </div>
        <span className="font-display font-bold text-3xl text-white mb-4 leading-tight">
          {project.title.split("—")[0].trim()}
        </span>
        <div className="flex flex-wrap gap-2">
          {project.stack.slice(0, 4).map((tech) => (
            <span
              key={tech}
              className="font-mono text-[10px] uppercase tracking-widest text-black bg-white px-2.5 py-1 rounded-sm font-bold"
            >
              {tech}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
