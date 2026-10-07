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
