"use client";

import Hero from "@/app/components/Hero";
import ProjectsSection from "@/app/components/ProjectsSection";
import StatsStrip from "@/app/components/StatsStrip";
import ExperienceTimeline from "@/app/components/ExperienceTimeline";
import Footer from "@/app/components/Footer";
import Terminal from "@/app/components/Terminal";
import LogoLoop from "@/app/components/LogoLoop";
import { motion } from "framer-motion";

/* ── Skills data ─────────────────────────────────────────────── */
const skillGroups = [
  {
    label: "Frontend",
    skills: ["React", "Next.js", "TypeScript", "JavaScript", "HTML", "CSS", "Tailwind CSS"],
  },
  {
    label: "Specialized",
    skills: ["Web3 Integration", "Real-Time Systems", "Performance Optimization", "REST APIs"],
  },
  {
    label: "Tools & Platforms",
    skills: ["Figma", "Git", "Firebase", "Shopify", "Webflow", "Wix", "Framer", "Spline"],
  },
];

/* ── Tech logo URLs (Devicon) ────────────────────────────────── */
const techLogos = [
  { default: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/react/react-original.svg", color: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/react/react-original.svg" },
  { default: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/nextjs/nextjs-plain.svg", color: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/nextjs/nextjs-original.svg" },
  { default: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/typescript/typescript-plain.svg", color: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/typescript/typescript-original.svg" },
  { default: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/tailwindcss/tailwindcss-original.svg", color: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/tailwindcss/tailwindcss-original.svg" },
  { default: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/javascript/javascript-plain.svg", color: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/javascript/javascript-original.svg" },
  { default: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/firebase/firebase-plain.svg", color: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/firebase/firebase-original.svg" },
  { default: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/figma/figma-plain.svg", color: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/figma/figma-original.svg" },
  { default: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/nodejs/nodejs-plain.svg", color: "https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/nodejs/nodejs-original.svg" },
];

/* ── Scroll reveal wrapper ───────────────────────────────────── */
function RevealSection({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <motion.div
      id={id}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      viewport={{ once: true, margin: "-80px" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ── Page ────────────────────────────────────────────────────── */
export default function HomePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* ── 1. Hero ──────────────────────────────────── */}
      <Hero />

      {/* ── 2. Tech marquee strip ────────────────────── */}
      <div className="py-12 overflow-hidden bg-background">
        <LogoLoop logos={techLogos} speed={25} className="w-full" />
      </div>

      {/* ── 3. Featured Work (basement.studio style) ─── */}
      <ProjectsSection />

      {/* ── 4. Stats strip ───────────────────────────── */}
      <StatsStrip />

      {/* ── 5. About ─────────────────────────────────── */}
      <RevealSection id="about">
        <section className="py-24 border-t border-border">
          <div className="section-container">
            <div className="grid md:grid-cols-2 gap-16 items-center">
              <div>
                <h2 className="font-display font-bold text-4xl md:text-5xl text-white mb-8 leading-tight">
                  About Me
                </h2>
                <div className="flex flex-col gap-5 text-white/50 leading-relaxed">
                  <p>
                    I&apos;m a frontend engineer finishing my B.Tech in CSE (AIML) at
                    Dronacharya Group of Institutions, graduating July 2026. While still
                    in college, I&apos;ve shipped production-grade products used by
                    thousands of real users — from real-time crypto intelligence platforms
                    to high-conversion web apps.
                  </p>
                  <p>
                    I specialize in React, Next.js, and TypeScript, with a focus on two
                    things that most devs treat as afterthoughts: <em className="text-white/70 not-italic">performance</em> and{" "}
                    <em className="text-white/70 not-italic">real-time data</em>. I&apos;ve
                    cut load times by 25%, shipped sub-second alerting systems, and
                    helped clients increase conversion — measurably.
                  </p>
                  <p>
                    I also build on the Web3 side, having integrated Phantom wallet auth
                    and built multichain dashboards at Alpha Block.
                  </p>
                </div>
              </div>

              {/* Right side — decorative stat card */}
              <div className="flex flex-col gap-4">
                <div className="glass rounded-2xl p-8 border border-white/5">
                  <p className="font-mono text-xs text-white/30 uppercase tracking-widest mb-6">
                    Quick Stats
                  </p>
                  <div className="flex flex-col gap-5">
                    {[
                      { label: "Years building products",  value: "3+" },
                      { label: "Projects shipped",         value: "10+" },
                      { label: "Users reached",            value: "1,000+" },
                      { label: "Graduating",               value: "Jul 2026" },
                    ].map(({ label, value }) => (
                      <div key={label} className="flex items-center justify-between border-b border-white/5 pb-4">
                        <span className="text-white/40 text-sm">{label}</span>
                        <span className="font-display font-bold text-white">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="glass rounded-2xl p-6 border border-white/5">
                  <p className="font-mono text-xs text-white/30 uppercase tracking-widest mb-3">
                    Education
                  </p>
                  <p className="text-white font-medium">
                    B.Tech in CSE (AI & ML)
                  </p>
                  <p className="text-white/40 text-sm mt-1">
                    Dronacharya Group of Institutions · Nov 2022 – Jul 2026
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </RevealSection>

      {/* ── 6. Experience Timeline ───────────────────── */}
      <ExperienceTimeline />

      {/* ── 7. Skills ────────────────────────────────── */}
      <RevealSection id="skills">
        <section className="py-24 border-t border-border">
          <div className="section-container">
            <h2 className="font-display font-bold text-4xl md:text-5xl text-white mb-16">
              Skills
            </h2>
            <div className="flex flex-col gap-10">
              {skillGroups.map((group) => (
                <div key={group.label}>
                  <p className="font-mono text-xs text-white/30 uppercase tracking-widest mb-4">
                    {group.label}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {group.skills.map((skill) => (
                      <span
                        key={skill}
                        className="text-sm text-white/60 border border-white/10 rounded-full px-4 py-1.5 hover:border-indigo-500/50 hover:text-white transition-all duration-200"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </RevealSection>

      {/* ── 8. Terminal ──────────────────────────────── */}
      <RevealSection id="terminal">
        <section className="py-24 border-t border-border">
          <div className="section-container">
            <div className="mb-12">
              <h2 className="font-display font-bold text-4xl md:text-5xl text-white mb-4">
                Terminal
              </h2>
              <p className="text-white/40 font-mono text-sm tracking-wide">
                Type <span className="text-indigo-400">help</span> to see all commands
              </p>
            </div>
            <Terminal />
          </div>
        </section>
      </RevealSection>

      {/* ── 9. Footer / Contact ──────────────────────── */}
      <Footer />
    </main>
  );
}