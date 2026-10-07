# Step B: whole-strip 3D solve (design; it runs only after the owner approves the 2D trace)

The input is `out_v6/edges_v3.json` (or whichever trace the owner approves): `pairs` (E1/E2 rulings, End 1 → End 2), per-sample visibility and kind, landmarks, silhouettes. The output is the `ruled` phone pose (L3/R3 rings) for `lib/ribbon/poses/ak-hero.json`.

## Why a new solver
The per-slice lift (`lift_sig.py`) computes depth from each ruling's projected length independently. It has a √-singularity as d → W, and it cannot represent a fold, where two layers are joined by a roll (HANDOFF §7). The new solver optimises the whole strip at once, as a discrete inextensible ribbon.

## Model correction (from the 2026-10-07 synthetic test, `synth/`)
- **Rulings are not perpendicular to the strip at oblique folds.** A developable strip's straight rulings run along the fold axis. Forcing |R − L| = W and r ⟂ t collapses the strip's apparent width inside a diagonal fold.
  - Replacement model: a chain of **planar quads exactly isometric to a flat strip**. Per ring, add flat-strip parameters a_i, b_i. The quad sides and one diagonal must match the flat quad's, and each quad must be planar.
  - Rings are then the true rulings, which is also what the engine's `ruled` pose should receive.
- **Single-view depth is ambiguous.** The test solve matched the 2D image to noise level with a different, equally valid depth (rms_3d ≈ 73 px).
  - Judge by the render from the owner's camera (silhouette, face masks, fold outline, layer order).
  - Let priors pick the depth: the layer order, the floor, smoothness, and plausible lighting.
- The table below describes the first model. The isometric model supersedes its width, ruling-perpendicularity and in-plane terms.

## Findings from synthetic tests 2–3 (`synth2/`, `synth3/`)
- The isometric planar-quad model fits the visible edges to noise level (0.62 px) and is exactly developable (isometry residual 0.0009). Oblique rulings emerge in the fold on their own.
- **Edges alone do not define the roll.** The true fold's rolled surface projects beyond the edge lines, out to the roll outline. Without a silhouette term, every solver leaves that region empty: fold-contour error ≈ 8.5 px, and the init was no better.
  - Required: a **silhouette coverage term** in every turn window.
  - Points 2 px inside the roll outline (the yellow `sil` guides) must be covered by the projected strip.
  - Points 2 px outside it must not be covered.
- **Over/under constraints must be between distinct strands** (flat-arc distance ≫ W). In the test they were mostly between rings 1–3 apart at the fold itself, which conflicts with isometry. The fold's own layering must emerge from the init plus the coverage term, not from over/under pairs.
- Finite-difference Jacobians are slow: 221 rings took about 9 min. The real strip has about 700 rings and needs analytic or block-vectorised Jacobians.

## Findings from synth5–6 and the next formulation
- With the vectorised solver (`solve3d_fast.py`), synth5's D reached silhouette IoU 0.987, fold-outline error 1.7 px and correct layer order of 91%. It was still not converged, with image fit 3.7 px.
- A custom sparse LM (synth6) was worse. The problem is **stiff**: isometry and planarity are penalties weighted 200–4000 against data at 1. Every optimiser crawls along the constraint manifold, and the per-block costs show data and isometry fighting.
- **Next formulation: an exact hinge chain.** Make developability exact by construction, not a penalty.
  - The strip is a chain of flat quads, cut from a flat strip of width W along rulings. The ruling endpoints are (a_i, 0) and (b_i, W) in the flat domain.
  - Consecutive quads are joined by a hinge about their shared ruling, with angle θ_i.
  - Unknowns: a global rigid pose (6), plus θ_i, a_i and b_i per ring.
  - Forward kinematics: place quad 0 by the pose. Each next quad is the previous one's flat continuation, rotated by θ_i about the shared ruling.
  - Isometry and planarity then hold exactly, with no penalty.
  - Jacobian: ∂p/∂θ_k = axis_k × (p − q_k) for every point downstream of hinge k (analytic). The a_i and b_i derivatives come from ring-local finite differences.
  - Long chains amplify early-hinge errors. Mitigations: root the chain at the middle (two half-chains), and solve per section (window by window) before a global polish.
- Keep: the coverage term, layer-aware init, clearance, and over/under between distinct strands.

## Findings from synth8–9 (the hinge chain)
- The exact hinge chain with a geometric init (synth8) reaches: isometry and planarity exact; silhouette IoU 0.986; fold-outline error 1.3 px; layer order 93%; image fit outside the fold 0.9 px.
- In the fold window the solved edges stay about 9 px from the true edges (polyline distance). This holds for 5× more iterations (R1), lower window data weight (R3) and 3× ring refinement (R2, which also destabilised).
  - The true fold is exactly representable: a cylinder roll with oblique rulings, at constant b − a across the roll.
  - So this is a **local minimum caused by the init inside the window**, not model capacity.
- **Next (synth10): contour-aware window init.**
  - Inside each fold window, set the rulings parallel to the roll-outline (`sil`) direction. That gives the flat obliqueness b − a = W·cot(angle between strip and axis).
  - Spread the half-turn uniformly: θ_i = ±π/n_roll over the rings of the roll arc, with the sign from the layer order.
  - Then run stages 1–4 as in synth8. On the real AK the `sil` guides in TURNS.md provide the axis for every fold.

## synth10 result and the next approach
- Contour-aware init v1 failed: everything got worse than H8.
  - The 2D angle between the strip and the roll outline is not the 3D angle, because perspective and tilt distort it. The obliqueness came out about 1.5× too large.
  - A uniform π/n hinge spread plus an outside-only Kabsch fit gave a 46 px init with the wrong layer order.
- **Next (synth11): a low-dimensional fold-primitive fit per window, then convert to hinge parameters.**
  - Model each fold window as an exact paper fold primitive: two flat layers joined by a half-cylinder roll. The parameters are the 3D axis direction (2), roll radius ρ (1), the 3D pose of the entry layer (6) and the flat obliqueness (1), about 10 in total.
  - Fit them by LM to the window's visible edge samples plus the roll-outline coverage points, from a handful of starts (axis sign × layer order). Pick the lowest cost that has the required layer order.
  - Convert the primitive analytically to hinge parameters (a, b, θ) for the window rings, and stitch them to the outside geometric init.
  - Then run synth8's stages. H8 stays the baseline to beat.

## Model (first version)
- N rings (≈ 600, about 2 W/11 spacing), each with 3D points L_i (E1) and R_i (E2), in world space: CSS px, z toward the camera, the engine's camera (FOV, viewport 390×844 phone, anchor transform as in `lift_sig.py`).
- Centre C_i = (L_i + R_i)/2, ruling r_i = (R_i − L_i)/|R_i − L_i|, tangent t_i = normalise(C_{i+1} − C_{i−1}), normal n_i = t_i × r_i.
- Unknowns: L_i, R_i (6N). All points are free. Inside turn windows the 2D positions are not fixed, so the solver needs full 3D freedom there.

## Energy (least squares; scipy.optimize.least_squares with sparse Jacobian)
| Term | Residual | Weight / notes |
|---|---|---|
| 2D data | π(L_i) − e1_i and π(R_i) − e2_i, for samples that are visible and hard/soft | hard 1, soft 0.2; hidden 0. Robust (soft-L1, f_scale 2 px) |
| Width | \|R_i − L_i\| − W | strong; W solved globally as one scalar initialised from face-on spans |
| Inextensibility | \|C_{i+1} − C_i\| − h | strong; h = total length / (N−1), solved as one scalar |
| No in-plane bend | geodesic curvature (C_{i+1} − 2C_i + C_{i−1}) · r_i | strong (paper and satin never bend sideways) |
| Rulings ⟂ tangent | r_i · t_i | medium |
| Bending smoothness | second difference of normal curvature κ_n = (C'' · n) along s | medium; no wrinkles |
| Twist smoothness | second difference of twist τ = r' · n along s | medium, outside flip windows; weak inside |
| Twist magnitude | τ | weak outside windows; free inside flip windows (the S twist, the post-wrap twist) |
| Clearance | hinge(2·thickness − dist(segment_i, segment_j)) for \|i − j\| > 3 W/h | strong; thickness = W/11. Pairs from a spatial hash, refreshed each outer iteration |
| Over/under | hinge(gap − (depth_back − depth_front)) at each listed crossing (HANDOFF §5/§5a, TURNS §3) | strong; gap = 2·thickness |
| Floor | hinge(y_floor − y_world(p)) for all p; attraction for listed contact spans | the sculpture rests on the floor |
| Text weave | hinge rules vs the name planes (phone: apex and leg tops behind KHURANA; tagline in front of the tail) | medium; anchor-space planes from DisplayHeading |
| End 2 hidden | the tip ring projects inside the right leg's projected quad and lies behind it | strong |

## Initialisation (decisive for folds)
- Depth per landmark from the layer order (front → back), as piecewise-linear z along s, then back-project the pairs at that depth.
- The layer order uses the existing `lift_sig.py` Z anchors as the starting values. They already encode the right over/under; re-check them against §5a.
- Inside each fold window (apex, far-left, top-K tip, S), initialise as two layers joined by a half-cylinder roll of radius ≈ 0.12 W about the fold-contour line (the silhouette guide). The roll axis comes from the contour direction; the layer order comes from the spec.
- Hidden twist after the wrap: initialise with a linear half-turn of r over the hidden span behind the left leg.

## Continuation schedule
1. Data + smoothness + width/length, with weak constraints, to get the shape.
2. Add clearance, over/under and floor at full weight.
3. Tighten inextensibility and in-plane bend to near-hard.
4. Polish: drop the robust loss on data to plain L2 inside a 2 px band.

## Gates (all required; the owner judges last)
1. Edge-line chamfer, render vs mockup (rim edges only), mean ≤ 2 px, p95 ≤ 5 px, per region (`eval_edges.py`).
2. Silhouette match at each turn window (rendered outline vs the yellow silhouette guides), p95 ≤ 4 px.
3. Face-map agreement ≥ 0.95, computed from the 3D normals vs the camera.
4. Wrinkle gate: no κ_n or τ oscillation shorter than 1 W.
5. Clearance ≥ 2·thickness everywhere; over/under all satisfied; End 2's tip fully hidden; the dark end strand visible in the wedge between the right leg and the bottom-K loop.
6. 3× crops of every turn, ours vs the mockup, reviewed live at 390×844 by the agent, then by the owner.

## De-risk first
Before the full strip, solve only the apex window (fl_out → apex_out) with its neighbours pinned, and confirm that a clean soft fold with the correct contour emerges. If it doesn't, fix the model there, not on the whole strip.

## synth11 result: root cause of the fold-window error
- The paper-fold primitive fits the GT fold exactly: 0.1 px to the GT edges, fold outline 0.07 px, correct layer order. Converting it to hinge parameters is also exact (0.02 px).
- **Root cause of the persistent ~9–10 px window error in every hinge run:** the data term ties ring i's endpoints to observation sample i (the same flat u on both edges). At an oblique fold the true rulings join E1 at u with E2 at u + W·cot β (up to about 210 units away), so the per-ring data term drags the rulings back toward perpendicular.
- **Fix (synth12):** a sliding point-to-curve data term. Each endpoint's residual is its distance to the observed edge polyline within its own visibility run, plus a weak anchor so it can't slide off the ends.

## synth13: GATE PASSED (the recipe)
Result: fold edges 0.90 px, fold outline 0.57 px, layer order 100%, silhouette IoU 0.994. All four gates pass.
- Recipe:
  1. Fit an exact paper-fold primitive per fold window (fold_primitive.py, multi-start).
  2. Convert it to hinge parameters with oblique rulings and stitch it to the geometric init outside the window.
  3. Run the hinge solver with the **sliding point-to-curve data term**, anchored only at the first and last 3 rings of each visibility run.
- The generic geometric init with the same solver fails (S8b), so the per-fold primitive init is essential.
- The "layer order 0.0" in synth11–12 was a label-gauge artifact (a[m] = 0 pinned inside the roll), not a mirror. The layer metric is now gauge-invariant (median label offset over non-window rings).
- **For the real AK:** the apex, far-left fold, top-K tip and the two bottom-K folds are "fold" windows that fit this primitive. The S twist (a twisting band) and the wrap (curl plus hidden half twist) need a twist primitive: a helicoidal band segment with a linear twist rate along a straight or circular axis. Design it the same way, test it synthetically, then apply.
