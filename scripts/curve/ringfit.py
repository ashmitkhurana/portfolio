#!/usr/bin/env python3
"""Bottom-K as a TILTED RING: a circle of radius R (css) whose plane is tilted by tau from the screen about the in-screen
axis at angle alpha; it projects to an ellipse. Entry tangent = the right leg's screen heading, exit tangent = the K band's,
entry on the leg's line, exit on the band's line. Fitted to the approved trace's loop centreline (out_v9, interval 7)."""
import math, json
import numpy as np
from scipy.optimize import minimize

K = 2.185
TRACE = np.array([(532, 1108), (565, 1169), (616, 1204), (680, 1207), (732, 1171), (753, 1122), (718, 1068), (707, 1056)], float) / K
L1p, L1d = np.array([531, 1105]) / K, np.array([0.244, 0.970])
L2p, L2d = np.array([553, 937]) / K, np.array([-0.79, -0.61]); L2d /= np.linalg.norm(L2d)


def ring(R, tau, al, sgn=1):
    a = np.array([math.cos(al), math.sin(al)]); ap = np.array([-a[1], a[0]])
    def p(th):  # screen offset from the centre, depth offset
        return R * (math.cos(th) * a + math.sin(th) * math.cos(tau) * ap), R * math.sin(th) * math.sin(tau) * sgn
    def t(th):
        v = R * (-math.sin(th) * a + math.cos(th) * math.cos(tau) * ap); return v / np.linalg.norm(v)
    return p, t


def solve_theta(t, d):
    ths = np.linspace(0, 2 * math.pi, 3601)
    return ths[int(np.argmax([t(x) @ d for x in ths]))]


def build(v, n=12):
    R, tau, al = v
    p, t = ring(R, tau, al)
    th0, th1 = solve_theta(t, L1d), solve_theta(t, L2d)
    if th1 <= th0: th1 += 2 * math.pi
    D = p(th1)[0] - p(th0)[0]
    # entry on L1 (s), entry + D on L2: cross(L1p + s L1d + D - L2p, L2d) = 0
    c = lambda w: w[0] * L2d[1] - w[1] * L2d[0]
    s = -c(L1p + D - L2p) / c(L1d)
    Ein = L1p + s * L1d
    C = Ein - p(th0)[0]
    pts = [(C + p(th)[0], p(th)[1]) for th in np.linspace(th0, th1, n)]
    return pts, th0, th1, s


def cost(v):
    try:
        pts, th0, th1, s = build(v, 60)
    except Exception:
        return 1e9
    P = np.array([q[0] for q in pts])
    d = [np.min(np.linalg.norm(P - q, axis=1)) for q in TRACE]
    span = th1 - th0
    return float(np.mean(np.square(d))) + 50 * max(0, 3.2 - span) ** 2


best = None
for tau in (0.7, 0.9, 1.1):
    for al in np.linspace(0, math.pi, 7):
        r = minimize(cost, [45, tau, al], method="Nelder-Mead", options=dict(maxiter=600))
        if best is None or r.fun < best.fun: best = r
R, tau, al = best.x
pts, th0, th1, s = build(best.x, 12)
print("cost %.1f  R %.1f css (%.2f W)  tau %.0f deg  alpha %.0f deg  sweep %.0f deg" % (best.fun, R, R / 51, math.degrees(tau), math.degrees(al), math.degrees(th1 - th0)))
print([(round(q[0][0] * K, 1), round(q[0][1] * K, 1), round(q[1], 1)) for q in pts])
json.dump(dict(R=R, tau=tau, alpha=al, pts=[[q[0][0] * K, q[0][1] * K, q[1]] for q in pts]), open("docs/ribbon/turns/curve/ringfit.json", "w"))
