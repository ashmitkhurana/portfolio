#!/usr/bin/env python3
"""Solve a round loop: a circular arc of radius R (css px) in a tilted 3D plane that leaves a straight strand
tangentially (entry point E on it, tangent te) and joins another straight strand tangentially (exit direction and a
point on that strand's screen line). Screen = cutout px / 2.185 (css, y down), depth z css; orthographic design.

The arc: P(phi) = E + R [sin(phi) te + (1 - cos(phi)) n],  n = cos(psi) zp + sin(psi) sp  (unit, perpendicular to te)
Unknowns: s (entry position along the strand), psi (tilt of the loop plane), Phi (sweep).
"""
import math, sys
import numpy as np
from scipy.optimize import least_squares

K = 2.185


def frame(te):
    te = te / np.linalg.norm(te)
    sp = np.array([-te[1], te[0], 0.0]); sp /= np.linalg.norm(sp)
    zp = np.cross(te, sp); zp *= np.sign(zp[2]) if zp[2] != 0 else 1
    return te, sp, zp


def arc(E, te, R, psi, Phi, k=9):
    te, sp, zp = frame(te)
    n = math.cos(psi) * zp + math.sin(psi) * sp
    return [E + R * (math.sin(f) * te + (1 - math.cos(f)) * n) for f in np.linspace(0, Phi, k)], math.cos(Phi) * te + math.sin(Phi) * n


def solve(A0, te, zA, R, out_dir, out_pt, x0, bounds, extra=None):
    """A0: a point on the entry strand (cutout), te: its 3D tangent (screen css, z), out_dir: exit screen direction,
    out_pt: a point on the exit strand's screen line (cutout)."""
    A0 = np.array([A0[0] / K, A0[1] / K, zA]); te = np.array(te, float); te /= np.linalg.norm(te)
    od = np.array(out_dir, float); od /= np.linalg.norm(od); op = np.array(out_pt, float) / K

    def res(v):
        s, psi, Phi = v
        E = A0 + s * te
        pts, tx = arc(E, te, R, psi, Phi)
        X = pts[-1]
        txs = tx[:2] / max(np.linalg.norm(tx[:2]), 1e-9)
        r = [txs[0] * od[1] - txs[1] * od[0], (1 - txs @ od) * 0.5,  # exit screen direction
             ((X[:2] - op)[0] * od[1] - (X[:2] - op)[1] * od[0]) / 20.0]  # exit point on the exit line
        if extra:
            r += extra(E, pts, tx)
        return r

    sol = least_squares(res, x0, bounds=bounds)
    s, psi, Phi = sol.x
    E = A0 + s * te
    pts, tx = arc(E, te, R, psi, Phi)
    return sol, pts, tx


def show(name, sol, pts, tx):
    print("== %s  cost %.2e  s=%.1f psi=%.1fdeg Phi=%.1fdeg" % (name, sol.cost, sol.x[0], math.degrees(sol.x[1]), math.degrees(sol.x[2])))
    for p in pts:
        print("   (%.0f, %.0f, %.1f)" % (p[0] * K, p[1] * K, p[2]))
    print("   exit tangent (screen css, z):", np.round(tx, 3))


if __name__ == "__main__":
    W = 51.0
    # bottom K: from the right leg (z = RIGHT_Z = 37, heading down its line) round to the K band (up-left, through the junction)
    for R in (0.8 * W, 1.0 * W):
        sol, pts, tx = solve((468, 900), (0.29 / K * K, 0.96, 0.0), 37.0, R, (-0.692, -0.722), (555, 935),
                             x0=[100, -0.8, math.radians(200)], bounds=([0, -math.pi, math.radians(150)], [200, math.pi, math.radians(260)]),
                             extra=lambda E, pts, tx: [(max(p[2] for p in pts) - 37.0) / 50.0])
        show("bottom K R=%.0f" % R, sol, pts, tx)
    # top K: from the front strand (z = 12, heading up-right) round to the end strand (down-left to the hidden tip)
    for R in (0.7 * W, 0.9 * W):
        sol, pts, tx = solve((545, 867), (0.884, -0.467, 0.0), 12.0, R, (-0.585, 0.811), (535, 1130),
                             x0=[60, -0.8, math.radians(200)], bounds=([0, -math.pi, math.radians(150)], [160, math.pi, math.radians(260)]),
                             extra=lambda E, pts, tx: [(max(p[2] for p in pts) - 12.0) / 50.0])
        show("top K R=%.0f" % R, sol, pts, tx)
