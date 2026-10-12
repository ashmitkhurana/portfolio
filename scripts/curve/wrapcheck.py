#!/usr/bin/env python
"""Does the wrap truly ENCIRCLE the A left leg in 3D? (engine dump.json)

  scripts/mockup/.venv/bin/python scripts/curve/wrapcheck.py <dump.json> --rings <diag/rings.csv> [--leg 388:483] [--wrap 860:1066]
                                                               [--min-dist 12] [--out report.txt]

Engine rings are mapped to pose rings through rings.csv (column pose_ring). Leg = engine rings with pose ring in --leg, wrap =
engine rings with pose ring in --wrap. The leg surface is a grid (leg rings x NU samples across the width) projected with the
engine camera (meta.proj/view, css px) and cut into triangles. For every wrap ring whose projected centre lies inside the leg
footprint (inside any triangle) the sign of z_wrap - z_leg(screen point) is taken (+ in front = nearer the camera, - behind;
0 when the wrap centre is between the leg's front and back layers, i.e. it passes THROUGH the leg).
PASS iff (1) the run-compressed sign sequence of the overlapping wrap rings is exactly [+, -]; (2) every wrap ring between the last '+'
and the first '-' is OUTSIDE the footprint with screen x less than the leg's left edge at that height (or at a height the leg does not
reach) - it goes round the outer edge; (3) the 3D distance from every wrap sample (centre + edges + 5 across) to the leg surface
samples is >= --min-dist.
"""
import argparse, csv, json, sys
import numpy as np
from scipy.spatial import cKDTree

ap = argparse.ArgumentParser()
ap.add_argument("dump")
ap.add_argument("--rings", required=True)
ap.add_argument("--leg", default="388:483")
ap.add_argument("--wrap", default="860:1066")
ap.add_argument("--min-dist", type=float, default=12.0)
ap.add_argument("--nu", type=int, default=13)
ap.add_argument("--out")
a = ap.parse_args()

D = json.load(open(a.dump))
meta = D["meta"]
VW, VH = meta["viewW"], meta["viewH"]
P = np.array(meta["proj"], float).reshape(4, 4).T
V = np.array(meta["view"], float).reshape(4, 4).T
VP = P @ V
c = np.array(D["c"]); B = np.array(D["B"]); hw = np.array(D["hw"])
pose_ring = np.array([int(r["pose_ring"]) for r in csv.DictReader(open(a.rings))])
assert len(pose_ring) == len(c)


def project(pts):
    h = np.hstack([pts, np.ones((len(pts), 1))]) @ VP.T
    nd = h[:, :3] / h[:, 3:4]
    return np.stack([(nd[:, 0] + 1) / 2 * VW, (1 - nd[:, 1]) / 2 * VH], 1)


l0, l1 = [int(v) for v in a.leg.split(":")]
w0, w1 = [int(v) for v in a.wrap.split(":")]
leg_idx = np.nonzero((pose_ring >= l0) & (pose_ring <= l1))[0]
wrap_idx = np.nonzero((pose_ring >= w0) & (pose_ring <= w1))[0]
# the leg = one contiguous run (the first run); the wrap = contiguous too, keep order
leg_idx = leg_idx[np.r_[True, np.diff(leg_idx) != 1].cumsum() == 1]
wrap_idx = wrap_idx[np.r_[True, np.diff(wrap_idx) != 1].cumsum() == 1] if len(wrap_idx) else wrap_idx
if len(leg_idx) < 3 or len(wrap_idx) < 3:
    print("no leg/wrap rings found"); sys.exit(2)
print("leg engine rings %d..%d (%d)  wrap engine rings %d..%d (%d)" % (leg_idx[0], leg_idx[-1], len(leg_idx), wrap_idx[0], wrap_idx[-1], len(wrap_idx)))

u = np.linspace(-1, 1, a.nu)
LS = c[leg_idx][:, None, :] + B[leg_idx][:, None, :] * hw[leg_idx][:, None, None] * u[None, :, None]  # (nl, nu, 3)
nl, nu = LS.shape[:2]
LP = project(LS.reshape(-1, 3)).reshape(nl, nu, 2)
LZ = LS[:, :, 2]
# triangles
tri = []
for i in range(nl - 1):
    for j in range(nu - 1):
        p00, p01, p10, p11 = (i, j), (i, j + 1), (i + 1, j), (i + 1, j + 1)
        tri.append((p00, p01, p10)); tri.append((p01, p11, p10))
TA = np.array([[LP[t[0]], LP[t[1]], LP[t[2]]] for t in tri])  # (nt,3,2)
TZ = np.array([[LZ[t[0]], LZ[t[1]], LZ[t[2]]] for t in tri])  # (nt,3)
tmin, tmax = TA.min(1), TA.max(1)
v0, v1 = TA[:, 1] - TA[:, 0], TA[:, 2] - TA[:, 0]
den = v0[:, 0] * v1[:, 1] - v1[:, 0] * v0[:, 1]
ok = np.abs(den) > 1e-9


def leg_z_at(p):
    """z of every leg triangle covering screen point p (list)."""
    m = (p[0] >= tmin[:, 0]) & (p[0] <= tmax[:, 0]) & (p[1] >= tmin[:, 1]) & (p[1] <= tmax[:, 1]) & ok
    idx = np.nonzero(m)[0]
    zs = []
    for k in idx:
        d = p - TA[k, 0]
        b1 = (d[0] * v1[k, 1] - v1[k, 0] * d[1]) / den[k]
        b2 = (v0[k, 0] * d[1] - d[0] * v0[k, 1]) / den[k]
        b0 = 1 - b1 - b2
        if b0 >= -1e-9 and b1 >= -1e-9 and b2 >= -1e-9:
            zs.append(b0 * TZ[k, 0] + b1 * TZ[k, 1] + b2 * TZ[k, 2])
    return zs


def left_edge_x(y):
    """smallest screen x of the leg footprint on the horizontal line y (None if the leg does not reach y)."""
    xs = []
    for k in range(len(TA)):
        if tmin[k, 1] <= y <= tmax[k, 1]:
            for e0, e1 in ((0, 1), (1, 2), (2, 0)):
                p, q = TA[k, e0], TA[k, e1]
                if (p[1] - y) * (q[1] - y) <= 0 and abs(q[1] - p[1]) > 1e-9:
                    xs.append(p[0] + (y - p[1]) / (q[1] - p[1]) * (q[0] - p[0]))
    return min(xs) if xs else None


WC = c[wrap_idx]
WP = project(WC)
sign = np.zeros(len(wrap_idx), int)  # +1 front, -1 behind, 0 through (inside footprint) ; 9 = outside footprint
zl_min = np.full(len(wrap_idx), np.nan); zl_max = np.full(len(wrap_idx), np.nan)
for k in range(len(wrap_idx)):
    zs = leg_z_at(WP[k])
    if not zs:
        sign[k] = 9
        continue
    lo, hi = min(zs), max(zs)
    zl_min[k], zl_max[k] = lo, hi
    z = WC[k, 2]
    sign[k] = 1 if z > hi else (-1 if z < lo else 0)
ovl = np.nonzero(sign != 9)[0]
seq = [int(sign[k]) for k in ovl]
runs = []
for k in ovl:
    s = int(sign[k])
    if not runs or runs[-1][0] != s:
        runs.append([s, int(wrap_idx[k]), int(wrap_idx[k]), 1])
    else:
        runs[-1][2] = int(wrap_idx[k]); runs[-1][3] += 1
sym = {1: "+", -1: "-", 0: "0"}
print("overlapping wrap rings: %d of %d; sign runs (sign, eng ring a..b, count):" % (len(ovl), len(wrap_idx)))
for s, ra, rb, n in runs:
    print("   %s  %d..%d  (%d)  pose %d..%d" % (sym[s], ra, rb, n, pose_ring[ra], pose_ring[rb]))
changes = [(runs[i][2], runs[i + 1][1]) for i in range(len(runs) - 1)]
print("sign changes between engine rings:", changes)
cond1 = [r[0] for r in runs] == [1, -1]

# condition 2: rings between last '+' and first '-'
cond2, c2msg = False, "n/a (pattern not [+,-])"
bad2 = []
if cond1:
    last_plus = max(int(wrap_idx[k]) for k in ovl if sign[k] == 1)
    first_minus = min(int(wrap_idx[k]) for k in ovl if sign[k] == -1)
    between = [k for k in range(len(wrap_idx)) if last_plus < wrap_idx[k] < first_minus]
    nl_, nb_ = 0, 0
    for k in between:
        if sign[k] != 9:
            bad2.append((int(wrap_idx[k]), "inside footprint"))
            continue
        le = left_edge_x(WP[k, 1])
        if le is None:
            nb_ += 1  # leg does not reach this height
        elif WP[k, 0] < le:
            nl_ += 1
        else:
            bad2.append((int(wrap_idx[k]), "right of left edge (x %.1f >= %.1f)" % (WP[k, 0], le)))
    cond2 = not bad2
    c2msg = "%d rings between %d and %d: %d left of the leg's left edge, %d at heights the leg does not reach, %d violations %s" % (
        len(between), last_plus, first_minus, nl_, nb_, len(bad2), bad2[:5])
print("condition 2 (goes round the outer-left edge):", c2msg)

# condition 3: 3D distance to the leg surface
us = np.linspace(-1, 1, 17)
LS2 = (c[leg_idx][:, None, :] + B[leg_idx][:, None, :] * hw[leg_idx][:, None, None] * us[None, :, None]).reshape(-1, 3)
tree = cKDTree(LS2)
uw = np.linspace(-1, 1, 9)
WS = (c[wrap_idx][:, None, :] + B[wrap_idx][:, None, :] * hw[wrap_idx][:, None, None] * uw[None, :, None]).reshape(-1, 3)
dd, _ = tree.query(WS)
dd = dd.reshape(len(wrap_idx), len(uw))
dmin = dd.min(1)
kmin = int(np.argmin(dmin))
cond3 = dmin.min() >= a.min_dist
print("condition 3: min 3D distance wrap sample -> leg surface %.2f px at wrap engine ring %d (pose %d); rings below %.0f px: %d" % (
    dmin.min(), wrap_idx[kmin], pose_ring[wrap_idx[kmin]], a.min_dist, int((dmin < a.min_dist).sum())))
if (dmin < a.min_dist).any():
    lo = np.nonzero(dmin < a.min_dist)[0]
    print("   rings < %.0f px: engine %d..%d" % (a.min_dist, wrap_idx[lo[0]], wrap_idx[lo[-1]]))
ok_all = cond1 and cond2 and cond3
print("condition 1 (signs go + then - exactly once): %s   sequence runs %s" % (cond1, "".join(sym[r[0]] for r in runs)))
print("WRAPCHECK %s  (c1 %s, c2 %s, c3 %s)" % ("PASS" if ok_all else "FAIL", cond1, cond2, cond3))
