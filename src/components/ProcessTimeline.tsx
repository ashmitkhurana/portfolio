import React, { useEffect, useRef } from 'react';
import './ProcessTimeline.css';
import { ProcessStep } from '../data/projects';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

interface ProcessTimelineProps {
  steps: ProcessStep[];
}

const ProcessTimeline: React.FC<ProcessTimelineProps> = ({ steps }) => {
  const sectionRef = useRef<HTMLElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const centralLineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    if (sectionRef.current && timelineRef.current && centralLineRef.current) {
      // Cache step elements and init states once
  const stepEls = Array.from(timelineRef.current.querySelectorAll('.process-step')) as HTMLElement[];
      type StepData = {
        el: HTMLElement;
        centerY: number; // relative to timeline container
        branch: HTMLElement;
        number: HTMLElement;
        stageEl: HTMLElement;
        descEl: HTMLElement;
        active: boolean;
        // quick setters reserved for future micro-perf tuning
      };

  const stepsData: StepData[] = stepEls.map((el) => {
        const branch = el.querySelector('.step-branch') as HTMLElement;
        const number = el.querySelector('.step-number') as HTMLElement;
        const stageEl = el.querySelector('.step-stage') as HTMLElement;
        const descEl = el.querySelector('.step-description') as HTMLElement;
        // Initial states
  // If branch exists and is visible, prep; otherwise skip safely
  if (branch) gsap.set(branch, { scaleX: 0, transformOrigin: 'left center' });
        gsap.set(number, { opacity: 0, scale: 0.6 });
  gsap.set([stageEl, descEl], { opacity: 0, y: 6, filter: 'blur(3px)' });
        return {
          el,
          centerY: el.offsetTop + el.offsetHeight / 2,
          branch,
          number,
          stageEl,
          descEl,
          active: false,
        };
      });

      // Recalculate centers on resize/orientation change
      const recalcCenters = () => {
        stepsData.forEach((s) => {
          s.centerY = s.el.offsetTop + s.el.offsetHeight / 2;
        });
        ScrollTrigger.refresh();
      };
      window.addEventListener('resize', recalcCenters);
      window.addEventListener('orientationchange', recalcCenters);

      // Central timeline growth animation + step activation based on its progress
      gsap.fromTo(centralLineRef.current,
        { height: '0%' },
        {
          height: '100%',
          ease: 'none',
          scrollTrigger: {
            trigger: timelineRef.current,
            start: 'top center',
            end: 'bottom center',
            scrub: 0.6,
            onUpdate: (self) => {
              const tl = timelineRef.current!;
              const containerHeight = tl.scrollHeight || tl.offsetHeight || 0;
              const progressY = self.progress * containerHeight;
              // Activate/deactivate steps based on central line height
              stepsData.forEach((s) => {
                const reached = progressY >= s.centerY;
                if (reached && !s.active) {
                  // Activate
                  s.active = true;
                  if (s.branch && getComputedStyle(s.branch).display !== 'none') {
                    gsap.to(s.branch, { scaleX: 1, duration: 0.4, ease: 'power2.out' });
                  }
                  gsap.to(s.number, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(1.6)' });
                  gsap.to([s.stageEl, s.descEl], {
                    opacity: 1,
                    y: 0,
                    filter: 'blur(0px)',
                    duration: 0.45,
                    ease: 'power2.out',
                    stagger: 0.08
                  });
                } else if (!reached && s.active) {
                  // Deactivate when scrolling back up
                  s.active = false;
                  if (s.branch && getComputedStyle(s.branch).display !== 'none') {
                    gsap.to(s.branch, { scaleX: 0, duration: 0.3, ease: 'power2.in' });
                  }
                  gsap.to(s.number, { opacity: 0, scale: 0.6, duration: 0.2, ease: 'power1.in' });
                  gsap.to([s.stageEl, s.descEl], {
                    opacity: 0,
                    y: 6,
                    filter: 'blur(3px)',
                    duration: 0.2,
                    ease: 'power1.in',
                  });
                }
              });
            }
          }
        }
      );

      // Create floating particles that traverse the full section using GSAP
      const createParticle = () => {
        const sec = sectionRef.current!;
        const h = sec.offsetHeight;
        const particle = document.createElement('div');
        particle.className = 'floating-particle';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.top = `${h + 10}px`; // start just below bottom
        // Disable CSS keyframe move if any
        particle.style.animation = 'none';
        sec.appendChild(particle);

        const duration = Math.random() * 15 + 15; // 15-30s
        gsap.fromTo(particle, { y: 0, opacity: 0 }, { y: -(h + 120), opacity: 1, ease: 'none', duration, onComplete: () => {
          particle.remove();
        }});
      };

      // Create initial particles
      for (let i = 0; i < 25; i++) {
        setTimeout(() => createParticle(), i * 300);
      }

      // Continue creating particles more frequently
      const particleInterval = setInterval(createParticle, 1500);

      return () => {
        clearInterval(particleInterval);
        window.removeEventListener('resize', recalcCenters);
        window.removeEventListener('orientationchange', recalcCenters);
        ScrollTrigger.getAll().forEach(trigger => trigger.kill());
      };
    }
  }, [steps]);

  if (!steps || steps.length === 0) {
    return null;
  }

  return (
    <section ref={sectionRef} className="process-timeline-section">
      <div className="container mx-auto px-6">
        <h2 className="text-4xl font-bold text-center mb-16 bg-gradient-to-r from-blue-400 via-cyan-400 to-purple-400 bg-clip-text text-transparent">
          My Process
        </h2>
        
        <div ref={timelineRef} className="process-timeline">
          <div ref={centralLineRef} className="central-timeline"></div>
          
    {steps.map((step, index) => {
            const isLeft = index % 2 === 0;
            return (
              <div key={index} className={`process-step ${isLeft ? 'step-left' : 'step-right'}`} data-step={index}>
                <div className="step-branch"></div>
                <div className="step-number">{index + 1}</div>
                <div className="step-content">
      <h3 className="step-stage">{step.stage}</h3>
      <p className="step-description">{step.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default ProcessTimeline;