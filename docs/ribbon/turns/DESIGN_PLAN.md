# Design the AK from the owner's flow (no pixel matching)

**Owner (2026-10-08):** "I don't care if it overlaps the mockup perfectly. The overall result should be perfect: the flow of the ribbon, the folds, the curves, the bends."

## Model
- One paper strip (paper.py / chain_fit re-rooted Chain, root at the apex), W = W_css, exact developable.
- The roll list follows the flow (End 1 → End 2):
  1. tail bend ×2
  2. S fold (face A→B)
  3. sweep bend
  4. far-left fold (B→A)
  5. left-leg bends (from A)
  6. apex fold (A→B)
  7. right-leg bends (from A)
  8. bottom-K loop roll (φ≈±π)
  9. k_return bend
  10. back-layer bend
  11. crossbar bend
  12. wrap curl (large, φ≈π, over the left leg toward the back)
  13. hidden half-twist folds ×2 (behind the left leg)
  14. return/middle bend
  15. top-K loop roll (φ≈π)
  16. end bend
- Seeds: A's 5 rolls + pose EXACTLY from msfit/sections/sec_A_APPROVED (frozen, never refit). S fold from sec_S_APPROVED; far-left fold from sec_F_APPROVED; top-K loop from sec_P_APPROVED. Everything else starts from the presearch.

## Objective (NO dense trace data)
1. **Landmarks:** ~25 loose 2D centreline landmarks (cutout px). Use the approved trace's ring-pair midpoints at these rings:
   - tail: 30, 90
   - S: 160, 200
   - sweep: 250
   - far-left: 330
   - bottom-K: 680, 712, 740
   - k_return: 790
   - crossbar: 870, 900
   - wrap: 940, 980, 1020
   - top-K front: 1110, 1135
   - top-K tip: 1170, 1200
   - end: 1250
   - (A's rings are covered by the locked A.)
   Residual: soft-L1 with f_scale 20 px, weight 1. They only place things roughly.
2. **Width cue (soft):** at the landmark rings with both edges visible, projected ruling length vs the trace ring width, soft-L1, f_scale 25 px, weight 0.3.
3. **Face rules (hard hinge, weight 20), from the owner's description:**
   - tail: A
   - sweep: B
   - left leg: A (locked)
   - right leg: B (locked)
   - bottom-K outer: B, inner: A
   - k_return: B
   - crossbar: B
   - return: B
   - top-K front: B
   - top-K back / end: A
   Sign convention as msfit/retrace.
4. **Over/under (hard hinge, weight 50):** overunder_v1.json, via the dense z-buffer overlap, exempting pairs within 1.5W of flat arc.
5. **End hidden:** the end tip projects inside the right leg's footprint and lies behind it (weight 50).
6. **Clearance:** ≥ 2·thickness between non-adjacent parts (weight 50).
7. **Realism (weight 10):**
   - fold ρ ≥ 0.3W; bend ρ ≥ 1W
   - no ruling crossings / separation violations
   - no curvature oscillation shorter than 1W
   - no dips or corners (add differentiable versions: the dip as the second difference of the dihedral angle between consecutive true-ruling quads, penalised where it changes sign in flat runs; the corner as edge turning > 12° over 0.15W outside rolls)
8. **Depth sanity:** all centre z within [A_min_z − 250, A_max_z + 250] css, except the tail, which may come up to +500 toward the camera (hinge, weight 10). This prevents the Stage 1 tail blow-up.

## Fit
Global LM (all non-A parameters), 3 passes:
1. landmarks + faces + realism;
2. + over/under, end hidden, clearance;
3. all, with realism weight ×3.
8-min cap each. Multi-start ×4 on the signs of the S, far-left, bottom-K, wrap and top-K rolls (sign combos chosen by the presearch). Keep the best by total cost with realism fails == 0.

## Review outputs (docs/ribbon/turns/design/)
- shaded_camera.png ([mockup | shaded from the site camera, key light from above]); shaded_side.png (orthographic from the right); shaded_top.png (orthographic from above)
- overlay.png (edges over the dimmed mockup, trace dashed)
- zoom sheets for every window
- metrics.json: realism table, faces, over/under, clearance, landmark residuals
- solution.npz
