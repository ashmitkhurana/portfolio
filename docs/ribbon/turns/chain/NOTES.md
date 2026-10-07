# Chain fit notes (execution agent log)
- Read CHAIN_PLAN + paper*.py + ak_* + engine code. Server started on 4100 (.next-ak build, POSE_OVERRIDE) pid in chain/server.pid.
- Engine facts: sim.count control points (core.ts RibbonSim(opts.controlPoints ?? 64)), RibbonGeometry(…,400) curve cap 400, ruledX 512; resolveRuled resamples any number of pose rings to sim.count by weight (arc + turning). Current ak-hero phone variant has 656 rings.
- Text weave: KHURANA proxy rect (css) x20 y195.25 w347.22 h77.09, depth cap +0.25 (= +17 css per plan); ASHMIT at -0.25.
## stage 1: intervals [0, 1] rings to 225; groups [['tail bend'], ['S bend', 'S fold']]
  group ['tail bend'] e=149 K=1 free=12 candidates=1 init costs [(['bend'], 2661328)]
    [bend] ok cost 283549.3 evals 10658 (12s)
    roll tail bend: tau 79.6 beta 132.3 rho 313.4 (6.00W) phi -15.4 [['bend']]
  group ['S bend', 'S fold'] e=225 K=3 free=20 candidates=3 init costs [(['bend', 'sil'], 2148561), (['bend', 'cf'], 2400489), (['bend', 'cf-flip'], 8911019)]
    [bend/sil] timeout cost 383674.1 evals 1278 (60s)
    [bend/cf] timeout cost 400688.0 evals 1281 (60s)
    [bend/cf-flip] timeout cost 740537.4 evals 1286 (60s)
    roll S bend: tau 230.8 beta 46.4 rho 52.2 (1.00W) phi 28.6 [['bend', 'sil']]
    roll S fold: tau 298.7 beta 115.1 rho 10.4 (0.20W) phi 147.2 [['bend', 'sil']]
  stage fit: free 20 rings 0..225 cost0 383674.1
    [stage1] ok cost 383673.9 evals 84 (4s)
  METRICS {"K": 3, "e": 225, "cost": 383673.9, "blocks": {"pt": 275534.43, "slide": 5002.07, "anchor": 76.42, "cov": 499.13, "ou": 0.0, "zr": 102250.8, "face": 0.0, "seen": 5.04, "overlap": 301.64, "bend": 0.0, "lam": 4.34}, "data": {"n": 410, "rms": 58.02066685555998, "p95": 92.68139086363185, "max": 131.90622600512543}, "face": {"checked": 132, "agree": 132, "frac": 1.0}, "ou": {"pairs": 0, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 0}, "min_fold_rho_over_W": 0.20000000000000848, "lam": [1.25, 0.844], "stage": 1, "status": "ok", "seconds": 196.21685910224915}
## stage 1: intervals [0, 1] rings to 225; groups [['tail bend'], ['S bend', 'S fold']]
  group ['tail bend'] e=149 K=1 free=12 candidates=1 init costs [(['bend'], 1100232)]
    [bend] ok cost 18221.4 evals 326 (0s)
    roll tail bend: tau 114.5 beta 11.7 rho 52.2 (1.00W) phi -28.6 [['bend']]
  group ['S bend', 'S fold'] e=225 K=3 free=20 candidates=2 init costs [(['bend', 'cf'], 2650047), (['bend', 'sil'], 6298692)]
    [bend/cf] timeout cost 130740.0 evals 1289 (60s)
    [bend/sil] ok cost 111257.3 evals 667 (31s)
    roll S bend: tau 280.7 beta 46.5 rho 52.3 (1.00W) phi -28.6 [['bend', 'sil']]
    roll S fold: tau 310.3 beta 112.9 rho 10.6 (0.20W) phi 58.0 [['bend', 'sil']]
  stage fit: free 20 rings 0..225 cost0 111257.3
    [stage1] ok cost 107067.2 evals 393 (18s)
  METRICS {"K": 3, "e": 225, "cost": 107067.2, "blocks": {"pt": 31554.41, "slide": 63459.87, "anchor": 132.11, "cov": 4607.53, "ou": 0.0, "zr": 0.0, "face": 0.0, "seen": 210.4, "overlap": 7100.99, "bend": 0.0, "lam": 1.87}, "data": {"n": 410, "rms": 45.78146681151811, "p95": 106.01356418666134, "max": 188.30768730613724}, "face": {"checked": 132, "agree": 132, "frac": 1.0}, "ou": {"pairs": 0, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 0}, "min_fold_rho_over_W": 0.202655414359539, "lam": [1.076, 1.178], "stage": 1, "status": "ok", "seconds": 110.42463397979736}
- STOPPED after stage 1 (failed badly): data rms 45.8 px (p95 106, max 188), slide cost 63k, overlap 7.1k; face 132/132. Causes found: (1) tail is imaged 2.75x->2.1x wider than W (width ratio, rings 0-120) which implies z~950-1150 for constant W, incompatible with lambda in [0.8,1.25] and with the S/sweep at z~100; (2) S window (rings 132-225) narrows to 0.22W (edge-on twist), fold hits rho=0.2W bound, bends hit |phi|=0.5, beta bounds. Existing ak-hero pose also uses a flared tail (|R-L| 114 css at ring 0). Exporter/sheets/stages 2-15 NOT built/run.
- Applied coordinator decisions (z free, lambda per interval [0.3,6] init from 3D arc, S window = bend + 2 folds, tail z monotone rule w5). Re-running stage 1.
## stage 1: intervals [0, 1] rings to 225; groups [['tail bend'], ['S bend', 'S fold', 'S fold 2']]
  group ['tail bend'] e=149 K=1 free=12 candidates=1 init costs [(['bend'], 864480)]
    [bend] ok cost 16587.2 evals 8718 (10s)
    roll tail bend: tau 79.6 beta 143.6 rho 134.2 (2.57W) phi 17.9 [['bend']]
  group ['S bend', 'S fold', 'S fold 2'] e=225 K=4 free=24 candidates=4 init costs [(['bend', 'cf', 'twist2b'], 19733484), (['bend', 'cf', 'twist2'], 24895413), (['bend', 'sil', 'twist2b'], 32882188), (['bend', 'sil', 'twist2'], 32882781)]
    [bend/cf/twist2b] ok cost 208731.5 evals 1241 (59s)
    [bend/cf/twist2] timeout cost 70892.9 evals 1886 (90s)
    [bend/sil/twist2b] ok cost 255542.6 evals 1477 (70s)
    roll S bend: tau 281.7 beta 153.8 rho 53.0 (1.01W) phi 26.4 [['bend', 'cf', 'twist2']]
    roll S fold: tau 305.5 beta 148.8 rho 10.4 (0.20W) phi 180.2 [['bend', 'cf', 'twist2']]
    roll S fold 2: tau 353.0 beta 146.2 rho 10.4 (0.20W) phi -182.7 [['bend', 'cf', 'twist2']]
  stage fit: free 24 rings 0..225 cost0 70892.9
    [stage1] ok cost 70588.9 evals 132 (6s)
  METRICS {"K": 4, "e": 225, "cost": 70588.9, "blocks": {"pt": 25879.79, "slide": 42816.3, "anchor": 10.49, "cov": 1029.99, "ou": 0.0, "zr": 0.0, "face": 0.0, "seen": 263.05, "overlap": 541.58, "bend": 0.0, "lam": 47.67, "tailz": 0.0}, "data": {"n": 410, "rms": 22.604518299608827, "p95": 44.802472162609504, "max": 67.7551802027116}, "face": {"checked": 132, "agree": 132, "frac": 1.0}, "ou": {"pairs": 0, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 0}, "min_fold_rho_over_W": 0.2000000000196374, "lam": [0.84, 2.157], "stage": 1, "status": "ok", "seconds": 236.4444122314453}
- Stage 1 rerun (decisions applied): data rms 22.6 px (p95 44.8, max 67.8) > 8 -> STOP. cost 70.6k (pt 25.9k, slide 42.8k, cov 1.0k), face 132/132, lambda [0.84, 2.16]. S folds both at rho=0.2W bound (phi +180.2, -182.7), fold2 beta 146 deg; tail bend rho 2.57W phi 17.9. Tail-bend-only sub-fit (rings 0-149): cost 16.6k (~10 px rms). Candidates tried: cf/twist2b 208k, cf/twist2 70.9k (90s timeout), sil/twist2b 255k.
- Applied 'Decisions after stage 1 re-run': tail 2 bends (rings 40,95), S bend 138 + 4 oblique rolls (152,168,184,200; rho [0.25W,3W], phi +-1.885), 6 starts x 360s. Gate: rms<=10 target, stop only >15.
## stage 1: intervals [0, 1] rings to 225; groups [['tail bend 1'], ['tail bend 2'], ['S bend', 'S obl 1', 'S obl 2', 'S obl 3', 'S obl 4']]
  group ['tail bend 1'] e=94 K=1 free=11 candidates=1 init costs [(['bend'], 451694)]
    [bend] ok cost 4055.0 evals 414 (0s)
    roll tail bend 1: tau 87.1 beta 134.9 rho 157.5 (3.02W) phi 18.3 [['bend']]
  group ['tail bend 2'] e=137 K=2 free=16 candidates=1 init costs [(['bend'], 64861)]
    [bend] ok cost 15358.0 evals 494 (1s)
    roll tail bend 2: tau 190.8 beta 75.6 rho 52.2 (1.00W) phi -12.4 [['bend']]
  group ['S bend', 'S obl 1', 'S obl 2', 'S obl 3', 'S obl 4'] e=225 K=7 free=36 candidates=6 init costs [(['b+30', '+-+-'], 18114469), (['b+0', '+-+-'], 18502054), (['b-30', '+-+-'], 25173602), (['b+30', '-+-+'], 70878005), (['b+0', '-+-+'], 81790410), (['b-30', '-+-+'], 82347772)]
## stage 1: intervals [0, 1] rings to 225; groups [['tail bend 1'], ['tail bend 2'], ['S bend', 'S obl 1', 'S obl 2', 'S obl 3', 'S obl 4']]
  group ['tail bend 1'] e=94 K=1 free=11 candidates=1 init costs [(['bend'], 451694)]
    [bend] ok cost 4055.0 evals 414 (0s)
    roll tail bend 1: tau 87.1 beta 134.9 rho 157.5 (3.02W) phi 18.3 [['bend']]
  group ['tail bend 2'] e=137 K=2 free=16 candidates=1 init costs [(['bend'], 64861)]
    [bend] ok cost 15358.0 evals 494 (1s)
    roll tail bend 2: tau 190.8 beta 75.6 rho 52.2 (1.00W) phi -12.4 [['bend']]
  group ['S bend', 'S obl 1', 'S obl 2', 'S obl 3', 'S obl 4'] e=225 K=7 free=36 candidates=6 init costs [(['b+30', '+-+-'], 18114469), (['b+0', '+-+-'], 18502054), (['b-30', '+-+-'], 25173602), (['b+30', '-+-+'], 70878005), (['b+0', '-+-+'], 81790410), (['b-30', '-+-+'], 82347772)]
    [b+30/+-+-] ok cost 63112.3 evals 3681 (180s)
    [b+0/+-+-] ok cost 118253.6 evals 904 (44s)
    [b-30/+-+-] ok cost 71688.4 evals 3576 (175s)
    [b+30/-+-+] ok cost 72912.2 evals 3791 (185s)
    [b+0/-+-+] ok cost 69422.2 evals 1682 (82s)
    [b-30/-+-+] ok cost 72246.4 evals 977 (48s)
    roll S bend: tau 256.7 beta 131.8 rho 52.3 (1.00W) phi 5.4 [['b+30', '+-+-']]
    roll S obl 1: tau 256.9 beta 126.6 rho 13.4 (0.26W) phi 56.5 [['b+30', '+-+-']]
    roll S obl 2: tau 301.5 beta 110.4 rho 13.1 (0.25W) phi -1.2 [['b+30', '+-+-']]
    roll S obl 3: tau 317.6 beta 158.5 rho 16.5 (0.32W) phi 21.7 [['b+30', '+-+-']]
    roll S obl 4: tau 370.9 beta 154.9 rho 13.2 (0.25W) phi -27.1 [['b+30', '+-+-']]
  stage fit: free 36 rings 0..225 cost0 63112.3
    [stage1] ok cost 63112.3 evals 84 (4s)
  METRICS {"K": 7, "e": 225, "cost": 63112.3, "blocks": {"pt": 29669.51, "slide": 28824.37, "anchor": 148.37, "cov": 3933.16, "ou": 0.0, "zr": 0.0, "face": 0.0, "overlap": 243.79, "bend": 275.66, "lam": 17.47, "tailz": 0.0}, "data": {"n": 410, "rms": 58.41523188370097, "p95": 166.36878536996738, "max": 181.6499067874211}, "face": {"checked": 132, "agree": 132, "frac": 1.0}, "ou": {"pairs": 0, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 0}, "min_fold_rho_over_W": 0.2514800438972483, "lam": [0.773, 3.463], "stage": 1, "status": "ok", "seconds": 719.6508848667145}
- Stage 1 (tail 2 bends + S bend + 4 oblique): best of 6 starts cost 63.1k (b+30/+-+-); starts: 63.1k,118.3k,71.7k,72.9k,69.4k,72.2k. data rms 58.4 px (p95 166, max 182) > 15 -> STOP. pt 29.7k slide 28.8k cov 3.9k. Roll obl rhos at 0.25-0.32W (bound), lam [0.77,3.46]. Note data rms metric mixes pt (tail) and sliding (S window). chain_fit.py now also has polish/report/export(emit_chain)/all commands and chain_sheets.py (untested).
## stage 1: interval 5 (apex_in__apex_out) rings 484..554; groups [['apex fold']]
  group ['apex fold'] rings 484..554 free=11 candidates=1 init costs [(['paper3'], 268270)]
    [paper3] ok cost 111.5 evals 476 (7s)
    roll apex fold: tau 854.7 beta 67.8 rho 34.3 (0.66W) phi -122.4 [['paper3']]
  stage fit: free 11 rings 484..554 cost0 111.5
    [stage1] ok cost 111.5 evals 19 (0s)
  METRICS {"act": 1, "lo": 484, "hi": 554, "cost": 111.5, "blocks": {"slide": 66.03, "anchor": 37.77, "cov": 5.4, "ou": 0.0, "weave": 0.0, "seen": 0.0, "lam": 2.33}, "data_all": {"n": 114, "rms": 20.788644493284565, "p95": 24.705161185790644, "max": 92.39978187982155}, "face": {"checked": 0, "agree": 0, "frac": 0.0}, "ou": {"pairs": 0, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 0}, "min_fold_rho_over_W": 0.6569237096398842, "new_interval": 5, "data_new": {"n": 114, "rms": 20.788644493284565, "p95": 24.705161185790644, "max": 92.39978187982155}, "stage": 1, "status": "ok", "seconds": 7.444286823272705, "gate_target": 12.0, "gate_stop": 20.0, "gate": "FAIL"}

## Re-rooted at apex (coordinator decision). Order apex->left leg->far-left->sweep->right leg->bottom-K->k_return->back->crossbar->wrap->middle->topK front->tip->end->S->tail. Kinematics: chain_surface/build_frames (reverse frames for u<u_root), isometry max|JtJ-I| 1e-9, normal jump across roll boundaries 6e-6. Seed apex+root pose from paper3: apex ring-data rms 1.1 px. Resume: python chain_fit.py all (skips finished stage_N.npz; resumes partial_N.npz).
## stage 1: interval 5 (apex_in__apex_out) rings 484..554; groups [['apex fold']]
  group ['apex fold'] rings 484..554 free=11 candidates=1 init costs [(['paper3'], 268270)]
    [paper3] ok cost 111.5 evals 476 (7s)
    roll apex fold: tau 854.7 beta 67.8 rho 34.3 (0.66W) phi -122.4 [['paper3']]
  stage fit: free 11 rings 484..554 cost0 111.5
    [stage1] ok cost 111.5 evals 19 (0s)
  METRICS {"act": 1, "lo": 484, "hi": 554, "cost": 111.5, "blocks": {"slide": 66.03, "anchor": 37.77, "cov": 5.4, "ou": 0.0, "weave": 0.0, "seen": 0.0, "lam": 2.33}, "data_all": {"n": 114, "rms": 1.0763281078112312, "p95": 2.3952268469458495, "max": 3.439646396600387}, "face": {"checked": 0, "agree": 0, "frac": 0.0}, "ou": {"pairs": 0, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 0}, "min_fold_rho_over_W": 0.6569237096398842, "new_interval": 5, "data_new": {"n": 114, "rms": 1.0763281078112312, "p95": 2.3952268469458495, "max": 3.439646396600387}, "stage": 1, "status": "ok", "seconds": 7.0971519947052, "gate_target": 12.0, "gate_stop": 20.0, "gate": "PASS"}
## stage 2: interval 4 (fl_out__apex_in) rings 388..554; groups [['left-leg bend 2'], ['left-leg bend 1']]
  group ['left-leg bend 2'] rings 421..554 free=9 candidates=1 init costs [(['bend'], 815975)]
    [bend] ok cost 185322.8 evals 345 (6s)
    roll left-leg bend 2: tau 843.1 beta 87.3 rho 201.5 (3.86W) phi -28.6 [['bend']]
  group ['left-leg bend 1'] rings 388..554 free=13 candidates=1 init costs [(['bend'], 957152)]
    [bend] ok cost 191490.6 evals 289 (5s)
    roll left-leg bend 1: tau 778.5 beta 79.5 rho 276.7 (5.30W) phi -28.5 [['bend']]
  stage fit: free 13 rings 388..554 cost0 191490.6
    [stage2] ok cost 191490.6 evals 63 (1s)
  METRICS {"act": 3, "lo": 388, "hi": 554, "cost": 191490.6, "blocks": {"pt": 143270.06, "slide": 12654.18, "anchor": 19.01, "cov": 10620.04, "ou": 0.0, "weave": 0.0, "face": 0.0, "seen": 0.0, "overlap": 24924.01, "bend": 0.0, "lam": 3.28}, "data_all": {"n": 221, "rms": 37.56433210239078, "p95": 76.41756784946118, "max": 86.79100116445105}, "face": {"checked": 40, "agree": 40, "frac": 1.0}, "ou": {"pairs": 0, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 0}, "min_fold_rho_over_W": 2.8846897631111577, "new_interval": 4, "data_new": {"n": 107, "rms": 51.74886486931735, "p95": 81.83658063017931, "max": 86.79100116445105}, "stage": 2, "status": "ok", "seconds": 12.096972942352295, "gate_target": 12.0, "gate_stop": 20.0, "gate": "FAIL"}
!! STOP: stage 2 (interval 4) new-interval rms 51.74886486931735 px > 20.0
- stage 2 (left leg) failed first try: new-interval rms 51.7 px; left-leg bend 2 hit its tau bound (+0.8W) toward the apex (paper3's entry segment is only ~15 css long, the plan's ring 455 is 118 css before the apex). Widened roll tau bounds to +-2W and re-ran.
## stage 2: interval 4 (fl_out__apex_in) rings 388..554; groups [['left-leg bend 2'], ['left-leg bend 1']]
  group ['left-leg bend 2'] rings 421..554 free=9 candidates=1 init costs [(['bend'], 815975)]
    [bend] ok cost 185322.8 evals 345 (6s)
    roll left-leg bend 2: tau 843.1 beta 87.3 rho 201.5 (3.86W) phi -28.6 [['bend']]
  group ['left-leg bend 1'] rings 388..554 free=13 candidates=1 init costs [(['bend'], 957152)]
    [bend] ok cost 191490.6 evals 289 (5s)
    roll left-leg bend 1: tau 778.5 beta 79.5 rho 276.7 (5.30W) phi -28.5 [['bend']]
  stage fit: free 13 rings 388..554 cost0 191490.6
    [stage2] ok cost 191490.6 evals 63 (1s)
  METRICS {"act": 3, "lo": 388, "hi": 554, "cost": 191490.6, "blocks": {"pt": 143270.06, "slide": 12654.18, "anchor": 19.01, "cov": 10620.04, "ou": 0.0, "weave": 0.0, "face": 0.0, "seen": 0.0, "overlap": 24924.01, "bend": 0.0, "lam": 3.28}, "data_all": {"n": 221, "rms": 37.56433210239078, "p95": 76.41756784946118, "max": 86.79100116445105}, "face": {"checked": 40, "agree": 40, "frac": 1.0}, "ou": {"pairs": 0, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 0}, "min_fold_rho_over_W": 2.8846897631111577, "new_interval": 4, "data_new": {"n": 107, "rms": 51.74886486931735, "p95": 81.83658063017931, "max": 86.79100116445105}, "stage": 2, "status": "ok", "seconds": 12.084362030029297, "gate_target": 12.0, "gate_stop": 20.0, "gate": "FAIL"}
!! STOP: stage 2 (interval 4) new-interval rms 51.74886486931735 px > 20.0
## stage 2: interval 4 (fl_out__apex_in) rings 388..554; groups [['left-leg bend 2'], ['left-leg bend 1']]
  group ['left-leg bend 2'] rings 421..554 free=9 candidates=1 init costs [(['bend'], 815975)]
    [bend] ok cost 153692.6 evals 460 (8s)
    roll left-leg bend 2: tau 905.8 beta 82.1 rho 85.2 (1.63W) phi -28.6 [['bend']]
  group ['left-leg bend 1'] rings 388..554 free=13 candidates=1 init costs [(['bend'], 886654)]
    [bend] ok cost 154648.9 evals 520 (10s)
    roll left-leg bend 1: tau 838.1 beta 84.4 rho 103.1 (1.97W) phi -28.4 [['bend']]
  stage fit: free 13 rings 388..554 cost0 154648.9
    [stage2] ok cost 154648.9 evals 20 (0s)
  METRICS {"act": 3, "lo": 388, "hi": 554, "cost": 154648.9, "blocks": {"pt": 116583.56, "slide": 19581.63, "anchor": 15.76, "cov": 12815.89, "ou": 0.0, "weave": 0.0, "face": 0.0, "seen": 0.0, "overlap": 1796.95, "bend": 3852.21, "lam": 2.91}, "data_all": {"n": 221, "rms": 35.103620101452236, "p95": 73.83390436102155, "max": 85.53507718880991}, "face": {"checked": 40, "agree": 40, "frac": 1.0}, "ou": {"pairs": 0, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 0}, "min_fold_rho_over_W": 1.5447476356801833, "new_interval": 4, "data_new": {"n": 107, "rms": 46.68117293430793, "p95": 80.10705173868352, "max": 85.53507718880991}, "stage": 2, "status": "ok", "seconds": 17.855600118637085, "gate_target": 12.0, "gate_stop": 20.0, "gate": "FAIL"}
!! STOP: stage 2 (interval 4) new-interval rms 46.68117293430793 px > 20.0
## stage 2: interval 4 (fl_out__apex_in) rings 388..554; groups [['left-leg bend 2'], ['left-leg bend 1']]
  group ['left-leg bend 2'] rings 421..554 free=9 candidates=1 init costs [(['bend'], 815975)]
    [bend] ok cost 105390.2 evals 272 (5s)
    roll left-leg bend 2: tau 861.9 beta 70.9 rho 52.2 (1.00W) phi -49.0 [['bend']]
  group ['left-leg bend 1'] rings 388..554 free=13 candidates=1 init costs [(['bend'], 517458)]
    [bend] ok cost 111769.7 evals 705 (12s)
    roll left-leg bend 1: tau 809.5 beta 128.2 rho 52.2 (1.00W) phi 68.8 [['bend']]
  stage fit: free 13 rings 388..554 cost0 111769.7
    [stage2] ok cost 111769.7 evals 28 (0s)
  METRICS {"act": 3, "lo": 388, "hi": 554, "cost": 111769.7, "blocks": {"pt": 93009.04, "slide": 12156.82, "anchor": 20.85, "cov": 4149.11, "ou": 0.0, "weave": 0.0, "face": 0.0, "seen": 50.41, "overlap": 2372.64, "bend": 0.0, "lam": 10.84}, "data_all": {"n": 221, "rms": 30.850077360718764, "p95": 58.895069909529276, "max": 89.52193707941541}, "face": {"checked": 40, "agree": 40, "frac": 1.0}, "ou": {"pairs": 0, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 0}, "min_fold_rho_over_W": 0.20000000000010054, "new_interval": 4, "data_new": {"n": 107, "rms": 41.69516443926888, "p95": 71.1138099433811, "max": 89.52193707941541}, "stage": 2, "status": "ok", "seconds": 17.48418688774109, "gate_target": 12.0, "gate_stop": 20.0, "gate": "FAIL"}
- Stage 2 (left leg, new-interval rms): 51.7 px (tau bound +-0.8W) -> 46.7 px (tau +-2W; both bends at |phi|=0.5 bound) -> 41.7 px diagnostic with BEND_PHI=1.2 env (bends rho 1W, phi -49/+69 deg, pt cost 93k). > 20 -> STOP. Stage 1 apex PASS 1.08 px. Pending: stages 3-16, polish, report/export/sheets/render (code present, untested except isometry: JtJ 1e-9, normal jump 6e-6).
## stage 1 (paper3 section, rings 363..580, 5 seeded rolls): seed cost 221225.8 data_all {'n': 273, 'rms': 6.845801923430751, 'p95': 15.805619917678843, 'max': 16.424366311738698} (paper3 section rms 5.98 px)
    [stage1] ok cost 214707.2 evals 321 (7s)
  METRICS {"act": 5, "lo": 363, "hi": 580, "cost": 214707.2, "blocks": {"pt": 5522.21, "slide": 451.17, "anchor": 2.16, "cov": 225.73, "ou": 0.0, "weave": 206578.86, "face": 0.0, "seen": 9.64, "overlap": 54.83, "bend": 1862.6, "lam": 0.0}, "data_all": {"n": 273, "rms": 6.6152152714887835, "p95": 12.690847160480748, "max": 21.259688698897637}, "face": {"checked": 65, "agree": 65, "frac": 1.0}, "ou": {"pairs": 0, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 895}, "min_fold_rho_over_W": 0.6421429491673891, "data_new": {"n": 273, "rms": 6.6152152714887835, "p95": 12.690847160480748, "max": 21.259688698897637}, "new_interval": "P3", "stage": 1, "status": "ok", "seconds": 6.783430814743042, "gate_target": 12.0, "gate_stop": 25.0, "gate": "PASS"}
- Re-planned per 'Decision after re-rooted stage 2': stage 1 = paper3 section rings 363-580, 5 paper3 rolls seeded (rings mapped: see x0.npz), pose free: seed data rms 6.85 px, fit 6.62 px (paper3 section 5.98) PASS. Bends rho>=0.5W |phi|<=1.2 beta free spacing>=1W. NOTE: text-weave (KHURANA z<=+17) is violated by the paper3 apex roll (z 59-143 inside the rect, 895 samples); shifting the section back in z by 40/80/120 css raises data rms to 21/38/53 px, so the weave conflicts with the image data. Running 'all 2'.
## stage 2: interval 3 (fl_in__fl_out) rings 289..580; groups [['far-left fold']]
  group ['far-left fold'] rings 289..580 free=13 candidates=2 init costs [(['cf'], 1160315), (['sil'], 1324329)]
    [cf] ok cost 239579.1 evals 263 (12s)
    [sil] ok cost 235504.6 evals 352 (16s)
    roll far-left fold: tau 615.4 beta 118.3 rho 10.4 (0.20W) phi -190.3 [['sil']]
  stage fit: free 13 rings 289..580 cost0 235504.6
    [stage2] ok cost 235504.6 evals 57 (3s)
  METRICS {"act": 6, "lo": 289, "hi": 580, "cost": 235504.6, "blocks": {"pt": 15941.92, "slide": 8178.57, "anchor": 10.79, "cov": 1563.83, "ou": 0.0, "weave": 207143.37, "face": 0.0, "seen": 701.64, "overlap": 99.28, "bend": 1862.6, "lam": 2.62}, "data_all": {"n": 453, "rms": 10.319506753028925, "p95": 24.16759145287989, "max": 40.05992203920111}, "face": {"checked": 65, "agree": 65, "frac": 1.0}, "ou": {"pairs": 0, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 896}, "min_fold_rho_over_W": 0.20000000000513485, "new_interval": 3, "data_new": {"n": 180, "rms": 9.28546291566249, "p95": 23.571553844438437, "max": 30.15511595909636}, "stage": 2, "status": "ok", "seconds": 30.93338704109192, "gate_target": 12.0, "gate_stop": 25.0, "gate": "PASS"}
## stage 3: interval 2 (s_out__fl_in) rings 226..580; groups [['sweep bend']]
  group ['sweep bend'] rings 226..580 free=13 candidates=1 init costs [(['bend'], 1558434)]
    [bend] ok cost 257244.8 evals 933 (46s)
    roll sweep bend: tau 454.4 beta 16.4 rho 26.1 (0.50W) phi 68.8 [['bend']]
  stage fit: free 13 rings 226..580 cost0 257244.8
    [stage3] ok cost 254605.2 evals 826 (41s)
  METRICS {"act": 7, "lo": 226, "hi": 580, "cost": 254605.2, "blocks": {"pt": 35176.18, "slide": 8392.82, "anchor": 4.37, "cov": 1116.14, "ou": 0.0, "weave": 207143.37, "face": 0.0, "seen": 806.68, "overlap": 99.28, "bend": 1862.6, "lam": 3.78}, "data_all": {"n": 579, "rms": 12.2677386587143, "p95": 27.16480427014622, "max": 47.162364688908134}, "face": {"checked": 128, "agree": 128, "frac": 1.0}, "ou": {"pairs": 0, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 896}, "min_fold_rho_over_W": 0.20000000000000004, "new_interval": 2, "data_new": {"n": 126, "rms": 16.902659920005743, "p95": 34.0460475683169, "max": 43.299273951672454}, "stage": 3, "status": "ok", "seconds": 87.79702997207642, "gate_target": 12.0, "gate_stop": 25.0, "gate": "FAIL"}
## stage 4: interval 6 (apex_out__bk_in) rings 226..658; groups []
  stage fit: free 9 rings 226..658 cost0 363466.8
    [stage4] ok cost 259868.4 evals 204 (10s)
  METRICS {"act": 7, "lo": 226, "hi": 658, "cost": 259868.4, "blocks": {"pt": 40930.58, "slide": 8683.98, "anchor": 4.37, "cov": 1116.14, "ou": 0.0, "weave": 207143.37, "face": 0.0, "seen": 806.68, "overlap": 1178.32, "bend": 0.75, "lam": 4.17}, "data_all": {"n": 735, "rms": 11.619190842296298, "p95": 23.97552809427104, "max": 47.162364688908134}, "face": {"checked": 206, "agree": 206, "frac": 1.0}, "ou": {"pairs": 0, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 896}, "min_fold_rho_over_W": 0.20000000000000004, "new_interval": 6, "data_new": {"n": 208, "rms": 8.13927366627065, "p95": 12.29599300978607, "max": 18.523063980944865}, "stage": 4, "status": "ok", "seconds": 10.476953268051147, "gate_target": 12.0, "gate_stop": 25.0, "gate": "PASS"}
## stage 5: interval 7 (bk_in__bk_out) rings 226..764; groups [['bottom-K fold 1', 'bottom-K fold 2']]
  group ['bottom-K fold 1', 'bottom-K fold 2'] rings 226..764 free=17 candidates=5 init costs [(['cf', 'sil'], 17390549), (['cf', 'cf'], 21450629), (['sil', 'sil'], 34564832), (['sil', 'cf-flip'], 34922679), (['sil', 'cf'], 35457214)]
    [cf/sil] ok cost 357598.6 evals 843 (86s)
    [cf/cf] ok cost 357122.6 evals 772 (79s)
    [sil/sil] ok cost 350586.6 evals 1131 (116s)
    bottom-K loop bottom (inner side toward camera) = bottom-K fold 1
    roll bottom-K fold 1: tau 1226.5 beta 45.4 rho 16.1 (0.31W) phi -125.8 [['sil', 'sil']]
    roll bottom-K fold 2: tau 1254.7 beta 107.6 rho 10.5 (0.20W) phi -91.0 [['sil', 'sil']]
  stage fit: free 17 rings 226..764 cost0 350617.0
    [stage5] ok cost 340542.7 evals 501 (52s)
  METRICS {"act": 9, "lo": 226, "hi": 764, "cost": 340542.7, "blocks": {"pt": 43117.64, "slide": 72749.8, "anchor": 27.27, "cov": 14440.57, "ou": 0.0, "weave": 207143.37, "face": 0.0, "seen": 833.18, "overlap": 2212.28, "bend": 4.39, "lam": 14.18}, "data_all": {"n": 902, "rms": 16.028483725286723, "p95": 34.33812357849891, "max": 88.67409533387222}, "face": {"checked": 207, "agree": 207, "frac": 1.0}, "ou": {"pairs": 85, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 896}, "min_fold_rho_over_W": 0.20000000000000004, "new_interval": 7, "data_new": {"n": 167, "rms": 27.691629702136357, "p95": 63.34486659738962, "max": 88.67409533387222}, "stage": 5, "status": "ok", "seconds": 332.6095881462097, "gate_target": 12.0, "gate_stop": 25.0, "gate": "FAIL"}
!! STOP: stage 5 (interval 7) new-interval rms 27.691629702136357 px > 25.0
- stages 2-4: new-interval rms 9.29 (far-left, PASS), 16.9 (sweep, FAIL target, below stop), 8.14 (right leg, PASS). Stage 5 bottom-K with nc=3: 27.7 px > 25 -> retrying with all candidates (nc 12).
## stage 5: interval 7 (bk_in__bk_out) rings 226..764; groups [['bottom-K fold 1', 'bottom-K fold 2']]
  group ['bottom-K fold 1', 'bottom-K fold 2'] rings 226..764 free=17 candidates=5 init costs [(['cf', 'sil'], 17390549), (['cf', 'cf'], 21450629), (['sil', 'sil'], 34564832), (['sil', 'cf-flip'], 34922679), (['sil', 'cf'], 35457214)]
    [cf/sil] ok cost 357598.6 evals 843 (86s)
    [cf/cf] ok cost 357122.6 evals 772 (79s)
    [sil/sil] ok cost 350586.6 evals 1131 (116s)
    [sil/cf-flip] ok cost 370993.8 evals 521 (53s)
    [sil/cf] timeout cost 335583.4 evals 1468 (150s)
    bottom-K loop bottom (inner side toward camera) = bottom-K fold 1
    roll bottom-K fold 1: tau 1212.8 beta 52.0 rho 10.4 (0.20W) phi -144.3 [['sil', 'cf']]
    roll bottom-K fold 2: tau 1228.2 beta 118.7 rho 10.5 (0.20W) phi -90.5 [['sil', 'cf']]
  stage fit: free 17 rings 226..764 cost0 335600.4
    [stage5] ok cost 331192.1 evals 553 (57s)
  METRICS {"act": 9, "lo": 226, "hi": 764, "cost": 331192.1, "blocks": {"pt": 42467.13, "slide": 70878.55, "anchor": 53.77, "cov": 8178.7, "ou": 0.0, "weave": 207143.37, "face": 0.0, "seen": 816.29, "overlap": 1615.37, "bend": 0.0, "lam": 38.93}, "data_all": {"n": 902, "rms": 15.853100749399573, "p95": 34.39994960369574, "max": 84.57730284412236}, "face": {"checked": 207, "agree": 207, "frac": 1.0}, "ou": {"pairs": 105, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 896}, "min_fold_rho_over_W": 0.20000000000000004, "new_interval": 7, "data_new": {"n": 167, "rms": 27.30535236756421, "p95": 60.24458931077067, "max": 84.57730284412236}, "stage": 5, "status": "ok", "seconds": 541.6886940002441, "gate_target": 12.0, "gate_stop": 25.0, "gate": "FAIL"}
!! STOP: stage 5 (interval 7) new-interval rms 27.30535236756421 px > 25.0
