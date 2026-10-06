#!/usr/bin/env python3
"""R4: snap the ruled model's two edge lines onto the REAL edge lines of the signature cutout (interior lines included).

edge map: multi-scale Canny on L* (2x upsampled) + gradient magnitude + alpha boundary -> r4/edgemap.png.
snake: for edge1 / edge2 separately a DP over offsets along the edge normal (+-W px, hard |d offset| <= 2 px per 2 px of arc, 2nd-difference penalty),
score = strength x gradient-direction agreement (|cos| >= 0.85) - distance penalty. Hidden edges (a strand in front covers them, from a z-buffer of the
current lift) are not snapped: they are PCHIP-interpolated between the visible snapped ends. 3 iterations re-predicting from the updated edges.
Usage: .venv/bin/python snake.py     (reads r3/edges.json + r3/ruled_phone.json, writes r4/edges_snap.json, edges_snap_review.png)
"""
import json, os, sys
import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.interpolate import PchipInterpolator

SP = ("/private/tmp/claude-501/-Users-ashmitkhurana-Development-studio-portfolio/428f1961-b6ad-4758-ba30-ff5eb1800006/scratchpad")
R3, R4 = SP + "/r3", SP + "/r4"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
UP = 2


def edge_map(rgb, alpha):
    big = cv2.resize(rgb, None, fx=UP, fy=UP, interpolation=cv2.INTER_CUBIC)
    L = cv2.cvtColor(big, cv2.COLOR_RGB2LAB)[..., 0]
    can = np.zeros(L.shape, np.float32)
    for sg in (1.5, 2.5, 3.5):
        b = cv2.GaussianBlur(L, (0, 0), sg)
        lo = 6 if sg > 2 else 10
        can += (cv2.Canny(b, lo, lo * 2.5) > 0).astype(np.float32)
    can = cv2.GaussianBlur(can / 3.0, (0, 0), 1.2)
    can = np.clip(can / max(np.percentile(can[can > 0], 98), 1e-6), 0, 1)
    Lf = cv2.GaussianBlur(L.astype(np.float32), (0, 0), 2.0)
    gx = cv2.Sobel(Lf, cv2.CV_32F, 1, 0, ksize=3); gy = cv2.Sobel(Lf, cv2.CV_32F, 0, 1, ksize=3)
    gm = np.hypot(gx, gy)
    gmn = np.clip(gm / np.percentile(gm, 99), 0, 1)
    ab = cv2.resize(alpha.astype(np.uint8), None, fx=UP, fy=UP, interpolation=cv2.INTER_NEAREST)
    ab = (ab - cv2.erode(ab, np.ones((3, 3), np.uint8))).astype(np.float32)
    ab = cv2.GaussianBlur(ab, (0, 0), 1.0); ab = np.clip(ab * 3, 0, 1)
    strength = np.clip(0.4 * can + 0.3 * gmn + 1.2 * ab, 0, 1.4)
    gdir = np.stack([gx, gy], -1) / np.maximum(gm, 1e-6)[..., None]
    return strength, gdir, can, gmn



# ---- hand-read edge stations (mockup px) for windows the automatic pairing cannot see: (E1, E2) in travel order, even spacing along the window.
# E1 / E2 keep the physical labels of edges.json. Read off 3x crops of the cutout. mode "fill": the span between two stations lists is hidden
# (behind another strand) and linearly bridged.
HAND_WINDOWS = []
SMOOTH_DMAX = 14.0
HAND = {
    # crossbar arch curling round the far-left of the A left leg (outer edge E1, rim E2); the strip goes edge-on and slips behind the leg band
    "arch_curl": dict(stations=[
        ((556, 903), (560, 990)), ((412, 852), (408, 955)), ((380, 832), (380, 933)), ((345, 806), (345, 911)), ((300, 790), (300, 878)),
        ((250, 783), (250, 851)), ((207, 785), (205, 845)), ((177, 793), (177, 848)), ((153, 807), (153, 857)),
        ((130, 823), (130, 870)), ((110, 847), (113, 883)), ((95, 877), (102, 897)), ((88, 903), (95, 910)), ((88, 927), (92, 927)),
        ((92, 950), (96, 943)), ((108, 962), (112, 958)), ((130, 982), (134, 978)), ((155, 1003), (159, 999)), ((185, 1027), (189, 1023)),
        ((214, 1048), (217, 1044)), ((240, 1054), (240, 1037)), ((270, 1055), (270, 1020)), ((300, 1047), (300, 1001)), ((340, 1033), (340, 975)),
        ((380, 1015), (380, 950))], pad=16),
    # bottom K: the stem turns under, the bright rim line is the hole ellipse (E2), the silhouette is E1; the band goes edge-on at the bottom
    "k_bottom": dict(stations=[
        ((519, 1190), (612, 1166)), ((545, 1212), (631, 1187)),
        ((580, 1232), (650, 1206)), ((625, 1246), (675, 1225)), ((675, 1252), (700, 1237)), ((725, 1248), (722, 1236)), ((775, 1232), (742, 1219)),
        ((812, 1205), (745, 1200)), ((836, 1175), (739, 1181)), ((835, 1140), (725, 1153))], pad=24),
}


def apply_hand(E1, E2, Q, name, spec, N0):
    st = spec["stations"]
    mids = np.array([(np.array(a) + np.array(b)) / 2 for a, b in st])
    # trace samples (2 px) nearest the first / last station midpoint
    i0 = int(np.argmin(np.hypot(*(Q - mids[0]).T))); i1 = int(np.argmin(np.hypot(*(Q - mids[-1]).T)))
    if i1 <= i0:
        print("hand", name, "ordering failed", i0, i1); return None
    cum = np.r_[0, np.cumsum(np.hypot(*np.diff(mids, axis=0).T))]
    ks = np.round(i0 + (i1 - i0) * cum / cum[-1]).astype(int)
    for j in range(1, len(ks)):
        ks[j] = max(ks[j], ks[j - 1] + 1)
    A = np.array([a for a, b in st], float); B = np.array([b for a, b in st], float)
    from scipy.interpolate import CubicSpline
    pad = spec.get("pad", 14)
    lo, hi = max(1, ks[0] - pad), min(len(E1) - 2, ks[-1] + pad)
    last = ks[-1]
    if "bridge_to" in spec:
        # hidden stretch after the last station: linear bridge to the stated ends, then the automatic model resumes
        pa, pb = np.array(spec["bridge_to"][0], float), np.array(spec["bridge_to"][1], float)
        j1 = int(np.argmin(np.hypot(*(0.5 * (E1 + E2) - 0.5 * (pa + pb)).T)[last:]) + last)
        for kk in range(last, j1 + 1):
            f = (kk - last) / max(j1 - last, 1)
            E1[kk] = A[-1] * (1 - f) + pa * f; E2[kk] = B[-1] * (1 - f) + pb * f
        print("hand", name, "bridge", last, "->", j1)
        hi = j1 + pad
    for E, P, other in ((E1, A, None), (E2, B, None)):
        kk = np.array([lo] + list(ks) + [hi], float)
        vv = np.vstack([E[lo][None], P, E[hi][None]]) if "bridge_to" not in spec else np.vstack([E[lo][None], P, E[hi][None]])
        d0 = (E[lo + 1] - E[lo - 1]) / 2.0; d1 = (E[hi + 1] - E[hi - 1]) / 2.0
        cs_ = CubicSpline(kk, vv, bc_type=((1, d0), (1, d1)))
        if "bridge_to" in spec:
            seg = np.arange(lo, last + pad // 2 + 1)
            E[seg] = cs_(seg) if False else E[seg]
        E[lo:ks[-1] + 1] = cs_(np.arange(lo, ks[-1] + 1))
    print("hand", name, "window samples", lo, hi, "stations", len(ks))
    return lo, hi



def curv_osc(P, u, W, amp_min=0.25):
    """arc positions (u) of curvature lobes shorter than 0.5 W with |kappa| W > amp_min between two curved lobes (wavelength < 1 W)"""
    n = int(u[-1] / 2.0)
    g = np.linspace(0, u[-1], n)
    Q = np.stack([np.interp(g, u, P[:, 0]), np.interp(g, u, P[:, 1])], 1)
    Q = np.stack([ndi.gaussian_filter1d(Q[:, c], 1.5) for c in (0, 1)], 1)
    d1 = np.gradient(Q, axis=0); d2 = np.gradient(d1, axis=0)
    k = (d1[:, 0] * d2[:, 1] - d1[:, 1] * d2[:, 0]) / np.maximum(np.hypot(*d1.T), 1e-6) ** 3 * W
    sg = np.sign(np.where(np.abs(k) < 0.02, 0, k))
    lobes = []; a = 0
    for i in range(1, n + 1):
        if i == n or sg[i] != sg[a]:
            if sg[a] != 0:
                lobes.append((a, i - 1, np.abs(k[a:i]).max()))
            a = i
    out = []
    for j in range(1, len(lobes) - 1):
        a_, b_, amp = lobes[j]
        if (b_ - a_ + 1) * 2.0 < 0.5 * W and amp > amp_min and lobes[j - 1][2] > amp_min and lobes[j + 1][2] > amp_min and amp < 3.0:
            out.append(float(g[(a_ + b_) // 2]))
    return out


def resample2(P, step=2.0):
    # index-based doubling: both edges (and the centre) must stay paired sample by sample
    n = len(P)
    u = np.linspace(0, n - 1, 2 * (n - 1) + 1)
    return np.stack([np.interp(u, np.arange(n), P[:, 0]), np.interp(u, np.arange(n), P[:, 1])], 1)


def resample2_arc(P, step=2.0):
    s = np.r_[0, np.cumsum(np.hypot(*np.diff(P, axis=0).T))]
    n = int(s[-1] / step) + 1
    u = np.arange(n) * step
    return np.stack([np.interp(u, s, P[:, 0]), np.interp(u, s, P[:, 1])], 1)


def normals(P):
    T = np.gradient(ndi.gaussian_filter1d(P, 3.0, axis=0, mode="nearest"), axis=0)
    T /= np.maximum(np.hypot(T[:, 0], T[:, 1]), 1e-9)[:, None]
    return T, np.stack([-T[:, 1], T[:, 0]], 1)


def snake(P, vis, strength, gdir, R=40, mu=0.05, lam=0.006, thr=0.85, other=None, lmin=None, lmax=None):
    N = len(P)
    T, Nn = normals(P)
    offs = np.arange(-R, R + 1, 1.0)
    K = len(offs)
    sc = np.zeros((N, K), np.float32)
    for k, d in enumerate(offs):
        q = P + Nn * d
        x, y = q[:, 0] * UP, q[:, 1] * UP
        s_ = ndi.map_coordinates(strength, [y, x], order=1, mode="nearest")
        g = np.stack([ndi.map_coordinates(gdir[..., c], [y, x], order=1, mode="nearest") for c in (0, 1)], 1)
        cs = np.abs((g * Nn).sum(1))
        a = np.clip((cs - thr) / (1 - thr), 0, 1) ** 0.5
        sc[:, k] = s_ * a - lam * abs(d)
        if other is not None:
            ln = np.hypot(*(q - other).T)
            sc[:, k] -= 1.5 * (ln < lmin) + 1.5 * (ln > lmax)
    sc[~vis] = (-lam * np.abs(offs) * 0.1)[None, :]       # hidden: no evidence, weak pull to the prediction (overridden by PCHIP anyway)
    DS = (-2, -1, 0, 1, 2)
    NEG = -1e9
    cost = np.full((K, 5), NEG, np.float32)
    cost[:, 2] = sc[0]
    bp = np.zeros((N, K, 5), np.int8)
    for i in range(1, N):
        new = np.full((K, 5), NEG, np.float32)
        arg = np.zeros((K, 5), np.int8)
        for jn, dn in enumerate(DS):
            best = np.full(K, NEG, np.float32); ba = np.zeros(K, np.int8)
            for jo, do in enumerate(DS):
                prev = np.full(K, NEG, np.float32)
                # state (d_prev = d - dn, delta = do)
                if dn >= 0:
                    prev[dn:] = cost[:K - dn, jo] if dn > 0 else cost[:, jo]
                else:
                    prev[:K + dn] = cost[-dn:, jo]
                v = prev - mu * (dn - do) ** 2
                m = v > best
                best = np.where(m, v, best); ba = np.where(m, jo, ba)
            new[:, jn] = best + sc[i]
            arg[:, jn] = ba
        cost = new; bp[i] = arg
    k, j = np.unravel_index(np.argmax(cost), cost.shape)
    path = np.zeros(N, int)
    for i in range(N - 1, -1, -1):
        path[i] = k
        jo = bp[i, k, j]
        k = k - DS[j]
        j = jo
    off = offs[path]
    return off, Nn


def fill_hidden(off, vis):
    if vis.all() or not vis.any():
        return off
    idx = np.arange(len(off))
    f = PchipInterpolator(idx[vis], off[vis], extrapolate=False)
    out = f(idx)
    first, last = idx[vis][0], idx[vis][-1]
    out[:first] = off[first]; out[last + 1:] = off[last]
    return out


def visibility(E1, E2, z):
    """per-sample visibility of each edge: painter's z-buffer of the ring quads (mockup px); a sample is visible when the frontmost ring just
    inside its edge belongs to its own part of the strand (arc distance < 2.5 rings-width) -> returns (v1, v2)."""
    H, W = 1846, 852
    N = len(E1)
    lab = np.full((H, W), -1, np.int32)
    order = np.argsort(z[:-1])
    for i in order:
        q = np.array([E1[i], E2[i], E2[i + 1], E1[i + 1]])
        cv2.fillConvexPoly(lab, np.round(q).astype(np.int32), int(i))
    ctr = 0.5 * (E1 + E2)
    out = []
    for E, sgn in ((E1, 1), (E2, -1)):
        u = ctr - E
        u = u / np.maximum(np.hypot(u[:, 0], u[:, 1]), 1e-9)[:, None]
        p = E + u * 3.0
        x = np.clip(np.round(p[:, 0]).astype(int), 0, W - 1); y = np.clip(np.round(p[:, 1]).astype(int), 0, H - 1)
        ids = lab[y, x]
        out.append((ids >= 0) & (np.abs(ids - np.arange(N)) < 60))
    return out[0], out[1]


def main():
    c = np.array(Image.open(ROOT + "/public/lab/ref/ak-signature-cutout.webp"))
    rgb, alpha = c[..., :3], c[..., 3] > 128
    strength, gdir, can, gmn = edge_map(rgb, alpha)
    cv2.imwrite(R4 + "/edgemap.png", (strength * 255).astype(np.uint8))
    E = json.load(open(R3 + "/edges.json"))
    RP = json.load(open(R3 + "/ruled_phone.json"))
    SX, SY = 852.0 / 390.0, 1846.0 / 844.0
    # model edges in mockup px (the R3 snapped model = the edges.json arrays), depth per sample from the R3 lift
    E1 = np.array(E["edge1"]); E2 = np.array(E["edge2"]); N0 = len(E1)
    zc = 0.5 * (np.array(RP["Lw"])[:, 2] + np.array(RP["Rw"])[:, 2])
    E1 = resample2(E1); E2 = resample2(E2)
    N = len(E1)
    z = np.interp(np.linspace(0, N0 - 1, N), np.arange(N0), zc)
    Qc = resample2(np.array(E["centre"]))[:N]
    for nm, spec in HAND.items():
        r_ = apply_hand(E1, E2, Qc, nm, spec, N0)
        if r_:
            HAND_WINDOWS.append(r_)
    info = {}
    for it, R in enumerate((24, 14, 8)):
        v1, v2 = visibility(E1, E2, z)
        offs = []
        Wref = 112.0
        # ruling length limits per sample: >= 0.3 W unless in a turn window (the model's own ruling is short there), <= 1.25 W
        mlen = np.hypot(*(E2 - E1).T)
        lmin = np.where(mlen < 0.5 * Wref, 0.0, 0.4 * Wref); lmax = np.full(N, 1.3 * Wref)
        for nm, P, v, oth in (("e1", E1, v1, E2), ("e2", E2, v2, None)):
            if oth is None:
                oth = E1_new
            off, Nn = snake(P, v, strength, gdir, R=R, other=oth, lmin=lmin, lmax=lmax)
            off = fill_hidden(off, v)
            for lo_, hi_ in HAND_WINDOWS:      # hand-read windows are kept as read (they are already exact; the DP only refines the automatic parts)
                off[lo_:hi_ + 1] = 0.0
            off = ndi.gaussian_filter1d(off, 1.0, mode="nearest")
            offs.append((P + Nn * off[:, None], off, v))
            if nm == "e1":
                E1_new = P + Nn * off[:, None]
        (E1, o1, v1), (E2, o2, v2) = offs
        print("iter %d R=%d: |offset| edge1 mean %.1f max %.1f, edge2 mean %.1f max %.1f; hidden %.0f%% / %.0f%%" % (
            it, R, np.abs(o1).mean(), np.abs(o1).max(), np.abs(o2).mean(), np.abs(o2).max(), 100 * (~v1).mean(), 100 * (~v2).mean()))
    # smoothing: least-squares cubic splines (knots every 0.75 W, 0.25 W in turn / hand windows) + curvature-radius limit, as edges.py
    import edges as ed
    from scipy.interpolate import LSQUnivariateSpline
    W = 112.0
    tt = np.arange(N) * 2.0
    wz = []
    for w_ in E["turn_windows"]:
        if "i0" in w_:
            wz.append((w_["i0"] * N / N0 * 2.0, w_["i1"] * N / N0 * 2.0))
    for lo_, hi_ in HAND_WINDOWS:
        wz.append((lo_ * 2.0, hi_ * 2.0))
    KS = float(os.environ.get('KNOT_OUT', '0.8')); KD = float(os.environ.get('KNOT_WIN', '0.4'))
    E1raw, E2raw = E1.copy(), E2.copy()
    widx = []
    for w_ in E["turn_windows"]:
        if "i0" in w_:
            widx.append((int(w_["i0"] * N / N0), int(w_["i1"] * N / N0)))
    widx += [(int(l_), int(h_)) for l_, h_ in HAND_WINDOWS]
    sm = []
    for Ee in (E1, E2):
        # per-edge chord-length parameter: knots are spaced by TRUE arc length of this edge (0.8 W straight-ish, 0.4 W in fold / hand windows)
        u = np.r_[0, np.cumsum(np.hypot(*np.diff(Ee, axis=0).T))]
        wz_u = [(u[min(l_, N - 1)], u[min(h_, N - 1)]) for l_, h_ in widx]
        knots = list(np.arange(KS * W, u[-1] - 0.5 * W, KS * W))
        dense = []
        for lo_, hi_ in wz_u:
            dense += list(np.arange(lo_, hi_, KD * W))
            knots = [k for k in knots if not (lo_ - 0.2 * W < k < hi_ + 0.2 * W)]
        knots = np.array(sorted(set(np.round(knots + dense, 2))))
        knots = knots[(knots > u[0] + 8) & (knots < u[-1] - 8)]
        kk = [knots[0]]
        for k_ in knots[1:]:
            if k_ - kk[-1] >= 0.25 * W:
                kk.append(k_)
        knots = np.array(kk)
        # one least-squares cubic spline over the whole edge: C2 across every span join, bridge and fold window by construction;
        # wherever the curvature still oscillates (lobe < 0.5 W) the knots within 0.6 W are thinned (looser fit there: smoothness wins, up to ~3+ px)
        TH = 0.3
        for rnd in range(10):
            TH = min(0.3 + 0.05 * rnd, 0.6)
            if rnd == 0:
                pass
            P2 = np.stack([LSQUnivariateSpline(u, Ee[:, c], knots, k=3)(u) for c in (0, 1)], 1)
            offs_u = curv_osc(P2, u, W)
            if not offs_u:
                break
            keep = np.ones(len(knots), bool)
            for uo in offs_u:
                keep &= np.abs(knots - uo) > TH * W
            if keep.sum() < 4:
                break
            knots = knots[keep]
        print("  edge fit: %d knots, %d residual oscillations" % (len(knots), len(offs_u)))
        sm.append(P2)
    dev = [np.hypot(*(a - b).T) for a, b in zip(sm, (E1raw, E2raw))]
    print("smoothing: deviation from snapped edges mean %.2f p99 %.2f max %.2f px (knots %d)" % (np.mean([d.mean() for d in dev]), np.percentile(np.r_[dev[0], dev[1]], 99), max(d.max() for d in dev), len(knots)))
    for nm_, d_ in zip(("edge1", "edge2"), dev):
        idx_ = np.nonzero(d_ > 3.0)[0]
        if len(idx_):
            runs_ = ed.spans(d_ > 3.0)
            print("  %s deviation > 3 px at (screen, max px):" % nm_, [(np.round(sm[0 if nm_ == "edge1" else 1][(a_ + b_) // 2]).astype(int).tolist(), round(float(d_[a_:b_ + 1].max()), 1)) for a_, b_ in runs_][:12])
    E1, E2 = sm
    np.save(R4 + "/E1raw.npy", E1raw); np.save(R4 + "/E2raw.npy", E2raw)
    # back to the 4 px sampling of edges.json (every 2nd), keep every other sample
    out = dict(E)
    k = np.round(np.linspace(0, N - 1, N0)).astype(int)
    out["edge1"] = np.round(E1[k], 2).tolist(); out["edge2"] = np.round(E2[k], 2).tolist()
    out["centre"] = np.round(0.5 * (E1[k] + E2[k]), 2).tolist()
    out["vis1"] = v1[k].tolist(); out["vis2"] = v2[k].tolist()
    json.dump(out, open(R4 + "/edges_snap.json", "w"))
    # review sheet
    S = 2
    im = cv2.resize(rgb, None, fx=S, fy=S, interpolation=cv2.INTER_CUBIC)[..., ::-1].copy()
    im = (im * 0.6).astype(np.uint8)
    for Ee, v, col in ((E1, v1, (60, 255, 60)), (E2, v2, (255, 60, 255))):
        for i in range(N - 1):
            if v[i] or (i % 6 < 3):
                cv2.line(im, tuple(int(a * S) for a in Ee[i]), tuple(int(a * S) for a in Ee[i + 1]), col, 1 if not v[i] else 2, cv2.LINE_AA)
    for i in range(0, N, 40):
        cv2.line(im, tuple(int(a * S) for a in E1[i]), tuple(int(a * S) for a in E2[i]), (230, 230, 230), 1, cv2.LINE_AA)
    cv2.imwrite(R4 + "/edges_snap_review.png", im)
    print("wrote edges_snap.json, edges_snap_review.png")


if __name__ == "__main__":
    main()
