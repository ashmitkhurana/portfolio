import { FC, useEffect, useRef } from 'react';
import { motion, useMotionValue, animate } from 'framer-motion';
import './CaseStudyHero.css';

export interface CaseStudyHeroProps {
  title: string;
  tagline: string;
  image: { src: string; alt: string };
}

// Contract
// - Inputs: title, tagline, hero image
// - Output: full-width hero with animated text and dynamic background
// - Behavior: parallax Ken Burns on image, aurora background, word-by-word entrance

const CaseStudyHero: FC<CaseStudyHeroProps> = ({ title, tagline, image }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Mouse reactive vignette
  const mouseX = useMotionValue(0.5);
  const mouseY = useMotionValue(0.5);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      mouseX.set((e.clientX - rect.left) / rect.width);
      mouseY.set((e.clientY - rect.top) / rect.height);
      el.style.setProperty('--mouse-x', `${mouseX.get() * 100}%`);
      el.style.setProperty('--mouse-y', `${mouseY.get() * 100}%`);
    };
    el.addEventListener('mousemove', onMove);
    return () => el.removeEventListener('mousemove', onMove);
  }, [mouseX, mouseY]);

  // Ken Burns scale animation
  const scale = useMotionValue(1.05);
  useEffect(() => {
    const controls = animate(scale, [1.05, 1.15, 1.05], {
      duration: 24,
      ease: 'easeInOut',
      repeat: Infinity,
    });
    return () => controls.stop();
  }, [scale]);

  // Split title into lines words (simple split; CSS will wrap)
  const words = title.split(' ');

  return (
    <section className="relative pt-28 md:pt-32 pb-16 overflow-hidden bg-[#0a0a0a]">
      <div ref={containerRef} className="relative max-w-7xl mx-auto px-4">
        {/* Background image with Ken Burns and parallax */}
        <motion.div
          className="absolute inset-0 -z-10"
          style={{
            scale,
          }}
        >
          <img
            src={image.src}
            alt={image.alt}
            className="w-full h-full object-cover opacity-25"
          />
          <div className="case-hero-aurora" />
          <div className="case-hero-vignette" />
          <div className="case-hero-grain" />
        </motion.div>

        {/* Heading */}
        <div className="relative flex flex-col items-center text-center">
          <motion.h1
            className="text-4xl md:text-6xl font-extrabold tracking-tight mb-5"
            initial="hidden"
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.06 } },
            }}
          >
            {words.map((w, i) => (
              <motion.span
                key={i}
                className="inline-block mr-2 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400"
                variants={{
                  hidden: { y: 24, opacity: 0, filter: 'blur(6px)' },
                  show: { y: 0, opacity: 1, filter: 'blur(0px)', transition: { type: 'spring', stiffness: 320, damping: 24 } },
                }}
              >
                {w}
              </motion.span>
            ))}
          </motion.h1>

          <motion.p
            className="text-lg md:text-xl text-blue-300/90 max-w-3xl"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
          >
            {tagline}
          </motion.p>

          {/* CTA / Scroll hint */}
          <motion.div
            className="mt-10 flex items-center gap-3 text-sm text-white/70"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.6 }}
          >
            <span className="inline-block h-3 w-3 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 animate-pulse" />
            <span>Scroll to explore the case study</span>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default CaseStudyHero;
