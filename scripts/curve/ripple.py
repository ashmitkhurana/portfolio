#!/usr/bin/env python
"""Ripple metric: |second difference of the unit surface normal N| per world px^2 along the strip.

  scripts/mockup/.venv/bin/python scripts/curve/ripple.py <pose.json> <dump.json> [K=160]

fit: a least-squares cubic B-spline (K ctrl pts) is fitted to the pose's ring centres and rulings, N = unit(T x b) is sampled at 4N
dense points (as fit3d's report); engine: N and c of consecutive engine rings in dump.json. Prints max / p99 / median.
"""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fit3d import pose_to_world, Basis, unit  # noqa: E402
from scipy.interpolate import BSpline  # noqa: E402


def rip(Nn, c):
    ds = 0.5 * (np.linalg.norm(c[2:] - c[1:-1], axis=1) + np.linalg.norm(c[1:-1] - c[:-2], axis=1))
    r = np.linalg.norm(Nn[2:] - 2 * Nn[1:-1] + Nn[:-2], axis=1) / np.maximum(ds, 1e-6) ** 2
    return r


def stat(r):
    return "max %.3e  p99 %.3e  median %.3e" % (r.max(), np.percentile(r, 99), np.median(r))


if __name__ == "__main__":
    pose, dump = sys.argv[1], sys.argv[2]
    K = int(sys.argv[3]) if len(sys.argv) > 3 else 160
    rg = json.load(open(pose))["variants"]["phone"]["ruled"]
    L = pose_to_world([r["L"] for r in rg]); R = pose_to_world([r["R"] for r in rg])
    N = len(L)
    bs = Basis(N, K)
    C = bs.fit((L + R) / 2); G = bs.fit(unit(R - L))
    td = np.linspace(0, N - 1, 4 * N)
    sp = BSpline(bs.kn, np.eye(K), 3)
    cd = sp(td) @ C; Td = unit(sp.derivative(1)(td) @ C); bd = unit(sp(td) @ G)
    rf = rip(unit(np.cross(Td, bd)), cd)
    print("fit (dense, K=%d): " % K + stat(rf))
    REG = {"sweep": (194, 354), "topK": (1015, 1177)}
    for nm, (a0, a1) in REG.items():
        m = (td[1:-1] >= a0) & (td[1:-1] <= a1)
        print("   fit %-6s pose %d..%d: p95 %.3e  max %.3e  median %.3e" % (nm, a0, a1, np.percentile(rf[m], 95), rf[m].max(), np.median(rf[m])))
    D = json.load(open(dump))
    c = np.array(D["c"]); Ne = np.array(D["N"])
    re_ = rip(Ne, c)
    print("engine (rings):    " + stat(re_))
    if len(sys.argv) > 4:
        import csv
        pr = np.array([int(r["pose_ring"]) for r in csv.DictReader(open(sys.argv[4]))])[1:-1]
        for nm, (a0, a1) in REG.items():
            m = (pr >= a0) & (pr <= a1)
            print("   engine %-6s pose %d..%d: p95 %.3e  max %.3e  median %.3e" % (nm, a0, a1, np.percentile(re_[m], 95), re_[m].max(), np.median(re_[m])))
