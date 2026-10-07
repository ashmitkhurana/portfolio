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
