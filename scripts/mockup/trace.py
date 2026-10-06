#!/usr/bin/env python3
"""Ordered centreline trace of the AK sculpture (public/lab/ref/ak-sculpture.webp), End 1 (tail, bottom edge) -> End 2
(crossbar tip). Hand waypoints (read off the sculpture, topology fixed by the designer) are interpolated with a smoothing
spline, then recentred on the band wherever the band is isolated in the mask. Spans that are hidden behind another strand
(or inside a tight turn where the mask is not one clean band) keep the waypoint curve and are flagged visible=False.

Usage: ANALYZE_OUT=$SP/r2 .venv/bin/python trace.py
Writes $OUT/sculpture/trace.json (same schema as the old centreline2d_orig.json: points, visible, anchors) and $OUT/trace_review.png
"""
import json, os, sys
import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.interpolate import splprep, splev

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.environ.get("ANALYZE_OUT", "/private/tmp/claude-501/-Users-ashmitkhurana-Development-studio-portfolio/428f1961-b6ad-4758-ba30-ff5eb1800006/scratchpad/r2")

# (name or None, x, y, hidden). hidden: centreline is covered by another strand (bridged).
WP = [
    ("tail_a", 492, 938, 0), (None, 568, 900, 0), ("tail_b", 644, 860, 0), (None, 709, 822, 0),
    (None, 752, 785, 0), ("S_turn", 773, 748, 0), (None, 768, 722, 0), (None, 745, 710, 0), ("S_mid", 700, 714, 0),
    (None, 650, 720, 0), (None, 600, 725, 0), ("S_left", 550, 728, 0), (None, 500, 726, 0), (None, 468, 712, 0),
    ("leg_bottom", 455, 690, 0), (None, 462, 660, 0), (None, 472, 620, 0), (None, 479, 580, 0), (None, 490, 540, 0),
    (None, 500, 500, 0), (None, 512, 460, 0), ("leg_under_crossbar", 526, 420, 1), (None, 535, 380, 1), (None, 543, 340, 0),
    (None, 553, 300, 0), (None, 564, 260, 0), (None, 576, 220, 0), (None, 590, 180, 0), (None, 608, 140, 0),
    (None, 628, 108, 0), ("A_apex", 657, 92, 0), (None, 686, 94, 0), (None, 714, 112, 0), (None, 740, 140, 0),
    (None, 759, 180, 0), (None, 775, 220, 0), ("rleg_top", 793, 260, 0), (None, 808, 300, 0), (None, 823, 340, 0),
    ("rleg_mid", 838, 380, 0), ("rleg_under_wrap", 854, 420, 1), (None, 869, 460, 1), (None, 885, 500, 0), (None, 901, 540, 0),
    (None, 919, 580, 0), (None, 937, 620, 0), (None, 956, 660, 0), (None, 981, 700, 0), (None, 1013, 738, 0),
    ("lower_back", 1055, 762, 0), (None, 1100, 770, 0), (None, 1150, 772, 0), ("lower_tip", 1195, 768, 0), (None, 1228, 750, 0),
    (None, 1252, 722, 0), (None, 1263, 688, 0), (None, 1256, 655, 0), (None, 1229, 620, 0), (None, 1191, 580, 0),
    ("lower_return", 1137, 540, 0), (None, 1060, 500, 0), (None, 1000, 476, 0), ("ret_pre", 950, 455, 0),
    ("ret_behind", 905, 443, 1), (None, 870, 447, 1), (None, 835, 462, 1), (None, 808, 468, 1),
    ("wrap", 790, 448, 0), (None, 800, 425, 0), ("wrap_front", 835, 414, 0), (None, 880, 408, 0), (None, 930, 390, 0),
    ("lowerarm_mid", 1000, 356, 0), (None, 1034, 340, 0), (None, 1099, 300, 0), (None, 1139, 260, 0), (None, 1163, 220, 0),
    (None, 1175, 180, 0), (None, 1177, 140, 0), ("upper_tip", 1172, 108, 0), (None, 1155, 88, 0), (None, 1120, 85, 0),
    (None, 1085, 96, 0), (None, 1060, 115, 0), ("top_arm", 1017, 145, 0), (None, 979, 182, 0), (None, 947, 220, 0),
    (None, 920, 260, 0), (None, 893, 300, 0), ("top_behind", 868, 336, 1), (None, 840, 360, 1), (None, 800, 371, 1),
    ("crossbar_right", 760, 377, 0), (None, 700, 388, 0), ("crossbar_mid", 640, 395, 0), (None, 580, 402, 0), (None, 520, 412, 0),
    (None, 470, 420, 0), (None, 430, 430, 0), (None, 395, 440, 0), (None, 363, 456, 0), ("crossbar_curl", 340, 480, 0),
    (None, 331, 515, 0), ("end2", 329, 552, 0),
]


# ---- R3: the signature knot (public/lab/ref/ak-signature-cutout.webp, 852 x 1846, = hero-mobile coordinates). Topology per the designer:
# tail -> S bend (half twist) -> long band leftward -> far-left fold -> A left leg (behind the crossbar arch) -> apex fold -> A right leg
# (frontmost; the K stem) -> bottom K loop (returns BEHIND the right leg) -> crossbar arch (in FRONT of the left leg) -> far-left wrap
# (behind the leg, fold) -> thin band crossing BEHIND the right leg -> upper K loop (tip fold) -> back section behind -> End 2 hidden.
WP_SIG = [
    ("tail_a", 210, 1844, 0), (None, 283, 1800, 0), (None, 327, 1750, 0), (None, 380, 1700, 0), ("tail_b", 443, 1650, 0), (None, 520, 1600, 0),
    (None, 595, 1550, 0), (None, 655, 1503, 0), (None, 697, 1455, 0), ("S_turn", 715, 1405, 0), (None, 700, 1360, 0), (None, 665, 1320, 0),
    (None, 620, 1290, 0), (None, 570, 1262, 0), ("band_mid", 500, 1240, 0), (None, 430, 1218, 0), (None, 360, 1196, 0), (None, 290, 1175, 0),
    (None, 220, 1157, 0), (None, 150, 1140, 0), (None, 95, 1122, 0), ("fold_left", 55, 1085, 0), (None, 90, 1040, 0), (None, 130, 1020, 0),
    (None, 150, 990, 0), (None, 165, 950, 0), (None, 172, 920, 0), (None, 180, 890, 0), ("leg_behind_arch", 200, 830, 1), (None, 225, 790, 1),
    (None, 244, 765, 0), (None, 252, 735, 0), (None, 263, 705, 0), (None, 274, 675, 0), (None, 286, 648, 0), (None, 302, 618, 0),
    (None, 322, 592, 0), ("A_apex", 352, 578, 0), (None, 385, 592, 0), (None, 405, 622, 0), (None, 414, 650, 0), (None, 423, 680, 0),
    (None, 431, 710, 0), (None, 440, 740, 0), (None, 447, 770, 0), (None, 460, 830, 0), ("rleg_mid", 472, 890, 0), (None, 485, 950, 0),
    (None, 499, 1000, 0), (None, 515, 1050, 0), (None, 537, 1100, 0), (None, 560, 1150, 0), (None, 585, 1190, 0), (None, 625, 1220, 0),
    ("K_bottom", 675, 1235, 0), (None, 725, 1232, 0), (None, 770, 1210, 0), (None, 810, 1170, 0), (None, 825, 1120, 0), (None, 815, 1070, 0),
    (None, 790, 1020, 0), (None, 750, 985, 0), (None, 710, 955, 0), (None, 665, 925, 0), (None, 625, 905, 0), (None, 580, 895, 0),
    ("ret_behind", 530, 888, 1), (None, 480, 886, 1), (None, 440, 884, 0), (None, 405, 870, 0), (None, 360, 845, 0), (None, 310, 818, 0),
    ("arch_top", 260, 800, 0), (None, 215, 795, 0), (None, 170, 807, 0), (None, 130, 830, 0), (None, 105, 860, 0), ("curl_left", 95, 895, 0),
    (None, 110, 930, 1), (None, 145, 985, 1), (None, 190, 1030, 1), ("thin_tip", 225, 1046, 0), (None, 260, 1042, 0), (None, 330, 1017, 0),
    (None, 400, 977, 0), (None, 450, 937, 0), (None, 500, 905, 0), ("cross_behind", 530, 885, 1), (None, 565, 858, 1), (None, 600, 825, 0),
    (None, 650, 783, 0), (None, 700, 742, 0), (None, 750, 710, 0), (None, 795, 700, 0), ("K_top_tip", 825, 728, 0), (None, 822, 765, 0),
    (None, 800, 800, 0), (None, 760, 840, 0), (None, 720, 870, 0), (None, 685, 895, 1), ("end2", 645, 912, 1),
]


def spl(P, ns=4000, smooth=0.0):
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(P, axis=0).T))]
    tck, u = splprep([P[:, 0], P[:, 1]], u=d / d[-1], s=smooth, k=3)
    return np.stack(splev(np.linspace(0, 1, ns), tck), 1), u


def main():
    SIG = os.environ.get("DATASET") == "sig"
    sub = "sig" if SIG else "sculpture"
    M = np.array(Image.open(OUT + "/%s/ribbon_mask.png" % sub).convert("L")) > 127
    if SIG:
        rgb = np.array(Image.open(OUT + "/cutout.png").convert("RGB"))
    else:
        rgb = np.array(Image.open(os.path.join(ROOT, "public/lab/ref/ak-sculpture.webp")).convert("RGB"))
    W = 110.0
    WPX = WP_SIG if SIG else WP
    names = [w[0] for w in WPX]
    P = np.array([[w[1], w[2]] for w in WPX], float)
    hid = np.array([w[3] for w in WPX], bool)
    # smoothing spline through the waypoints (s = n * 3^2: a few px of slack)
    C, u = spl(P, 4000, smooth=len(P) * 3.0)
    # waypoint parameter positions on the dense curve
    idx = [int(np.argmin(np.hypot(*(C - p).T))) for p in P]
    # hidden flag along the dense curve: between the arc positions of consecutive hidden waypoints (padded by half a gap)
    vis = np.ones(len(C), bool)
    for i in range(len(P)):
        if hid[i]:
            a = idx[i - 1] + (idx[i] - idx[i - 1]) // 2 if i > 0 else idx[i]
            b = idx[i] + (idx[i + 1] - idx[i]) // 2 if i + 1 < len(P) else idx[i]
            vis[a:b + 1] = False
    soft = ndi.gaussian_filter(M.astype(np.float32), 0.8)

    def cast(c, n, rmax, step=0.5):
        ts = np.arange(0, rmax, step)
        v = ndi.map_coordinates(soft, [c[1] + n[1] * ts, c[0] + n[0] * ts], order=1, mode="nearest")
        ins = v > 0.5
        k = np.nonzero(ins[:-1] & ~ins[1:])[0]
        return (ts[k[0]] if len(k) else None) if ins[0] else None

    # arc-resample to 2 px
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(C, axis=0).T))]
    n2 = int(d[-1] / 2.0)
    g = np.linspace(0, d[-1], n2)
    Q = np.stack([np.interp(g, d, C[:, 0]), np.interp(g, d, C[:, 1])], 1)
    V = np.interp(g, d, vis.astype(float)) > 0.5
    moved = 0
    for it in range(3):
        T = np.gradient(Q, axis=0)
        T /= np.hypot(T[:, 0], T[:, 1])[:, None]
        N = np.stack([-T[:, 1], T[:, 0]], 1)
        Qn = Q.copy()
        for i in range(n2):
            if not V[i]:
                continue
            tl = cast(Q[i], N[i], 1.3 * W)
            tr = cast(Q[i], -N[i], 1.3 * W)
            if tl is None or tr is None:
                continue
            w = tl + tr
            if not (0.45 * W <= w <= 1.25 * W):
                continue
            sh = 0.5 * (tl - tr)
            if abs(sh) > 22:
                continue
            Qn[i] = Q[i] + N[i] * sh * 0.6
        # smooth the correction field so it never kinks the curve
        dlt = Qn - Q
        dlt = np.stack([ndi.gaussian_filter1d(dlt[:, k], 6.0, mode="nearest") for k in (0, 1)], 1)
        moved = float(np.hypot(*dlt.T).max())
        Q = Q + dlt
    print("recentring max last-iteration shift %.2f px" % moved)
    Q = np.stack([ndi.gaussian_filter1d(Q[:, k], 3.0, mode="nearest") for k in (0, 1)], 1)
    # anchors: index of nearest point to each named waypoint
    anchors = {}
    for nm, p in zip(names, P):
        if nm:
            anchors[nm] = int(np.argmin(np.hypot(*(Q - p).T)))
    out = dict(points=np.round(Q, 2).tolist(), visible=V.tolist(), anchors=anchors, W=W, image=dict(w=rgb.shape[1], h=rgb.shape[0]),
               note="End 1 = tail (bottom edge) -> End 2 = crossbar tip; points every 2 px of arc; visible False = hidden behind another strand (bridged)")
    json.dump(out, open(OUT + "/%s/trace.json" % sub, "w"))
    # review overlay
    S = 2
    img = cv2.resize(rgb, None, fx=S, fy=S, interpolation=cv2.INTER_CUBIC)[:, :, ::-1].copy()
    img = (img * 0.6).astype(np.uint8)
    for i in range(0, n2 - 1):
        col = (60, 255, 60) if V[i] else (255, 60, 255)
        cv2.line(img, tuple(int(v * S) for v in Q[i]), tuple(int(v * S) for v in Q[i + 1]), col, 2, cv2.LINE_AA)
    for k in range(0, n2, 50):
        cv2.putText(img, str(k // 50), tuple(int(v * S) + 4 for v in Q[k]), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
    for nm, i in anchors.items():
        p = Q[i]
        cv2.circle(img, (int(p[0] * S), int(p[1] * S)), 5, (0, 220, 255), -1, cv2.LINE_AA)
        cv2.putText(img, nm, (int(p[0] * S) + 6, int(p[1] * S) - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 220, 255), 1, cv2.LINE_AA)
    cv2.putText(img, "trace End1(tail) -> End2: green = visible band centre, magenta = hidden/bridged", (20, img.shape[0] - 20),
                cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2, cv2.LINE_AA)
    cv2.imwrite(OUT + "/trace_review.png", img)
    print("trace: %d points, %.0f px, hidden %d" % (n2, d[-1], int((~V).sum())))


if __name__ == "__main__":
    main()
