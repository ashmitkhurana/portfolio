# NEXT SESSION — start here (written 2026-10-10, end of session)

Branch: `claude/upbeat-hellman-f92bb7` (pushed). Never merge to main without the owner's OK.
Read this file first, then the last sections of `docs/ribbon/JOURNEY.md`. Memory notes in `~/.claude/projects/.../memory/` carry the owner's working rules.

## Owner's working rules (must follow)
- Apple-level polish. Never call something fixed without a full-resolution check of that exact spot.
- When the owner gives a concrete fix, do exactly that; don't switch approach on your own. Owner sends tweaks one by one; work starts on their "green light"; after each round send the render (or just say "done" if they say they'll check localhost) and stop.
- Stop and think when two rounds fail at the same spot: measure the geometry, find the cause. Never launch blind variant sweeps.
- Opus decides every parameter; subagents only execute exact specs (owner allowed Opus to work end-to-end itself last session — ask before assuming that still holds).
- Update `docs/ribbon/JOURNEY.md` every round (version tally; next version is **v334**). Commit often; push when asked.
- Shell: zsh does not word-split `$VAR` — run loops with `bash`. Use `/bin/rm -f`, `/bin/ls`. Never pkill.

## What is DONE and live (localhost:3100, dev server "site-live" in .claude/launch.json)
- **Pose: `docs/ribbon/turns/scratch/N14s5/pose.json` (v333)** is the phone hero in `lib/ribbon/poses/ak-hero.json`.
  - Built from scratch by `scripts/curve/scratch/build_n4.py` (config: `docs/ribbon/turns/scratch/N13d/config.json`): turns are cylinder sections (one tilted plane each, band width on the plane's axis), straights twist evenly; apex and top-K tip are even circular arcs IN THEIR PLANES (`arc_plane`); no hidden face flips (both faces share one material).
  - Post-passes: `scripts/curve/scratch/edgesmooth.py` on seam windows 340-400, 590-670, 780-840, 870-925, 205-245, apex 440-530 (sigma 7) and wrap 925-995 (sigma 5).
  - Checks: `scripts/curve/scratch/jitter.py <pose>` (edge-curvature jitter, fold-back test), clearance.py, dump-view.mjs (engine geometry at any viewport; use port 4100 for pose overrides — 3100 ignores overrides).
- **Desktop:** engine feature `fit` (lib/ribbon/poses/resolve.ts `fitRuled`, types.ts `FitSpec`): per viewport the phone sculpture is scaled/placed into the mockup's box relative to the name and rotated so the camera sees it from the phone's direction. Responsive tail `steerTail` (`TailSpec`) on desktop (fromRing 165, right edge at screen centre) and phone (fromRing 70, diagonal bottom-left exit).
- **Per-letter weave:** `DisplayHeading` `ribbonFront` (runs of letters, each fully in front/behind; switches only between letters). Currently the whole name is in front.
- **Name type-in** synced to the intro: `components/site/HeroTypeIn.tsx` (only hides the name if the intro really starts within 1.5 s).
- **Intro animation:** slide mode with `hiddenEntry` (ribbon grows out of its hidden end along a camera ray), slowed (introStiffness 1.6). Settings in `lib/ribbon/siteSettings.ts`.
- **Material:** matte (metalness 0, roughness 0.4, #ff4a00), key + light 45° above the camera, depthShade 0.6, soft AO (0.45 / aoSpec 1), DoubleSide material (fixed the "translucent folds" = back-face culling), thick band 0.147, straight-cut ends (capLengthRatio 0).
- **Slow networks:** engine render deadline starts after the chunk loads (25 s chunk deadline); posters regenerated (`node scripts/render-posters.mjs --base http://localhost:3100`) — regenerate again whenever pose/material changes.

## What is LEFT (agreed plan, in order)
1. (Optional polish the owner may raise) satin sheen on the matte material; tail swing tuning.
2. **Pinned-scroll story (step 3 of the plan):** sections pin for a stretch of scroll (sticky + scroll progress, NOT a hard scroll lock; scroll up reverses; reduced-motion = static). One long ribbon track: AK pose → scroll slides the ribbon off the name toward the leading end → it exits at the base of the A's left leg → continues into section 2. Extend `lib/ribbon/slide.ts` (the path already has extensions beyond both ends; drive `sigma` from section scroll progress instead of the intro spring once settled).
3. **Section 2** ("Interfaces, systems and AI. One continuous line.") as a full-viewport section; ribbon forms a wave (horizontal desktop, vertical phone), generated per viewport, pinned until the wave completes, released near the section bottom.
4. **Section 3:** the 3 project cards fit in ONE viewport; ribbon weaves through/around them (agree the design with the owner first).
5. Open questions for the owner: where does the ribbon's journey end? Does the hero exit start on the first scroll or after a short pause?
6. Check sizes before reporting: 1280x800, 1440x900, 1512x982, 1920x1080, 2560x1440, 3440x1440, 1024x768, 390x844, 440x956, 375x667 (`scripts/curve/scratch/shot.mjs`, `introframes*.mjs`, `slow4g.mjs`).

## How to resume
1. `git checkout claude/upbeat-hellman-f92bb7 && git pull`
2. Start the dev server: preview_start name "site-live" (port 3100). The pose-override build for renders runs on port 4100 (`NEXT_DIST_DIR=.next-ak NEXT_PUBLIC_POSE_OVERRIDE=1 npx next build` then `... next start -p 4100`; `git checkout -- next-env.d.ts tsconfig.json` after building).
3. Python: `scripts/mockup/.venv/bin/python`. Render a pose: `node scripts/render-pose.mjs --pose <pose.json> --out <dir> --settings '<json>'`.
4. To change the phone pose: edit a config, run `build_n4.py`, the edgesmooth passes, check `jitter.py` + clearance, then copy rings into `lib/ribbon/poses/ak-hero.json` (keep the desktop `fit` and `tail` blocks; desktop rings are only a fallback), regenerate posters.

## Owner decisions, 2026-10-10 (final guest-pass session)
- Execution: Opus works end to end itself this session (no subagents).
- Hero exit timing: hero stays pinned; the ribbon first slides fully off the name (toward the leading end, exiting at the base of the A's left leg); only once the name is clear does the page move on to section 2. Scroll up reverses.
- Journey end: the ribbon runs the whole page. It pauses at the TERMINAL section; a bar at the bottom right fills as you scroll; when full, the site auto-scrolls to the footer, where the ribbon re-forms the signature AK pose next to "Let's build something together", weaving in and out of that text like the hero.
- Site polish is in scope: the navbar is transparent and text collides/overlaps under it; the rest of the site needs Apple-level polish.
- The owner has per-section animation ideas: get them before designing sections 3+.

## THE SCROLL JOURNEY (owner's spec, 2026-10-10) — desktop and mobile choreographies differ
Every section is one viewport. Pinned by scroll progress (not a hard lock); scroll up reverses scroll-linked parts. Reduced motion = static. The navbar never overlaps content. Motion: Apple-like, fluid, energetic (springs, not linear scrubs).
1. **Hero:** intro as built (ribbon grows from the hidden end behind the A's right leg, flows to the leading end at the bottom; name types in). On scroll the hero stays pinned; the ribbon slides off the name toward the leading end and exits at the base of the A's left leg; only when the name is clear does the pin release.
2. **"Interfaces, systems and AI. One continuous line."** Full viewport, pinned; the ribbon forms a wave: horizontal on desktop/landscape, vertical on phone/portrait. Released when the wave completes.
3. **Selected Work:** the 3 cards shrink to fit one viewport (responsive). Pinned; scroll drives the ribbon card 1 → 2 → 3, behind some cards and in front of others (Claude designs the order and shows the owner). After card 3 it speeds up and leaves; the pin holds until the cards are clear, then releases.
4. **How I Build:** (Experience moves OUT of this section, so it fits one viewport.) The ribbon goes down into the empty box to the right of the three principles (desktop). Scroll-linked: it twists and compresses like a spring. When fully compressed (AUTOMATIC from here): it springs back out the way it came, much faster, then shoots diagonally down-left through the gap between the D of BUILD and "01 Make it understandable", and the page auto-scrolls to the next section. Mobile: make room in the layout for the spring.
5. **Experience + Terminal:** desktop = ONE section fitting the viewport; mobile = two separate sections, same concept. The ribbon stops just before the first experience entry and waits. Scroll-linked: it underlines the experience lines (desktop: horizontal, a straight line with a little wave; mobile: a straight vertical line down, a little wavy). Then it loops back, does an S-curve sweep, loops again and stops right next to the terminal.
   Then a progress bar (bottom right) filled by scrolling, like lusion.co: it drains back to 0 if the user stops before it is full; when full, the site auto-scrolls to the footer.
6. **Footer (full screen, contact + footer):** the ribbon curves and loops (small flourishes), then enters at the HIDDEN TAIL END of the signature AK pose and forms it exactly like the hero intro (leading end at the bottom), weaving in and out of "LET'S BUILD SOMETHING." like the name in the hero. The journey ends here.


## STATE AT END OF THE 2026-10-10 GUEST-PASS SESSION (read this first)
Latest commit on `claude/upbeat-hellman-f92bb7` is pushed. Journey log: docs/ribbon/JOURNEY.md, era 5 (v334-v339). Next version: **v340**.

### Done and live
- Navbar never overlaps content: last screen (contact + footer) = one viewport (components/site/FooterHeight.tsx); a frosted header backdrop fades in only while content is under the bar (SiteHeader.tsx). Checks: scripts/contactfit.mjs, scripts/navcover.mjs.
- **Hero exit (v334):** hero pinned (sticky `.hero__pin`, 110svh room); the ribbon slides toward its leading end until its trailing end clears the name (`SlideMotion.sigmaToClear`, measured from the name's ink). Page scroll moves the ribbon image by a camera LENS SHIFT (core.ts `viewShift`), never by moving the 3D geometry (that tilted curves).
- **Section 2 (v335-v339):** pinned full-screen statement split around a wave. Code: components/site/journey.ts (driver), lib/ribbon/journeyPathDesktop.ts (desktop, owner-approved), lib/ribbon/journeyPath.ts (phone/portrait).
  - VIRTUAL page = the page with every pin's scroll room removed; V = virtual y at the viewport top (from the governing pin); world = (vx - W/2, H/2 - vy). Each section is designed as if the camera faced it, then sheared y += z * sectionTop / camZ (exact head-on look through the shifted lens).
  - DESKTOP (approved "almost perfect"): rigid window; the hero's remaining strand flows down-left off the left edge during the free scroll (perspective-aware exit + smooth blend out of the dive), a hidden route, the head re-enters from the left edge as section 2 pins and draws a horizontal tilted-plane wave between "Interfaces, systems and AI." (above) and "One continuous line." (below).
  - PHONE: since v341 the SAME approved desktop choreography, vertical (journeyPathDesktop.ts portrait branch: rigid ribbon, the strand flows off-screen, the head re-enters from the top edge and draws a centred vertical tilted-plane wave). Older phone attempts below (v336-v340, rejected) are kept for reference only:
  - (old) PHONE (v339): independent head/tail (`SlideMotion.lead`): the tail unthreads off the name while the tip waits below the hero; once the user reaches it the tip follows at 72% of the screen height. Path: twist 90° to edge-on at the hero's bottom, one pure bend about that width toward the middle, 45° twist on the straight, edge-on turn straight down the exact centre, a regular centred wave; texts left/right of it.
  - Phone hero: the A's apex sits IN FRONT of KHURANA's U and R (`ribbonFrontPortrait`, `data-ribbon-depth-portrait`).
- Physical rules that made things work: a band only bends about its own width (cylinder sections); twists only on straight stretches; never smooth a twist across a turn (= pinched folds); band width is defined up to sign (always take the shorter twist).

### Next (owner's plan, in order) - full spec in "THE SCROLL JOURNEY" above
1. Get the owner's verdict on the v341 phone section 2 (desktop choreography, vertical); fix what they flag (one change at a time).
2. Footer: full-screen; the ribbon curves/loops, then enters at the HIDDEN TAIL END and forms the AK pose exactly like the hero intro, weaving with "LET'S BUILD SOMETHING." like the name in the hero.
3. Experience + Terminal (desktop one section; phone two): ribbon stops before the first experience entry, underlines the entries as the user scrolls (desktop horizontal slightly wavy; phone vertical slightly wavy), loops back, S-sweep, stops next to the terminal; lusion.co-style scroll-filled progress bar bottom right (drains to 0 if the user stops), when full auto-scroll to the footer.
4. How I Build: Experience moves out; ribbon goes into the empty box right of the three principles, scroll-linked spring compression, then AUTOMATIC fast release back out and diagonally down through the gap between the D of BUILD and "01", auto-scroll to the next section. Phone: make room for the spring.
5. Selected Work: 3 cards fit one viewport; ribbon weaves card 1 -> 2 -> 3 behind/in front (Claude designs the order and shows the owner); speeds off; pin holds until cards are clear.
6. Rest-of-site Apple-level polish. Check every result at 10 sizes before showing (scripts/journey/strip.mjs, crease.mjs, wavecheck.mjs, pathtest.ts offline).

### Tools (scripts/journey/)
- `node scripts/journey/strip.mjs <outPrefix> <WxH> <y1,y2,..vh> [settleMs]` frame strips; `sheet.py` tiles them (python: scripts/mockup/.venv/bin/python).
- `crease.mjs` (SIZE, AT env): ring-to-ring normal/tangent changes of the visible ribbon (twist = dNormal - dTangent).
- `wavecheck.mjs`, `nums.mjs` (set window.__journeyDebug = {} for the driver's numbers), `join.mjs`, `pathtest.ts` (`npx tsx`, the phone path offline).
- Dev server: localhost:3100 (`-H 0.0.0.0`; owner tests on a phone at http://<mac LAN ip>:3100).

### OWNER'S WORKING RULES (copied from Claude's memory, which does not carry over between accounts)
- Apple-level polish is the one constraint. Never show/adopt anything with a visible wrinkle, crease, fold, pinch, streak or pass-through; check full-resolution crops of the exact spot before saying it is fixed.
- Do exactly the change the owner asks; do not switch approach on your own; do not carry a change to the other device unasked (desktop and phone choreographies are separate).
- Never regress what the owner approved: compare the whole figure with the baseline before sending.
- Two failed rounds at the same spot: STOP, measure the geometry, find the cause; no blind variant sweeps.
- Update docs/ribbon/JOURNEY.md every round (version tally; the owner will blog it). Commit often, push the branch; never merge to main without the owner's OK.
- The owner reviews on localhost and on a real phone; send frame strips (SendUserFile) and stop for feedback after each round.
- Screenshot QA headless only (Playwright); never drive or resize the owner's own browser.
- Shell: zsh does not word-split `$VAR` (use bash for loops); use `/bin/rm -f`, `/bin/ls`; never pkill dev servers (kill by port only).
- Usage: work until limits; at 5% weekly or session left, save/commit/push, update this file, and give the owner the prompt for the next account.
