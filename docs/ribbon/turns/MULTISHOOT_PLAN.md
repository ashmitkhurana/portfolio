# Full AK by multiple shooting (replaces the single growing chain)

**Why:** the single chain from the apex (chain_fit.py) fits the A well (the paper3 section ≈ 1–8 px), but every later section inherits the accumulated angle errors. From the bottom of the right leg onward it drifts badly (overlay: scratchpad chain_stage14_overlay.png; confirmed by the owner).

**Fix:** fit each section as its own paper-model chain with its own pose (like the apex, which reached ≈ 1 px). Then join the sections with continuity residuals whose weight is ramped up until the strip is seamless.

## Sections (ring ranges from ak_problem_phone.npz intervals; each fit also uses 15 extra rings of data on each side)

| Sec | Intervals | Rings | Rolls | Data |
|---|---|---|---|---|
| T | tail (0) | 0–131 | 2 bends | soft/blurred: weight 0.3 |
| S | S (1) | 132–225 | S bend + 4 oblique rolls (chain_fit's S setup) | visible |
| F | sweep (2) + far-left (3) | 226–387 | sweep bend + far-left fold | visible |
| A | left leg (4) + apex (5) + right leg (6) | 388–658 | the 5 paper3 rolls; seed exactly from docs/ribbon/turns/paper3/solution.npz | visible |
| K | bottom-K (7) + k_return (8) | 659–813 | fold 1, loop curl, fold 2 (chain_fit bk setup) + k_return bend | visible |
| B | back layer (9) | 814–858 | 1 bend | hidden: continuity + over/under only |
| X | crossbar (10) + wrap (11) | 859–1066 | 2 crossbar bends, wrap curl, 2 wrap twist folds | partly hidden |
| M | middle layer (12) | 1067–1101 | 1 bend | hidden |
| P | top-K front (13) + tip (14) + end (15) | 1102–1298 | front bend, tip fold, end bend | end tip hidden |

## Step 1: independent section fits (visible sections T, S, F, A, K, X, P)
- Use the paper3_fit machinery per section: its own pose, its own λ per visibility run ∈ [0.3, 6], data (point-to-point outside windows, sliding inside), coverage for windows in range, the in-section layer rule, visible-side rules (weight 5).
- Bends: ρ ≥ 0.5W, |φ| ≤ 1.2, β free. Folds: ρ ∈ [0.2W, 3W], |φ| ≤ π + 0.3.
- Every roll gets a coarse pre-search (chain_fit `presearch`) before LM. Multi-start the pose: Kabsch to the back-projected trace at depth_profile z, plus a ±25° tilt about the screen x-axis.
- Depth initial values: ak_solve.depth_profile; the tail uses the face-on width scale.
- **Gate per section: data RMS ≤ 6 px** (T ≤ 12 px). Record failures, keep going.
- Hidden sections B and M: initialise as a smooth bridge, i.e. flat plus 1 bend, posed so their ends match the neighbours' boundary rings (least squares on continuity only).

## Step 2: joint fit
- **Parameters:** all sections (poses, rolls, λ) plus a flat-u offset δ_j per junction.
- **Residuals:**
  - all section data/coverage/visible-side terms;
  - **continuity at each of the 8 junctions:** 3D difference of the two sections' surfaces at u_j + {−0.3W, 0, +0.3W} × v ∈ {−W/2, −W/4, 0, W/4, W/2}, plus normal difference (×W) at u_j. The two sections' flat coordinates are linked by δ_j;
  - **over/under between all sections** (overunder_v1.json, dense z-buffer cells, 2·thk, skip pairs within 1.5W flat arc);
  - clearance;
  - end-tip hidden behind the right leg;
  - NO text weave (handled at integration).
- **Continuation:** continuity weight 1 → 10 → 100 → 1000 (LM per level, 8-min cap each).
- **Gates:**
  - max junction gap < 0.5 css
  - junction normal angle < 2°
  - overall data RMS ≤ 6 px (tail ≤ 12 px)
  - window silhouette IoU ≥ 0.97
  - face map ≥ 0.95
  - over/under all satisfied
  - min clearance ≥ 2·thk

## Step 3: export / render / review
- Concatenate the sections' TRUE-ruling rings over their own u ranges (trim the overlaps at the junctions).
- emit_chain rules: weight-uniform spacing, ≤ 320 rings, no crossings, ≤ 0.1 px deviation; add a check of junction gaps < 0.5 css.
- Render via render-pose.mjs (4100).
- Make chain_sheets-style per-window sheets [mockup | engine | offline] plus the overview, and an overlay like chain_stage14_overlay.png (projected edges over the dimmed mockup) for every stage.

## OWNER PRIORITY (2026-10-08): realism over exact overlap
"If the overlap isn't perfect I don't care; the folds, the curves and the realism should all be perfect."
- **Hard gates (realism):**
  - no crossing or fanning rulings anywhere;
  - folds are soft rolls (ρ ≥ 0.3W) whose outline reads like the mockup's rounded outline;
  - no kinks, ripples or flat-faceted look;
  - smooth curvature (no curvature oscillation shorter than 1W along either edge);
  - over/under correct; the end tip hidden; faces correct.
- **Soft:** data RMS is a target (≈ 6–10 px), not a gate. When fidelity and realism conflict, realism wins.
