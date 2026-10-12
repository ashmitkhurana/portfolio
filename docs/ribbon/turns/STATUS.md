# Status for Ashmit

**2026-10-07: 2D trace APPROVED by the owner: `out_v9` (route_v8.json, guides_v5.json).** Their review fixes are included: the wrap's hidden half twist, the bottom-K double fold (from their sketch), and the full-width end strand with an angled hidden tip. Next: Step B, the 3D solve.

(Overnight notes below.)

## For you to review: the new 2D edge trace
Open these side-by-side sheets: the mockup is on the left, the trace on the right.
- `out_v6/sheet_overview.png`: the whole ribbon
- `out_v6/sheet_apex.png`, `sheet_farleft.png`, `sheet_scurve.png`, `sheet_bottomk.png`, `sheet_wrap.png`, `sheet_junction.png`, `sheet_topk.png`, `sheet_endstrand.png`: 3× crops of every turn

Legend:
- **magenta** = edge 1, **green** = edge 2
- **dashed** = hidden behind another strand
- **yellow dotted** = roll outline (surface turning away, never an edge)
- **thin white lines** = matched cross-sections of the strip

What to check: does each colour follow ONE physical edge all the way, crossing over at every flip, exactly as we discussed (the apex dive line, top-K tip, far-left fold, S twist)?

## What changed vs the previous agent's trace
- Edges are now labelled by **physical continuity**, never by "outer vs inner". The edges cross over at the S twist, the far-left fold, the apex, the hidden twist after the wrap, and the top-K tip.
- Roll outlines (the apex flat top, the far-left outline, the S outer bend, the top-K tip end, the bottom-K loop bottom, the wrap curl) are marked as outlines, not edges.
- The left-leg anomaly is removed along your white line. The return strand now emerges from behind that true edge.
- The full turn-by-turn breakdown with coordinates is in `TURNS.md`. The locked spec is in `HANDOFF.md` §5a.

## Automatic checks (from `out_v6/report.txt`)
| Check | Result |
|---|---|
| Visible face vs your face map (all non-turn spans) | **100%** agreement (488 cross-sections), gate ≥ 95% |
| Wobble (curvature ripples shorter than 1 ribbon width) outside turns | **0** |
| Snap accuracy to the real image edge lines (core, p95 / max) | edge 1 **0.58 / 1.82 px**, edge 2 **0.88 / 2.01 px** |

The blurred tail bottom (the mockup's depth of field) is used as low-confidence data so it can't bend the line.

## New facts found while tracing (now part of the spec)
1. The sweep passes **in front of** the bottom of the A's right leg (where the bottom-K loop starts).
2. At the V by the right leg, the return strand runs over the crossbar's lower corner just before both go behind the right leg (return in front, as you said).
3. The junction X sits entirely inside the right leg's width.

## Not started (waiting for your OK on the trace)
- The 3D solve (design in `SOLVE_SPEC.md`). A synthetic test of the new solver, an exact paper fold reconstructed from its 2D edges only, was run to de-risk it. It does not touch your ribbon. Results are below once available.

## Synthetic solver tests (they do not touch your ribbon)
I folded an exact paper strip with a soft roll, projected it through the site camera, and asked the solver to rebuild it from the 2D edges only.
1. **The first model was wrong at diagonal folds.** It assumed the straight lines across the ribbon are always perpendicular to its length. At a diagonal fold (like the A's apex) they run along the fold axis instead. The new model is a chain of flat panels that unrolls exactly to a flat strip (`solve_iso`). It fits the edges to 0.6 px while staying exactly paper-like.
2. **One camera cannot fix depth on its own.** Several depths give the identical image. So we judge the result by the render from your camera, and let physical rules choose the depth: layer order, floor and smoothness.
3. **Edges alone don't shape the roll.** The rolled part of a fold bulges past the edge lines, out to the roll outline. The next solver version adds the roll outlines (the yellow guides) as a constraint. That test is running or queued in the next session.

4. **With the roll outline added (`synth4/`), the fold starts forming correctly.** The fold-outline error fell from 8.7 px to 3.2 px, and the correct layer is in front 70–75% of the time, up from 14%. The run didn't fully converge because the solver is slow, so a speed-up and a converged re-run are next (`synth5/`).

5. **A faster solver (`synth5/`, 20× faster Jacobian) gets the fold mostly right.** The silhouette matches the true fold at 0.987 overlap, the fold-outline error is 1.7 px, and the correct layer is in front 91% of the time.
   - It still hasn't converged, and the image fit is 3.7 px where the target is under 1.
   - Next: a direct sparse Levenberg-Marquardt optimiser, with the target fold-outline error ≤ 1.5 px, image fit ≤ 1 px and correct layer ≥ 95%.
   - Only after that is it applied to the real AK, and only once you approve the trace.

6. **The optimiser crawls because "paper can't stretch" is only a penalty (`synth6/`).** The next version builds it in: flat panels hinged along their creases, so stretching or warping is impossible by construction (see `SOLVE_SPEC.md`, "Next formulation").

7. **The hinge solver with a geometric start (`synth8/`) is the best so far.**
   - Exactly paper-like: stretch 0 and warp 0.
   - Silhouette overlap 0.986, fold-outline error **1.3 px**, correct layer in front **93%**.
   - Image fit is **0.9 px** outside the fold.
   - Open issue: inside the fold window the edge data and the roll outline still conflict (8 px), and the run hadn't fully converged (300-iteration cap).
   - Next: a longer run, then find out whether the conflict comes from too few panels in the roll (refine rings in windows) or from the coverage weights.

8. **The diagnosis (`synth9/`): the solver gets stuck inside the fold because of how it starts there**, not because the model is too weak. More iterations, denser panels or lower data weight don't fix it. Next: start each fold with its creases along the roll-outline direction, which the yellow guides provide for every fold of the real AK.

9. A first attempt at that fold start (`synth10/`) was worse. On-screen angles are distorted by perspective. Next: fit a tiny exact "paper fold" model (about 10 numbers) to each fold first, then hand it to the full solver. synth8 remains the best result.

Details: `SOLVE_SPEC.md` ("Findings") and `synth*/`.

## Resume point (2026-10-07 ~19:25)
- The synthetic FOLD solver passes all gates (synth13; recipe in SOLVE_SPEC).
- Running when the session ended:
  - synth14, the twist primitive (notes in synth14/NOTES.md)
  - ak_v1, the first real-AK baseline solve with the older method (docs/ribbon/turns/ak_v1)
  - the skeleton screenshot pass (docs/skeleton/qa)
- Next:
  1. Finish or verify synth14.
  2. Real AK window by window with the recipe (fold windows: apex, far-left, top-K tip, bottom-K ×2; twist windows: S, wrap). Render via scripts/render-pose.mjs and show the owner the apex first.
  3. Skeleton review vs the storyboard with the owner, using the screenshots.
- Done this session:
  - the terminal port (components/terminal)
  - sections size to content (scroll room behind :root[data-ribbon-journey])
  - the live dev config "site-live" on :3100 (stopped at the owner's request)

- 2026-10-07: owner reviewed the skeleton screenshots (docs/skeleton/qa) and said they look good. Sections size to content for now.

## Resume point (2026-10-07 ~22:20, session at 84%)
- Done and committed:
  - the trace (approved)
  - the paper model (paper.py)
  - apex fits v1–v3 (v3 offline matches the mockup's fold)
  - the terminal, the motion engine (?motion=slide), OG/meta, the audit
- In progress: the full-AK paper chain (scripts/mockup/chain_fit.py; plan and all decisions in CHAIN_PLAN.md; progress in docs/ribbon/turns/chain/NOTES.md with per-stage npz).
  - Stage 1 (tail + S): S being re-fitted as 4 oblique rolls.
  - Then all stages → polish → emit_chain (≤ 320 rings, weight-uniform, true rulings) → render → per-turn sheets → gates.
- After the chain passes:
  - Material/lighting step (the engine's top-of-roll dark band and the bright shoulder cap are lighting).
  - Swap the pose into ak-hero.json (after the owner OKs the renders).
  - Wire the intro reveal to `ribbon:intro-settled`.
  - Desktop placement, then the remaining audit fixes, then the PR.

## Resume point (2026-10-08 02:50; owner asleep, wants autonomous continuation)
- Approach: multiple shooting (MULTISHOOT_PLAN.md, scripts/mockup/msfit.py, docs/ribbon/turns/msfit/). Realism over exact overlap.
- All 7 visible sections have had a first fit. A is good.
- The overlays and realism checks used same-u chords instead of the true rulings, which gave false fan/crossing failures (A was flagged). The agent is switching to true rulings, dashed hidden edges and shaded renders, then re-evaluating every section and redoing only the genuinely failing folds (candidates: far-left corner too tight, top-K tip, S, bottom-K double fold, wrap).
- Then joint (continuity ramp) → export → render → sheets → owner review.
- A one-shot session cron resumes at 05:35.

## Resume point (2026-10-08 ~06:45; weekly usage 62%)
- Sections APPROVED and LOCKED (msfit/sections/*_APPROVED.npz):
  - A, owner-confirmed;
  - F;
  - P v5 (top-K loop);
  - S v6 (one big soft roll).
- Not approved: K (bottom-K loop; best = original), X (wrap; best = v5, clean curl but a flat crossbar), T (tail, unreviewed).
- Lessons, all in NOTES/messages:
  - inside fold windows use sliding + dense alpha coverage, never point-to-point;
  - seed fold axes with the paper-fold reflection rule;
  - the crossbar arch is the start of the wrap curl;
  - warm-start redos and accept only if not worse.
- The joint step (continuity ramp) DEGRADED at wc = 10 (tail collapsed, K/X mangled). The independently fitted sections are inconsistent in 3D. Junction diagnostics (gap, depth, normal/tangent angles per junction) have been requested. The next decision depends on that table: e.g. re-fit inconsistent sections WITH continuity to the locked neighbours, chained outward from the locked A (A→K→B→X→M→P and A→F→S→T), instead of a global joint.

## STOPPED for the owner's decision (2026-10-08 ~07:00; weekly usage 64%)
- Joining failed in both forms:
  - The global continuity ramp wrecked shapes.
  - Sequential one-ended growth from A: F joined (gap 5 css, realism 0) but at 160 px data RMS; S 178 px, T 725 px, K 256 px.
- Root cause: single-view depth/tilt ambiguity. Each section fitted alone picks its own depth. The approved isolated shapes (F, S, P) only match their 2D data at their own depths, which are mutually inconsistent (junction depth gaps 40–1300 css).
- What's solid:
  - the approved trace;
  - the paper model and fold recipes;
  - A (owner-confirmed);
  - the isolated shapes of F, S and P, which look right individually;
  - the terminal, motion engine, OG/meta, skeleton, audit.
- Options for the owner (see the final chat message): (1) one global fit of all rolls from a single depth layout designed up front; (2) a designed, depth-consistent 3D layout that keeps the mockup only as a 2D guide; (3) pause the 3D fit and ship other site work first.

## 2026-10-08: handoff to a fresh session
Every roll-chain approach failed (design_fit was the 5th). NEXT: docs/ribbon/turns/CURVE_PLAN.md, the AK as a designed smooth 3D centreline using the engine's own curvature frames and soft folds, built from the owner's flow and judged by eye. Weekly usage 69%.

## 2026-10-08 (afternoon): curve plan, first real-engine iterations. Paused at weekly 74% (the owner never set an 80% stop rule; an earlier note claimed it, now removed)
Tools (all in scripts/curve/, run against the `.next-ak` override build on :4100):
- `author.py <ver> 1.5 [delta.json]`: writes docs/ribbon/turns/curve/<ver>/pose.json from a control-point table (cutout px + depth css). Round arcs via `arc()`, the wrap via `helix()`.
- `dump-pose.mjs`: the REAL engine's rings (centre, ruling, normal, half width), fold/hairpin reports, smoothness, edge kink.
- `views.py`: front over the mockup, side/top, clearance groups, screen crossings. `faces.py`: visible face per ring.
- `level.py`: face-on leveling (see the rules below). Converges in 1–2 passes.
- `loopsolve*.py`: an attempt to solve loops analytically. It's ill-posed; don't reuse it.

Owner's verdict on v3 (false-colour view): the K tips are too sharp (they should be smooth circular loops), the far-left fold is too sharp, the bottom S is broken and both K loops are wrong. Judge in the SHADED render (`render-pose.mjs`, ribbon.png), never by the metrics alone.

Engine rules learned (they explain every failure so far):
1. Curvature frames follow the principal normal fully below a 4-width radius and partly up to 16 widths (width = params.width 34, NOT ×1.5). A face-on strand must therefore be straight on screen. Any visible screen curve rolls it toward edge-on.
2. Where the curve fades, the frames HOLD whatever roll they reached. Straight runs inherit leftover roll from the previous turn. `level.py` fixes this with twist offsets, measured per tagged run.
3. Never put a twist correction INSIDE a turn: it cancels the frame's roll and flattens the band into an in-plane pinch (seen in the bottom-K U). Put it just after the turn, or hidden behind another strand.
4. Flat folds only for turns of 50–150°. The fold zone runs ~1.7 W before and ~3–4 W after the corner, so two folds on the left leg barely fit. At ρ 0.45 a fold reads as a crease to the owner. Only the apex stays a fold (ρ 0.6); every other turn is a round arc that the frames roll.
5. A round loop joined to straight strands that converge toward it can't fit (the top-K tip): the strands must be parallel or diverging at the loop.

State at stop (v10b, ribbon render in curve/v10b/render):
- Better: the bottom-K loop is round, the far-left corner and top-K end are round, the A reads, and faces are correct on all straight runs.
- Still broken:
  - the tail→S junction kinks (edge kink 1084 at ring ~430);
  - the sweep shows a half roll mid-span;
  - the return crumples near the left leg (the hidden twist isn't hidden enough);
  - two clearance contacts remain.

Next:
- S: design the tail and S together in depth. The near-camera tail must curve into the screen plane BEFORE the S arc, with no screen kink where the straight tail meets the arc.
- Return and sweep: move their twist ramps fully out of view.
- After that, per-turn shaded crops for each turn, then the owner.

## 2026-10-08 ~17:15: v18w0 (latest; render in curve/v18w0/render/ribbon.png)
The owner re-stated the flow (it matches §5a). Rebuild on the APPROVED TRACE centreline (out_v9/edges_v3.json "pairs" midpoints per interval; the numbers are in the author.py comments).
- Fixed:
  - the S is a wide eased bend (eased_arc, 0.95 W) that exits onto the mockup sweep line, with a single A→B flip at the right-hand bend (leveling with no wind);
  - the far-left is a FLAT fold at ρ 0.6 (zones measured: 426..624 vs the apex 630..776, so it fits);
  - the wrap and return follow the trace;
  - the top-K tip is a 0.45 W rolled arc;
  - leveling uses ONE lock per straight run (several locks per run fight each other and never converge).
- Owner's open critique (17:05): the bottom-K loop is bad, and the overall finish isn't natural.
- Next:
  1. Bottom K: rebuild as a TILTED RING in 3D. Today it's an in-screen arc, so the frame rolls it edge-on at the bottom and it reads as a pinched tongue. The mockup's loop is a ring you look into: broad all round, with the dark inner face showing. Fit an ellipse (the tilted circle) whose tangent points match the right leg (entry) and the K band (exit); let the right leg bend back in depth into it.
  2. Remove the wavy edges on the return and the wrap's inner edge: fewer twist corrections, RAMPs only where hidden, eased curvature (eased_arc) at every turn.
  3. Two contacts remain (crossbar front pass vs the left leg near (251,846); the wrap vs the leg base near (104,966)).
- 17:25: tried evening out the return's depth (-50/-24/-4/6) to remove its wavy edge (v20). It unsettled leveling and put the return within ~1 px of the crossbar at the V (431,901). Reverted to v19c. Next try: keep the return >= 14 px in front of the crossbar from x 380 to 470, and space the return's control points evenly in 3D arc length (uneven spacing + steep depth = curvature ripple = edge waviness).

## ENGINE FOLD PLAN (owner said GO, 2026-10-08 ~17:40; keep working to 100% usage and auto-resume after resets)
Owner's verdict on v19c, from close crops (images in this session):
- the S pinches and flashes pale (it must stay broad, with one long gradual turn and a thin rim);
- the bottom-K must be the DOUBLE FOLD of the approved trace (other face visible between the folds), not a ring;
- the top-K outgoing strand must read IN FRONT (broad and bright to the tip, rolling over the top; the returning strand the darker inner face behind; numerically v19c is right, -67 px, but it reads wrong because the outgoing strand rolls edge-on early and the returning one is the brightest);
- creases and ripples everywhere = the seams of my circles + straight runs + twist corrections.

Root cause: lib/ribbon/fold.ts builds ONE crease per zone, with long straight lead-ins (Lin/Lout ~1.7 W / 3–4 W), so two folds close together are impossible. The curvature frames roll the band their own way at every curve.

Plan: a local PAPER-SPAN primitive in the engine, a port of scripts/mockup/paper.py. That file is an exact isometric strip folded by a chain of rolls, each [u_k, beta_k (crease angle), rho_k, phi_k]; it built the owner-confirmed A.
1. lib/ribbon/paper.ts: buildPaperSpan(entry frame {pos, T, N} from the centreline at the span start, rolls[], span length, ring count) -> rings (centre, ruling, normal, hwScale) in the same arrays geometry.ts already packs, so the shader is unchanged.
   - Node test: edge lengths preserved; layers >= 2 × thickness apart.
2. Pose format: variant-level `spans: [{from: pointIndex, to: pointIndex, rolls: [...]}]`. resolve.ts passes it through. geometry.ts applies the spans after frames/folds and replaces those rings.
   - Make the span's exit frame continue smoothly into the following centreline: blend over ~1 W, or author the next control points from the span's exit pose.
3. Bottom-K double fold first. Read the creases from the trace: TURNS.md §2.4, guides_v5.json roll outlines, and the edge crossovers in out_v9/edges_v3.json around landmarks bk_in/bk_out. Take the radius from the mockup's roll outline.
   - Render, then compare a close crop with the mockup bottom-K crop.
4. Then the top-K tip (a fold like the apex: the 150° limit no longer applies) and the S (a twist span spread over >= 3 W, the band broad, only a rim showing).
5. Reuse msfit/sections/*_APPROVED.npz (A, F, P, S shapes in paper parameters) as starting rolls where they apply. They are paper.py parameters already.
- 17:45: step 1 DONE (commit 4b1a84e). lib/ribbon/paper.ts (paperPoint, buildPaperSpan) plus scripts/curve/paper-test.mjs (`node --experimental-strip-types`). It matches paper.py to 7e-14 and is isometric to 0.05 %.
  - Design note: two folds with the SAME roll sense put layer 3 back under layer 1 (0.2 px apart), so a double fold whose ends must clear needs OPPOSITE phi signs (a Z-fold: layers 36 / 72 px apart). Check which the bottom-K trace implies.
  - Next: step 2 (spans in the pose format plus geometry.ts), then step 3 (the bottom-K double fold).

## 2026-10-08 end of session: see docs/ribbon/RESUME.md (start there)
The approach changed to `scripts/curve/rotosurf.py`: the AK from the approved trace's edges + designed depth + the approved paper sections. The best is `docs/ribbon/turns/curve/best/` (r19). `ak-hero.json` is unchanged.

## 2026-10-09: r31 = new best (S crease fixed)
Fresh session after the Mac reset. The env is rebuilt and r23 reproduces byte-identically.
- ROOT CAUSE of the S crease (diagnosed from the screen-space ruling dumps): the approved sections were resampled and crossfaded BY RING INDEX. The trace and the S source are 60–80 px out of phase along the strip, and the re-paired 's' window pins the trace's R edge on one point for rings 152–193 (all those rulings fan from one apex). The index blend made the R edge double back (a small curl at rings 140–152), which read as the crease and cone.
- FIX: `ALIGN=1`: each section is located on the trace by position and resampled onto the trace's rings by arclength. For S the fade-in completes by ring 148 (`S_FADE_END`), before the pinned rings. Default `ALIGN_SECS=S`: aligning F/A/P too (r28) put a diagonal seam in the sweep and a notch at the left-leg corner.
- Tried and rejected: no approved S (r24, r27: a sharper kink); longer index fade FADE_S_LO 70/110 (r25, r26: barely softer); an earlier S fade end 140 (r30: kinks at 124–134).
- Still open at the S: a bright fan of shading converging toward the S's lower tip (the rulings rotate fast there). The mockup is a broad, even turn with a thin bright rim along the inner edge.

## 2026-10-09: r33 = new best (S fan removed)
- The S's bright fan came from the ruling pairing: at ring 135 the L edge advanced 7.4 px/ring and the R edge 1.2, so the rulings swept from one point. `EQS=a:b` re-pairs both edges at equal arclength fractions over rings a..b (blended in/out over EQS_RAMP=12). The default is 125:215 (r33): the fan is gone and the bend reads round. 118:243 (r32) is similar but adds more near-intersections; 140:200 (r34) misses ring 135 and changes nothing.
- Still open at the S: a faint seam line running from the lower left into the S's tip (render ≈ x 540–675, y 1400–1435).

## 2026-10-09: S seam line + material test (no new best)
- Faint thin line across the lower S (rings ~123–127, along a ruling): not a mesh discontinuity. The S relief pitches the band into its dive quickly (zL 260→240 over rings 119–131, the centre tangent Tz 0→−0.41), so the normal sweeps ~4°/ring and the glossy material shows a narrow glint. New knobs, default OFF: `ALIGN_DEDUP=1` (zero-length trace steps no longer stall the aligned source at rings 131/132: a real but minor glitch, does not remove the line) and `ZSM=a:b:sigma` (Gaussian-smooth zL/zR over a..b). `ALIGN_DEDUP=1 ZSM=40:200:16` (r37) makes the line much fainter but flattens the S highlight; wider settings distort the S top near the F join. A real fix needs a slower designed pitch into the S.
- Material test (`render-pose.mjs --material '<json>'`, a live engine.patchSettings override, no rebuild): clearcoatRoughness 0.35/0.5, anisotropy 0.25, roughness 0.42. The line SURVIVES even at clearcoatRoughness 0.5 (so it is geometry, not only gloss), and rougher settings only make the ribbon flatter. The mockup's look comes from bold highlight STRIPES across the band alternating with deep red-brown shading, i.e. strip-light (softbox) reflections in a glossy satin. The material pass should design the ENVIRONMENT (softbox strips), not the roughness.

## 2026-10-09: r34 = new best (the wrap's arch over the left leg)
- Diagnosis: the wrap's screen edges already match the trace (< 1 px mean) and the mockup silhouette (3–8 px). The failure was DEPTH: the crossbar was keyed to arrive at z ≈ 6 (`LZ+30`), but the approved A section tilts the left leg so it sits at z ≈ 40 where the crossbar crosses (y ≈ 790–830 cutout px). The leg hid 80% of the arch and the surfaces intersected, hence the slivers.
- Fix: `XB_Z=70` (the crossbar's end depth; knobs `WRAP_DIP`, `WRAP_HOLD` also exist) + a depth-constraint pass `ZCON="a:b>ivs:gap;a:b<ivs:gap"` (moving rings a..b must be in front of / behind intervals ivs by gap wherever they overlap on screen; a smooth envelope, applied at the very end to zL/zR; screen edges unchanged). Default `ZCON="880:945>3,4:16"`: the crossbar is 100% in front of the leg with ≥ 16 clearance, the notch is gone.
- Still open: the curl bottom (rings ~941–1000) passes THROUGH the leg (min 3D distance ~0.1) to get behind it, hidden at the leg's base. Forcing it behind (`;975:1066<3,4:16`, w6–w8) leaves a spike: the trace's curl lies ON the leg's outer-edge region on screen, so there is no screen room to go round the leg's edge. A clean fix needs the leg's own left edge to roll back where the curl wraps it (a leg-side change), or a retrace of the curl.
- Tools: `$SP`-style checks (occlusion z-buffer, 3D clearance, order checks) were written as scratch scripts; port them into scripts/curve/ when needed again.

## 2026-10-09: r35 = new best (S inner-corner ridge softened)
- The owner pointed at hiccups in the S/sweep (their crop = render x 393–745, y 1064–1480). Mapped: (A) a dent on the S's upper edge at ring ~218, the S→F crossfade (F still index-blended); (B) a shading ridge from a corner on the S's inner edge: smooth edges and depths, but the surface normal turned 18.8°/ring at ring 195 (rings 189–204 > 6°; it was 13.7° in r31, and EQS 125:215 concentrated it); (C) a thin dark line along the S's inner edge: the band's edge/thickness renders dark where the mockup has a bright rim (material); (D) the known glint line at rings 123–127 (pitch onset).
- B: `EQS=125:230 EQS_RAMP=20` (r35): normal kink 18.8 → 9.5°/ring, the corner softer. 125:240 (s2) sharpens the corner again. `ALIGN_ENDS=F:lo` (align only F's S end) resamples F's interior and adds kinks at rings 288–290: rejected.

## 2026-10-09: S→F dent (A): open, three approaches rejected
- The S and F sources never agree in their overlap (rings 211..243): ≥ 14 px (R) / ≥ 38 px (L) apart, ruling angles diverging up to 88°. The stage-a trace is smooth there but 40–90 px from both (F's L edge ~90–95 px off the trace all along rings 211..260: F looks ~18 rings out of phase with the trace at its S end, the same index-phase problem the S had).
- Rejected: `ALIGN_ENDS=F:lo` (resamples F's interior, kinks at rings 288–290); a short crossfade centred on the best-agreement ring (`SF_FADE`, a hard depth crease at 210/211); fading both into the trace (`SF_TRACE`, R-edge turns up to 83°). Next idea: align F's phase by arclength over ONLY its first ~40 rings, blending back to F's own index mapping by ring ~270, and find out why full F alignment kinked at 288–290 first.

## 2026-10-09: r36 = new best (the bottom-K loop: bigger, round, smooth)
- Diagnosis: the loop missed 40% of the mockup's loop area (a crescent at its right and bottom); ringfit.py fitted the ring to the trace CENTRELINE only, so it was too small and too steeply tilted. The ring was also sampled at only 12 points and linearly interpolated over ~106 rings: a 12-sided POLYGON, whose vertices were the creases and whose flat facet was the bright flat strip. And it was seated in depth only at its start, so it reached the K band ~150 z too near the camera and the exit fade made a crease.
- Fix (new defaults): `BK_RF=72.155,2.1885,0.7960` (R 72 css ≈ 1.4 W, tilt 125°, from a silhouette fit), `BK_WSCALE=1.297`, `BK_TURN=0.409`, `BK_NPTS=120` (ring maths in scripts/curve/ringmod.py), `BK_FADE=10` (removes the entry kink), `BK_ZRAMP=smooth` (a smoothstep depth ramp so the ring ends at the K band's depth). Loop-box IoU vs the mockup 0.67 → 0.84, no clearance violations, the far wall consistently behind the near wall.
- Rejected: widening alone (BK_WSCALE up to 2.5: IoU 0.71), BK_TURN_OUT (ruling already agrees at the exit), K8_Z_MATCH (moves the depth step instead of removing it), BK_ZRAMP=late (dN 28 at ring 720).
- Remaining at the loop: the entry where it leaves the right leg's foot (rings 659–690) is a tangent junction with dz ≈ 0 (no 2T margin), as before.

## 2026-10-09 (session 2): r37 = new best (top-K loop as a constant-ruling band)
- New tools: `scripts/curve/diagnose.py` (engine-ring metrics dN/dB/obliquity/curvature, pose-ring mapping, overlays), `scripts/curve/clearance.py` (3D clearance clusters between non-adjacent strands), `scripts/curve/cylfit.py` (fit a constant screen offset d between the two trace edges; `scan` mode finds cylinder-like stretches). `scripts/render-pose.mjs --settings '<json>'` patches any engine setting live.
- Diagnosis: the right-leg crumples are ruling FANS (the R edge stalls while L advances): pose rings ~647–657 (leg foot → bottom K) and ~1103–1114 (top-K strand leaving the leg). `EQS_POST` (final 3D equal-fraction re-pairing, default off) made dN worse: rejected.
- In the mockup the top-K loop is a generalised cylinder: both projected edges are the same arc shifted by d ≈ (−47, −76) cutout px (cylscan residual 0.2–0.8 px over rings 1150–1290). `CYL="a:b:ramp:sign:zmode"` replaces a window with a constant-ruling band fitted to the trace (edges = midline ± d/2; zmode perp = the centre depth integrated so the centre curve is perpendicular to the ruling). Default `CYL=1080:1290:25:-1:perp` (r37): the notch/sliver where the top-K leaves the right leg is gone, the loop is rounder and wider; max dN in rings 1080–1298 19.5° → 5.1°. sign +1 or zmode keep: no better than r36; windows starting at 1110/1130 keep the notch.
- Clearance (r37): pre-existing INTERSECT clusters remain: pose 378–422 × 942–1005 (far-left/left leg × wrap curl, hidden) and 818–859 × 1050–1095 (the hidden X behind the right leg); 790–809 × 1252–1269 also still < 2 px.
- Material sweeps (docs/ribbon/turns/mat/, sheets sheet*.png): metalness gives the mockup's deep shade and golden reflections; candidate j5 saved as docs/ribbon/turns/mat/candidate.json (NOT in siteSettings.ts yet). The owner spec says inner faces read darker only from shadow, so the brown loop interiors need ambient occlusion (planned).

## 2026-10-09 (night): r38 = new best; site material = metallic orange + baked AO
- Bottom-K ring refits to the mockup silhouette (`scripts/curve/bkfit2.py`, `BK_FIT3` knob, default off): silhouette IoU 0.69 → 0.87, but rendered loops get normal flips (dN 100–138°) and a worse crease at the leg foot (b1–b5): rejected for now. Every ring family needs a 65–85° twist from the right leg's ruling at the entry.
- Leg-foot crease (D2, pose rings ~647–657, the R edge stalls): `EQS` now takes several windows; default `125:230,620:700` (r38) removes it (crease and pinch gone at 2× crop; max dN in rings 620–720 14.1° → 13.4°). `EDGE_SIGW="a:b:sigma"` (extra local edge smoothing, default off) also works (f3, dN 9.7°) but bends the foot more.
- Environment AO in the engine (commit 3c84d8c): depth maps from 32 directions → soft PCF bake into a per-vertex texture → blur along the strip within each face; one fetch per vertex per frame; re-baked only when the geometry changes. No mottling at 1:1.
- Site material (lib/ribbon/siteSettings.ts, owner-approved for this branch): metalness 0.7, env AO 1.0 (aoSpec 2), key strip 14 / width 5 / softness 0.7, exposure 1.2 (sweeps in docs/ribbon/turns/mat, ao3, ao4). Still missing vs the mockup: broad satin highlight gradients (needs a softbox-style env pass).
- Comparison with the live hero pose: docs/ribbon/turns/live/compare.png.

## 2026-10-09 (night): r39 = new best (apex corner) + key light moved off the tail
- `EDGE_SIGW` default `490:535:8` (r39) rounds the A apex's top-left corner (g1; no new defect). Rounding the far-left fold corner the same way (g2–g4) raised dN 7.6° → 10.7–13.1°: rejected.
- Site key strip moved to elevation 40 / azimuth −50 (h6): the blown-out glare on the near tail is gone (tail pixels > 220: 10.5 % → 0.08 %), deep-shade share 17 % → 24 % (mockup 28 %).
- The return strand (pose rings 990–1070) matches the trace to < 1 %; it only reads thin because it emerges from behind the left leg as a wedge and is shaded dark with one specular streak (shading, not geometry).
- New: `scripts/curve/silhouette.py` (render vs mockup silhouette diff, per-region IoU); r39 results in docs/ribbon/turns/curve/r39/sil/.

## 2026-10-09 (night): site material = golden orange with bright rims
- Rims: `material.rimNormalMix` 0.85 (rim normals blended toward the camera-facing face normal, like a rounded bevel): the dark edge line along every strand is now a bright thin rim (docs/ribbon/turns/rim).
- Hue: the salmon-pink highlights came from the white clearcoat reflection. Clearcoat 0, base #ff7a0a, specular tint #ffd060, key 17 (docs/ribbon/turns/gold2, z6): golden orange like the mockup (mid-tone hue 18° → 26°, mockup 28°).
- Rejected: warm key colours (docs/ribbon/turns/gold: darker and redder); wider bottom-K bands BK_WSCALE 1.45–1.75 (silhouette IoU 0.78 → 0.81 but dN 14–16°); apex-shoulder notch fixes (it is the hidden edge's rim emerging behind the front face; with bright rims it is a ~3 px seam; a real fix is a rim fade-in in the engine).
- Finding: most of the bottom-K "missing" silhouette (docs/ribbon/turns/curve/r39/sil) is the END strand (#12): in the mockup it is visible as a dark strand in the gap between the right leg and the bottom-K loop down to ~y 1100 (780 frame); ours ends higher (ring 1298 at ~(492, 972)) and hides behind the leg.

## 2026-10-09 (night): desktop hero = r39; bottom-K twist attempt rejected
- Desktop variant of lib/ribbon/poses/ak-hero.json is now the r39 sculpture: the phone-variant points are mapped to world with the phone context, uniformly scaled (0.82 × the old desktop height ratio), placed with the projected bbox top at 120 px and right edge at viewW − 70 at 1440×900, then mapped back with the desktop context (scripts/curve/desktopify.mjs; exact port of resolve.ts pointToWorld; round-trip error < 0.001 px). Old desktop pose: docs/ribbon/turns/live/ak-hero.prev2.json. Screens: docs/ribbon/turns/live/desk_r39_*.png.
- `BK_TWIST=slerp` (default off): rotates the bottom-K ruling about the tangent instead of a linear blend. Entry twist needed is 100–117°; with the refit ring it still folds (dN 75–94°), with the default ring it adds a beak at the loop's lower end (s1–s4, docs/ribbon/turns/curve/bktwist_compare.png). Rejected. The bottom-K needs a different construction (e.g. the leg itself rolling gradually over its lower third so the twist is spread, or a re-trace of the loop with the owner).

## 2026-10-09 (night): soft-box fill; far-left chamfer attempt rejected
- Site fill light = a large soft box from upper-front-left (az −20, el 50, 20×40, softness 1, intensity 3; docs/ribbon/turns/soft, f1): broad satin gradients; foreground luminance p5/p50/%<60 = 26/93/26 % vs the mockup's 28/98/28 %.
- Far-left fold chamfer: `EDGE_SIGW1="a:b:sigma:L|R"` (default off) smooths only one edge; the outer edge there is R. Sigma 8–12 changes nothing visible; 18–25 rounds the corner but pulls the outline inside the mockup and adds a crease (farleft IoU 0.81 → 0.76, dN 7.5° → 15°). Rejected: the chamfer comes from the F section's 3D fold (a tight roll), not from the outline; it needs a fold with a larger roll radius.
- Overall silhouette IoU is now 0.881 with the brighter material (the mask threshold picks up the soft glow; r39 geometry unchanged).

## 2026-10-09 (night, end of window 1): close-crop QA of the live hero vs the mockup (next steps)
QA source: docs/ribbon/turns/live/ak-hero-r39/ribbon_crop_*.png vs the mockup windows.
1. **A left leg too dark.** It renders ~(59,21,0) vs the right leg ~(160,72,3); the mockup's left leg is bright orange. Bisect (docs/ribbon/turns/leg): direct light and self-shadow have no effect there, AO only lifts it to ~(85,30,0), so the leg FACES AWAY from the lights. Cause: the approved A section seats the leg with a steep tilt (iv 4 mean zR−zL ≈ −96 for a ~51 css band). `SIGMA` has no effect inside the approved section (sg1–sg3). Next: re-seat the A section's leg tilt (flip/reduce its relief over rings ~388–480 while keeping its apex fold), or rotate the key/fill so the leg catches light without washing the rest.
2. **Bottom-K + end strand**: the biggest structural gap (the mockup shows a clean ring with a dark interior and the dark end strand in the gap; ours shows crossing bands). Every ring refit needs a 65–117° twist at the entry from the right leg (rejected attempts: BK_FIT3, BK_WSCALE, BK_TWIST). Needs a new construction or a re-trace with the owner.
3. **Far-left fold**: chamfer + small kink where the wrap meets the leg; needs a larger roll radius in the F section (outline smoothing rejected).
4. **Apex top**: flatter than the mockup's round arch; ~3 px rim seam at the right shoulder.
5. **Near tail highlight** slightly hot after the soft-box fill (S crop).
Good now: top-K loop, wrap, junction, S shape, material hue (golden), rims, AO, desktop placement.

## 2026-10-09 (night): r40 = new best (A left leg lit)
- `SEC_RELIEF="NAME:a:b:k[:ramp]"` scales an approved section's own depth relief (half-difference zR−zL) over rings a..b. Default `A:395:478:0.5:40` (r40): the left leg's tilt halves, so it turns toward the light; it renders as a smooth satin highlight along its lit edge (left-leg patch 59 → 73 mean R; max dN in rings 380–500 6.3° → 5.5°; rings > 6°: 41 → 35). Short ramps (15) make a crease-like streak near the apex; flipping the relief (k ≤ 0) flips the wrap/leg front order: rejected (docs/ribbon/turns/curve/legtilt_compare.png, legtilt2_compare.png).
- Phone and desktop hero poses regenerated from r40.

## 2026-10-09 (day): smooth global fit (scripts/curve/fit3d.py) — in progress, nothing adopted yet
- The owner rejected r40 (wrinkles everywhere, the wrap around the A left leg broken). New method: ONE smooth ribbon fitted to the trace as a soft target (fit3d.py: B-spline centreline c, ruling g→b, half-width h; residuals: point-to-polyline edge fit, ruling/jerk smoothness, ruling ⟂ tangent, developability, speed and width hinges, end pins, --edge_w, --faceon, --screenw, --hide/--hide_auto, --rmin bend radius, --inside (stay inside the mockup silhouette), --zprior), then scripts/curve/layer.py (moves rings along camera rays — screen unchanged — to satisfy front/back order with one decision per crossing cluster; SLSQP on a smooth Δz spline), then a refit with the layered depth as prior, then layer again.
- Results so far (docs/ribbon/turns/fit/): g2/h4 remove the wrinkles (owner confirmed "ripples/wrinkles are gone"); k1/e1 make the wrap curl a face-on band of the mockup's width; e4 (rmin 25) brings the engine normal-jump max to 7.9°, 0 INTERSECT, 0 order violations; f3 (+ --inside 3, fold edge weights 0.2, rmin 35) best silhouette (apex IoU 0.961, top-K 0.920) but dN 8.4 and a mild S crease.
- Engine verified clean (docs/ribbon/turns/enginetest: analytic helices render with < 0.03° normal error); diagnose.py now measures angles with atan2 on normalised vectors.
- Open: apex crown still a flat lip, top-K tip a thin lip, fold "transparency" strip (diagnosis running), tail IoU loss in the chain refit, bottom-K ring.

## 2026-10-09 (evening): automatic turn fitting exhausted
- Owner marked 5 turns (wrap around the A left leg, top-K loop, far-left fold, bottom-K lower right, S bend) as still wrong vs the mockup; the wrap must truly encircle the left leg in 3D (for the slide animation).
- Tried, all rejected (docs/ribbon/turns/fit/): ii1 fixed outline assignment (crinkles gone, pinches remain), jj width floors, kk oblique folds + edge roll radius (kk4 = best numeric: dN 9.2, 0 INTERSECT), ll mockup-outline targets in the 5 boxes (buckles), turn cylinder primitives from the mockup outline (rejected: the silhouette lacks the inner edges), rr/rs fits to hand-picked interior rim lines (docs/ribbon/turns/rims/, incl. the owner's bottom-K sketch digitised in rims/owner/) — with forced sides the bottom-K hole improves but every turn still folds (dN 84–172°).
- Free AI image-to-3D (Hunyuan3D-2.1 via a public Hugging Face Space) produced a smooth ribbon tangle that is not the AK (docs/ribbon/turns/ai3d/); TRELLIS.2 / TripoSG blocked by the free daily GPU quota (retry scheduled).
- Conclusion: single-image fitting cannot recover which way each turn rolls in 3D. Next: shape the 5 turns by eye (a lab shaping page with per-turn handles over the mockup, or manual 3D design), awaiting the owner's choice.
