"""compose6: A (poseA) base; apex+right leg from r40 (B2); straight left leg (B3); top-K + end strand from r40 (B4).
usage: compose6.py POSE_A POSE_Q OUT_POSE"""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from fit3d import pose_to_world, world_to_pose, unit, project

fa, fq, fo = sys.argv[1], sys.argv[2], sys.argv[3]
PA = json.load(open(fa)); PQ = json.load(open(fq))
rga = PA["variants"]["phone"]["ruled"]; rgq = PQ["variants"]["phone"]["ruled"]
n = len(rga); assert len(rgq) == n


def edges(rg):
    L = pose_to_world(np.array([r["L"] for r in rg], float))
    R = pose_to_world(np.array([r["R"] for r in rg], float))
    return L, R


LA, RA = edges(rga); LQ0, RQ0 = edges(rgq)
cA = (LA + RA) / 2; bA = unit(RA - LA); hA = np.linalg.norm(RA - LA, axis=1) / 2
bQ0 = unit(RQ0 - LQ0)
ang = lambda a, b: np.degrees(np.arccos(np.clip(np.sum(a * b, -1), -1, 1)))
s = lambda x: (lambda t: t * t * (3 - 2 * t))(np.clip(x, 0, 1))

# B1
sigQ = 1 if np.dot(bA[505], bQ0[505]) >= 0 else -1
sigK = 1 if np.dot(bA[1100], bQ0[1100]) >= 0 else -1
print("sigQ = %+d, angle(bA[505], sigQ*bQ[505]) = %.3f deg" % (sigQ, ang(bA[505], sigQ * bQ0[505])))
print("sigK = %+d, angle(bA[1100], sigK*bQ[1100]) = %.3f deg" % (sigK, ang(bA[1100], sigK * bQ0[1100])))


def swap(sig):
    return (LQ0, RQ0) if sig == 1 else (RQ0, LQ0)


LQ, RQ = swap(sigQ); LK, RK = swap(sigK)
cQ = (LQ + RQ) / 2; bQ = unit(RQ - LQ)
OL, OR = LA.copy(), RA.copy()

# B2
for k in range(505, 661):
    w = 1.0 if k <= 645 else 1 - float(s((k - 645) / 15))
    OL[k] = w * LQ[k] + (1 - w) * LA[k]
    OR[k] = w * RQ[k] + (1 - w) * RA[k]

# B3
a, e = 380, 505
P0, P1 = cA[a], cQ[e]
seg = np.linalg.norm(np.diff(cA[a:e + 1], axis=0), axis=1)
u = np.concatenate([[0], np.cumsum(seg)]); u /= u[-1]
dL = unit(P1 - P0)
b_s, b_e = bA[a], sigQ * bQ0[e]
om = np.arccos(np.clip(np.dot(b_s, b_e), -1, 1))
cen = np.zeros((e - a + 1, 3)); rul = np.zeros((e - a + 1, 3))
for i, k in enumerate(range(a, e + 1)):
    ui = u[i]
    cS = P0 + ui * (P1 - P0)
    if om < 1e-9:
        bS = b_s.copy()
    else:
        bS = (np.sin((1 - ui) * om) * b_s + np.sin(ui * om) * b_e) / np.sin(om)
    bS = bS - np.dot(bS, dL) * dL
    bS = bS / np.linalg.norm(bS)
    c_, r_ = cS, bS
    if k <= a + 12:
        q = float(s((k - a) / 12))
        c_ = (1 - q) * cA[k] + q * cS
        r_ = (1 - q) * bA[k] + q * bS
        r_ = r_ / np.linalg.norm(r_)
    if k >= e - 15:
        g = float(s((k - (e - 15)) / 15))
        c_ = (1 - g) * c_ + g * cQ[k]
        r_ = (1 - g) * r_ + g * bQ[k]
        r_ = r_ / np.linalg.norm(r_)
    cen[i], rul[i] = c_, r_
    OL[k] = c_ - hA[k] * r_
    OR[k] = c_ + hA[k] * r_

# B4
for k in range(1098, n):
    w = float(s((k - 1098) / 17)) if k < 1115 else 1.0
    OL[k] = w * LK[k] + (1 - w) * LA[k]
    OR[k] = w * RK[k] + (1 - w) * RA[k]

# B5
Lp, Rp = world_to_pose(OL), world_to_pose(OR)
for k in range(n):
    rgA = rga[k]
    rgA["L"] = [float(v) for v in Lp[k]]
    rgA["R"] = [float(v) for v in Rp[k]]
json.dump(PA, open(fo, "w"))
c = (OL + OR) / 2; bo = unit(OR - OL)
scr = project(c)
for lo, hi in [(375, 390), (495, 515), (640, 665), (1095, 1120)]:
    d = np.linalg.norm(np.diff(scr[lo:hi + 1], axis=0), axis=1)
    print("max screen step of centre, rings %d..%d: %.3f px (between %d and %d)" % (lo, hi, d.max(), lo + int(np.argmax(d)), lo + int(np.argmax(d)) + 1))
for lo, hi in [(370, 670), (1090, 1130)]:
    d = ang(bo[lo + 1:hi + 1], bo[lo:hi])
    print("max per-ring ruling change rings %d..%d: %.3f deg (at ring %d)" % (lo, hi, d.max(), lo + 1 + int(np.argmax(d))))
