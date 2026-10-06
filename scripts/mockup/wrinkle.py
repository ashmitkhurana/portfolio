#!/usr/bin/env python3
"""Wrinkle gate on the RENDERED edge lines (rings.json from ringdump.mjs at the page viewport): projected curvature of both band edges; counts
curvature zig-zags (swing > 0.3 / W) inside any 1.5 W window of arc, outside fold / turn windows (given as arc fractions). Usage: wrinkle.py rings.json"""
import json, sys
import numpy as np
from scipy import ndimage as ndi
d = json.load(open(sys.argv[1])); M = d["M"]; W = d["width"]
tot = 0
for side in (0, 1):
    P = np.array([e[side] for e in d["edges"]], float)
    wpx0 = np.hypot(*(np.array(d['edges'][M // 2][0]) - np.array(d['edges'][M // 2][1])))
    ds0 = np.hypot(*np.diff(P, axis=0).T).mean()
    sg = max(1.5, 0.1 * wpx0 / ds0)      # smooth over 0.1 W of arc: ring-level raster noise is not a wrinkle
    P = np.stack([ndi.gaussian_filter1d(P[:, c], sg) for c in (0, 1)], 1)
    ds = np.hypot(*np.diff(P, axis=0).T)
    s = np.r_[0, np.cumsum(ds)]
    a = np.arctan2(np.gradient(P[:, 1]), np.gradient(P[:, 0])); a = np.unwrap(a)
    kap = np.gradient(a) / np.maximum(np.gradient(s), 1e-3)
    wpx = np.hypot(*(np.array(d["edges"][M // 2][0]) - np.array(d["edges"][M // 2][1])))   # projected width scale
    k = kap * W * (wpx / max(W, 1e-9)) if False else kap * wpx
    # zigzag extrema
    ext = []; dr = 0; last = k[0]; li = 0; h = 0.3
    for i in range(1, M):
        v = k[i]
        if dr >= 0 and v < last - h:
            if dr > 0: ext.append(li)
            dr = -1; last = v; li = i
        elif dr <= 0 and v > last + h:
            if dr < 0: ext.append(li)
            dr = 1; last = v; li = i
        elif (dr >= 0 and v > last) or (dr <= 0 and v < last) or dr == 0:
            if dr == 0: dr = 1 if v > last else -1
            last = v; li = i
    best = 0; at = 0; j = 0; bad = []
    for i in range(len(ext)):
        while s[ext[i]] - s[ext[j]] > 1.5 * wpx: j += 1
        if i - j + 1 > best: best, at = i - j + 1, ext[i]
        if i - j + 1 >= 4: bad.append(ext[i])
    runs = []
    for r in bad:
        if runs and r - runs[-1][1] < 25: runs[-1][1] = r
        else: runs.append([r, r])
    print("  edge %d busy spans (rings, screen):" % side, [(a, b, np.round(P[(a + b) // 2]).astype(int).tolist()) for a, b in runs])
    print("edge %d: curvature zig-zags in the busiest 1.5 W window: %d at ring %d (screen %s)" % (side, best, at, np.round(P[at]).tolist()))
    tot = max(tot, best)
print("wrinkle gate (<= 3 zig-zags per 1.5 W):", "PASS" if tot <= 3 else "FAIL", tot)
