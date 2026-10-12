import sys, json, os
import numpy as np
sys.path.insert(0, "/Users/ashmitkhurana/Development/Personal/portfolio/scripts/curve")
from fit3d import pose_to_world, Basis  # noqa
from scipy.interpolate import BSpline
ZONES = [("S",152,203),("farleft",345,387),("apex",503,537),("bottomK",648,772),("wrap",860,1066),("topK",1089,1264)]
DELTA = float(os.environ.get("WDELTA", "0.003"))
def count(k, delta):
    # hysteresis extrema count of kappa
    n = 0; last = k[0]; direction = 0
    for v in k[1:]:
        if direction >= 0 and v < last - delta:
            if direction == 1: n += 1
            direction = -1; last = v
        elif direction <= 0 and v > last + delta:
            if direction == -1: n += 1
            direction = 1; last = v
        elif (direction == 1 and v > last) or (direction == -1 and v < last) or direction == 0 and False:
            last = v
    return n
def table(pose, K=160):
    rg = json.load(open(pose))["variants"]["phone"]["ruled"]
    L = pose_to_world([r["L"] for r in rg]); R = pose_to_world([r["R"] for r in rg])
    N = len(L); bs = Basis(N, K)
    sp = BSpline(bs.kn, np.eye(K), 3)
    res = {}
    for nm, E in (("L", L), ("R", R)):
        C = bs.fit(E)
        for zn, a, b in ZONES:
            t = np.linspace(a, b, int((b - a) * 8) + 1)
            e1 = sp.derivative(1)(t) @ C; e2 = sp.derivative(2)(t) @ C
            kap = np.linalg.norm(np.cross(e1, e2), axis=1) / np.linalg.norm(e1, axis=1) ** 3
            ds = np.linalg.norm(e1, axis=1) * (t[1] - t[0])
            s = np.r_[0, np.cumsum(ds[1:])]
            dk = np.gradient(kap, s)
            raw = int((np.sign(dk[1:]) * np.sign(dk[:-1]) < 0).sum())
            res[(zn, nm)] = (count(kap, DELTA) / s[-1] * 100, raw / s[-1] * 100, s[-1])
    return res
if __name__ == "__main__":
    for pose in sys.argv[1:]:
        r = table(pose)
        print(pose)
        for zn, a, b in ZONES:
            l, rr = r[(zn, "L")], r[(zn, "R")]
            print("  %-8s hyst L %.2f R %.2f /100px   raw L %.1f R %.1f   (arclen %.0f px)" % (zn, l[0], rr[0], l[1], rr[1], l[2]))
