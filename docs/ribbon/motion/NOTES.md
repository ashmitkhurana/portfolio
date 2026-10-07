# Slide motion progress

- [x] lib/ribbon/slide.ts (SlideMotion: path + window + intro/scroll springs + sway), wired into sim.ts (mode "slide"), settings.ts (sim.slide), core.ts (sim.ruledOut), engine.ts (scroll feed, keeps active), RibbonStage (?motion=slide, introSettled flag + `ribbon:intro-settled` event), LabPanel option. Default mode stays frozen. tsc clean.
- [ ] numerical check sigma=0 vs pose; eslint; build + scripts/qa-motion.mjs
- [x] numerical check (overshoot 7.6%, settle 1.9s), tsc+eslint clean; qa-motion.mjs written; next: build on 4400 + run
- [x] build+qa PASS (4400 stopped); dt clamp raised to 0.1 for slide
