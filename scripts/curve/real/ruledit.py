"""Turn the band ruling into the screen plane (perpendicular to the path) inside rings A..B, keeping the centreline.
usage: ruledit.py IN_POSE OUT_POSE A B RAMP"""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from fit3d import pose_to_world, world_to_pose, unit

src, dst = sys.argv[1], sys.argv[2]
a, b_, ramp = int(sys.argv[3]), int(sys.argv[4]), float(sys.argv[5])
P = json.load(open(src))
rg = P["variants"]["phone"]["ruled"]
n = len(rg)
L = np.array([r["L"] for r in rg], float)
R = np.array([r["R"] for r in rg], float)
Lw, Rw = pose_to_world(L), pose_to_world(R)
c = (Lw + Rw) / 2
h = np.linalg.norm(Rw - Lw, axis=1) / 2
b = unit(Rw - Lw)
T = unit(np.gradient(c, axis=0))
ker = np.ones(5) / 5
Ts = np.stack([np.convolve(np.pad(T[:, i], 2, mode="edge"), ker, mode="valid") for i in range(3)], 1)
T = unit(Ts)
ez = np.array([0.0, 0.0, 1.0])
bf = unit(np.cross(ez, T))
flip = (bf * b).sum(1) < 0
bf[flip] *= -1
nf = 0
for k in range(a + 1, min(b_, n - 1) + 1):
    if (bf[k] * bf[k - 1]).sum() < 0:
        bf[k] *= -1
        nf += 1
print("continuity walk flips:", nf)
k = np.arange(n)
x = np.clip(np.minimum(k - a, b_ - k) / ramp, 0, 1)
w = np.where((k >= a) & (k <= b_), x * x * (3 - 2 * x), 0.0)
bn = unit((1 - w)[:, None] * b + w[:, None] * bf)
ang = np.degrees(np.arccos(np.clip((b * bf).sum(1), -1, 1)))
print("max angle between b and b_flat in A..B: %.2f deg" % ang[a:b_ + 1].max())
Lw2, Rw2 = c - h[:, None] * bn, c + h[:, None] * bn
L2, R2 = world_to_pose(Lw2), world_to_pose(Rw2)
inside = (k >= a) & (k <= b_)
for i in range(n):
    if inside[i]:
        rg[i]["L"] = [float(v) for v in L2[i]]
        rg[i]["R"] = [float(v) for v in R2[i]]
dang = np.degrees(np.arccos(np.clip((b * bn).sum(1), -1, 1)))
for i in range(a, b_ + 1, 10):
    print("ring %d  angle(b,bn) %.2f deg  old b_z %.4f  new bn_z %.4f" % (i, dang[i], b[i, 2], bn[i, 2]))
json.dump(P, open(dst, "w"))
