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
