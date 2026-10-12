"""Squeeze a pose's depth around its median, keeping every screen position (pose stores screen x,y + depth z).
usage: zsqueeze.py IN_POSE OUT_POSE S"""
import json, sys
import numpy as np
src, dst, s = sys.argv[1], sys.argv[2], float(sys.argv[3])
P = json.load(open(src))
for vname, var in P["variants"].items():
    rg = var.get("ruled")
    if not rg:
        continue
    zs = np.array([r["L"][2] for r in rg] + [r["R"][2] for r in rg])
    zc = float(np.median(zs))
    for r in rg:
        for k in ("L", "R"):
            r[k][2] = zc + s * (r[k][2] - zc)
    print(vname, "rings", len(rg), "z median", zc, "range before", zs.min(), zs.max(), "after", zc + s * (zs.min() - zc), zc + s * (zs.max() - zc))
json.dump(P, open(dst, "w"))
