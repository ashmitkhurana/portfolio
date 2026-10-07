# msfit notes (v2 rules: owner priority realism; v1 results archived in v1/)
## section K: rings 659..813 (data 644..828), intervals [7, 8], rolls ['bottom-K fold 1', 'bottom-K curl', 'bottom-K fold 2', 'k_return bend'], free 24
## section S: rings 132..225 (data 117..240), intervals [1], rolls ['S bend', 'S obl 1', 'S obl 2', 'S obl 3', 'S obl 4'], free 27
## section T: rings 0..131 (data 0..146), intervals [0], rolls ['tail bend 1', 'tail bend 2'], free 15
## section A: rings 388..658 (data 373..673), intervals [4, 5, 6], rolls ['left-leg bend 1', 'left-leg bend 2', 'apex fold', 'right-leg bend 1', 'right-leg bend 2'], free 29
## section F: rings 226..387 (data 211..402), intervals [2, 3], rolls ['sweep bend', 'far-left fold'], free 16
## section P: rings 1102..1298 (data 1087..1298), intervals [13, 14, 15], rolls ['top-K front bend', 'top-K tip fold', 'end bend'], free 21
  A seeded from paper3: cost0 129418.6, data {'n': 429, 'rms': 28.467606603545768, 'p95': 68.23707002899238, 'max': 84.0377667685551}
  6 starts; best init costs [(['tilt+0', 'tail bend 1', 'b45', 'p0.00'], 2274), (['tilt+0', 'tail bend 1', 'b90', 'p0.00'], 2274), (['tilt-25', 'tail bend 2', 'b135', 'p0.50'], 28348), (['tilt-25', 'tail bend 2', 'b135', 'p1.00'], 28348), (['tilt+25', 'tail bend 2', 'b45', 'p0.50'], 28927), (['tilt+25', 'tail bend 2', 'b45', 'p1.00'], 28927)]
  12 starts; best init costs [(['tilt-25', '-+', 'c-'], 21667523), (['tilt+25', '-+', 'c-'], 23602821), (['tilt+25', '-+', 'c+'], 25259977), (['tilt+0', '-+', 'c-'], 25312253), (['tilt+0', '-+', 'c+'], 28069127), (['tilt-25', '-+', 'c+'], 29795034), (['tilt-25', '+-', 'c+'], 62801329), (['tilt-25', '+-', 'c-'], 68956500)]
  18 starts; best init costs [(['tilt+0', 'b+30', '-+-+'], 5782329), (['tilt+0', 'b-30', '-+-+'], 7871599), (['tilt+0', 'b+0', '-+-+'], 7946094), (['tilt+0', 'b+30', '+-+-'], 32374291), (['tilt+0', 'b+0', '+-+-'], 33844857), (['tilt+0', 'b-30', '+-+-'], 34075388), (['tilt+25', 'b+30', '-+-+'], 61310637), (['tilt-25', 'b-30', '+-+-'], 68043952)]
  6 starts; best init costs [(['tilt+25', 'end bend', 'b135', 'p-0.25'], 939373), (['tilt+25', 'end bend', 'b135', 'p-0.50'], 939374), (['tilt+0', 'end bend', 'b135', 'p-0.25'], 1619164), (['tilt+0', 'end bend', 'b135', 'p-0.50'], 1619165), (['tilt-25', 'end bend', 'b135', 'p-0.25'], 1918534), (['tilt-25', 'end bend', 'b135', 'p-0.50'], 1918535)]
  6 starts; best init costs [(['tilt+25', 'far-left fold', 'b135', 'p-3.14'], 186985), (['tilt+25', 'sweep bend', 'b90', 'p0.50'], 262560), (['tilt+0', 'far-left fold', 'b90', 'p-1.57'], 361327), (['tilt+0', 'far-left fold', 'b90', 'p-1.00'], 505018), (['tilt-25', 'far-left fold', 'b45', 'p-3.14'], 591362), (['tilt-25', 'far-left fold', 'b90', 'p1.57'], 1134558)]
    [tilt+0/tail bend 1/b45/p0.00] ok cost 1052.5 evals 14199 (33s)
    [tilt+25/far-left fold/b135/p-3.14] ok cost 18207.7 evals 757 (31s)
    [tilt+0/tail bend 1/b90/p0.00] ok cost 1158.6 evals 7360 (21s)
    [tilt-25/tail bend 2/b135/p0.50] ok cost 748.3 evals 5536 (16s)
    [refine] ok cost 748.3 evals 183 (1s)
  v1-rules result: data 18.60 px, realism fails [], outline {}
  SECTION T DONE: data rms 18.603813835776787 (p95 43.16829424796486, max 67.55066842493814) gate <= 12.0: FAIL; cost 748.3; 71s
  METRICS {"section": "T", "cost": 748.3, "blocks": {"pt": 746.95, "ou": 0.0, "face": 0.0, "overlap": 0.0, "bend": 0.0, "lam": 1.32, "xing": 0.0}, "data_own": {"n": 264, "rms": 18.603813835776787, "p95": 43.16829424796486, "max": 67.55066842493814}, "ou": {"pairs": 0, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 0}, "tags": ["tilt-25", "tail bend 2", "b135", "p0.50"], "realism": {"section": "T", "roll_overlap_min_gap": 14.994926271541207, "crossings": 0, "sep_violations": 0, "min_fold_rho_over_W": null, "curv_oscillations": 0, "corners": 0, "outline": {}, "fails": []}, "gate_rms": 12.0, "gate": "FAIL", "rolls": [{"name": "tail bend 1", "tau": -29.8415290037423, "beta_deg": 89.47497205686702, "rho_css": 26.114767403193426, "rho_over_W": 0.5000000001802137, "phi_deg": -2.3076009849188037}, {"name": "tail bend 2", "tau": 84.97952163485174, "beta_deg": 143.9716838694916, "rho_css": 127.48451475829592, "rho_over_W": 2.4408510486801327, "phi_deg": 17.701887426010767}], "lam": {"0": 0.614178797719846}, "seconds": 71.48030614852905}
    [tilt+25/sweep bend/b90/p0.50] ok cost 15236.6 evals 768 (35s)
    [tilt+0/far-left fold/b90/p-1.57] ok cost 17183.4 evals 947 (38s)
    [refine] ok cost 15236.6 evals 34 (1s)
  v1-rules result: data 8.59 px, realism fails ['corners'], outline {'farleft': {'mean_px': 5.974930675635993, 'max_px': 18.788294228055936, 'n': 50}}
  RESEED pass for F: old score (fails, outline, rms) = (1, 5.974930675635993, 8.590429130337647)
  window fit Fw3: rings 274..402, rolls ['sweep bend', 'far-left fold', 'left-leg bend 1']
    [paper3] ok cost 3419.9 evals 3536 (127s)
    [refine] ok cost 3332.8 evals 1859 (58s)
  v1-rules result: data 5.57 px, realism fails ['crossing', 'roll-overlap'], outline {'apex': {'mean_px': 0.8901344731688348, 'max_px': 2.0, 'n': 42}}
  RESEED pass for A: old score (fails, outline, rms) = (2, 0.8901344731688348, 5.566440015279298)
  window fit Aw5: rings 469..569, rolls ['left-leg bend 1', 'left-leg bend 2', 'apex fold', 'right-leg bend 1', 'right-leg bend 2', 'bottom-K fold 1']
    [tilt-25/-+/c-] ok cost 437133.6 evals 2275 (196s)
    [tilt+25/end bend/b135/p-0.25] timeout cost 124448.6 evals 12010 (240s)
    [win/t25/right-leg bend 2/b90/p0.25] timeout cost 377926.4 evals 1695 (60s)
    [win/t25/right-leg bend 2/b90/p0.50] timeout cost 390351.4 evals 1597 (60s)
    [tilt+0/b+30/-+-+] timeout cost 32272.5 evals 4898 (360s)
    [win/t0/right-leg bend 2/b90/p-1.00] timeout cost 411607.9 evals 1576 (60s)
    [tilt+25/-+/c-] ok cost 1192603.1 evals 2169 (184s)
    [win/t0/right-leg bend 2/b90/p-0.50] timeout cost 411557.5 evals 1595 (60s)
    [tilt+25/end bend/b135/p-0.50] timeout cost 132172.1 evals 11856 (240s)
    [win/t-25/right-leg bend 2/b90/p-1.00] timeout cost 129392.2 evals 1580 (60s)
    [win/t-25/right-leg bend 2/b90/p-0.50] timeout cost 129242.9 evals 1559 (60s)
  window Aw5 best cost 129242.9 tags ['t-25', 'right-leg bend 2', 'b90', 'p-0.50'] data 20.071938535220053
## section F: rings 226..387 (data 211..402), intervals [2, 3], rolls ['sweep bend', 'far-left fold'], free 16
## section K: rings 659..813 (data 644..828), intervals [7, 8], rolls ['bottom-K fold 1', 'bottom-K curl', 'bottom-K fold 2', 'k_return bend'], free 24
## section A: rings 388..658 (data 373..673), intervals [4, 5, 6], rolls ['left-leg bend 1', 'left-leg bend 2', 'apex fold', 'right-leg bend 1', 'right-leg bend 2'], free 29
## section S: rings 132..225 (data 117..240), intervals [1], rolls ['S bend', 'S obl 1', 'S obl 2', 'S obl 3', 'S obl 4'], free 27
## section P: rings 1102..1298 (data 1087..1298), intervals [13, 14, 15], rolls ['top-K front bend', 'top-K tip fold', 'end bend'], free 21
  A seeded from paper3: cost0 129418.6, data {'n': 429, 'rms': 28.467606603545768, 'p95': 68.23707002899238, 'max': 84.0377667685551}
  12 starts; best init costs [(['tilt-25', '-+', 'c-'], 21667523), (['tilt+25', '-+', 'c-'], 23602821), (['tilt+25', '-+', 'c+'], 25259977), (['tilt+0', '-+', 'c-'], 25312253), (['tilt+0', '-+', 'c+'], 28069127), (['tilt-25', '-+', 'c+'], 29795034), (['tilt-25', '+-', 'c+'], 62801329), (['tilt-25', '+-', 'c-'], 68956500)]
  18 starts; best init costs [(['tilt+0', 'b+30', '-+-+'], 5782329), (['tilt+0', 'b-30', '-+-+'], 7871599), (['tilt+0', 'b+0', '-+-+'], 7946094), (['tilt+0', 'b+30', '+-+-'], 32374291), (['tilt+0', 'b+0', '+-+-'], 33844857), (['tilt+0', 'b-30', '+-+-'], 34075388), (['tilt+25', 'b+30', '-+-+'], 61310637), (['tilt-25', 'b-30', '+-+-'], 68043952)]
  6 starts; best init costs [(['tilt+25', 'end bend', 'b135', 'p-0.25'], 939373), (['tilt+25', 'end bend', 'b135', 'p-0.50'], 939374), (['tilt+0', 'end bend', 'b135', 'p-0.25'], 1619164), (['tilt+0', 'end bend', 'b135', 'p-0.50'], 1619165), (['tilt-25', 'end bend', 'b135', 'p-0.25'], 1918534), (['tilt-25', 'end bend', 'b135', 'p-0.50'], 1918535)]
  6 starts; best init costs [(['tilt+25', 'far-left fold', 'b135', 'p-3.14'], 186985), (['tilt+25', 'sweep bend', 'b90', 'p0.50'], 262560), (['tilt+0', 'far-left fold', 'b90', 'p-1.57'], 361327), (['tilt+0', 'far-left fold', 'b90', 'p-1.00'], 505018), (['tilt-25', 'far-left fold', 'b45', 'p-3.14'], 591362), (['tilt-25', 'far-left fold', 'b90', 'p1.57'], 1134558)]
    [tilt+25/far-left fold/b135/p-3.14] ok cost 18207.7 evals 757 (34s)
    [tilt+25/sweep bend/b90/p0.50] ok cost 15236.6 evals 768 (35s)
    [tilt+0/far-left fold/b90/p-1.57] ok cost 17183.4 evals 947 (45s)
    [refine] ok cost 15236.6 evals 34 (2s)
  v1-rules result: data 8.59 px, realism fails ['corners'], outline {'farleft': {'mean_px': 5.974930675635993, 'max_px': 18.788294228055936, 'n': 50}}
  RESEED pass for F: old score (fails, outline, rms) = (1, 5.974930675635993, 8.590429130337647)
  window fit Fw3: rings 274..402, rolls ['sweep bend', 'far-left fold', 'left-leg bend 1']
    [paper3] ok cost 3419.9 evals 3536 (141s)
    [win/s+1/m2.6/rho0.6/db-30/t25] timeout cost 16160.4 evals 1278 (60s)
    [refine] ok cost 3332.8 evals 1859 (76s)
  v1-rules result: data 5.57 px, realism fails ['crossing', 'roll-overlap'], outline {'apex': {'mean_px': 0.8901344731688348, 'max_px': 2.0, 'n': 42}}
  RESEED pass for A: old score (fails, outline, rms) = (2, 0.8901344731688348, 5.566440015279298)
  window fit Aw5: rings 469..569, rolls ['left-leg bend 1', 'left-leg bend 2', 'apex fold', 'right-leg bend 1', 'right-leg bend 2', 'bottom-K fold 1']
    [tilt-25/-+/c-] ok cost 437133.6 evals 2275 (232s)
    [tilt+25/end bend/b135/p-0.25] timeout cost 124761.9 evals 9918 (240s)
    [win/s+1/m2.6/rho0.6/db-30/t0] timeout cost 19321.6 evals 1283 (60s)
    [win/t25/right-leg bend 2/b90/p0.25] timeout cost 391012.2 evals 1320 (60s)
    [win/s+1/m1.6/rho0.6/db-30/t25] timeout cost 12634.4 evals 1278 (60s)
    [win/t25/right-leg bend 2/b90/p0.50] timeout cost 399276.0 evals 1328 (60s)
    [tilt+0/b+30/-+-+] timeout cost 33385.5 evals 4075 (360s)
    [win/s+1/m2.6/rho0.4/db-30/t0] timeout cost 12777.9 evals 1286 (60s)
    [win/t0/right-leg bend 2/b90/p-1.00] timeout cost 412282.6 evals 1334 (60s)
    [win/s-1/m2.6/rho0.25/db-30/t0] timeout cost 8134.8 evals 1277 (60s)
    [tilt+25/-+/c-] ok cost 1192603.1 evals 2169 (224s)
    [win/t0/right-leg bend 2/b90/p-0.50] timeout cost 412282.6 evals 1333 (60s)
    [tilt+25/end bend/b135/p-0.50] timeout cost 132513.2 evals 9779 (240s)
    [win/s+1/m2.6/rho0.4/db-30/t25] timeout cost 11315.9 evals 1257 (60s)
  window Fw3 best cost 8134.8 tags ['s-1', 'm2.6', 'rho0.25', 'db-30', 't0'] data 8.706709341446414
    [win/t-25/right-leg bend 2/b90/p-1.00] timeout cost 131231.9 evals 1206 (60s)
    [reseed-as-is] ok cost 16232.0 evals 986 (52s)
    reseed F iv3 as-is: cost 16232.0 score (0, 5.773791199447794, 8.760195624024261) fails []
    [win/t-25/right-leg bend 2/b90/p-0.50] timeout cost 132390.7 evals 1247 (60s)
  window Aw5 best cost 131231.9 tags ['t-25', 'right-leg bend 2', 'b90', 'p-1.00'] data 19.978891911620536
## section A: rings 388..658 (data 373..673), intervals [4, 5, 6], rolls ['left-leg bend 1', 'left-leg bend 2', 'apex fold', 'right-leg bend 1', 'right-leg bend 2'], free 29
  A seeded from paper3: cost0 129418.6, data {'n': 429, 'rms': 28.467606603545768, 'p95': 68.23707002899238, 'max': 84.0377667685551}
    [tilt+0/b-30/-+-+] timeout cost 6873.4 evals 3905 (360s)
    [tilt+0/end bend/b135/p-0.25] timeout cost 385110.7 evals 9389 (240s)
    [paper3] ok cost 3419.9 evals 3536 (147s)
    [refine] ok cost 105088.3 evals 2213 (54s)
  v1-rules result: data 39.32 px, realism fails ['separation', 'corners'], outline {'topk': {'mean_px': 4.15420064509836, 'max_px': 11.212039196538953, 'n': 17}}
  RESEED pass for P: old score (fails, outline, rms) = (2, 4.15420064509836, 39.3182378824667)
  window fit Pw14: rings 1126..1245, rolls ['top-K front bend', 'top-K tip fold', 'end bend']
    [win/s+1/m2.6/rho0.25/db0/t-25] ok cost 7879.2 evals 698 (17s)
    [reseed-kabsch] ok cost 20762.1 evals 5459 (262s)
    reseed F iv3 kabsch: cost 20762.1 score (1, 5.612604072841456, 13.105992275275634) fails ['corners']
  RESEED result for F: kept score (0, 5.773791199447794, 8.760195624024261) (old (1, 5.974930675635993, 8.590429130337647))
  SECTION F DONE: data rms 8.760195624024261 (p95 16.59538646669227, max 19.550113039654708) gate <= 6.0: FAIL; cost 16232.0; 803s
  METRICS {"section": "F", "cost": 16232.0, "blocks": {"pt": 12004.7, "slide": 3806.64, "anchor": 11.58, "cov": 306.04, "ou": 0.0, "face": 0.0, "seen": 101.73, "overlap": 0.0, "bend": 0.0, "lam": 1.3, "xing": 0.0}, "data_own": {"n": 306, "rms": 8.760195624024261, "p95": 16.59538646669227, "max": 19.550113039654708}, "ou": {"pairs": 0, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 0}, "tags": ["reseed", "as-is"], "realism": {"section": "F", "roll_overlap_min_gap": 130.67243244186693, "crossings": 0, "sep_violations": 0, "min_fold_rho_over_W": 0.30000000000000004, "curv_oscillations": 0, "corners": 0, "outline": {"farleft": {"mean_px": 5.773791199447794, "max_px": 19.72308292331602, "n": 50}}, "fails": []}, "gate_rms": 6.0, "gate": "FAIL", "rolls": [{"name": "sweep bend", "tau": 446.78541713336654, "beta_deg": 148.0804483459531, "rho_css": 26.11476739378095, "rho_over_W": 0.5000000000000001, "phi_deg": 68.75493541569877}, {"name": "far-left fold", "tau": 602.2257761748933, "beta_deg": 121.83301210495851, "rho_css": 15.66886043626857, "rho_over_W": 0.30000000000000004, "phi_deg": -197.18873385392467}], "lam": {"2": 1.2373038154825609, "3": 1.4906651279469594}, "seconds": 802.5166509151459}
    [tilt+25/-+/c+] timeout cost 337067.7 evals 3354 (360s)
    [refine] ok cost 3332.8 evals 1859 (75s)
  v1-rules result: data 5.57 px, realism fails ['crossing', 'roll-overlap'], outline {'apex': {'mean_px': 0.8901344731688348, 'max_px': 2.0, 'n': 42}}
  SECTION A DONE: data rms 5.566440015279298 (p95 8.764909758985032, max 18.474120309513285) gate <= 6.0: PASS; cost 3332.8; 223s
  METRICS {"section": "A", "cost": 3332.8, "blocks": {"pt": 2613.05, "slide": 710.11, "anchor": 0.47, "cov": 5.84, "ou": 0.0, "weave": 0.0, "face": 0.0, "seen": 0.0, "overlap": 0.42, "bend": 2.63, "lam": 0.22, "xing": 0.0}, "data_own": {"n": 429, "rms": 5.566440015279298, "p95": 8.764909758985032, "max": 18.474120309513285}, "ou": {"pairs": 0, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 0}, "tags": ["paper3"], "realism": {"section": "A", "roll_overlap_min_gap": -0.0188320514625957, "crossings": 69, "sep_violations": 0, "min_fold_rho_over_W": 0.9874951067240476, "curv_oscillations": 0, "corners": 0, "outline": {"apex": {"mean_px": 0.8901344731688348, "max_px": 2.0, "n": 42}}, "fails": ["crossing", "roll-overlap"]}, "gate_rms": 6.0, "gate": "PASS", "rolls": [{"name": "left-leg bend 1", "tau": 785.6366790066361, "beta_deg": 161.47755037612976, "rho_css": 68.0749237363749, "rho_over_W": 1.303379859944425, "phi_deg": 3.4911452284307676}, {"name": "left-leg bend 2", "tau": 880.5232080124381, "beta_deg": 84.03206256207365, "rho_css": 31.23050257518595, "rho_over_W": 0.5979471711209513, "phi_deg": -67.57981870021169}, {"name": "apex fold", "tau": 917.8660586939279, "beta_deg": 95.22617189640745, "rho_css": 51.57641002919079, "rho_over_W": 0.9874951067240476, "phi_deg": -44.81937835668686}, {"name": "right-leg bend 1", "tau": 982.2042539017516, "beta_deg": 41.281041919647556, "rho_css": 26.11476739378097, "rho_over_W": 0.5000000000000004, "phi_deg": -68.74947974170226}, {"name": "right-leg bend 2", "tau": 1034.7929525063496, "beta_deg": 37.97970525979191, "rho_css": 26.11476739378095, "rho_over_W": 0.5000000000000001, "phi_deg": -20.4433188449994}], "lam": {"4": 1.0670470563283876, "5": 1.1290166122612302, "6": 0.9634259989625406}, "seconds": 222.54709887504578}
    [win/s-1/m2.6/rho0.25/db0/t25] ok cost 10988.8 evals 1920 (38s)
    [win/s-1/m2.6/rho0.25/db0/t0] timeout cost 5836.8 evals 3414 (60s)
    [win/s-1/m2.6/rho0.25/db0/t-25] ok cost 6716.2 evals 1539 (26s)
    [win/s+1/m2.6/rho0.25/db30/t0] ok cost 7598.6 evals 670 (11s)
    [tilt+0/-+/c-] ok cost 1203362.7 evals 1547 (124s)
    [refine] ok cost 337067.4 evals 63 (5s)
  v1-rules result: data 42.18 px, realism fails ['corners'], outline {'bottomk': {'mean_px': 6.675096428501832, 'max_px': 25.314984164736757, 'n': 150}}
  RESEED pass for K: old score (fails, outline, rms) = (1, 6.675096428501832, 42.18081297674688)
  window fit Kw7: rings 644..779, rolls ['right-leg bend 2', 'bottom-K fold 1', 'bottom-K curl', 'bottom-K fold 2', 'k_return bend']
    [win/s+1/m2.6/rho0.25/db30/t-25] ok cost 7613.0 evals 1061 (18s)
  window Pw14 best cost 5836.8 tags ['s-1', 'm2.6', 'rho0.25', 'db0', 't0'] data 8.000953251341736
    [reseed-as-is] ok cost 31408.5 evals 1704 (31s)
    reseed P iv14 as-is: cost 31408.5 score (3, 4.884320234715707, 21.19529171077292) fails ['separation', 'curv-oscillation', 'corners']
    [tilt+0/b+0/-+-+] ok cost 24190.4 evals 3806 (282s)
    [win/t0/-+/c-] timeout cost 2096284.6 evals 766 (60s)
