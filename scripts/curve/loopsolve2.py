#!/usr/bin/env python3
"""Round loops that turn THROUGH DEPTH (see loopsolve.py for the arc). Extra unknown: the entry strand's slope into depth
(alpha). The loop plane is pushed towards containing the depth axis (|sin psi| small) so the band shows its broad face
on both sides of the loop and rolls only at its round end."""
import math
import numpy as np
from scipy.optimize import least_squares
from loopsolve import arc, K, show


def solve(A0, sdir, zA, R, out_dir, out_pt, wpsi, x0, lo, hi, zmax=None):
    A0 = np.array([A0[0] / K, A0[1] / K, zA]); sdir = np.array(sdir, float); sdir /= np.linalg.norm(sdir)
    od = np.array(out_dir, float); od /= np.linalg.norm(od); op = np.array(out_pt, float) / K

    def geo(v):
        s, al, psi, Phi = v
        te = np.array([sdir[0] * math.cos(al), sdir[1] * math.cos(al), -math.sin(al)])
        E = A0 + s * np.array([sdir[0], sdir[1], 0.0])  # the strand stays at its depth down to E ...
        E[2] = zA
        return te, E

    def res(v):
        te, E = geo(v)
        pts, tx = arc(E, te, R, v[2], v[3])
        X = pts[-1]
        txs = tx[:2] / max(np.linalg.norm(tx[:2]), 1e-9)
        r = [(txs[0] * od[1] - txs[1] * od[0]) * 3, (1 - txs @ od) * 2,
             ((X[:2] - op)[0] * od[1] - (X[:2] - op)[1] * od[0]) / 10.0,
             wpsi * math.sin(v[2])]
        if zmax is not None:
            r.append(max(0.0, max(p[2] for p in pts) - zmax) / 5.0)
        return r

    sol = least_squares(res, x0, bounds=(lo, hi))
    te, E = geo(sol.x)
    pts, tx = arc(E, te, R, sol.x[2], sol.x[3])
    return sol, pts, tx


if __name__ == "__main__":
    W = 51.0
    for R in (0.8 * W, 1.0 * W):
        for wpsi in (1.0, 0.3):
            sol, pts, tx = solve((468, 900), (0.29, 0.96), 37.0, R, (-0.692, -0.722), (555, 935), wpsi,
                                 x0=[90, 0.6, -0.3, math.radians(200)], lo=[0, 0, -math.pi, math.radians(140)], hi=[220, 1.4, math.pi, math.radians(270)], zmax=37.0)
            show("bottom K R=%.0f wpsi=%.1f alpha=%.0fdeg" % (R, wpsi, math.degrees(sol.x[1])), sol, pts, tx)
    for R in (0.7 * W, 0.9 * W):
        for wpsi in (1.0, 0.3):
            sol, pts, tx = solve((545, 867), (0.884, -0.467), 12.0, R, (-0.585, 0.811), (535, 1130), wpsi,
                                 x0=[80, 0.5, -0.3, math.radians(200)], lo=[0, 0, -math.pi, math.radians(140)], hi=[200, 1.4, math.pi, math.radians(270)], zmax=12.0)
            show("top K R=%.0f wpsi=%.1f alpha=%.0fdeg" % (R, wpsi, math.degrees(sol.x[1])), sol, pts, tx)
