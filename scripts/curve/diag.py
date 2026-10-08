#!/usr/bin/env python3
"""Where does the band misbehave? From a surface.npz: roll rate (deg per width), projected width, screen curvature
(1/width), per piece; prints the worst spots (local maxima) with their cutout position.  diag.py <dir> [top N]"""
import sys, os, math
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import surface as S  # noqa

d = np.load(os.path.join(sys.argv[1], "surface.npz"), allow_pickle=True)
c, T, NA, B, h, tags = d["c"], d["T"], d["NA"], d["B"], d["h"], d["tags"]
n = len(c)
seg = np.linalg.norm(np.diff(c, axis=0), axis=1)
# roll rate: angle between consecutive normals about the tangent, per width
rr = np.zeros(n)
for i in range(1, n):
    a = NA[i - 1] - (NA[i - 1] @ T[i]) * T[i]
    rr[i] = abs(S.roll_angle(S.unit(a), NA[i], T[i])) / max(seg[i - 1], 1e-6) * S.W
sc = S.screen(c)
L, R = S.screen(c - B * h[:, None]), S.screen(c + B * h[:, None])
pw = np.linalg.norm(R - L, axis=1)  # projected width, cutout px
# screen curvature of the centreline
k = np.zeros(n)
for i in range(2, n - 2):
    a, b = sc[i] - sc[i - 2], sc[i + 2] - sc[i]
    k[i] = abs(math.atan2(a[0] * b[1] - a[1] * b[0], a @ b)) / max(np.linalg.norm(b) + np.linalg.norm(a), 1e-6) * 2 * S.W * S.SX
# half-width jumps (sheared sections)
hj = np.abs(np.gradient(h)) / S.DS
score = rr / 60 + np.maximum(0, k - 2) + hj * 5
top = int(sys.argv[2]) if len(sys.argv) > 2 else 12
picked = []
for i in np.argsort(-score):
    if all(abs(i - j) > 25 for j in picked):
        picked.append(i)
    if len(picked) >= top:
        break
for i in sorted(picked):
    print("ring %4d  %-26s cutout (%4.0f,%4.0f) z %5.0f  roll %5.0f deg/W  screen-curv %4.1f /W  proj-w %4.0f  dh %.2f" % (
        i, tags[i], sc[i][0], sc[i][1], c[i][2], rr[i], k[i], pw[i], hj[i]))

# ---- clearance between non-adjacent parts of the strip (5 samples across each ring) ---------------------------------------
from scipy.spatial import cKDTree
fr = np.linspace(-1, 1, 5)
P = (c[:, None, :] + B[:, None, :] * (h[:, None, None] * fr[None, :, None])).reshape(-1, 3)
ring = np.repeat(np.arange(n), 5)
arc = np.concatenate([[0], np.cumsum(seg)])
tree = cKDTree(P)
pairs = tree.query_pairs(6.0, output_type="ndarray")
bad = pairs[np.abs(arc[ring[pairs[:, 0]]] - arc[ring[pairs[:, 1]]]) > 2.5 * S.W]
if len(bad):
    dd = np.linalg.norm(P[bad[:, 0]] - P[bad[:, 1]], axis=1)
    groups = {}
    for (a, b), dv in zip(bad, dd):
        key = (ring[a] // 20, ring[b] // 20)
        if key not in groups or dv < groups[key][0]:
            groups[key] = (dv, ring[a], ring[b])
    print("clearance < 6 px (non-adjacent):")
    for key, (dv, ra, rb) in sorted(groups.items(), key=lambda t: t[1][0])[:12]:
        print("  %.1f px  ring %d (%s) vs ring %d (%s)  at cutout (%.0f,%.0f)" % (dv, ra, tags[ra], rb, tags[rb], *sc[ra]))
else:
    print("clearance OK (>= 6 px everywhere)")
