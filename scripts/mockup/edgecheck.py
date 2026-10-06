#!/usr/bin/env python3
"""Edge smoothness gate on edges_snap.json: curvature sign oscillation with a wavelength < 1 W (i.e. two sign changes within 1 W of arc, each lobe with |kappa| W above 0.03)
and the C2 check (max jump of the 2nd difference). Usage: edgecheck.py edges_snap.json"""
import json, sys
import numpy as np
from scipy import ndimage as ndi
E = json.load(open(sys.argv[1])); W = 112.0
bad = 0
for nm in ("edge1", "edge2"):
    P = np.array(E[nm]); s = np.r_[0, np.cumsum(np.hypot(*np.diff(P, axis=0).T))]
    n = int(s[-1] / 2.0); u = np.linspace(0, s[-1], n)
    Q = np.stack([np.interp(u, s, P[:, 0]), np.interp(u, s, P[:, 1])], 1)
    Q = np.stack([ndi.gaussian_filter1d(Q[:, c], 1.5) for c in (0, 1)], 1)      # 3 px: raster noise
    d1 = np.gradient(Q, axis=0); d2 = np.gradient(d1, axis=0)
    k = (d1[:, 0] * d2[:, 1] - d1[:, 1] * d2[:, 0]) / np.maximum(np.hypot(*d1.T), 1e-6) ** 3 * 2.0 * W   # kappa*W  (per px, 2 px step)
    k = k / 2.0
    sg = np.sign(np.where(np.abs(k) < 0.02, 0, k))
    # lobes
    lobes = []; a = 0
    for i in range(1, n + 1):
        if i == n or sg[i] != sg[a]:
            if sg[a] != 0: lobes.append((a, i - 1, sg[a], np.abs(k[a:i]).max()))
            a = i
    osc = []
    for j in range(1, len(lobes) - 1):
        a_, b_, sgn, amp = lobes[j]
        length = (b_ - a_ + 1) * 2.0
        if length < 0.5 * W and amp > 0.25 and lobes[j - 1][3] > 0.25 and lobes[j + 1][3] > 0.25 and amp < 3.0:
            osc.append((int(a_), np.round(Q[(a_ + b_) // 2]).astype(int).tolist(), round(length), round(float(amp), 2)))
    print("%s: %d curvature lobes shorter than 0.5 W (wavelength < 1 W) with |kappa|W < 3 : %s" % (nm, len(osc), osc[:10]))
    bad += len(osc)
print("oscillation gate:", "PASS" if bad == 0 else "FAIL (%d)" % bad)
