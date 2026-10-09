"""usage: curlcheck.py <run> a:b[,a:b...]   (run = folder under docs/ribbon/turns/real/)
Per window: how well the ribbon is a cylinder band (constant ruling, ruling perpendicular to the centreline)."""
import sys, os
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from depth import load


def ang(u, v):
    return np.degrees(np.arccos(np.clip((u * v).sum(-1), -1, 1)))


def main():
    run = sys.argv[1]
    L, R, c, T, b = load(run)
    d1 = np.gradient(c, axis=0)
    d2 = np.gradient(d1, axis=0)
    kap = np.linalg.norm(np.cross(d1, d2), axis=1) / np.maximum(np.linalg.norm(d1, axis=1), 1e-9) ** 3
    for w in sys.argv[2].split(","):
        a, bb = [int(x) for x in w.split(":")]
        s = slice(a, bb + 1)
        mbt = np.abs((b[s] * T[s]).sum(1)).max()
        rt = ang(b[a], b[bb])
        pr = ang(b[a:bb], b[a + 1:bb + 1]).max()
        rmin = 1.0 / max(kap[s].max(), 1e-12)
        S = np.linalg.norm(np.diff(c[a:bb + 1], axis=0), axis=1).sum()
        Q = ang(T[a:bb], T[a + 1:bb + 1]).sum()
        print("curl %d..%d: max|b.T| %.3f  ruling turn (angle b[%d]..b[%d]) %.1f deg  max per-ring ruling turn %.2f deg  min radius %.1f  (arc length %.0f px, centreline turn angle %.1f deg)" % (a, bb, mbt, a, bb, rt, pr, rmin, S, Q))


main()
