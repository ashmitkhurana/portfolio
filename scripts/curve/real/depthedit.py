"""Change the depth of a ruled pose's rings while keeping every screen position (edits only p[2]).
usage: depthedit.py IN_POSE OUT_POSE"""
import json, os, sys
import numpy as np
from scipy.interpolate import PchipInterpolator
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fit3d import pose_to_world, A

src, dst = sys.argv[1], sys.argv[2]
P = json.load(open(src))
rg = P["variants"]["phone"]["ruled"]
N = len(rg)
L0 = np.array([r["L"] for r in rg], float)
R0 = np.array([r["R"] for r in rg], float)
Lw, Rw = pose_to_world(L0), pose_to_world(R0)
zc = (Lw[:, 2] + Rw[:, 2]) / 2
zt = zc.copy()

def smoothstep(x):
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3 - 2 * x)

# (a) left leg straight
a, b = 392, 472
k = np.arange(a, b + 1)
zl = zc[a] + (zc[b] - zc[a]) * (k - a) / (b - a)
wl = smoothstep(np.minimum(k - a, b - k) / 8.0)
zt[k] = (1 - wl) * zt[k] + wl * zl

# (b) wrap roll
anch = {880: zc[880], 895: 66, 910: 70, 925: 68, 945: 58, 958: 47, 970: 36, 982: 27, 995: 23, 1010: 20, 1030: 14, 1050: 6, 1075: zc[1075]}
if len(sys.argv) > 3:
    anch = {}
    for pair in sys.argv[3].split(","):
        rs, vs = pair.split(":")
        anch[int(rs)] = zc[int(rs)] if vs.strip() == "orig" else float(vs)
    anch = dict(sorted(anch.items()))
ks = sorted(anch)
f = PchipInterpolator(ks, [anch[q] for q in ks])
kk = np.arange(min(anch), max(anch) + 1)
zt[kk] = f(kk)

dz = zt - zc
H = A["height"]
L1, R1 = L0.copy(), R0.copy()
L1[:, 2] += dz / H
R1[:, 2] += dz / H
for i, r in enumerate(rg):
    r["L"][2] = float(L1[i, 2])
    r["R"][2] = float(R1[i, 2])

Lw1, Rw1 = pose_to_world(L1), pose_to_world(R1)
zc1 = (Lw1[:, 2] + Rw1[:, 2]) / 2
# screen positions: project via pose x,y (unchanged by construction); verify via world->screen
D_ = None
import fit3d
sc0 = np.concatenate([fit3d.project(Lw), fit3d.project(Rw)])
sc1 = np.concatenate([fit3d.project(Lw1), fit3d.project(Rw1)])
print("N rings", N)
print("max screen-position change (px): %.3e" % np.abs(sc1 - sc0).max())
print("max |new centre z - zt| (world px): %.3e" % np.abs(zc1 - zt).max())
print("ring  old_zc  new_zt")
for q in list(range(380, 481, 10)) + list(range(870, 1081, 10)):
    print("%4d  %8.3f  %8.3f" % (q, zc[q], zt[q]))
json.dump(P, open(dst, "w"))
