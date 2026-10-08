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
