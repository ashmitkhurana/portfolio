"""Constant-ruling (generalised cylinder) fit: the 2D offset d such that polyline L + d/2 matches polyline R - d/2."""
import sys
import numpy as np
from scipy.optimize import minimize


def pt_seg_dist(P, A):
    """nearest distance from each point of P (m x 2) to the polyline A (k x 2), point-to-SEGMENT; also the nearest points."""
    P = np.asarray(P, float); A = np.asarray(A, float)
    s0, s1 = A[:-1], A[1:]
    e = s1 - s0
    ee = np.maximum((e * e).sum(1), 1e-12)
    w = P[:, None, :] - s0[None, :, :]
    t = np.clip((w * e[None]).sum(2) / ee[None], 0, 1)
    proj = s0[None] + t[:, :, None] * e[None]
    dist = np.linalg.norm(P[:, None, :] - proj, axis=2)
    j = dist.argmin(1)
    r = np.arange(len(P))
    return dist[r, j], proj[r, j]


def _dists(L, R, d):
    d = np.asarray(d, float)
    A, B = L + d / 2, R - d / 2
    d1, _ = pt_seg_dist(A, B)
    d2, _ = pt_seg_dist(B, A)
    return np.concatenate([d1, d2])


def fit_offset(L, R, d0=None):
    L = np.asarray(L, float); R = np.asarray(R, float)
    if d0 is None:
        d0 = np.median(R - L, axis=0)
    f = lambda d: _dists(L, R, d).mean()
    r = minimize(f, np.asarray(d0, float), method="Nelder-Mead", options=dict(xatol=1e-3, fatol=1e-5, maxiter=600))
    dd = _dists(L, R, r.x)
    return r.x, float(dd.mean()), float(dd.max())


def scan(npz, out_csv, win=40, step=10):
    z = np.load(npz)
    L2, R2 = z["L2"], z["R2"]
    n = len(L2)
    rows = ["a,b,dx,dy,absd,res_mean,res_max"]
    for a in range(0, n - win, step):
        b = a + win
        d, rm, rx = fit_offset(L2[a:b + 1], R2[a:b + 1])
        rows.append("%d,%d,%.2f,%.2f,%.2f,%.3f,%.3f" % (a, b, d[0], d[1], np.hypot(*d), rm, rx))
    open(out_csv, "w").write("\n".join(rows) + "\n")
    print("wrote", out_csv, len(rows) - 1, "windows")


if __name__ == "__main__":
    if len(sys.argv) >= 4 and sys.argv[1] == "scan":
        scan(sys.argv[2], sys.argv[3])
    else:
        print("usage: cylfit.py scan <edges.npz> <out.csv>")
