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
    [reseed-kabsch] ok cost 11517.4 evals 4191 (78s)
    reseed P iv14 kabsch: cost 11517.4 score (3, 5.3163737235063655, 12.909882945911319) fails ['separation', 'curv-oscillation', 'corners']
  RESEED result for P: kept score (2, 4.15420064509836, 39.3182378824667) (old (2, 4.15420064509836, 39.3182378824667))
  SECTION P DONE: data rms 39.3182378824667 (p95 73.93742921879912, max 110.09578007044826) gate <= 6.0: FAIL; cost 105088.3; 1060s
  METRICS {"section": "P", "cost": 105088.3, "blocks": {"pt": 80489.87, "slide": 24246.47, "anchor": 22.9, "cov": 6.0, "ou": 0.0, "face": 0.0, "seen": 193.96, "overlap": 0.0, "bend": 0.0, "lam": 74.32, "prior": 52.65, "xing": 2.17}, "data_own": {"n": 271, "rms": 39.3182378824667, "p95": 73.93742921879912, "max": 110.09578007044826}, "ou": {"pairs": 0, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 0}, "tags": ["tilt+25", "end bend", "b135", "p-0.25"], "realism": {"section": "P", "roll_overlap_min_gap": 0.049437160567549654, "crossings": 0, "sep_violations": 21, "min_fold_rho_over_W": 0.30000000000000004, "curv_oscillations": 0, "corners": 2, "outline": {"topk": {"mean_px": 4.15420064509836, "max_px": 11.212039196538953, "n": 17}}, "fails": ["separation", "corners"]}, "gate_rms": 6.0, "gate": "FAIL", "rolls": [{"name": "top-K front bend", "tau": 1943.721195316573, "beta_deg": 64.56934568464214, "rho_css": 26.114783616514064, "rho_over_W": 0.5000003106045876, "phi_deg": 43.652433877981224}, {"name": "top-K tip fold", "tau": 2014.083671086497, "beta_deg": 168.53754468889147, "rho_css": 15.66886043626857, "rho_over_W": 0.30000000000000004, "phi_deg": 31.07096386090831}, {"name": "end bend", "tau": 2157.3973629086117, "beta_deg": 95.82112583076749, "rho_css": 26.11476739378095, "rho_over_W": 0.5000000000000001, "phi_deg": -68.75493541569877}], "lam": {"13": 2.320666527241401, "14": 3.3905178136169214, "15": 4.103018380330319}, "seconds": 1059.9368090629578}
    [win/t0/+-/c+] timeout cost 412189.4 evals 757 (60s)
    [win/t25/-+/c-] timeout cost 1302937.5 evals 860 (60s)
    [win/t25/+-/c+] timeout cost 284392.5 evals 895 (60s)
    [win/t0/-+/c+] timeout cost 682975.5 evals 908 (60s)
REVIEW A ['apex', 'farleft', 'bottomk', 'wrap', 'junction', 'endstrand']
  REALISM A: {"section": "A", "roll_overlap_min_gap": -0.0188320514625957, "crossings": 70, "sep_violations": 0, "min_fold_rho_over_W": 0.9874951067240476, "curv_oscillations": 0, "corners": 0, "outline": {"apex": {"mean_px": 0.8800730390517393, "max_px": 2.0, "n": 42}}, "fails": ["crossing", "roll-overlap"], "data_rms": 5.566440015279298}
REVIEW T ['scurve']
  REALISM T: {"section": "T", "roll_overlap_min_gap": 14.994926271541207, "crossings": 0, "sep_violations": 0, "min_fold_rho_over_W": null, "curv_oscillations": 0, "corners": 0, "outline": {}, "fails": [], "data_rms": 18.603813835776787}
REVIEW P ['bottomk', 'wrap', 'junction', 'topk', 'endstrand']
  REALISM P: {"section": "P", "roll_overlap_min_gap": 0.049437160567549654, "crossings": 0, "sep_violations": 21, "min_fold_rho_over_W": 0.30000000000000004, "curv_oscillations": 0, "corners": 2, "outline": {"topk": {"mean_px": 4.15420064509836, "max_px": 11.212039196538953, "n": 17}}, "fails": ["separation", "corners"], "data_rms": 39.3182378824667}
REVIEW P_v2 ['bottomk', 'junction', 'topk', 'endstrand']
  REALISM P_v2: {"section": "P", "roll_overlap_min_gap": 11.850005363391574, "crossings": 0, "sep_violations": 67, "min_fold_rho_over_W": 0.32202113872308463, "curv_oscillations": 1, "corners": 2, "outline": {"topk": {"mean_px": 2.191250723057535, "max_px": 3.7285645925237114, "n": 17}}, "fails": ["separation", "curv-oscillation", "corners"], "data_rms": 8.893229744747465}
## section X: rings 859..1066 (data 844..1081), intervals [10, 11], rolls ['crossbar bend 1', 'crossbar bend 2', 'wrap curl', 'wrap twist 1', 'wrap twist 2'], free 28
REVIEW P ['bottomk', 'junction', 'topk', 'endstrand']
  REALISM P: {"section": "P", "roll_overlap_min_gap": 11.850005363391574, "crossings": 0, "sep_violations": 67, "min_fold_rho_over_W": 0.32202113872308463, "curv_oscillations": 1, "corners": 2, "outline": {"topk": {"mean_px": 2.191250723057535, "max_px": 3.7285645925237114, "n": 17}}, "fails": ["separation", "curv-oscillation", "corners"], "data_rms": 8.893229744747465}
    [win/t0/+-/c-] timeout cost 327976.2 evals 883 (60s)
  window Kw7 best cost 284392.5 tags ['t25', '+-', 'c+'] data 53.57612584475623
REVIEW F ['farleft', 'scurve', 'bottomk', 'wrap', 'endstrand']
  REALISM F: {"section": "F", "roll_overlap_min_gap": 130.67243244186693, "crossings": 0, "sep_violations": 0, "min_fold_rho_over_W": 0.30000000000000004, "curv_oscillations": 0, "corners": 0, "outline": {"farleft": {"mean_px": 5.784084795340793, "max_px": 19.849433241279208, "n": 50}}, "fails": [], "data_rms": 8.760195624024261}
  6 starts; best init costs [(['tilt+25', 'wrap twist 2', 'b45', 'p3.14'], 2084437), (['tilt+25', 'wrap twist 2', 'b90', 'p3.14'], 2096258), (['tilt-25', 'wrap twist 2', 'b45', 'p-1.57'], 2447664), (['tilt-25', 'wrap twist 1', 'b45', 'p-1.57'], 2447909), (['tilt+0', 'wrap twist 2', 'b45', 'p3.14'], 2567199), (['tilt+0', 'wrap twist 2', 'b45', 'p1.57'], 2568644)]
    [tilt+0/b+30/+-+-] timeout cost 46576.3 evals 5966 (360s)
    [refine] ok cost 6862.4 evals 784 (49s)
  v1-rules result: data 9.37 px, realism fails ['crossing', 'separation', 'curv-oscillation', 'corners', 'roll-overlap'], outline {'s': {'mean_px': 19.86059860038254, 'max_px': 46.95337793945622, 'n': 112}}
  RESEED pass for S: old score (fails, outline, rms) = (5, 19.86059860038254, 9.366305677274527)
  window fit Sw1: rings 117..240, rolls ['tail bend 2', 'S bend', 'S obl 1', 'S obl 2', 'S obl 3', 'S obl 4', 'sweep bend']
    [reseed-as-is] ok cost 1321803.6 evals 1644 (122s)
    reseed K iv7 as-is: cost 1321803.6 score (2, 7.090934648781331, 94.66239201503927) fails ['separation', 'corners']
    [win/t0/b+30/-+-+] timeout cost 327160.3 evals 935 (60s)
    [reseed-kabsch] ok cost 205975.3 evals 1019 (76s)
    reseed K iv7 kabsch: cost 205975.3 score (2, 10.43217761739908, 42.00068172040453) fails ['curv-oscillation', 'corners']
  RESEED result for K: kept score (1, 6.675096428501832, 42.18081297674688) (old (1, 6.675096428501832, 42.18081297674688))
  SECTION K DONE: data rms 42.18081297674688 (p95 77.53820068850561, max 83.98104899564474) gate <= 6.0: FAIL; cost 337668.6; 1507s
  METRICS {"section": "K", "cost": 337668.6, "blocks": {"pt": 216124.4, "slide": 93470.85, "anchor": 13.5, "cov": 9088.07, "ou": 0.0, "face": 0.0, "seen": 601.22, "overlap": 0.0, "bend": 0.0, "lam": 71.04, "xing": 0.0, "fixed1": 15259.58, "loopface": 3039.91}, "data_own": {"n": 264, "rms": 42.18081297674688, "p95": 77.53820068850561, "max": 83.98104899564474}, "ou": {"pairs": 0, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 0}, "tags": ["tilt+25", "-+", "c+"], "realism": {"section": "K", "roll_overlap_min_gap": 74.670887130462, "crossings": 0, "sep_violations": 0, "min_fold_rho_over_W": 0.30000001964942036, "curv_oscillations": 0, "corners": 5, "outline": {"bottomk": {"mean_px": 6.675096428501832, "max_px": 25.314984164736757, "n": 150}}, "fails": ["corners"]}, "gate_rms": 6.0, "gate": "FAIL", "rolls": [{"name": "bottom-K fold 1", "tau": 1179.4637448339, "beta_deg": 106.94311210929257, "rho_css": 15.671438335087151, "rho_over_W": 0.3000493571085607, "phi_deg": -136.8781078210571}, {"name": "bottom-K curl", "tau": 1233.0170714494266, "beta_deg": 69.28016819623632, "rho_css": 15.671694953975555, "rho_over_W": 0.30005427039927723, "phi_deg": 101.74574876775729}, {"name": "bottom-K fold 2", "tau": 1314.3649746199696, "beta_deg": 115.48023016420599, "rho_css": 15.668861462548652, "rho_over_W": 0.30000001964942036, "phi_deg": 172.97836118896484}, {"name": "k_return bend", "tau": 1368.678698714899, "beta_deg": 84.9012427370717, "rho_css": 26.236506768586914, "rho_over_W": 0.5023308531332152, "phi_deg": -68.75493406413129}], "lam": {"7": 2.458154268548787, "8": 4.735308069862421}, "seconds": 1507.112622976303}
    [win/t0/b-30/-+-+] timeout cost 242682.3 evals 950 (60s)
    [tilt+25/wrap twist 2/b45/p3.14] timeout cost 208226.9 evals 6611 (240s)
    [win/t0/b+0/-+-+] timeout cost 251905.5 evals 1032 (60s)
    [win/t0/b+30/+-+-] timeout cost 291683.0 evals 1036 (60s)
    [win/t0/b+0/+-+-] timeout cost 294360.2 evals 1034 (60s)
    [win/t0/b-30/+-+-] timeout cost 404827.0 evals 1023 (60s)
  window Sw1 best cost 242682.3 tags ['t0', 'b-30', '-+-+'] data 29.45081287454737
    [tilt+25/wrap twist 2/b90/p3.14] timeout cost 573414.5 evals 7222 (240s)
    [reseed-as-is] ok cost 21937.9 evals 1842 (106s)
    reseed S iv1 as-is: cost 21937.9 score (5, 34.002731353890034, 19.489569409582877) fails ['crossing', 'separation', 'curv-oscillation', 'corners', 'roll-overlap']
## section P: rings 1102..1298 (data 1087..1298), intervals [13, 14, 15], rolls ['top-K front bend a', 'top-K front bend', 'top-K front bend c', 'top-K tip fold', 'end bend'], free 29
## section A: rings 388..658 (data 373..673), intervals [4, 5, 6], rolls ['left-leg bend 1', 'left-leg bend 2', 'apex fold', 'right-leg bend 1', 'right-leg bend 2'], free 29
  A seeded from paper3: cost0 193925.2, data {'n': 429, 'rms': 28.467606603545768, 'p95': 68.23707002899238, 'max': 84.0377667685551}
  7 starts; best init costs [(['seed-v1'], 34066753), (['tilt+25', 'end bend', 'b90', 'p-0.50'], 2294515), (['tilt+25', 'end bend', 'b90', 'p-1.00'], 2294518), (['tilt+0', 'end bend', 'b90', 'p-0.50'], 3085839), (['tilt+0', 'end bend', 'b90', 'p-1.00'], 3085842), (['tilt-25', 'end bend', 'b135', 'p0.50'], 3140834), (['tilt-25', 'end bend', 'b135', 'p1.00'], 3140846)]
    [tilt-25/wrap twist 2/b45/p-1.57] timeout cost 61441.3 evals 6909 (240s)
    [refine] ok cost 59632.2 evals 2665 (95s)
  v1-rules result: data 26.59 px, realism fails ['crossing', 'separation', 'corners', 'roll-overlap'], outline {'wrap': {'mean_px': 2.8865628334741253, 'max_px': 7.810249675906654, 'n': 51}}
  RESEED pass for X: old score (fails, outline, rms) = (4, 2.8865628334741253, 26.589288924740618)
  window fit Xw11: rings 896..1081, rolls ['crossbar bend 2', 'wrap curl', 'wrap twist 1', 'wrap twist 2', 'middle-layer bend']
    [reseed-kabsch] timeout cost 16291.5 evals 4972 (300s)
    reseed S iv1 kabsch: cost 16291.5 score (4, 2.8933228496688534, 10.474661848590474) fails ['crossing', 'curv-oscillation', 'corners', 'roll-overlap']
  RESEED result for S: kept score (4, 2.8933228496688534, 10.474661848590474) (old (5, 19.86059860038254, 9.366305677274527))
  SECTION S DONE: data rms 10.474661848590474 (p95 26.025174165839893, max 27.36087030824522) gate <= 6.0: FAIL; cost 16291.5; 2181s
  METRICS {"section": "S", "cost": 16291.5, "blocks": {"pt": 11489.16, "slide": 4004.73, "anchor": 24.55, "cov": 706.12, "ou": 0.0, "overlap": 31.48, "bend": 0.0, "lam": 35.35, "xing": 0.07}, "data_own": {"n": 146, "rms": 10.474661848590474, "p95": 26.025174165839893, "max": 27.36087030824522}, "ou": {"pairs": 0, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 0}, "tags": ["reseed", "kabsch"], "realism": {"section": "S", "roll_overlap_min_gap": -0.1815063168069173, "crossings": 68, "sep_violations": 0, "min_fold_rho_over_W": 0.30000000000000004, "curv_oscillations": 1, "corners": 2, "outline": {"s": {"mean_px": 2.8933228496688534, "max_px": 11.173900194730722, "n": 112}}, "fails": ["crossing", "curv-oscillation", "corners", "roll-overlap"]}, "gate_rms": 6.0, "gate": "FAIL", "rolls": [{"name": "S bend", "tau": 148.76574569514938, "beta_deg": 168.53977097077998, "rho_css": 26.148092210886084, "rho_over_W": 0.5006380454514995, "phi_deg": -39.71453916208001}, {"name": "S obl 1", "tau": 268.19922947824006, "beta_deg": 32.8284374124134, "rho_css": 15.66886043626857, "rho_over_W": 0.30000000000000004, "phi_deg": -55.6149077001715}, {"name": "S obl 2", "tau": 292.3754231355835, "beta_deg": 77.78981260370523, "rho_css": 15.724384080306926, "rho_over_W": 0.30106306985624504, "phi_deg": 52.99416518625728}, {"name": "S obl 3", "tau": 303.25430742306634, "beta_deg": 72.1696914715818, "rho_css": 28.47903691261165, "rho_over_W": 0.5452669074776775, "phi_deg": -13.101969331330913}, {"name": "S obl 4", "tau": 372.91651260968285, "beta_deg": 164.1315297705322, "rho_css": 15.66886043626857, "rho_over_W": 0.30000000000000004, "phi_deg": 108.00254438216017}], "lam": {"1": 2.593469251353994}, "seconds": 2181.42663025856}
    [win/t25/wrap twist 2/b45/p-1.57] timeout cost 827480.4 evals 1860 (60s)
    [win/t25/wrap twist 2/b45/p-1.00] timeout cost 810076.7 evals 2025 (60s)
    [win/t-25/wrap twist 2/b45/p-1.00] timeout cost 834277.9 evals 1959 (60s)
    [win/t-25/wrap twist 2/b45/p-1.57] timeout cost 784330.3 evals 2007 (60s)
    [win/t0/wrap twist 2/b45/p0.50] timeout cost 851696.3 evals 2020 (60s)
    [win/t0/wrap twist 2/b45/p0.25] timeout cost 892918.1 evals 2019 (60s)
  window Xw11 best cost 784330.3 tags ['t-25', 'wrap twist 2', 'b45', 'p-1.57'] data 46.572779536432655
    [reseed-as-is] ok cost 55640.4 evals 3125 (95s)
    reseed X iv11 as-is: cost 55640.4 score (4, 5.882227857735471, 26.38363876233117) fails ['crossing', 'separation', 'corners', 'roll-overlap']
## section A: rings 388..658 (data 373..673), intervals [4, 5, 6], rolls ['left-leg bend 1', 'left-leg bend 2', 'apex fold', 'right-leg bend 1', 'right-leg bend 2'], free 29
## section P: rings 1102..1298 (data 1087..1298), intervals [13, 14, 15], rolls ['top-K front bend a', 'top-K front bend', 'top-K front bend c', 'top-K tip fold', 'end bend'], free 29
  A seeded from paper3: cost0 193923.9, data {'n': 429, 'rms': 28.467606603545768, 'p95': 68.23707002899238, 'max': 84.0377667685551}
## section S: rings 132..225 (data 117..240), intervals [1], rolls ['S bend', 'S obl 1', 'S obl 2', 'S obl 3', 'S obl 4'], free 27
## section K: rings 659..813 (data 644..828), intervals [7, 8], rolls ['bottom-K fold 1', 'bottom-K curl', 'bottom-K fold 2', 'k_return bend'], free 24
  7 starts; best init costs [(['seed-v1'], 34066753), (['tilt+25', 'end bend', 'b90', 'p-0.50'], 2294515), (['tilt+25', 'end bend', 'b90', 'p-1.00'], 2294518), (['tilt+0', 'end bend', 'b90', 'p-0.50'], 3085839), (['tilt+0', 'end bend', 'b90', 'p-1.00'], 3085842), (['tilt-25', 'end bend', 'b135', 'p0.50'], 3140834), (['tilt-25', 'end bend', 'b135', 'p1.00'], 3140846)]
  12 starts; best init costs [(['tilt+25', '-+', 'c-'], 26369237), (['tilt+25', '-+', 'c+'], 28002234), (['tilt-25', '-+', 'c-'], 28665431), (['tilt+0', '-+', 'c-'], 29224996), (['tilt+0', '-+', 'c+'], 32006363), (['tilt-25', '-+', 'c+'], 36814462), (['tilt-25', '+-', 'c+'], 69910196), (['tilt+25', '+-', 'c+'], 77718797)]
  18 starts; best init costs [(['tilt+0', 'b+30', '-+-+'], 5782329), (['tilt+0', 'b-30', '-+-+'], 7871599), (['tilt+0', 'b+0', '-+-+'], 7946094), (['tilt+0', 'b+30', '+-+-'], 32374291), (['tilt+0', 'b+0', '+-+-'], 33844857), (['tilt+0', 'b-30', '+-+-'], 34075388), (['tilt+25', 'b+30', '-+-+'], 61310637), (['tilt-25', 'b-30', '+-+-'], 68043952)]
## section S: rings 132..225 (data 117..240), intervals [1], rolls ['S bend', 'S obl 1', 'S obl 2', 'S obl 3', 'S obl 4'], free 27
## section K: rings 659..813 (data 644..828), intervals [7, 8], rolls ['bottom-K fold 1', 'bottom-K curl', 'bottom-K fold 2', 'k_return bend'], free 24
## section P: rings 1102..1298 (data 1087..1298), intervals [13, 14, 15], rolls ['top-K front bend a', 'top-K front bend', 'top-K front bend c', 'top-K tip fold', 'end bend'], free 29
## section A: rings 388..658 (data 373..673), intervals [4, 5, 6], rolls ['left-leg bend 1', 'left-leg bend 2', 'apex fold', 'right-leg bend 1', 'right-leg bend 2'], free 29
  A seeded from paper3: cost0 193931.9, data {'n': 429, 'rms': 28.467606603545768, 'p95': 68.23707002899238, 'max': 84.0377667685551}
  12 starts; best init costs [(['tilt+25', '-+', 'c-'], 26369237), (['tilt+25', '-+', 'c+'], 28002234), (['tilt-25', '-+', 'c-'], 28665431), (['tilt+0', '-+', 'c-'], 29224996), (['tilt+0', '-+', 'c+'], 32006363), (['tilt-25', '-+', 'c+'], 36814462), (['tilt-25', '+-', 'c+'], 69910196), (['tilt+25', '+-', 'c+'], 77718797)]
  18 starts; best init costs [(['tilt+0', 'b+30', '-+-+'], 5894545), (['tilt+0', 'b+0', '-+-+'], 8555365), (['tilt+0', 'b-30', '-+-+'], 8991484), (['tilt+0', 'b+30', '+-+-'], 33514049), (['tilt+0', 'b+0', '+-+-'], 37238427), (['tilt+0', 'b-30', '+-+-'], 40309718), (['tilt+25', 'b+30', '-+-+'], 61317269), (['tilt-25', 'b-30', '+-+-'], 68047534)]
  7 starts; best init costs [(['seed-v1'], 34066753), (['tilt+25', 'end bend', 'b90', 'p-0.50'], 2294515), (['tilt+25', 'end bend', 'b90', 'p-1.00'], 2294518), (['tilt+0', 'end bend', 'b90', 'p-0.50'], 3085839), (['tilt+0', 'end bend', 'b90', 'p-1.00'], 3085842), (['tilt-25', 'end bend', 'b135', 'p0.50'], 3140834), (['tilt-25', 'end bend', 'b135', 'p1.00'], 3140846)]
    [tilt+25/-+/c-] ok cost 5107788.5 evals 519 (46s)
    [seed-v1] ok cost 11612.3 evals 1956 (48s)
    [tilt+0/b+30/-+-+] ok cost 178225.2 evals 861 (66s)
    [paper3] ok cost 3580.0 evals 2257 (81s)
    [tilt+25/end bend/b90/p-0.50] ok cost 439293.3 evals 1318 (34s)
    [tilt+25/end bend/b90/p-1.00] ok cost 429966.6 evals 1016 (26s)
    [tilt+0/end bend/b90/p-0.50] ok cost 2207095.5 evals 527 (14s)
    [refine] ok cost 11355.4 evals 1259 (38s)
  v1-rules result: data 11.67 px, realism fails ['separation', 'curv-oscillation', 'corners'], outline {'topk': {'mean_px': 2.0386370471917283, 'max_px': 6.561882355638769, 'n': 17}}
  RESEED pass for P: old score (fails, outline, rms) = (3, 2.0386370471917283, 11.670831918246469)
  window fit Pw14: rings 1126..1245, rolls ['top-K front bend', 'top-K front bend c', 'top-K tip fold', 'end bend']
    [tilt+0/b+0/-+-+] ok cost 142839.3 evals 1253 (110s)
    [win/t25/top-K tip fold/b90/p3.14] ok cost 255506.3 evals 547 (24s)
    [reseed-kabsch] timeout cost 75073.9 evals 5974 (300s)
    reseed X iv11 kabsch: cost 75073.9 score (4, 7.030066000110108, 30.692361509392043) fails ['crossing', 'separation', 'corners', 'roll-overlap']
  RESEED result for X: kept score (4, 2.8865628334741253, 26.589288924740618) (old (4, 2.8865628334741253, 26.589288924740618))
REVIEW X_v2 ['farleft', 'wrap', 'junction']
    [win/t25/top-K tip fold/b90/p1.00] timeout cost 311339.4 evals 1550 (60s)
REVIEW X ['farleft', 'wrap', 'junction']
  SECTION X DONE: data rms 26.589288924740618 (p95 43.80260021975154, max 130.62567105796518) gate <= 6.0: FAIL; cost 59632.2; 1602s
  METRICS {"section": "X", "cost": 59632.2, "blocks": {"pt": 52233.14, "slide": 3328.22, "anchor": 15.21, "cov": 126.24, "ou": 0.0, "face": 0.0, "seen": 609.08, "overlap": 4.23, "bend": 0.0, "lam": 110.8, "prior": 146.88, "xing": 0.09, "visw": 354.57, "twist": 2703.75}, "data_own": {"n": 286, "rms": 26.589288924740618, "p95": 43.80260021975154, "max": 130.62567105796518}, "ou": {"pairs": 0, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 0}, "tags": ["tilt-25", "wrap twist 2", "b45", "p-1.57"], "realism": {"section": "X", "roll_overlap_min_gap": -0.05291687455769534, "crossings": 201, "sep_violations": 21, "min_fold_rho_over_W": 0.30391426475977595, "curv_oscillations": 0, "corners": 2, "outline": {"wrap": {"mean_px": 2.8865628334741253, "max_px": 7.810249675906654, "n": 51}}, "fails": ["crossing", "separation", "corners", "roll-overlap"]}, "gate_rms": 6.0, "gate": "FAIL", "rolls": [{"name": "crossbar bend 1", "tau": 1535.2571029947821, "beta_deg": 82.98446073768474, "rho_css": 26.13237396278821, "rho_over_W": 0.5003370998627286, "phi_deg": 68.75156596974541}, {"name": "crossbar bend 2", "tau": 1547.3841765199907, "beta_deg": 30.44296705064023, "rho_css": 26.11476739378112, "rho_over_W": 0.5000000000000032, "phi_deg": 68.75479029989805}, {"name": "wrap curl", "tau": 1616.4504162449564, "beta_deg": 67.97343330182821, "rho_css": 110.1441204204581, "rho_over_W": 2.1088474340898813, "phi_deg": -98.66605472938116}, {"name": "wrap twist 1", "tau": 1705.432473701627, "beta_deg": 42.002990766227384, "rho_css": 15.873300663707013, "rho_over_W": 0.30391426475977595, "phi_deg": -128.46085255542866}, {"name": "wrap twist 2", "tau": 1760.7245305976826, "beta_deg": 140.39916997812946, "rho_css": 53.43929843825579, "rho_over_W": 1.0231624435410822, "phi_deg": -160.05609100361295}], "lam": {"10": 5.9999981546548256, "11": 2.0565373141451198}, "seconds": 1601.886598110199}
    [tilt+0/b-30/-+-+] ok cost 195757.3 evals 1037 (132s)
    [tilt+25/-+/c+] ok cost 837103.7 evals 2195 (264s)
    [win/t0/top-K tip fold/b90/p1.00] timeout cost 295320.4 evals 2000 (60s)
    [tilt+0/b+30/+-+-] ok cost 148600.0 evals 663 (61s)
    [win/t0/top-K tip fold/b90/p3.14] timeout cost 218132.2 evals 2365 (60s)
    [refine] timeout cost 3344.4 evals 6265 (300s)
  v1-rules result: data 5.58 px, realism fails ['corners'], outline {'apex': {'mean_px': 0.8068016063475186, 'max_px': 1.851027332241756, 'n': 42}}
REVIEW A ['apex', 'farleft', 'bottomk', 'wrap', 'junction', 'endstrand']
  SECTION A DONE: data rms 5.579285304205835 (p95 9.33771305874946, max 19.267675559200523) gate <= 6.0: PASS; cost 3344.4; 381s
  METRICS {"section": "A", "cost": 3344.4, "blocks": {"pt": 2559.96, "slide": 778.56, "anchor": 0.46, "cov": 4.72, "ou": 0.0, "weave": 0.0, "face": 0.0, "seen": 0.0, "overlap": 0.0, "bend": 0.0, "lam": 0.19, "xing": 0.0, "ovm": 0.49, "smooth": 0.0}, "data_own": {"n": 429, "rms": 5.579285304205835, "p95": 9.33771305874946, "max": 19.267675559200523}, "ou": {"pairs": 0, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 0}, "tags": ["paper3"], "realism": {"section": "A", "roll_overlap_min_gap": 0.9786588175006727, "crossings": 0, "sep_violations": 0, "min_fold_rho_over_W": 0.7385886512217039, "curv_oscillations": 0, "corners": 2, "outline": {"apex": {"mean_px": 0.8068016063475186, "max_px": 1.851027332241756, "n": 42}}, "fails": ["corners"]}, "gate_rms": 6.0, "gate": "PASS", "rolls": [{"name": "left-leg bend 1", "tau": 794.3233961170863, "beta_deg": 162.76777721036171, "rho_css": 39.77498467523728, "rho_over_W": 0.7615420056299145, "phi_deg": 2.1572302295029178}, {"name": "left-leg bend 2", "tau": 882.0686018143883, "beta_deg": 83.47409898692372, "rho_css": 28.09047841661285, "rho_over_W": 0.5378274673681835, "phi_deg": -68.75493541569877}, {"name": "apex fold", "tau": 925.7771945228518, "beta_deg": 97.35709475154815, "rho_css": 38.5761416526824, "rho_over_W": 0.7385886512217039, "phi_deg": -42.56871155344817}, {"name": "right-leg bend 1", "tau": 980.0532025560593, "beta_deg": 41.701258371690734, "rho_css": 26.11476739378095, "rho_over_W": 0.5000000000000001, "phi_deg": -68.75493541569877}, {"name": "right-leg bend 2", "tau": 1029.5654338061277, "beta_deg": 40.62765230141032, "rho_css": 26.11476739378095, "rho_over_W": 0.5000000000000001, "phi_deg": -20.58405789288898}], "lam": {"4": 1.0815906243273326, "5": 1.1528455931810586, "6": 0.9751055667212051}, "seconds": 381.2768130302429}
    [refine] ok cost 141738.5 evals 438 (38s)
  v1-rules result: data 22.59 px, realism fails ['separation', 'corners'], outline {'s': {'mean_px': 18.540321928420987, 'max_px': 31.64209463445141, 'n': 112}}
  RESEED pass for S: old score (fails, outline, rms) = (2, 18.540321928420987, 22.587564132679976)
  window fit Sw1: rings 117..240, rolls ['tail bend 2', 'S bend', 'S obl 1', 'S obl 2', 'S obl 3', 'S obl 4', 'sweep bend']
    [win/t-25/top-K tip fold/b90/p3.14] timeout cost 277911.4 evals 2612 (60s)
    [win/t0/b+30/-+-+] timeout cost 191826.8 evals 744 (60s)
    [win/t-25/top-K tip fold/b90/p1.57] timeout cost 297528.7 evals 2822 (60s)
  window Pw14 best cost 218132.2 tags ['t0', 'top-K tip fold', 'b90', 'p3.14'] data 31.366482094344438
    [win/t0/b+0/-+-+] timeout cost 131785.8 evals 768 (60s)
    [win/t0/b-30/-+-+] timeout cost 918839.1 evals 762 (60s)
    [win/t0/b+30/+-+-] timeout cost 205899.4 evals 762 (60s)
    [tilt-25/-+/c-] timeout cost 422611.5 evals 3835 (360s)
## section X: rings 859..1066 (data 844..1081), intervals [10, 11], rolls ['crossbar bend 1', 'crossbar bend 2', 'wrap curl', 'wrap twist 1', 'wrap twist 2'], free 28
  72 starts; best init costs [(['tilt+25', 'db20', 'c+1', 'tw+1+1'], 4528802), (['tilt-25', 'db0', 'c+1', 'tw-1-1'], 4660206), (['tilt+0', 'db20', 'c+1', 'tw-1+1'], 4942774), (['tilt+25', 'db20', 'c+1', 'tw+1-1'], 4992270), (['tilt+0', 'db20', 'c+1', 'tw-1-1'], 4993392), (['tilt+0', 'db20', 'c+1', 'tw+1+1'], 5134688), (['tilt-25', 'db20', 'c+1', 'tw-1-1'], 5367081), (['tilt-25', 'db20', 'c+1', 'tw+1+1'], 5464680)]
    [win/t0/b+0/+-+-] timeout cost 861666.5 evals 686 (60s)
    [tilt+25/db20/c+1/tw+1+1] ok cost 2105079.2 evals 891 (50s)
    [win/t0/b-30/+-+-] timeout cost 796040.3 evals 649 (60s)
  window Sw1 best cost 131785.8 tags ['t0', 'b+0', '-+-+'] data 29.87344371660604
    [tilt-25/db0/c+1/tw-1-1] ok cost 2693467.4 evals 1387 (81s)
    [reseed-as-is] ok cost 79357.5 evals 12365 (330s)
    reseed P iv14 as-is: cost 79357.5 score (2, 7.295260168989168, 32.2015996437002) fails ['separation', 'corners']
    [reseed-as-is] ok cost 172956.3 evals 809 (75s)
    reseed S iv1 as-is: cost 172956.3 score (2, 45.677818172190314, 37.37161972259112) fails ['separation', 'corners']
    [reseed-kabsch] ok cost 351829.4 evals 798 (23s)
    reseed P iv14 kabsch: cost 351829.4 score (2, 2.8189855273861593, 62.91448576454343) fails ['separation', 'corners']
  RESEED result for P: kept score (2, 2.8189855273861593, 62.91448576454343) (old (3, 2.0386370471917283, 11.670831918246469))
REVIEW P_v2 ['bottomk', 'junction', 'topk', 'endstrand']
REVIEW P ['bottomk', 'junction', 'topk', 'endstrand']
  SECTION P DONE: data rms 62.91448576454343 (p95 100.78592789798171, max 124.9603619145009) gate <= 6.0: FAIL; cost 351829.4; 858s
  METRICS {"section": "P", "cost": 351829.4, "blocks": {"pt": 220636.32, "slide": 47533.93, "anchor": 21.07, "cov": 737.2, "ou": 0.0, "face": 7933.65, "seen": 987.88, "overlap": 0.0, "bend": 0.0, "lam": 74.41, "prior": 46.15, "xing": 103.14, "ovm": 0.0, "smooth": 2354.42, "hidend-1": 50312.01, "hidend1": 21089.17}, "data_own": {"n": 271, "rms": 62.91448576454343, "p95": 100.78592789798171, "max": 124.9603619145009}, "ou": {"pairs": 10, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 0}, "tags": ["reseed", "kabsch"], "realism": {"section": "P", "roll_overlap_min_gap": 27.41810598691518, "crossings": 0, "sep_violations": 99, "min_fold_rho_over_W": 0.9992469050461485, "curv_oscillations": 0, "corners": 2, "outline": {"topk": {"mean_px": 2.8189855273861593, "max_px": 5.385164807134504, "n": 17}}, "fails": ["separation", "corners"]}, "gate_rms": 6.0, "gate": "FAIL", "rolls": [{"name": "top-K front bend a", "tau": 1930.9311071921936, "beta_deg": 63.17170652349663, "rho_css": 214.21876309764647, "rho_over_W": 4.101487098611133, "phi_deg": 16.48603675094366}, {"name": "top-K front bend", "tau": 1983.7206176803795, "beta_deg": 102.54655452391823, "rho_css": 148.64727183691318, "rho_over_W": 2.8460385956244916, "phi_deg": 23.983368808342934}, {"name": "top-K front bend c", "tau": 2048.672006288374, "beta_deg": 103.84849692647298, "rho_css": 129.33576783239388, "rho_over_W": 2.476295612405001, "phi_deg": 68.27122040802323}, {"name": "top-K tip fold", "tau": 2140.397138329511, "beta_deg": 78.48474351075065, "rho_css": 52.190200988471375, "rho_over_W": 0.9992469050461485, "phi_deg": 153.51539642827365}, {"name": "end bend", "tau": 2215.2046529201984, "beta_deg": 13.360944567442536, "rho_css": 26.13625567619421, "rho_over_W": 0.500411420138063, "phi_deg": -68.29052155177656}], "lam": {"13": 3.120704576245436, "14": 3.8216784523000915, "15": 3.1448200726121667}, "seconds": 857.9219868183136}
    [tilt+0/db20/c+1/tw-1+1] ok cost 1439222.1 evals 771 (45s)
    [tilt+0/-+/c-] ok cost 750981.5 evals 1850 (196s)
    [reseed-kabsch] ok cost 73472.0 evals 639 (56s)
    reseed S iv1 kabsch: cost 73472.0 score (2, 6.626506401422454, 19.073546913636175) fails ['separation', 'corners']
  RESEED result for S: kept score (2, 6.626506401422454, 19.073546913636175) (old (2, 18.540321928420987, 22.587564132679976))
REVIEW S_v2 ['scurve', 'bottomk', 'endstrand']
REVIEW S ['scurve', 'bottomk', 'endstrand']
  SECTION S DONE: data rms 19.073546913636175 (p95 35.6711908027985, max 38.64555400418801) gate <= 6.0: FAIL; cost 73472.0; 907s
  METRICS {"section": "S", "cost": 73472.0, "blocks": {"pt": 58080.17, "slide": 13278.71, "anchor": 42.36, "cov": 962.93, "ou": 0.0, "overlap": 0.0, "bend": 0.0, "lam": 29.3, "xing": 0.06, "ovm": 1.4, "smooth": 1077.07}, "data_own": {"n": 146, "rms": 19.073546913636175, "p95": 35.6711908027985, "max": 38.64555400418801}, "ou": {"pairs": 0, "viol_lt_2thk": 0, "viol_lt_thk": 0, "max_shortfall_css": 0.0, "weave_violations": 0}, "tags": ["reseed", "kabsch"], "realism": {"section": "S", "roll_overlap_min_gap": 0.9617514516864674, "crossings": 0, "sep_violations": 12, "min_fold_rho_over_W": 0.30419029118862373, "curv_oscillations": 0, "corners": 5, "outline": {"s": {"mean_px": 6.626506401422454, "max_px": 22.653936584189168, "n": 112}}, "fails": ["separation", "corners"]}, "gate_rms": 6.0, "gate": "FAIL", "rolls": [{"name": "S bend", "tau": 245.31820024425446, "beta_deg": 73.65090247180946, "rho_css": 135.2850051515879, "rho_over_W": 2.590201228133571, "phi_deg": 1.1919639308850478}, {"name": "S obl 1", "tau": 247.36410383687252, "beta_deg": 69.84357971901844, "rho_css": 15.887717395674805, "rho_over_W": 0.30419029118862373, "phi_deg": -28.102751705647645}, {"name": "S obl 2", "tau": 293.6600043732775, "beta_deg": 105.14083613577849, "rho_css": 46.26694830390034, "rho_over_W": 0.8858387977623438, "phi_deg": 45.3565365139137}, {"name": "S obl 3", "tau": 308.06274120595515, "beta_deg": 109.15531600781537, "rho_css": 46.567948493930025, "rho_over_W": 0.8916018242042596, "phi_deg": -23.837665465601663}, {"name": "S obl 4", "tau": 362.74028429305855, "beta_deg": 160.91536302582762, "rho_css": 20.639262338713888, "rho_over_W": 0.39516458307855706, "phi_deg": 107.59878805700664}], "lam": {"1": 2.844613864886974}, "seconds": 906.9399919509888}
    [refine] ok cost 298644.7 evals 1033 (90s)
  v1-rules result: data 32.26 px, realism fails ['corners'], outline {'bottomk': {'mean_px': 21.541649410852983, 'max_px': 61.239114970566945, 'n': 150}}
  RESEED pass for K: old score (fails, outline, rms) = (1, 21.541649410852983, 32.26469723483846)
  window fit Kw7: rings 644..779, rolls ['right-leg bend 2', 'bottom-K fold 1', 'bottom-K curl', 'bottom-K fold 2', 'k_return bend']
