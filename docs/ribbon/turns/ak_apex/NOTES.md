# ak_apex notes (execution agent)

## Step 0 (setup) done
- New module scripts/mockup/ak_apex.py (setup, primitive fit, handedness conversion, solve, metrics). Existing modules untouched.
- Section = global rings 363..580 (fl_out 388 - 25, apex_out 555 + 25), N=218, apex window local 121..191 (global 484..554). Fit range local 106..206.
- Units: W_css=52.23 (W_px 114.1), SC=2.186 px/css; H (flat ring spacing) 1.860 css from the geometric init (median over non-window rings).
- Override site build (.next-ak, NEXT_PUBLIC_POSE_OVERRIDE=1) finished OK in the background (build.log); next-env.d.ts/tsconfig.json restored.
- Step 2 (primitive fit multi-start) running: prep.log

## Step 2-3 (primitive fit + conversion) done (prep.log, prep.json)
- 12 starts; best (cost 145.6, slide rms 1.04 px): beta0 = beta_axis -70.58 deg, s=-1, rho0=0.25W; fit beta -94.45, rho at lower bound 1.04 css (0.02W), right leg in front 100%.
- Conversion: cands 0 (sgn +1, noswap) and 2 (sgn -1, noswap) tie on 3D rms (1e-13; achiral edge set). Tie-break by right-leg-in-front picks cand 0. Blend 5, hinge range local 106..206.
- Step 4 (solve) running: run.log

## Coordinator change: soft folds (rho in [0.10W, 0.35W], starts 0.12/0.18/0.25 W, guard |theta|>pi/6 weight 20 in window)
- Crease attempt (rho 0.02W bound) moved to crease_attempt/. Solve killed after stage 3 (data 260 cost, not used).
- New fit: selected beta0 -70.58, s=-1, rho0 0.18W; fitted rho 5.22 css (=0.10W, again at the new lower bound), cost 158.2, slide rms 1.08 px, right leg front.
- Conversion tied on 3D rms (all 4); front-tie-break picked cand 0 (sgn +1, no swap); blend 6, range local 97..206.
