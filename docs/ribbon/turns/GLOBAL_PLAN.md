# Global fit from one depth plan: Stage 1 (quick test)

**Goal:** one paper-model chain for the WHOLE ribbon, fitted first to a fully specified 3D target (the approved trace back-projected at a single designed depth plan), so no section can choose its own depth. Stage 1 = depth plan + 3D fit + renders. No 2D refinement yet.

**Inputs:**
- docs/ribbon/turns/ak_problem_phone.npz (rings, e1_px/e2_px, vis, kind, intervals int_i0/int_i1/int_names, W_css, camera)
- scripts/mockup/ak_problem.py (project/backproject)
- docs/ribbon/turns/msfit/sections/sec_A_APPROVED.npz (the locked A; owner-confirmed)
- the approved isolated shapes, used ONLY as roll seeds: sec_F_APPROVED, sec_S_APPROVED (v6), sec_P_APPROVED (v5); best K (original) and X (v5) in msfit/sections
- overunder_v1.json

## 1. Depth plan z*(ring) (css, +z toward camera)
Evaluate the locked A at its own ring flat positions:
- zL = mean z of the left leg (rings 388–483);
- zR = mean z of the right leg (rings 555–658);
- zLb, zRb = z at their lowest rings (388 and 658).
Set the anchor values below (W = W_css), join them piecewise-linearly in ring index, then smooth with a gaussian of σ = 8 rings, EXCEPT rings 388–658, which use A's own z exactly (with a 10-ring blend at each end).

| Interval (rings) | z* |
|---|---|
| left leg + apex + right leg (388–658) | A's own z |
| far-left fold (289–387) | from zLb at 387 to z_sweep at 289 |
| sweep (226–288) | z_sweep = max(zLb, zRb) + 1.0W |
| S (132–225) | z_sweep + 0.5W |
| tail (0–131) | from z_S at 131 to z_tail(ring) toward ring 0, where z_tail = D − W·SX·D / width_px(ring) (face-on width formula; SX = W_px/W_css; width_px = trace ring width), clamped to ≤ D − 300 and blended in over rings 131→100 |
| bottom-K window (659–764) | from zRb at 659 down to zR − 1.5W at 712, staying there |
| k_return (765–813) | zR − 1.5W |
| back layer (814–858) | zR − 2.5W |
| crossbar (859–910) | ramp to zL + 1.0W by ring 875 |
| wrap (911–1066) | zL + 1.0W at 911 → zL − 1.5W at 990 → zR − 1.5W at 1066 |
| middle layer (1067–1101) | zR − 1.5W |
| top-K front (1102–1140) | zR − 0.5W |
| top-K tip window (1141–1230) | zR − 0.5W → zR − 2.0W at 1230 |
| end strand (1231–1298) | zR − 2.5W |

Check the plan against overunder_v1 at the 2D overlap cells: for each rule, front z* − back z* ≥ 2·thickness. Report violations. If any, add +0.5W to the front strand's anchor and recompute, up to 3 iterations.

## 2. 3D targets
For every ring: T1 = backproject(e1_px, z*), T2 = backproject(e2_px, z*), using ALL samples (visible and hidden; the approved trace has hidden spans too). Weights: visible hard/fixed 1.0, soft 0.3, hidden 0.3.

## 3. Global paper-chain fit to the 3D targets
- Model: scripts/mockup/chain_fit.py's re-rooted Chain (root at the apex; kinematics walk outward both ways), with ONE roll list for the whole ribbon:
  - tail: 2 bends
  - S: 1 fold + 1 bend (the S v6 layout)
  - far-left: 1 fold + sweep bend (the F layout)
  - A: its 5 rolls (seeded EXACTLY from sec_A_APPROVED)
  - bottom-K: 1 loop roll + 1 bend
  - back layer: 1 bend
  - crossbar: 1 gentle bend + the wrap curl (ρ 0.8–2W) + 2 hidden twist folds
  - middle layer: 1 bend
  - top-K: 1 bend + 1 loop roll (the P v5 layout)
  - end: 1 bend
- Seeds: roll parameters from the approved/best isolated solutions, mapped to chain flat u. Where unavailable, use chain_fit presearch.
- λ: free per interval, bounds [0.3, 6].
- Residual: 3D distance from the chain edge points at each ring's flat u to T1/T2, weighted. Plus realism penalties (crossings, corners, dips, curvature oscillation, roll overlap) at weight 0.3, and fold ρ ≥ 0.3W.
- Fit in 3 passes (8-min cap each):
  1. A's rolls frozen, everything else free, 3D weight 1;
  2. all free, but A's rolls with a prior to approved (weight 100);
  3. same, with realism weight 1.0.
  No 2D data term in Stage 1.

## 4. Outputs (docs/ribbon/turns/global/)
- depth_plan.png: z*(ring) plotted with the interval names, plus the over/under check table.
- full_overlay.png (projected true-ruling edges over the dimmed mockup, approved trace dashed: msfit overlay style) and full_shaded.png ([mockup | offline shaded with key light from above], msfit shaded style).
- zoom sheets for every window: zoom_<window>.png (msfit zoom style).
- metrics.json:
  - 3D RMS to targets per interval;
  - 2D reprojection RMS per interval (to the trace, info only);
  - the realism table per window;
  - min fold ρ;
  - over/under violations (dense z-buffer);
  - min clearance.
- solution.npz. No engine render, no export.
