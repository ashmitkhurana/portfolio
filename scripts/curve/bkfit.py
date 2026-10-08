#!/usr/bin/env python3
"""Bottom-K DOUBLE FOLD (Z-fold: the owner's sketch + the approved trace): fit 2 paper rolls (scripts/mockup/paper.py, the
same math as lib/ribbon/paper.ts) from the right leg's real engine frame so the strip leaves on the trace's K band (start
(702,1051) cutout, heading (-0.79,-0.61)), BEHIND the right leg, with the loop passing the trace's loop centreline.
Writes docs/ribbon/turns/curve/bkfold.json {L, rolls, entry}."""
import json, math, os, sys
import numpy as np
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "mockup"))
import paper  # noqa

DUMP = sys.argv[1] if len(sys.argv) > 1 else "docs/ribbon/turns/curve/v19c"
d = json.load(open(os.path.join(DUMP, "dump.json")))
c, T, N = np.array(d["c"]), np.array(d["T"]), np.array(d["N"])
D = d["meta"]["camPos"][2]; VW, VH = d["meta"]["viewW"], d["meta"]["viewH"]
SX, SY = 852 / 390, 1846 / 844
W = 51.0


def scr(p):
    k = D / (D - p[..., 2])
    return np.stack([(p[..., 0] * k + VW / 2) * SX, (VH / 2 - p[..., 1] * k) * SY], -1)


# entry: the right-leg ring nearest the cutout point E0
E0 = np.array([float(sys.argv[2]) if len(sys.argv) > 2 else 520.0, float(sys.argv[3]) if len(sys.argv) > 3 else 1060.0])
i0 = int(np.argmin(np.linalg.norm(scr(c) - E0, axis=1)))
if len(sys.argv) > 4:  # the engine's actual span entry ring (spanReports ring0)
    i0 = int(sys.argv[4])
t0 = T[i0] / np.linalg.norm(T[i0]); n0 = N[i0] - (N[i0] @ t0) * t0; n0 /= np.linalg.norm(n0)
R0 = np.stack([t0, np.cross(n0, t0), n0], 1)  # local x -> T, y -> N x T, z -> N
rv0, p0 = Rotation.from_matrix(R0).as_rotvec(), c[i0]
print("entry ring", i0, "screen", scr(c[i0]).round(1), "z %.1f" % c[i0][2], "N.z %.2f" % n0[2])

TRACE = np.array([(565, 1169), (616, 1204), (680, 1207), (732, 1171), (753, 1122), (718, 1068)], float)
X_OUT = np.array([702.0, 1051.0]); D_OUT = np.array([-0.79, -0.61]); D_OUT /= np.linalg.norm(D_OUT)


def xvec(v):
    L, u1, b1, r1, p1, du, b2, r2, p2 = v
    return np.concatenate([rv0, p0, [u1, b1, r1, p1, u1 + du, b2, r2, p2]]), L


def res(v, sgn):
    x, L = xvec(v)
    us = np.linspace(0, L, 80)
    C = paper.surface(x, us, np.zeros_like(us), K=2)
    S = scr(C)
    ex, ex2 = S[-1], S[-2]
    dd = (ex - ex2); dd /= max(np.linalg.norm(dd), 1e-9)
    r = list((ex - X_OUT) / 6.0)
    r.append((dd[0] * D_OUT[1] - dd[1] * D_OUT[0]) * 20); r.append((1 - dd @ D_OUT) * 20)
    zE = C[0][2]
    mid = C[len(C) // 2][2]
    r.append(max(0.0, mid - (zE - 45.0)) / 6.0)  # the loop's bottom (between the folds) lies BEHIND the leg
    r.append((C[-1][2] - (zE - 30.0)) / 8.0)  # the K band leaves behind the leg ...
    r.append(max(0.0, mid + 15.0 - C[-1][2]) / 6.0)  # ... but in front of the loop's bottom
    # the section between the folds stands steeply away from the camera (the mockup shows the inner face only as a
    # dark sliver and the loop's hole stays open): |N.z| small over the middle of the span
    for f in (0.42, 0.5, 0.58):
        um = f * L
        A_ = paper.surface(x, np.array([um - 0.5, um + 0.5, um, um]), np.array([0, 0, -0.5, 0.5]), K=2)
        tt = A_[1] - A_[0]; vv = A_[3] - A_[2]
        nn = np.cross(tt, vv); nn /= np.linalg.norm(nn)
        r.append(max(0.0, abs(nn[2]) - 0.5) * 6)
    _, _, rr = paper.unpack(x, 2)
    ramp = lambda b: (W / 2) * abs(1 / math.tan(b)) + 0.3 * W
    r.append(min(0.0, rr[0][0] - ramp(rr[0][1])) / 3.0)  # room before fold 1 for the section directions to turn
    end2 = rr[1][0] + rr[1][2] * abs(rr[1][3]) / math.sin(rr[1][1])
    r.append(min(0.0, L - end2 - ramp(rr[1][1])) / 3.0)  # and after fold 2
    r += [np.min(np.linalg.norm(S - q, axis=1)) / 15.0 for q in TRACE]
    g = paper.overlap_gaps(x, W, K=2)
    r += list(np.minimum(g - 4.0, 0) / 2.0)  # the two rolls must not overlap in the flat domain
    return r


best = None
for sgn in ((1, -1), (-1, 1), (1, 1), (-1, -1)):
    for b1 in (0.6, 1.0, 2.1, 2.5):
        for b2 in (0.6, 1.0, 1.4, 2.0, 2.5):
            x0 = [380, 60, b1, 0.7 * W, sgn[0] * 1.9, 150, b2, 0.7 * W, sgn[1] * 1.9]
            lo = [200, 5, 0.25, 0.55 * W, -math.pi, 60, 0.25, 0.55 * W, -math.pi]
            hi = [560, 160, math.pi - 0.25, 0.95 * W, math.pi, 300, math.pi - 0.25, 0.95 * W, math.pi]
            if sgn[0] > 0: lo[4], hi[4] = 1.2, 2.7
            else: lo[4], hi[4] = -2.7, -1.2
            if sgn[1] > 0: lo[8], hi[8] = 1.2, 2.7
            else: lo[8], hi[8] = -2.7, -1.2
            try:
                s_ = least_squares(res, x0, args=(sgn,), bounds=(lo, hi), max_nfev=300)
            except Exception:
                continue
            if best is None or s_.cost < best.cost: best, bs = s_, sgn
print("signs", bs)
v = best.x
x, L = xvec(v)
us = np.linspace(0, L, 25); C = paper.surface(x, us, np.zeros_like(us), K=2); S = scr(C)
print("cost %.2f  L %.0f  rolls:" % (best.cost, L))
for k in range(2):
    u, b, r, p = x[6 + 4 * k: 10 + 4 * k]
    print("  u %.0f beta %.0fdeg rho %.2fW phi %.0fdeg" % (u, math.degrees(b), r / W, math.degrees(p)))
print("centreline (cutout x, y, z):", [(round(a), round(b_), round(z)) for (a, b_), z in zip(S[::3], C[::3, 2])])
print("exit", S[-1].round(1), "z %.1f" % C[-1][2], "gaps", paper.overlap_gaps(x, W, K=2).round(1))
json.dump(dict(L=L, entry_ring=i0, rolls=[dict(u=float(x[6 + 4 * k]), beta=float(x[7 + 4 * k]), rho=float(x[8 + 4 * k]), phi=float(x[9 + 4 * k])) for k in range(2)],
               centre=[[float(a), float(b_), float(z)] for (a, b_), z in zip(S, C[:, 2])]), open("docs/ribbon/turns/curve/bkfold.json", "w"))
