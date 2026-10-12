#!/usr/bin/env python3
"""Face-on leveling. The curvature frames HOLD whatever roll they reached when a curve fades, so a straight run after a
turn can come out rolled (part edge-on, or showing the wrong face). For every point tagged LB / LA in author.py this
measures, in the engine dump, the roll that makes the band face-on showing that face, and adds it to the point's twist.
RAMP points (turns) are interpolated between the neighbouring locked corrections; other points hold the previous one.

  level.py <dump dir> <delta in | -> <delta out>
"""
import json, math, os, sys
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import author as A  # noqa: E402

d = json.load(open(os.path.join(sys.argv[1], "dump.json")))
prev = [0.0] * len(A.P) if sys.argv[2] == "-" else json.load(open(sys.argv[2]))
c, N, T = np.array(d["c"]), np.array(d["N"]), np.array(d["T"])
cam = np.array(d["meta"]["camPos"]); D = cam[2]
VW, VH = d["meta"]["viewW"], d["meta"]["viewH"]


def world(cx, cy, z):
    sx, sy = cx / A.SX, cy / A.SY
    k = (D - z) / D
    return np.array([(sx - VW / 2) * k, (VH / 2 - sy) * k, z])


def wrap(a):
    return a - 2 * math.pi * round(a / (2 * math.pi))


# measured correction at each locked point
corr = {}
for i, (cx, cy, z, tw, ex) in enumerate(A.P):
    if not ex or "face" not in ex:
        continue
    r = int(np.argmin(np.linalg.norm(c - world(cx, cy, z), axis=1)))
    v = cam - c[r]; v /= np.linalg.norm(v)
    t = T[r] / np.linalg.norm(T[r]); n = N[r]; b = np.cross(t, n)
    # twist adds roll: N' = N cos(d) + (T x N) sin(d)  ->  N' . v is largest at d = atan2(b.v, n.v) (face A)
    dd = math.atan2(b @ v, n @ v) + (math.pi if ex["face"] == "B" else 0.0)
    corr[i] = (wrap(dd), r, float(n @ v))

# chain the corrections (each locked value chosen mod 2 pi nearest the previous) and fill the rest
out = list(prev)
locked = sorted(corr)
acc = {}
last = 0.0
for i in locked:
    k = prev[i] + corr[i][0]
    k = k - 2 * math.pi * round((k - last) / (2 * math.pi)) if acc else k
    k += 2 * math.pi * A.P[i][4].get("wind", 0)  # force the long way round (e.g. the S half twist's direction)
    acc[i] = last = k
for i in range(len(A.P)):
    if i in acc:
        out[i] = acc[i]
        continue
    lo = max([j for j in locked if j < i], default=None)
    hi = min([j for j in locked if j > i], default=None)
    ex = A.P[i][4] or {}
    if lo is None:
        out[i] = prev[i]  # before the first lock: untouched (the tail keeps its own face)
    elif ex.get("ramp") and hi is not None:
        # interpolate across the run of ramp points between the two locks
        run = [j for j in range(lo + 1, hi) if (A.P[j][4] or {}).get("ramp")]
        f = (run.index(i) + 1) / (len(run) + 1)
        out[i] = acc[lo] + (acc[hi] - acc[lo]) * f
    else:
        out[i] = acc[lo]
for i in locked:
    print("pt %2d ring %4d  face %s  N.v %+.2f  correction %+6.1f deg  ->  %+7.1f deg" % (i, corr[i][1], A.P[i][4]["face"], corr[i][2], math.degrees(corr[i][0]), math.degrees(out[i])))
json.dump([round(x, 5) for x in out], open(sys.argv[3], "w"))
