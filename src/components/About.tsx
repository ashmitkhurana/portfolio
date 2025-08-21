import { useLayoutEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import ScrollFloat from './ScrollFloat';
import ScrollReveal from './ScrollReveal';
import SpotlightCard from './Card';
import { Smartphone, Globe } from 'lucide-react';

gsap.registerPlugin(ScrollTrigger);

export default function About() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const cardsRef = useRef<HTMLDivElement | null>(null);
  const [pinReadyKey, setPinReadyKey] = useState<number | null>(null);
  const introRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    const cards = cardsRef.current;
    if (!section) return;

    const st = ScrollTrigger.create({
      id: 'aboutPin',
      trigger: section,
      start: 'top top',
      end: '+=240%',
      pin: true,
      scrub: false,
      anticipatePin: 1,
      markers: false,
    });

    // Signal ScrollReveal to re-init with computed starts once the pin is created
    setPinReadyKey(st.start);

    // Cards animations: desktop (simultaneous) vs mobile (sequential)
    const mm = gsap.matchMedia();
    if (cards) {
      // Target actual card elements inside wrappers to ensure correct indexing
      const cardEls = Array.from(cards.querySelectorAll<HTMLElement>('.custom-spotlight-card'));

      // Use viewport-based offsets so cards start fully off-screen
      const computeFrom = () => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const offLeft = -vw * 1.1;
        const offRight = vw * 1.1;
        const offBottom = vh * 0.9;
        return {
          fromX: (i: number) => (i === 0 ? offLeft : i === 2 ? offRight : 0),
          fromY: (i: number) => (i === 1 ? offBottom : 0),
        };
      };

      // Desktop: simultaneous (no stagger)
      mm.add('(min-width: 768px)', () => {
        const { fromX, fromY } = computeFrom();
        // Initial state: off-screen, but fully opaque
        gsap.set(cardEls, {
          opacity: 1,
          willChange: 'transform',
          x: (i: number) => fromX(i),
          y: (i: number) => fromY(i),
        });
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: section,
            start: () => st.start + window.innerHeight * 1.0,
            end: () => st.start + window.innerHeight * 1.55,
            scrub: true,
          },
        });
        tl.fromTo(
          cardEls,
          {
            x: (i: number) => fromX(i),
            y: (i: number) => fromY(i),
          },
          {
            x: 0,
            y: 0,
            stagger: 0,
            ease: 'none',
          },
          0
        );
        return () => tl.scrollTrigger?.kill();
      });

      // Mobile: sequential full-screen cards
      mm.add('(max-width: 767px)', () => {
        const { fromX, fromY } = computeFrom();
        const vh = window.innerHeight;
        // All cards exit upward
        const outX = () => 0;
        const outY = () => -vh;

        // Slide the intro (heading+description) off before cards start
        if (introRef.current) {
          gsap.fromTo(
            introRef.current,
            { y: 0 },
            {
              y: -vh,
              ease: 'none',
              scrollTrigger: {
                trigger: section,
                start: () => st.start + vh * 0.8,
                end: () => st.start + vh * 1.2,
                scrub: true,
              },
            }
          );
        }

        // Prepare cards as absolute centered layers
        gsap.set(cardEls, {
          position: 'absolute',
          top: '50%',
          left: '50%',
          xPercent: -50,
          yPercent: -50,
          width: '90vw',
          maxWidth: '28rem',
          opacity: 1,
          willChange: 'transform',
          x: (i: number) => fromX(i),
          y: (i: number) => fromY(i),
          zIndex: 1,
        });

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: section,
            start: () => st.start + vh * 1.2,
            end: () => st.start + vh * 2.4,
            scrub: true,
          },
        });

        const gap = 0.2; // empty screen gap between cards
        const move = 1.0; // duration units per in/out segment

        // First two cards: in -> out -> gap
        [0, 1].forEach((i) => {
          tl.set(cardEls[i], { zIndex: 10 });
          tl.fromTo(
            cardEls[i],
            { x: fromX(i), y: fromY(i) },
            { x: 0, y: 0, ease: 'none', duration: move }
          );
          tl.to(cardEls[i], { x: outX(), y: outY(), ease: 'none', duration: move });
          tl.to({}, { duration: gap });
          tl.set(cardEls[i], { zIndex: 1 });
        });

        // Last card: in and hold at center; the pin will release right after
        tl.set(cardEls[2], { zIndex: 10 });
        tl.fromTo(
          cardEls[2],
          { x: fromX(2), y: fromY(2) },
          { x: 0, y: 0, ease: 'none', duration: move }
        );

        return () => tl.scrollTrigger?.kill();
      });
    }

    return () => {
      st.kill();
      // Revert all matchMedia-created animations and triggers
      mm.revert();
    };
  }, []);

  return (
    <section id="about" ref={sectionRef} className="relative h-screen w-full overflow-hidden bg-[#0a0a0a]">
      {/* Centered content overlay */}
      <div className="absolute inset-0 z-20 px-6 flex flex-col items-center justify-center gap-6 md:gap-8">
        <div ref={introRef} className="w-full flex flex-col items-center gap-6">
          <div className="w-full flex justify-center">
            <ScrollFloat
              animationDuration={1}
              ease="back.inOut(2)"
              triggerRef={sectionRef}
              scrollStart="top top"
              scrollEnd="top+=40% top"
              stagger={0.03}
              containerClassName="gradient-text"
              textClassName="text-5xl sm:text-6xl md:text-7xl font-extrabold"
            >
              About Me
            </ScrollFloat>
          </div>

          <div className="w-full max-w-3xl">
            <ScrollReveal
              triggerRef={sectionRef}
              pinTriggerId="aboutPin"
              reinitKey={pinReadyKey}
              startOffsetVh={50}
              endOffsetVh={90}
              enableBlur={true}
              baseOpacity={0}
              baseRotation={0}
              blurStrength={4}
              textClassName="text-gray-300 text-center text-lg sm:text-xl md:text-2xl leading-relaxed"
            >
              {"I'm a B.Tech undergrad student in Computer Science and Engineering, passionate about creating innovative mobile and web solutions. I specialize in Flutter, iOS, and front-end web development."}
            </ScrollReveal>
          </div>
        </div>

        <div ref={cardsRef} className="w-full">
          <div className="mx-auto max-w-6xl grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            <div className="flex justify-center">
              <SpotlightCard className="custom-spotlight-card" spotlightColor="rgba(0, 229, 255, 0.2)">
                <div className="rounded-xl p-6 backdrop-blur-lg transition-all duration-300 flex flex-col items-center text-center" style={{ background: 'none', boxShadow: 'none' }}>
                  <div className="w-16 h-16 rounded-full bg-[#474973]/10 flex items-center justify-center mb-4">
                    <Smartphone className="w-8 h-8 text-blue-500" />
                  </div>
                  <h3 className="text-lg md:text-xl font-semibold mb-2">Flutter Developer</h3>
                  <p className="text-gray-400 text-sm md:text-base">Building cross-platform mobile applications with Flutter, creating beautiful and performant user experiences</p>
                </div>
              </SpotlightCard>
            </div>

            <div className="flex justify-center">
              <SpotlightCard className="custom-spotlight-card" spotlightColor="rgba(0, 229, 255, 0.2)">
                <div className="rounded-xl p-6 backdrop-blur-lg transition-all duration-300 flex flex-col items-center text-center" style={{ background: 'none', boxShadow: 'none' }}>
                  <div className="w-16 h-16 rounded-full bg-[#474973]/10 flex items-center justify-center mb-4">
                    <svg viewBox="0 0 384 512" className="w-8 h-8 text-white" aria-hidden="true">
                      <path fill="currentColor" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
                    </svg>
                  </div>
                  <h3 className="text-lg md:text-xl font-semibold mb-2">iOS Developer</h3>
                  <p className="text-gray-400 text-sm md:text-base">Developing native iOS applications using Swift and SwiftUI, focusing on Apple's design principles</p>
                </div>
              </SpotlightCard>
            </div>

            <div className="flex justify-center">
              <SpotlightCard className="custom-spotlight-card" spotlightColor="rgba(0, 229, 255, 0.2)">
                <div className="rounded-xl p-6 backdrop-blur-lg transition-all duration-300 flex flex-col items-center text-center" style={{ background: 'none', boxShadow: 'none' }}>
                  <div className="w-16 h-16 rounded-full bg-[#474973]/10 flex items-center justify-center mb-4">
                    <Globe className="w-8 h-8 text-blue-500" />
                  </div>
                  <h3 className="text-lg md:text-xl font-semibold mb-2">Front End Web Developer</h3>
                  <p className="text-gray-400 text-sm md:text-base">Creating responsive and interactive web applications using React, TypeScript, and modern web technologies</p>
                </div>
              </SpotlightCard>
            </div>
          </div>
        </div>
      </div>

      {/* spacer to guarantee enough scrollable area while pinned */}
      <div className="invisible select-none" style={{ height: '200vh' }} />
    </section>
  );
}