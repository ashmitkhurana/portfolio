[global +0.0min] ## global_fit all start
[global +0.0min] W_css 52.230, thk 4.748; A centre z at rings 388..658: min 98.8 max 282.1 mean 215.2
[global +0.0min] depth plan iteration 0: bump {} -> over/under violations 85 in rules [('left_leg', 'wrap', 85)]
[global +0.0min] depth plan iteration 1: bump {11: -26.114767393780948} -> over/under violations 58 in rules [('wrap', 'crossbar', 1), ('left_leg', 'wrap', 57)]
[global +0.0min] depth plan iteration 2: bump {11: -52.229534787561896} -> over/under violations 48 in rules [('wrap', 'crossbar', 1), ('left_leg', 'wrap', 47)]
[global +0.0min] depth plan iteration 3: bump {11: -78.34430218134284} -> over/under violations 37 in rules [('middle_layer', 'back_layer', 2), ('wrap', 'crossbar', 1), ('crossbar', 'left_leg', 10), ('left_leg', 'wrap', 24)]
[global +0.0min] depth plan: kept the iteration with the fewest violations (37), bumps {11: -78.34430218134284}
[global +0.0min] depth plan anchors {"zL": 147.7, "zR": 258.74, "zLb": 98.79, "zRb": 217.49, "z_sweep": 269.72} (W=52.23); final bumps {11: -78.34430218134284}
[global +0.0min] targets: T1/T2 = backproject(e1_px/e2_px, z*), weights vis hard/fixed 1.0, soft 0.3, hidden 0.3; z* range 0.9..1138.8
[global +0.0min]   seed order fix: roll crossbar bend 1 reset to default
[global +0.0min]   seed order fix: roll wrap twist 2 reset to default
[global +0.0min]   seed order fix: roll top-K front bend a reset to default
[global +0.0min] seed built (A exact; flat shift 17.342)
[global +0.0min] check: seed 3D rms (before growth) 853.6 css
[global +0.0min] check: global chain (A rolls only) vs sec_A_APPROVED edges at rings 388..658: max |dL| = 0.0000 css
[global +0.0min]   grow K: act 7 best start seed cost 196181 3D rms of its rings 41.1 css
[global +0.0min]   grow B: act 8 best start seed cost 28072 3D rms of its rings 69.1 css
[global +0.1min]   grow X: act 12 best start default cost 979929 3D rms of its rings 80.0 css
[global +0.1min]   grow M: act 13 best start seed cost 22110 3D rms of its rings 77.5 css
[global +0.3min]   grow P: act 16 best start flip cost 369321 3D rms of its rings 67.7 css
[global +0.4min]   grow F: act 18 best start seed cost 218315 3D rms of its rings 39.5 css
[global +0.5min]   grow S: act 20 best start default cost 251188 3D rms of its rings 58.7 css
[global +0.6min]   grow T: act 22 best start default cost 18320762 3D rms of its rings 521.2 css
[global +0.6min] after seed growth: 3D rms 173.8 css; per interval {"start__s_in": 521.2, "s_in__s_out": 60.6, "s_out__fl_in": 33.5, "fl_in__fl_out": 42.9, "fl_out__apex_in": 12.9, "apex_in__apex_out": 15.2, "apex_out__bk_in": 11.1, "bk_in__bk_out": 39.8, "bk_out__j1_in": 41.7, "j1_in__j1_out": 56.3, "j1_out__wrap_in": 99.3, "wrap_in__j2_in": 70.1, "j2_in__j2_out": 65.5, "j2_out__tk_in": 65.2, "tk_in__tk_out": 44.1, "tk_out__end": 90.8}
    [pass 1 (A rolls frozen)] ok cost 3810568.3 evals 4578 (122s)
[global +2.6min] pass 1 (A rolls frozen): status ok, cost 20350123 -> 3810568, 3D rms (all samples) 88.19 css, 122s
[global +2.6min] pass 1 done; A region unchanged check (A rolls only chain) max |dL| vs approved 0.0000
    [pass 2 (all free, A prior 100)] ok cost 3600590.3 evals 3443 (91s)
[global +4.1min] pass 2 (all free, A prior 100): status ok, cost 3810568 -> 3600590, 3D rms (all samples) 87.79 css, 91s
    [pass 3 (realism weight 1.0)] ok cost 3614821.9 evals 1727 (45s)
[global +4.9min] pass 3 (realism weight 1.0): status ok, cost 3665196 -> 3614822, 3D rms (all samples) 88.03 css, 45s
[global +4.9min] metrics.json written
[global +4.9min] full_overlay.png, full_shaded.png written
[global +5.0min] zoom sheets written
[global +5.0min] solution.npz written
[global +5.0min] ## done in 5.0 min
