#!/usr/bin/env python3
"""R1-b: lift the rotoscoped edges (edges.json) onto their camera rays.

Each ruling (E1 -> E2, screen px at the 1672x941 fit frame) gets a centre depth z_c(s) from the named
anchors (PCHIP) and a depth difference dz solving |R3 - L3| = W (constant true width). The sign of dz
is chosen by a DP minimising the change of the ruling direction in 3D; sign changes are only allowed
inside the turn windows. Output: $SP/rotoscope/ruled_desktop.json (rings L3/R3 in anchor space).

Usage: .venv/bin/python lift.py
"""
import json
import math
import os
import sys

import numpy as np
from scipy.interpolate import PchipInterpolator

sys.path.insert(0, os.path.dirname(__file__))
import edges as ed  # noqa: E402

OUTD = ed.OUTD
VW, VH = 1672.0, 941.0
FOV = 26.4
D = (VH / 2) / math.tan(math.radians(FOV) / 2)
ANCHOR = dict(left=56.609375, top=192.625, width=1196.921875, height=400.71875)

# world px (ASHMIT plane -45, KHURANA plane +45)
Z_ANCHORS = [
    ("T1_hidden_end", -130), ("A_left_leg", -130), ("A_apex", -40),
    ("A_right_leg_top", 20), ("A_right_leg_q", 50), ("A_right_leg_mid", 70), ("A_right_leg_low", 70),
    ("lower_out", 90), ("lower_tip", 20), ("lower_back", 40),
    ("K_junction", 60),
    ("upper_out", 40), ("upper_tip", -20), ("upper_back", 10),
    ("ret_hidden_start", -5), ("crossbar_right", -20), ("crossbar", -20), ("drop_R", -20),
    ("S_left", 40), ("S_mid", 90), ("S_turn", 150),
    ("tail_a", 230), ("tail_b", 420),
]


def k_of(z):
    return (D - z) / D


def lift(p, z):
    k = k_of(z)
    return np.array([(p[0] - VW / 2) * k, (VH / 2 - p[1]) * k, z])


def ruling_len(pL, pR, zc, dz):
    L = lift(pL, zc - dz / 2)
    R = lift(pR, zc + dz / 2)
    return L, R, float(np.linalg.norm(R - L))


def solve_dz(pL, pR, zc, sign, W):
    """magnitude m >= 0 with |R3 - L3| = W for dz = sign*m; (0, True) when the projected ruling already exceeds W"""
    _, _, l0 = ruling_len(pL, pR, zc, 0.0)
    if l0 >= W:
        return 0.0, True
    lo, hi = 0.0, 3000.0
    for _ in range(50):
        mid = 0.5 * (lo + hi)
        if ruling_len(pL, pR, zc, sign * mid)[2] < W:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi), False


def main():
    E = json.load(open(OUTD + "/edges.json"))
    t = np.array(E["s"])
    E1 = np.array(E["edge1"])
    E2 = np.array(E["edge2"])
    N = len(t)
    M, T, X, rgb, cl, g = ed.load()
    Q, tt, vis, P, s_orig = ed.prep_trace(cl)
    names = cl["anchors"]
    xs, zs = [], []
    for nm, z in Z_ANCHORS:
        xs.append(float(s_orig[names[nm]]))
        zs.append(float(z))
    xs.append(float(t[-1]))
    zs.append(520.0)       # the 200 px extension keeps rising towards the camera
    for i in range(1, len(xs)):
        assert xs[i] > xs[i - 1], (Z_ANCHORS[i - 1], xs[i - 1], xs[i])
    zc = PchipInterpolator(xs, zs)(np.clip(t, xs[0], xs[-1]))

    # true width: 75th percentile of (projected ruling length in world px at the centre depth) over trusted samples
    # outside the turn windows
    tw = np.zeros(N, bool)
    for w in E["turn_windows"]:
        if "i0" in w:
            tw[w["i0"]:w["i1"] + 1] = True
    trusted = np.array(E["trusted"], bool)
    ls = np.array([np.linalg.norm(lift(E2[i], zc[i]) - lift(E1[i], zc[i])) for i in range(N)])
    Wt = float(np.percentile(ls[trusted & ~tw], 95))
    print("true width W = %.2f world px (p95 of projected ruling lengths at centre depth; median %.2f)" % (Wt, np.median(ls[trusted & ~tw])))

    mag = np.zeros((N, 2))
    grow = np.zeros((N, 2), bool)
    B = np.zeros((N, 2, 3))
    Ls = np.zeros((N, 2, 3))
    Rs = np.zeros((N, 2, 3))
    for i in range(N):
        for j, sg in enumerate((+1, -1)):
            m, gw = solve_dz(E1[i], E2[i], zc[i], sg, Wt)
            mag[i, j], grow[i, j] = m, gw
            L, R, ln = ruling_len(E1[i], E2[i], zc[i], sg * m)
            Ls[i, j], Rs[i, j] = L, R
            B[i, j] = (R - L) / max(ln, 1e-9)
    # DP over the sign; flips only inside turn windows
    cost = np.full((N, 2), np.inf)
    arg = np.zeros((N, 2), int)
    cost[0] = 0.0
    for i in range(1, N):
        for a in range(2):
            for b in range(2):
                if a != b and not tw[i]:
                    continue
                c = float(np.arccos(np.clip(B[i, a] @ B[i - 1, b], -1, 1)))
                if a != b:
                    c += 1e-3
                if cost[i - 1, b] + c < cost[i, a]:
                    cost[i, a] = cost[i - 1, b] + c
                    arg[i, a] = b
    sg = np.zeros(N, int)
    sg[-1] = int(np.argmin(cost[-1]))
    for i in range(N - 1, 0, -1):
        sg[i - 1] = arg[i, sg[i]]
    flips = [int(i) for i in range(1, N) if sg[i] != sg[i - 1]]
    Lw = np.array([Ls[i, sg[i]] for i in range(N)])
    Rw = np.array([Rs[i, sg[i]] for i in range(N)])
    dzs = np.array([(1 if sg[i] == 0 else -1) * mag[i, sg[i]] for i in range(N)])
    gr = np.array([grow[i, sg[i]] for i in range(N)])
    ln = np.linalg.norm(Rw - Lw, axis=1)
    print("sign flips at samples", flips, "(arc", [round(float(t[i])) for i in flips], ")")
    print("|dz|: max %.1f, mean %.1f; grown (dz=0, ruling longer than W): %d of %d samples, max width %.2f W" % (
        np.abs(dzs).max(), np.abs(dzs).mean(), gr.sum(), N, ln.max() / Wt))
    runs = ed.spans(gr)
    print("grown spans (arc):", [(round(float(t[a])), round(float(t[b]))) for a, b in runs][:30])

    # roll (angle of B about the centre tangent, unwrapped) range per turn window
    C = 0.5 * (Lw + Rw)
    Tg = np.gradient(C, axis=0)
    Tg /= np.maximum(np.linalg.norm(Tg, axis=1)[:, None], 1e-9)
    Bn = (Rw - Lw) / np.maximum(ln[:, None], 1e-9)
    roll = np.zeros(N)
    ref = None
    for i in range(N):
        bp = Bn[i] - Tg[i] * (Bn[i] @ Tg[i])
        bp /= max(np.linalg.norm(bp), 1e-9)
        if ref is None:
            ref = np.cross(Tg[i], bp)
        roll[i] = math.atan2(np.cross(Tg[i], bp) @ Tg[i], 1.0)
    # signed angle between consecutive perpendicular parts, accumulated
    acc = np.zeros(N)
    for i in range(1, N):
        b0 = Bn[i - 1] - Tg[i - 1] * (Bn[i - 1] @ Tg[i - 1])
        b1 = Bn[i] - Tg[i] * (Bn[i] @ Tg[i])
        b0 /= max(np.linalg.norm(b0), 1e-9)
        b1 /= max(np.linalg.norm(b1), 1e-9)
        acc[i] = acc[i - 1] + math.atan2(np.cross(b0, b1) @ Tg[i], b0 @ b1)
    rr = []
    for w in E["turn_windows"]:
        if "i0" in w:
            seg = acc[w["i0"]:w["i1"] + 1]
            rr.append((w["id"], round(math.degrees(seg.max() - seg.min()), 1), round(math.degrees(abs(seg[-1] - seg[0])), 1)))
    print("roll range per turn (id, max-min deg, net deg):", rr)
    print("grown (dz=0) share: %.1f %%" % (100.0 * gr.mean()))
    # to anchor space: x,y = screen position as a fraction of the anchor box, z in anchor heights
    def to_anchor(P3, scr):
        return [round((scr[0] - ANCHOR["left"]) / ANCHOR["width"], 5), round((scr[1] - ANCHOR["top"]) / ANCHOR["height"], 5),
                round(P3[2] / ANCHOR["height"], 5)]
    rings = []
    for i in range(0, N, 2):
        l = to_anchor(Lw[i], E1[i])
        r = to_anchor(Rw[i], E2[i])
        rings.append(dict(L=l, R=r))
    json.dump(dict(rings=rings, W=Wt, anchor=ANCHOR, fov=FOV, flips=flips, zc=[round(float(v), 1) for v in zc],
                   dz=[round(float(v), 1) for v in dzs], t=[round(float(v), 1) for v in t], sign=[int(v) for v in sg],
                   grown=[bool(v) for v in gr]), open(OUTD + "/ruled_desktop.json", "w"))
    print("wrote", OUTD + "/ruled_desktop.json", len(rings), "rings")


if __name__ == "__main__":
    main()
