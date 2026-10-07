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
