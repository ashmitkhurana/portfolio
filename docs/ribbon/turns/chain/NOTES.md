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
## 2026-10-08 resume: W_WEAVE=0 (weave dropped from the fit); bottom-K now 3 rolls (fold 1, 'bottom-K curl' ring 712, fold 2), 4 starts (fold signs x curl sign, 6-min cap), x layout migrated (stage_4.npz/x0.npz +4 params for curl; old copies in chain/old_layout); stage_5.npz (old 2-roll attempt, 27.3 px) moved to old_layout. Stop rules: fold windows (S, far-left, apex, bottom-K, wrap, top-K tip) 35 px, S/tail 35, others 25; targets 12 (S/tail 20 as before).
## stage 5: interval 7 (bk_in__bk_out) rings 226..764; groups [['bottom-K fold 1', 'bottom-K curl', 'bottom-K fold 2']]
  group ['bottom-K fold 1', 'bottom-K curl', 'bottom-K fold 2'] rings 226..764 free=21 candidates=4 init costs [(['-+', 'c+'], 12819023), (['-+', 'c-'], 12858299), (['+-', 'c+'], 16484468), (['+-', 'c-'], 34736054)]
    [-+/c+] ok cost 121354.9 evals 897 (93s)
    [-+/c-] ok cost 149455.3 evals 808 (84s)
    [+-/c+] ok cost 110001.1 evals 3338 (346s)
    [+-/c-] timeout cost 133882.3 evals 3473 (360s)
    bottom-K loop bottom (inner side toward camera) = bottom-K curl
    roll bottom-K fold 1: tau 1200.8 beta 78.6 rho 10.4 (0.20W) phi 147.9 [['+-', 'c+']]
    roll bottom-K curl: tau 1281.2 beta 11.5 rho 10.4 (0.20W) phi 89.5 [['+-', 'c+']]
    roll bottom-K fold 2: tau 1413.1 beta 164.3 rho 10.9 (0.21W) phi -146.3 [['+-', 'c+']]
  stage fit: free 21 rings 226..764 cost0 110190.1
    [stage5] ok cost 110190.1 evals 44 (5s)
  METRICS {"act": 10, "lo": 226, "hi": 764, "cost": 110190.1, "blocks": {"pt": 43778.33, "slide": 60224.09, "anchor": 64.51, "cov": 3908.81, "ou": 0.0, "weave": 0.0, "face": 0.0, "seen": 995.66, "overlap": 1193.27, "bend": 0.0, "lam": 25.39}, "data_all": {"n": 902, "rms": 15.185652301990853, "p95": 32.708060595857596, "max": 82.39693937354095}, "face": {"checked": 207, "agree": 207, "frac": 1.0}, "ou": {"pairs": 91, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 0}, "min_fold_rho_over_W": 0.20000000000000004, "new_interval": 7, "data_new": {"n": 167, "rms": 24.843895708946484, "p95": 51.15345465237836, "max": 82.39693937354095}, "stage": 5, "status": "ok", "seconds": 887.2404778003693, "gate_target": 12.0, "gate_stop": 35.0, "gate": "FAIL"}
## stage 6: interval 8 (bk_out__j1_in) rings 226..813; groups [['k_return bend']]
  group ['k_return bend'] rings 226..813 free=13 candidates=1 init costs [(['bend'], 3679597)]
    [bend] ok cost 150631.0 evals 610 (68s)
    roll k_return bend: tau 1361.3 beta 109.6 rho 26.1 (0.50W) phi -68.8 [['bend']]
  stage fit: free 13 rings 226..813 cost0 150631.0
    [stage6] ok cost 150631.0 evals 19 (2s)
  METRICS {"act": 11, "lo": 226, "hi": 813, "cost": 150631.0, "blocks": {"pt": 61236.49, "slide": 66507.9, "anchor": 62.33, "cov": 20447.45, "ou": 0.0, "weave": 0.0, "face": 0.0, "seen": 1047.39, "overlap": 1193.27, "bend": 0.0, "lam": 136.16}, "data_all": {"n": 999, "rms": 15.992013955668982, "p95": 34.25752261867756, "max": 78.88659238370897}, "face": {"checked": 253, "agree": 253, "frac": 1.0}, "ou": {"pairs": 99, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 0}, "min_fold_rho_over_W": 0.20000000000000004, "new_interval": 8, "data_new": {"n": 97, "rms": 18.972663616676527, "p95": 30.704621782057313, "max": 78.88659238370897}, "stage": 6, "status": "ok", "seconds": 70.81741404533386, "gate_target": 12.0, "gate_stop": 25.0, "gate": "FAIL"}
## stage 7: interval 9 (j1_in__j1_out) rings 226..858; groups [['back-layer bend']]
  group ['back-layer bend'] rings 226..858 free=13 candidates=1 init costs [(['bend'], 163109)]
    [bend] ok cost 147855.6 evals 513 (59s)
    roll back-layer bend: tau 1414.5 beta 17.3 rho 148.9 (2.85W) phi 59.5 [['bend']]
  stage fit: free 13 rings 226..858 cost0 147855.6
    [stage7] ok cost 147855.6 evals 31 (4s)
  METRICS {"act": 12, "lo": 226, "hi": 858, "cost": 147855.6, "blocks": {"pt": 57756.39, "slide": 66847.79, "anchor": 62.33, "cov": 20727.98, "ou": 0.0, "weave": 0.0, "face": 0.0, "seen": 1047.39, "overlap": 1193.27, "bend": 0.0, "lam": 198.42, "prior": 22.04}, "data_all": {"n": 1000, "rms": 15.78633440331116, "p95": 33.68753966129739, "max": 78.39643381245966}, "face": {"checked": 253, "agree": 253, "frac": 1.0}, "ou": {"pairs": 396, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 0}, "min_fold_rho_over_W": 0.20000000000000004, "new_interval": 9, "data_new": {"n": 1, "rms": 7.096125928183619, "p95": 7.096125928183619, "max": 7.096125928183619}, "stage": 7, "status": "ok", "seconds": 62.53033781051636, "gate_target": 12.0, "gate_stop": 25.0, "gate": "PASS"}
## stage 8: interval 10 (j1_out__wrap_in) rings 226..910; groups [['crossbar bend']]
  group ['crossbar bend'] rings 226..910 free=13 candidates=1 init costs [(['bend'], 540104)]
    [bend] ok cost 472595.5 evals 152 (18s)
    roll crossbar bend: tau 1583.1 beta 90.0 rho 156.7 (3.00W) phi 0.0 [['bend']]
  stage fit: free 13 rings 226..910 cost0 472595.5
    [stage8] ok cost 472588.3 evals 52 (6s)
  METRICS {"act": 13, "lo": 226, "hi": 910, "cost": 472588.3, "blocks": {"pt": 382489.15, "slide": 66847.79, "anchor": 62.33, "cov": 20727.98, "ou": 0.0, "weave": 0.0, "face": 0.0, "seen": 1047.39, "overlap": 1193.27, "bend": 0.0, "lam": 198.42, "prior": 22.0}, "data_all": {"n": 1104, "rms": 28.530969017753367, "p95": 70.8882562042157, "max": 142.48509086876527}, "face": {"checked": 304, "agree": 304, "frac": 1.0}, "ou": {"pairs": 404, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 0}, "min_fold_rho_over_W": 0.20000000000000004, "new_interval": 10, "data_new": {"n": 104, "rms": 78.83164641847556, "p95": 129.78042679188698, "max": 142.48509086876527}, "stage": 8, "status": "ok", "seconds": 24.00244402885437, "gate_target": 12.0, "gate_stop": 25.0, "gate": "FAIL"}
!! STOP: stage 8 (interval 10) new-interval rms 78.83164641847556 px > 25.0
- Resume result: stage 5 bottom-K (3 rolls) 24.84 px (target FAIL, stop 35 not hit; fold1 phi 148 rho 0.2W, curl phi 89.5 rho 0.2W beta 11.5, fold2 phi -146 rho 0.21W); stage 6 k_return 18.97 (FAIL target, <25); stage 7 back layer 7.10 PASS; stage 8 crossbar 78.83 px > 25 STOP (crossbar bend init: tau 1583, beta 90, rho 3W, phi 0 = near-inert; fit moved only cost 472595->472588; data_all 28.5). Polish/report/export/sheets NOT run (stop rule). Log: all5b.log
## 2026-10-08 coordinator decision after stage 8 applied: presearch (u-in-span check + coarse phi x beta grid, coordinate pass, best 2 LM starts) for every new-roll group except S/bottom-K/apex; crossbar = 2 bends (rings 876, 893; layout migrated +4 params, backups old_layout/pre8_*); back-layer bend kept free in stage 8; no hard stops. Resuming all 8.
## stage 8: interval 10 (j1_out__wrap_in) rings 226..910; groups [['crossbar bend 1'], ['crossbar bend 2']]
  group ['crossbar bend 1'] rings 226..892 free=13 candidates=2 init costs [(['crossbar bend 1', 45, -1.0], 287100), (['crossbar bend 1', 45, -0.5], 287100)]
## stage 8: interval 10 (j1_out__wrap_in) rings 226..910; groups [['crossbar bend 1'], ['crossbar bend 2']]
  group ['crossbar bend 1'] rings 226..892 free=13 candidates=2 init costs [(['crossbar bend 1', 'b45', 'p-1.00'], 287100), (['crossbar bend 1', 'b45', 'p-0.50'], 287100)]
    [crossbar bend 1/b45/p-1.00] ok cost 152977.4 evals 365 (42s)
    [crossbar bend 1/b45/p-0.50] ok cost 152977.5 evals 282 (33s)
    roll crossbar bend 1: tau 1648.3 beta 29.9 rho 226.4 (4.34W) phi -57.3 [['crossbar bend 1', 'b45', 'p-1.00']]
  group ['crossbar bend 2'] rings 226..910 free=13 candidates=2 init costs [(['crossbar bend 2', 'b45', 'p-1.00'], 19614351), (['crossbar bend 2', 'b45', 'p-0.50'], 19614351)]
    [crossbar bend 2/b45/p-1.00] ok cost 312179.6 evals 268 (32s)
    [crossbar bend 2/b45/p-0.50] ok cost 312179.6 evals 268 (31s)
    roll crossbar bend 2: tau 1633.2 beta 32.5 rho 262.4 (5.02W) phi -28.6 [['crossbar bend 2', 'b45', 'p-0.50']]
  stage fit: free 17 rings 226..910 cost0 312179.6
    [stage8] ok cost 312178.4 evals 64 (8s)
  METRICS {"act": 14, "lo": 226, "hi": 910, "cost": 312178.4, "blocks": {"pt": 215416.04, "slide": 66847.79, "anchor": 62.33, "cov": 20727.98, "ou": 0.0, "weave": 0.0, "face": 0.0, "seen": 1047.39, "overlap": 2103.45, "bend": 5759.45, "lam": 199.64, "prior": 14.32}, "data_all": {"n": 1104, "rms": 22.612994576123103, "p95": 56.04515530720106, "max": 96.65066258677177}, "face": {"checked": 304, "agree": 304, "frac": 1.0}, "ou": {"pairs": 454, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 0}, "min_fold_rho_over_W": 0.20000000000000004, "new_interval": 10, "data_new": {"n": 104, "rms": 54.07358001941285, "p95": 87.43807599049566, "max": 96.65066258677177}, "stage": 8, "status": "ok", "seconds": 150.68051409721375, "gate_target": 12.0, "gate_stop": 25.0, "gate": "FAIL"}
!! (no hard stop) stage 8 (interval 10) new-interval rms 54.07358001941285 px > 25.0; continuing
## stage 9: interval 11 (wrap_in__j2_in) rings 226..1066; groups [['wrap curl', 'wrap twist 1', 'wrap twist 2']]
  group ['wrap curl', 'wrap twist 1', 'wrap twist 2'] rings 226..1066 free=21 candidates=2 init costs [(['wrap twist 1', 'b45', 'p1.00'], 3024934), (['wrap twist 2', 'b135', 'p-1.00'], 3028688)]
    [wrap twist 1/b45/p1.00] timeout cost 513946.5 evals 599 (90s)
    [wrap twist 2/b135/p-1.00] timeout cost 327705.0 evals 599 (90s)
    roll wrap curl: tau 1654.0 beta 55.5 rho 33.2 (0.64W) phi 136.3 [['wrap twist 2', 'b135', 'p-1.00']]
    roll wrap twist 1: tau 1788.2 beta 87.3 rho 53.9 (1.03W) phi -31.9 [['wrap twist 2', 'b135', 'p-1.00']]
    roll wrap twist 2: tau 1903.8 beta 104.4 rho 31.9 (0.61W) phi 32.1 [['wrap twist 2', 'b135', 'p-1.00']]
  stage fit: free 21 rings 226..1066 cost0 327705.0
    [stage9] ok cost 327530.7 evals 307 (46s)
  METRICS {"act": 17, "lo": 226, "hi": 1066, "cost": 327530.7, "blocks": {"pt": 215146.37, "slide": 77004.29, "anchor": 10018.2, "cov": 22264.24, "ou": 0.0, "weave": 0.0, "face": 0.0, "seen": 1047.39, "overlap": 1524.03, "bend": 256.33, "lam": 212.33, "prior": 57.5}, "data_all": {"n": 1286, "rms": 21.315618957174983, "p95": 51.498493326271856, "max": 96.65066258677177}, "face": {"checked": 305, "agree": 305, "frac": 1.0}, "ou": {"pairs": 758, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 0}, "min_fold_rho_over_W": 0.20000000000000004, "new_interval": 11, "data_new": {"n": 182, "rms": 10.564557924577034, "p95": 20.965156141194004, "max": 27.574099508164707}, "stage": 9, "status": "ok", "seconds": 242.17575597763062, "gate_target": 12.0, "gate_stop": 35.0, "gate": "PASS"}
## stage 10: interval 12 (j2_in__j2_out) rings 226..1101; groups [['middle-layer bend']]
  group ['middle-layer bend'] rings 226..1101 free=13 candidates=2 init costs [(['middle-layer bend', 'b90', 'p0.00'], 327531), (['middle-layer bend', 'b90', 'p-0.25'], 327531)]
    [middle-layer bend/b90/p0.00] ok cost 325235.4 evals 266 (41s)
    [middle-layer bend/b90/p-0.25] ok cost 325235.4 evals 266 (41s)
    roll middle-layer bend: tau 1946.9 beta 90.0 rho 156.7 (3.00W) phi 0.0 [['middle-layer bend', 'b90', 'p0.00']]
  stage fit: free 13 rings 226..1101 cost0 325235.4
    [stage10] ok cost 325235.4 evals 28 (4s)
  METRICS {"act": 18, "lo": 226, "hi": 1101, "cost": 325235.4, "blocks": {"pt": 215146.37, "slide": 74487.14, "anchor": 10235.27, "cov": 22264.24, "ou": 0.0, "weave": 0.0, "face": 0.0, "seen": 1047.39, "overlap": 1524.03, "bend": 256.33, "lam": 212.33, "prior": 62.29}, "data_all": {"n": 1286, "rms": 21.2235935411408, "p95": 51.498493326271856, "max": 96.65066258677177}, "face": {"checked": 305, "agree": 305, "frac": 1.0}, "ou": {"pairs": 758, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 0}, "min_fold_rho_over_W": 0.20000000000000004, "new_interval": 12, "data_new": {"n": 0, "rms": null, "p95": null, "max": null}, "stage": 10, "status": "ok", "seconds": 90.56708002090454, "gate_target": 12.0, "gate_stop": 25.0, "gate": "FAIL"}
!! (no hard stop) stage 10 (interval 12) new-interval rms None px > 25.0; continuing
## stage 11: interval 13 (j2_out__tk_in) rings 226..1140; groups [['top-K front bend']]
  group ['top-K front bend'] rings 226..1140 free=13 candidates=2 init costs [(['top-K front bend', 'b135', 'p-1.00'], 90054190), (['top-K front bend', 'b135', 'p-0.50'], 90054190)]
    [top-K front bend/b135/p-1.00] ok cost 809257.4 evals 219 (34s)
    [top-K front bend/b135/p-0.50] ok cost 814069.5 evals 205 (32s)
    roll top-K front bend: tau 2112.8 beta 158.2 rho 278.4 (5.33W) phi 15.8 [['top-K front bend', 'b135', 'p-1.00']]
  stage fit: free 13 rings 226..1140 cost0 809257.4
    [stage11] ok cost 809069.1 evals 152 (24s)
  METRICS {"act": 19, "lo": 226, "hi": 1140, "cost": 809069.1, "blocks": {"pt": 620629.84, "slide": 109136.64, "anchor": 1010.63, "cov": 22264.24, "ou": 44840.77, "weave": 0.0, "face": 0.0, "seen": 1047.39, "overlap": 3262.03, "bend": 6471.17, "lam": 249.09, "prior": 157.33}, "data_all": {"n": 1364, "rms": 32.71144794447068, "p95": 71.05166531051141, "max": 218.8988129858598}, "face": {"checked": 343, "agree": 343, "frac": 1.0}, "ou": {"pairs": 926, "viol_lt_2thk": 9, "viol_lt_thk": 9, "max_shortfall_css": 239.7251110815172, "weave_violations": 0}, "min_fold_rho_over_W": 0.20000000000000004, "new_interval": 13, "data_new": {"n": 78, "rms": 101.96573966396376, "p95": 191.26796501009002, "max": 218.8988129858598}, "stage": 11, "status": "ok", "seconds": 94.35720109939575, "gate_target": 12.0, "gate_stop": 25.0, "gate": "FAIL"}
!! (no hard stop) stage 11 (interval 13) new-interval rms 101.96573966396376 px > 25.0; continuing
## stage 12: interval 14 (tk_in__tk_out) rings 226..1230; groups [['top-K tip fold']]
  group ['top-K tip fold'] rings 226..1230 free=13 candidates=2 init costs [(['top-K tip fold', 'b135', 'p-0.25'], 1617649), (['top-K tip fold', 'b135', 'p0.25'], 1617649)]
    [top-K tip fold/b135/p-0.25] ok cost 849666.8 evals 298 (52s)
    [top-K tip fold/b135/p0.25] ok cost 845292.3 evals 284 (50s)
    roll top-K tip fold: tau 2101.3 beta 84.7 rho 16.0 (0.31W) phi 73.0 [['top-K tip fold', 'b135', 'p0.25']]
  stage fit: free 13 rings 226..1230 cost0 845292.3
    [stage12] ok cost 843860.5 evals 150 (26s)
  METRICS {"act": 20, "lo": 226, "hi": 1230, "cost": 843860.5, "blocks": {"pt": 637597.43, "slide": 131740.71, "anchor": 1070.55, "cov": 23610.44, "ou": 37897.03, "weave": 0.0, "face": 0.0, "seen": 1415.76, "overlap": 3645.67, "bend": 6471.17, "lam": 250.28, "prior": 161.44}, "data_all": {"n": 1522, "rms": 31.795547251587585, "p95": 69.67993062862445, "max": 217.77869649708475}, "face": {"checked": 344, "agree": 344, "frac": 1.0}, "ou": {"pairs": 922, "viol_lt_2thk": 7, "viol_lt_thk": 7, "max_shortfall_css": 247.3428467624526, "weave_violations": 0}, "min_fold_rho_over_W": 0.20000000000000004, "new_interval": 14, "data_new": {"n": 158, "rms": 15.129776245081619, "p95": 35.23649853950452, "max": 43.14339861839771}, "stage": 12, "status": "ok", "seconds": 134.80626702308655, "gate_target": 12.0, "gate_stop": 35.0, "gate": "FAIL"}
## stage 13: interval 15 (tk_out__end) rings 226..1298; groups [['end bend']]
  group ['end bend'] rings 226..1298 free=13 candidates=2 init costs [(['end bend', 'b90', 'p0.50'], 4100618), (['end bend', 'b90', 'p1.00'], 4100621)]
    [end bend/b90/p0.50] ok cost 876505.6 evals 330 (60s)
    [end bend/b90/p1.00] timeout cost 874507.8 evals 496 (90s)
    roll end bend: tau 2198.9 beta 77.8 rho 45.8 (0.88W) phi 68.8 [['end bend', 'b90', 'p1.00']]
  stage fit: free 13 rings 226..1298 cost0 874507.8
    [stage13] ok cost 866990.4 evals 176 (32s)
  METRICS {"act": 21, "lo": 226, "hi": 1298, "cost": 866990.4, "blocks": {"pt": 645002.02, "slide": 140086.79, "anchor": 1027.29, "cov": 23812.9, "ou": 41143.23, "weave": 0.0, "face": 0.0, "seen": 1495.35, "overlap": 7049.45, "bend": 6471.17, "end": 340.18, "lam": 360.45, "prior": 201.56}, "data_all": {"n": 1557, "rms": 31.75631372581791, "p95": 68.07178167100417, "max": 217.77869649708475}, "face": {"checked": 352, "agree": 352, "frac": 1.0}, "ou": {"pairs": 1279, "viol_lt_2thk": 42, "viol_lt_thk": 42, "max_shortfall_css": 247.3428467624526, "weave_violations": 0}, "min_fold_rho_over_W": 0.20000000000000004, "new_interval": 15, "data_new": {"n": 35, "rms": 26.668748348379488, "p95": 60.335760859832575, "max": 72.56743925677225}, "stage": 13, "status": "ok", "seconds": 186.65645003318787, "gate_target": 12.0, "gate_stop": 25.0, "gate": "FAIL"}
!! (no hard stop) stage 13 (interval 15) new-interval rms 26.668748348379488 px > 25.0; continuing
## stage 14: interval 1 (s_in__s_out) rings 132..1298; groups [['S bend', 'S obl 1', 'S obl 2', 'S obl 3', 'S obl 4']]
  group ['S bend', 'S obl 1', 'S obl 2', 'S obl 3', 'S obl 4'] rings 132..1298 free=29 candidates=6 init costs [(['b+0', '-+-+'], 19057470), (['b+30', '-+-+'], 20070800), (['b-30', '-+-+'], 25819541), (['b+30', '+-+-'], 60836910), (['b+0', '+-+-'], 60909498), (['b-30', '+-+-'], 62858362)]
    [b+0/-+-+] ok cost 916515.8 evals 968 (233s)
    [b+30/-+-+] ok cost 896760.1 evals 1175 (283s)
    [b-30/-+-+] timeout cost 903736.6 evals 1492 (360s)
    [b+30/+-+-] timeout cost 900139.3 evals 1495 (360s)
    [b+0/+-+-] timeout cost 896952.2 evals 1494 (360s)
    [b-30/+-+-] timeout cost 904355.9 evals 1494 (360s)
    roll S bend: tau 260.5 beta 147.9 rho 134.7 (2.58W) phi -11.4 [['b+30', '-+-+']]
    roll S obl 1: tau 289.4 beta 50.0 rho 14.0 (0.27W) phi -33.3 [['b+30', '-+-+']]
    roll S obl 2: tau 292.6 beta 95.6 rho 74.0 (1.42W) phi 54.9 [['b+30', '-+-+']]
    roll S obl 3: tau 314.7 beta 113.2 rho 45.4 (0.87W) phi -27.9 [['b+30', '-+-+']]
    roll S obl 4: tau 364.5 beta 154.1 rho 13.1 (0.25W) phi 65.6 [['b+30', '-+-+']]
  stage fit: free 29 rings 132..1298 cost0 896760.1
    [stage14] ok cost 896760.1 evals 35 (8s)
  METRICS {"act": 26, "lo": 132, "hi": 1298, "cost": 896760.1, "blocks": {"pt": 649647.53, "slide": 162602.74, "anchor": 1054.98, "cov": 25124.12, "ou": 41143.23, "weave": 0.0, "face": 0.0, "seen": 1500.56, "overlap": 8303.45, "bend": 6471.17, "end": 340.18, "lam": 370.56, "prior": 201.56}, "data_all": {"n": 1703, "rms": 30.88535566757491, "p95": 64.91941239131913, "max": 217.77869649708188}, "face": {"checked": 352, "agree": 352, "frac": 1.0}, "ou": {"pairs": 1251, "viol_lt_2thk": 42, "viol_lt_thk": 42, "max_shortfall_css": 247.34284676245247, "weave_violations": 0}, "min_fold_rho_over_W": 0.20000000001173207, "new_interval": 1, "data_new": {"n": 146, "rms": 17.431924368989563, "p95": 35.39135840924164, "max": 43.25112660175719}, "stage": 14, "status": "ok", "seconds": 1967.5958459377289, "gate_target": 20.0, "gate_stop": 35.0, "gate": "PASS"}
## stage 15: interval 0 (start__s_in) rings 0..1298; groups [['tail bend 2'], ['tail bend 1']]
  group ['tail bend 2'] rings 41..1298 free=13 candidates=2 init costs [(['tail bend 2', 'b135', 'p1.00'], 1639237), (['tail bend 2', 'b90', 'p1.00'], 1788345)]
    [tail bend 2/b135/p1.00] timeout cost 1016055.1 evals 362 (90s)
    [tail bend 2/b90/p1.00] timeout cost 1016034.2 evals 362 (90s)
    roll tail bend 2: tau 233.0 beta 168.5 rho 26.4 (0.50W) phi 26.1 [['tail bend 2', 'b90', 'p1.00']]
  group ['tail bend 1'] rings 0..1298 free=13 candidates=2 init costs [(['tail bend 1', 'b45', 'p-0.25'], 1047775), (['tail bend 1', 'b90', 'p-0.25'], 1053933)]
    [tail bend 1/b45/p-0.25] timeout cost 1012523.5 evals 329 (90s)
    [tail bend 1/b90/p-0.25] timeout cost 1012580.6 evals 352 (90s)
    roll tail bend 1: tau 138.2 beta 23.1 rho 214.1 (4.10W) phi -17.1 [['tail bend 1', 'b45', 'p-0.25']]
  stage fit: free 17 rings 0..1298 cost0 1012523.5
    [stage15] ok cost 990667.9 evals 761 (195s)
  METRICS {"act": 28, "lo": 0, "hi": 1298, "cost": 990667.9, "blocks": {"pt": 733426.37, "slide": 166722.71, "anchor": 1058.8, "cov": 26938.03, "ou": 41143.23, "weave": 0.0, "face": 0.0, "seen": 1500.56, "overlap": 12469.65, "bend": 6494.43, "end": 340.18, "lam": 372.38, "tailz": 0.0, "prior": 201.56}, "data_all": {"n": 1967, "rms": 31.67042265757631, "p95": 66.42674437437172, "max": 217.77869649708475}, "face": {"checked": 484, "agree": 484, "frac": 1.0}, "ou": {"pairs": 1251, "viol_lt_2thk": 42, "viol_lt_thk": 42, "max_shortfall_css": 247.3428467624526, "weave_violations": 0}, "min_fold_rho_over_W": 0.20000000001173207, "new_interval": 0, "data_new": {"n": 264, "rms": 35.89712445852679, "p95": 70.26978045361011, "max": 95.8781333871796}, "stage": 15, "status": "ok", "seconds": 567.3909170627594, "gate_target": 20.0, "gate_stop": 35.0, "gate": "FAIL"}
!! (no hard stop) stage 15 (interval 0) new-interval rms 35.89712445852679 px > 35.0; continuing
## polish: all 134 params, cost0 990667.9
stopped by coordinator after stage 15: switching to multiple-shooting
