#!/usr/bin/env python3
"""Rotoscope edge extraction (R1-a): the two EDGES of the ribbon in screen space.

Walks the approved ORDERED trace (result_s2c/centreline2d_orig.json: order/topology only),
pairs the left/right band edges with normal rays, takes the turn windows from the
silhouette contours, interpolates untrusted spans with PCHIP on (centre, half width,
ruling angle), smooths with least-squares cubic splines and writes edges.json plus a
review sheet.

Usage: .venv/bin/python edges.py            (desktop only)
"""
import warnings
warnings.filterwarnings("ignore")
import json
import os
import sys

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from scipy.interpolate import PchipInterpolator, LSQUnivariateSpline

SP = ("/private/tmp/claude-501/-Users-ashmitkhurana-Development-studio-portfolio/"
      "428f1961-b6ad-4758-ba30-ff5eb1800006/scratchpad")
SRC = os.environ.get("ROTO_SRC", "mockup")
SCUL = ("sculpture", "sig")      # "mockup" (old hero-desktop) | "sculpture" (ak-sculpture.webp, $SP/r2)
if SRC == "sig":
    FIT = SP + "/r3/sig"
    OUTD = SP + "/r3"
elif SRC in SCUL:
    FIT = SP + "/r2/sculpture"
    OUTD = SP + "/r2"
else:
    FIT = SP + "/fit/desktop"
    OUTD = SP + "/rotoscope"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
os.makedirs(OUTD, exist_ok=True)

STEP = 4.0          # px of arc between samples
TEXT_NEAR = 6.0     # ribbon_mask already excludes text dilated by 3 px; + 2 px + 1 px slack
EXC_NEAR = 3.0
CROSS_ARC = 3.0     # (x W) arc separation that makes two trace parts "different strands"
CROSS_DIST = 1.0    # (x W) centreline distance below which strands overlap in projection
TURN_DEG = 90.0
TURN_ARC = 2.0      # (x W)
RIDGE_LO, RIDGE_HI, RIDGE_THR = 0.18, 0.66, 0.45   # ridge search window (x rmax/1.4 = x W) and strength
SIG_WINDOWS = [("S_turn", 1.1), ("fold_left", 1.0), ("A_apex", 1.0), ("K_bottom", 1.1), ("curl_left", 1.0), ("thin_tip", 0.9), ("K_top_tip", 1.0)]
RMIN_WIN = {} if SRC in SCUL else {}      # window id -> min radius (x W): the K lower tip's hole cusp needs a rounder edge
DMAX_CURV = 30.0 if SRC in SCUL else None    # sculpture: edges may move this far (px) from the silhouette to reach the curvature rule


# ------------------------------------------------------------------ io
def gray(path):
    return np.array(Image.open(path).convert("L")) > 127


def load():
    M = gray(FIT + "/ribbon_mask.png")
    T = gray(FIT + "/text_mask.png")
    X = gray(FIT + "/exclusion_mask.png")
    if SRC == "sig":
        rgb = np.array(Image.open(SP + "/r3/cutout.png").convert("RGB"))
        cl = json.load(open(FIT + "/trace.json"))
        g = dict(nodes=[])
    elif SRC in SCUL:
        rgb = np.array(Image.open(os.path.join(ROOT, "public/lab/ref/ak-sculpture.webp")).convert("RGB"))
        cl = json.load(open(FIT + "/trace.json"))
        g = dict(nodes=[])      # the skeleton graph of the sculpture is not used: crossings come from the trace self-intersections
    else:
        rgb = np.array(Image.open(os.path.join(ROOT, "public/lab/ref/hero-desktop.webp")).convert("RGB"))
        cl = json.load(open(FIT + "/result_s2c/centreline2d_orig.json"))
        g = json.load(open(FIT + "/graph.json"))
    return M, T, X, rgb, cl, g


# ------------------------------------------------------------------ geometry helpers
def arclen(P):
    return np.r_[0, np.cumsum(np.hypot(*np.diff(P, axis=0).T))]


def smooth_poly(P, sigma):
    return np.stack([ndi.gaussian_filter1d(P[:, i], sigma, mode="nearest") for i in (0, 1)], 1)


def resample(P, step):
    s = arclen(P)
    n = max(2, int(round(s[-1] / step)) + 1)
    t = np.linspace(0, s[-1], n)
    return np.stack([np.interp(t, s, P[:, i]) for i in (0, 1)], 1), t


def heading(P):
    d = np.gradient(P, axis=0)
    return np.unwrap(np.arctan2(d[:, 1], d[:, 0]))


def wrap(a):
    return (a + np.pi) % (2 * np.pi) - np.pi


# ------------------------------------------------------------------ boundary classes
class Boundaries:
    def __init__(self, M, T, X):
        self.H, self.W = M.shape
        self.M = M
        self.soft = ndi.gaussian_filter(M.astype(np.float32), 0.8)
        self.d_text = ndi.distance_transform_edt(~T)
        self.d_exc = ndi.distance_transform_edt(~X)
        self.T = T

    def inside(self, x, y):
        return ndi.map_coordinates(self.soft, [y, x], order=1, mode="nearest") > 0.5

    def classify(self, x, y):
        """0 band, 1 occlusion (text), 2 excluded (chrome rects / image border)"""
        xi = int(round(min(max(x, 0), self.W - 1)))
        yi = int(round(min(max(y, 0), self.H - 1)))
        if self.d_exc[yi, xi] <= EXC_NEAR or xi <= 1 or yi >= self.H - 3 or yi <= 1 or xi >= self.W - 2:
            return 2
        if self.d_text[yi, xi] <= TEXT_NEAR:
            return 1
        return 0

    ridge = None     # sculpture/sig: thin-rim ridge map (occlusion edges inside the silhouette), set by load()

    def cast(self, c, n, rmax, step=0.5):
        t, cls = self.cast_mask(c, n, rmax, step)
        if self.ridge is None:
            return t, cls
        ts = np.arange(0.0, rmax, step)
        rv = ndi.map_coordinates(self.ridge, [c[1] + n[1] * ts, c[0] + n[0] * ts], order=1, mode="nearest")
        lo, hi = int(RIDGE_LO * rmax / step / 1.4), int(RIDGE_HI * rmax / step / 1.4)
        seg = rv[lo:hi]
        if len(seg) < 3:
            return t, cls
        k = int(np.argmax(seg))
        st = float(seg[k])
        tr = ts[lo + k]
        if st < RIDGE_THR:
            return t, cls
        if t is not None and cls == 0 and abs(tr - t) <= 5.0:
            return t, cls
        if t is None or tr < t - 5.0:
            return float(tr), 0
        return t, cls

    def cast_mask(self, c, n, rmax, step=0.5):
        """March from c along unit n; return (distance, class) of the first boundary crossing
        that happens after the ray first is (or enters) the ribbon mask; (None, 3) if nothing."""
        ts = np.arange(0.0, rmax, step)
        xs = c[0] + n[0] * ts
        ys = c[1] + n[1] * ts
        v = ndi.map_coordinates(self.soft, [ys, xs], order=1, mode="nearest")
        ins = v > 0.5
        # first inside->outside transition
        idx = np.nonzero(ins[:-1] & ~ins[1:])[0]
        if len(idx) == 0:
            return None, 3
        i = idx[0]
        # sub-pixel crossing of 0.5
        a, b = v[i], v[i + 1]
        f = (a - 0.5) / (a - b) if a != b else 0.5
        t = ts[i] + f * step
        cls = self.classify(c[0] + n[0] * t, c[1] + n[1] * t)
        if not ins[0]:
            # the centre is not in the mask (behind text / dashed trace): treat as occluded
            cls = max(cls, 1)
        return t, cls


# ------------------------------------------------------------------ stage 1: trace + pairing
def prep_trace(cl, ext_tail=200.0):
    P = np.array(cl["points"], float)
    vis = np.array(cl["visible"], bool)
    if SRC in SCUL:
        # End 1 (the tail) is the START of the trace: extend straight past it (down and out of the frame) by ext_tail px
        tl = P[0] - P[min(40, len(P) - 1)]
        tl /= np.hypot(*tl)
        ext = np.array([P[0] + tl * k for k in np.arange(ext_tail, 0, -1.0)])
        P = np.vstack([ext, P])
        vis = np.r_[np.zeros(len(ext), bool), vis]
    else:
        # extend the tail straight past the last point by ext_tail px
        tl = P[-1] - P[-40]
        tl /= np.hypot(*tl)
        ext = np.array([P[-1] + tl * k for k in np.arange(1, ext_tail + 1, 1.0)])
        P = np.vstack([P, ext])
        vis = np.r_[vis, np.zeros(len(ext), bool)]
    ps = smooth_poly(P, 4.0)
    # resample on arc, carry visibility by nearest original index
    s_orig = arclen(P)
    Q, t = resample(ps, STEP)
    idx = np.clip(np.searchsorted(s_orig, t), 0, len(P) - 1)
    visQ = vis[idx]
    return Q, t, visQ, P, s_orig


def tangent_normal(Q):
    d = np.gradient(Q, axis=0)
    d /= np.hypot(d[:, 0], d[:, 1])[:, None]
    n = np.stack([-d[:, 1], d[:, 0]], 1)    # +n = "left" in image coords (x right, y down => clockwise side)
    return d, n


def crossing_flags(Q, t, W, g):
    """Crossing zones: disks of 0.8 W around the self-intersections of the trace (two arc-distant
    parts of the strip overlapping in projection) and 0.5 W around graph junctions."""
    flag = np.zeros(len(Q), bool)
    A, Bp = Q[:-1], Q[1:]
    pts = []
    for i in range(len(A)):
        r = Bp[i] - A[i]
        for j in range(i + 1, len(A)):
            if abs(t[j] - t[i]) < CROSS_ARC * W:
                continue
            sv = Bp[j] - A[j]
            den = r[0] * sv[1] - r[1] * sv[0]
            if abs(den) < 1e-9:
                continue
            w = A[j] - A[i]
            u = (w[0] * sv[1] - w[1] * sv[0]) / den
            v = (w[0] * r[1] - w[1] * r[0]) / den
            if 0 <= u <= 1 and 0 <= v <= 1:
                pts.append(A[i] + u * r)
    for p in pts:
        flag |= np.hypot(*(Q - p).T) < 0.8 * W
    for nd in g["nodes"]:
        if nd["kind"] == "junction":
            flag |= np.hypot(*(Q - np.array(nd["xy"])).T) < 0.5 * W
    return flag, pts


def pair_edges(B, Q, n, rmax):
    N = len(Q)
    tl = np.full(N, np.nan); tr = np.full(N, np.nan)
    cl_ = np.full(N, 3); cr_ = np.full(N, 3)
    for i in range(N):
        tl[i], cl_[i] = B.cast(Q[i], n[i], rmax)
        tr[i], cr_[i] = B.cast(Q[i], -n[i], rmax)
    return tl, cl_, tr, cr_


def turn_windows(Q, t, W):
    th = heading(smooth_poly(Q, 3))
    # turning within a window of 2W of arc
    half = int(round(TURN_ARC * W / 2 / STEP))
    turn = np.zeros(len(Q))
    for i in range(len(Q)):
        a, b = max(0, i - half), min(len(Q) - 1, i + half)
        turn[i] = abs(th[b] - th[a])
    ok = np.degrees(turn) > TURN_DEG
    # grow each flagged run to the full turn extent: samples whose |dtheta| is large
    wins = []
    i = 0
    while i < len(Q):
        if ok[i]:
            j = i
            while j + 1 < len(Q) and ok[j + 1]:
                j += 1
            wins.append((i, j))
            i = j + 1
        else:
            i += 1
    return wins, th, np.degrees(turn)



def rolling_median(x, ok, half):
    out = np.full(len(x), np.nan)
    for i in range(len(x)):
        a, b = max(0, i - half), min(len(x), i + half + 1)
        v = x[a:b][ok[a:b]]
        if len(v) >= 3:
            out[i] = np.median(v)
    return out


def face_edge_inner(V, c, n, t_exit, W, lo=0.42, hi=0.5, tmin=0.3, step=0.5):
    """Inner side of a turn: if the ray runs bright face -> dark inner face before the mask
    exit, return the distance of that V crossing (the face boundary)."""
    ts = np.arange(0.0, min(t_exit if t_exit is not None else 1.4 * W, 1.4 * W), step)
    if len(ts) < 4:
        return None
    xs = c[0] + n[0] * ts
    ys = c[1] + n[1] * ts
    v = ndi.map_coordinates(V, [ys, xs], order=1, mode="nearest")
    seen = False
    for k in range(len(ts)):
        if v[k] > hi and ts[k] > 0:
            seen = True
        if seen and ts[k] > tmin * W and v[k] < lo:
            return float(ts[k])
        if not seen and ts[k] > 0.25 * W:
            return None
    return None


def ridge_map(rgb):
    V = rgb.max(2).astype(np.float32) / 255.0
    r = np.clip(ndi.gaussian_filter(V, 1.2) - ndi.gaussian_filter(V, 5.0), 0, None)
    return np.clip(r / np.percentile(r, 99.5), 0, 1)


def build(M, T, X, rgb, cl, g, verbose=True):
    B = Boundaries(M, T, X)
    if SRC == "sig":
        B.ridge = ridge_map(rgb)
    Q, t, vis, P, s_orig = prep_trace(cl)
    d, n = tangent_normal(Q)
    N = len(Q)
    V = ndi.gaussian_filter(rgb.max(2).astype(np.float32) / 255.0, 1.2)
    # first pass: W estimate
    W0 = 115.0
    tl, cls_l, tr, cls_r = pair_edges(B, Q, n, 1.4 * W0)
    ok0 = (cls_l == 0) & (cls_r == 0) & np.isfinite(tl) & np.isfinite(tr)
    W = float(np.median((tl + tr)[ok0]))
    if SRC in SCUL:      # the sculpture's apparent width ranges 55..115 (strongly foreshortened bands): scale on the p90
        W = float(np.percentile((tl + tr)[ok0], 75))
        if SRC == "sig":      # the tail is near the camera (wide): scale on the knot
            kn = ok0 & (Q[:, 1] < 1250)
            W = float(os.environ.get('SIG_W', 112))
    if verbose:
        print("W_est (median apparent width) = %.1f px" % W)
    rmax = 1.4 * W
    tl, cls_l, tr, cls_r = pair_edges(B, Q, n, rmax)
    # turn windows (>= 0.5 W of arc; shorter ones are kinks, not turns)
    wins, th, turn = turn_windows(Q, t, W)
    wins = [(a, b) for a, b in wins if (b - a) * STEP >= 0.5 * W]
    if SRC in SCUL:
        # designer-named turns the 90 deg / 2 W detector under-reports (long rounded turns): the K lower tip and the
        # crossbar end curl are added as explicit windows (anchor +- half-length); the wrap hairpin sits next to a trace
        # self-crossing and is a turn, so there is no crossing filter here
        off = len(P) - len(cl["points"]) if False else None
        ext_n = 200
        sA = arclen(P)
        for nm, half in ((("lower_tip", 1.1 * W), ("crossbar_curl", 1.0 * W)) if SRC == "sculpture" else tuple((n_, h_ * W) for n_, h_ in SIG_WINDOWS)):
            c = float(sA[ext_n + cl["anchors"][nm]])
            a = int(np.searchsorted(t, c - half)); b = int(np.searchsorted(t, c + half))
            wins = [w for w in wins if w[1] < a - 4 or w[0] > b + 4] + [(a, min(b, N - 1))]
        wins.sort()
    else:
        # a window whose centre sits within 1.3 W of a trace self-crossing is the crossing, not a turn
        _, _xp = crossing_flags(Q, t, W, g)
        wins = [(a, b) for a, b in wins
                if not any(np.hypot(*(Q[(a + b) // 2] - p_)) < 1.3 * W for p_ in _xp)]
    in_turn = np.zeros(N, bool)
    inner_pos = np.zeros(N, bool)       # True: inner side is +n (left)
    pad = int(round(0.25 * W / STEP))
    for a, b in wins:
        a2, b2 = max(0, a - pad), min(N - 1, b + pad)
        in_turn[a2:b2 + 1] = True
        sgn = th[b] - th[a] > 0
        inner_pos[a2:b2 + 1] = sgn
        for i in range(a2, b2 + 1):
            if inner_pos[i]:
                f = face_edge_inner(V, Q[i], n[i], tl[i] if np.isfinite(tl[i]) else None, W)
                if f is not None and cls_l[i] != 2:
                    tl[i], cls_l[i] = f, 0
            else:
                f = face_edge_inner(V, Q[i], -n[i], tr[i] if np.isfinite(tr[i]) else None, W)
                if f is not None and cls_r[i] != 2:
                    tr[i], cls_r[i] = f, 0
    cross, xpts = crossing_flags(Q, t, W, g)
    ok = (cls_l == 0) & (cls_r == 0) & np.isfinite(tl) & np.isfinite(tr)
    ws = tl + tr
    half = int(round(3 * W / STEP))
    wmed = rolling_median(ws, ok & ~cross, half)
    wmed = np.where(np.isfinite(wmed), wmed, W)
    hi = np.where(in_turn, 1.6, 1.3)
    ok &= ws <= hi * wmed
    ok &= ws >= 0.5 * wmed
    xflag = np.zeros(N, bool)
    for p_ in xpts:
        xflag |= np.hypot(*(Q - p_).T) < 0.8 * W
    ok &= ~xflag
    ok &= ~(cross & ~in_turn)      # inside a turn the contour edges replace the skeleton-junction veto
    # continuity: reject hits that jump away from the running median of their neighbours
    for arr in (tl, tr):
        a2 = np.where(ok, arr, np.nan)
        med = rolling_median(np.nan_to_num(a2), ok, 3)
        bad = np.isfinite(med) & (np.abs(arr - med) > 0.18 * W)
        ok &= ~np.nan_to_num(bad, nan=0).astype(bool)
    # h / ruling-angle outliers against the running median of the neighbouring trusted samples
    hw_ = 0.5 * (np.nan_to_num(tl) + np.nan_to_num(tr))
    ph_ = np.arctan2(*((-n) * (np.nan_to_num(tl) + np.nan_to_num(tr))[:, None]).T[::-1])
    for _ in range(2):
        mh = rolling_median(hw_, ok, 4)
        bad = np.isfinite(mh) & (np.abs(hw_ - mh) > 0.28 * mh)
        ok &= ~bad
    return dict(contour=np.zeros(N, bool), B=B, Q=Q, t=t, vis=vis, d=d, n=n, V=V, W=W, tl=tl, tr=tr, cls_l=cls_l, cls_r=cls_r,
                ok=ok, cross=cross, xpts=xpts, wins=wins, in_turn=in_turn, inner_pos=inner_pos, th=th)




def floor_fixed_boundaries(S, rgb, M, T, X, box):
    """Boundaries for a window whose bottom edge is cut by the floor-glow rule: colour mask with
    V >= 0.12 and no floor rule, accepted only within 14 px of the original mask (the glow itself
    has the same colour but is far from the crisp silhouette)."""
    import analyze
    h, s_, v = analyze.hsv_of(rgb)
    col = (h >= 2) & (h <= 45) & (s_ > 0.35) & (v >= 0.12)
    x0, y0, x1, y1 = box
    near = ndi.binary_dilation(M, iterations=14)
    M2 = M.copy()
    add = np.zeros_like(M)
    add[y0:y1, x0:x1] = (col & near & ~ndi.binary_dilation(T, iterations=3))[y0:y1, x0:x1]
    M2 |= add
    M2 = ndi.binary_closing(M2, np.ones((5, 5)))
    M2 = ndi.binary_opening(M2, np.ones((3, 3)))
    return Boundaries(M2, T, X)


def contour_chains(M):
    cs, _ = cv2.findContours(M.astype(np.uint8), cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    cs = [c[:, 0, :].astype(float) for c in cs if len(c) > 30]
    allp = np.vstack(cs)
    owner = np.concatenate([np.full(len(c), k) for k, c in enumerate(cs)])
    pos = np.concatenate([np.arange(len(c)) for c in cs])
    return cs, allp, owner, pos


def chain_between(CH, p0, p1, Qwin, W, B, snap=6, max_len=None):
    """Shorter closed-contour path between the contour pixels nearest p0 and p1 that stays within
    1.8 W of the window trace; None if p0/p1 sit on different contours or the path is mostly text."""
    from scipy.spatial import cKDTree
    cs, allp, owner, pos = CH
    tree = cKDTree(allp)
    d0, i0 = tree.query(p0)
    d1, i1 = tree.query(p1)
    if d0 > snap or d1 > snap or owner[i0] != owner[i1]:
        return None
    c = cs[owner[i0]]
    n_ = len(c)
    j0, j1 = pos[i0], pos[i1]
    fwd = [c[(j0 + k) % n_] for k in range((j1 - j0) % n_ + 1)]
    bwd = [c[(j0 - k) % n_] for k in range((j0 - j1) % n_ + 1)]
    best = None
    for path in sorted((fwd, bwd), key=len):
        P_ = np.array(path)
        dd = np.hypot(P_[::3, None, 0] - Qwin[None, :, 0], P_[::3, None, 1] - Qwin[None, :, 1]).min(1)
        if dd.max() > 2.5 * W:
            continue
        if max_len is not None and arclen(P_)[-1] > max_len:
            continue
        occ = np.mean([B.classify(x, y) != 0 for x, y in P_[::3]])
        if occ > 0.35:
            continue
        best = P_
        break
    return best


def chain_resample(P_, n_out):
    P_ = smooth_poly(P_, 2.0) if len(P_) > 8 else P_
    a_ = arclen(P_)
    if a_[-1] < 1e-6:
        return np.repeat(P_[:1], n_out, 0)
    u = np.linspace(0, a_[-1], n_out)
    return np.stack([np.interp(u, a_, P_[:, 0]), np.interp(u, a_, P_[:, 1])], 1)


def contour_windows(S, M, T, X, rgb):
    """Turn windows: replace the paired samples by the outer silhouette contour and the inner
    (hole) contour between the trusted pairs on each side of the window, matched by fraction of
    chain length."""
    Q, n, ok, W, B = S["Q"], S["n"], S["ok"], S["W"], S["B"]
    N = len(Q)
    pL0 = Q + n * np.nan_to_num(S["tl"])[:, None]
    pR0 = Q - n * np.nan_to_num(S["tr"])[:, None]
    CH = contour_chains(M)
    CH_k2 = None
    # inner-face aware mask: the dark inner face (V channel) is cut out, so its boundary with the
    # bright outer face becomes a contour too
    dark = M & (S["V"] < 0.30)
    dark = ndi.binary_opening(dark, np.ones((3, 3)))
    lab, nl = ndi.label(dark)
    sz = ndi.sum(dark, lab, range(1, nl + 1))
    dark = np.isin(lab, [i + 1 for i, z in enumerate(sz) if z > 150])
    CH2 = contour_chains(M & ~dark)
    log = []
    info = []
    for k, (a, b) in enumerate(S["wins"]):
        inner_L = bool(S["inner_pos"][a])
        pad = int(round(0.25 * W / STEP))
        a2, b2 = max(0, a - pad), min(N - 1, b + pad)
        lim = int(round(1.0 * W / STEP))
        prev = np.nonzero(ok[max(0, a2 - lim):a2])[0] + max(0, a2 - lim)
        nxt = np.nonzero(ok[b2 + 1:b2 + 1 + lim])[0]
        if len(prev) == 0 or len(nxt) == 0:
            log.append((k + 1, "no trusted sample on one side"))
            info.append(dict(id=k + 1, i0=a, i1=b, status="no entry/exit sample: interpolated"))
            continue
        ia, ib = prev[-1], nxt[0] + b2 + 1
        Qwin = Q[ia:ib + 1]
        res = {}
        CHk = CH
        if SRC not in SCUL and k + 1 == 2:
            if CH_k2 is None:
                CH_k2 = contour_chains(floor_fixed_boundaries(S, rgb, M, T, X, (1380, 600, 1672, 830)).M)
            CHk = CH_k2
        span = arclen(Qwin)[-1]
        for side, (P0, P1) in (("L", (pL0[ia], pL0[ib])), ("R", (pR0[ia], pR0[ib]))):
            res[side] = chain_between(CHk, P0, P1, Qwin, W, B, max_len=3.0 * span)
            if res[side] is None:
                res[side] = chain_between(CH2, P0, P1, Qwin, W, B, snap=24, max_len=3.0 * span)
        if res["L"] is None or res["R"] is None:
            log.append((k + 1, "contour chain failed"))
            info.append(dict(id=k + 1, i0=a, i1=b, status="contour chain failed: paired + interpolated"))
            continue
        ns = ib - ia + 1
        cL = chain_resample(res["L"], ns)
        cR = chain_resample(res["R"], ns)
        # anchor ends on the paired samples, so the strip stays continuous
        cL[0], cL[-1] = pL0[ia], pL0[ib]
        cR[0], cR[-1] = pR0[ia], pR0[ib]
        pL0[ia:ib + 1] = cL
        pR0[ia:ib + 1] = cR
        ok[ia:ib + 1] = True
        S["contour"][ia:ib + 1] = True
        info.append(dict(id=k + 1, i0=int(ia), i1=int(ib), status="contour edges (chain L %d px, R %d px)" % (len(res["L"]), len(res["R"]))))
    S["pL0"], S["pR0"] = pL0, pR0
    return info


# hand-read rulings (E1 = upper edge at entry = inner edge of the hairpin, E2 = outer) for windows whose edges are interior
# colour edges, not silhouette (the wrap: a rolled hairpin around the front of the A right leg). Read off the sculpture at 4x.
# E1 / E2 are the PHYSICAL edges (continuous labels). "flip": the +normal labels swap sides after the window (the heading reverses).
OVERRIDES = {
    # The A apex is a FLAT SOFT SIDE-FOLD: the band folds over along a near-horizontal crease (the top silhouette, P1 -> P2), the left layer
    # (dark inner face towards the camera) behind, the right layer (lit face) in front. Rulings shear towards the crease (at the crease the
    # ruling IS the crease line, longer than W), then back into the right leg's rulings. E1 = left-leg outer edge -> crease left end -> right
    # leg's INNER edge (it crosses the left layer, the overlap triangle); E2 = left-leg inner edge (hidden under the right layer above the
    # triangle tip) -> crease right end -> right leg's outer edge. Read off the sculpture at 5x.
    # The wrap is a BELT around the A right leg (a half turn about the leg axis): rulings stay near-vertical, the physical edges keep their
    # sides (here E1 = BOTTOM edge, E2 = top edge: after the apex fold the physical E1 is the +normal-right edge), the +normal labels swap.
    "wrap": dict(even=False, flip=True, stations=[   # (trace centre, E1, E2)
        ((905, 447), (898, 420), (910, 484)),
        ((868, 452), (862, 420), (872, 490)),
        ((835, 462), (828, 422), (840, 498)),
        ((808, 470), (800, 416), (812, 497)),
        ((792, 450), (789, 410), (798, 490)),
        ((803, 425), (797, 402), (808, 470)),
        ((835, 414), (832, 393), (836, 456)),
        ((880, 408), (878, 383), (884, 434)),
    ]),
}


def _ray_hit(p, d, poly):
    """first intersection of the ray p + t d (t > 0) with the polyline poly"""
    best = None
    for i in range(len(poly) - 1):
        a, b = np.array(poly[i], float), np.array(poly[i + 1], float)
        e = b - a
        den = d[0] * e[1] - d[1] * e[0]
        if abs(den) < 1e-9:
            continue
        w = a - p
        t = (w[0] * e[1] - w[1] * e[0]) / den
        u = (w[0] * d[1] - w[1] * d[0]) / den
        if t > 0 and 0 <= u <= 1 and (best is None or t < best[0]):
            best = (t, p + d * t)
    return None if best is None else best[1]


def apex_stations():
    """The apex flat side-fold, stations (centre, E1, E2) built from silhouette points measured on the mask (top silhouette flat from
    x 632 to 714; hole tip at (681, 108)). Rulings run from E1 (physical edge 1) to E2 and always point LEFT (the ruling is continuous through
    the fold); their line angle shears from the left leg's perpendicular tilt to the crease line and on to the right leg's tilt (smoothstep)."""
    outer_l = [(533, 186), (536, 178), (542, 162), (552, 146), (561, 130), (569, 114), (580, 98), (595, 82), (611, 70), (623, 66)]
    inner_l = [(626, 230), (632, 214), (636, 204), (641, 192), (645, 182), (651, 166), (658, 150), (664, 134), (673, 118), (678, 110), (690, 93), (702, 78), (714, 64), (722, 54)]
    outer_r = [(720, 67), (725, 70), (735, 78), (743, 86), (750, 94), (756, 102), (762, 110), (767, 118), (771, 126), (776, 134), (784, 150), (792, 166), (796, 174)]
    inner_r = [(632, 60), (640, 62), (648, 66), (662, 78), (674, 94), (685, 110), (689, 118), (694, 126), (698, 134), (705, 150), (713, 166), (718, 178), (722, 190), (726, 202), (730, 214)]
    sm = lambda x: x * x * (3 - 2 * x)
    st = []
    n = len(outer_l)
    for i, p in enumerate(outer_l):
        al = np.radians(15.0 + (3.0 - 15.0) * sm(i / n))      # line angle, descending to the right
        d = np.array([np.cos(al), np.sin(al)])
        q = _ray_hit(np.array(p, float), d, inner_l)
        if q is None:
            continue
        st.append((tuple((np.array(p) + q) / 2), tuple(q), tuple(p)))
    # the crease: P1 (632,60) is the left end (E2), P2 (714,64) the right end (E1)
    st.append(((673, 62), (714, 64), (632, 60)))
    m = len(outer_r)
    for i, p in enumerate(outer_r):
        ga = np.radians(-3.0 + (21.0 + 3.0) * sm((i + 1) / m))   # line angle: going LEFT it descends (ascends to the right)
        d = np.array([-np.cos(ga), np.sin(ga)])
        q = _ray_hit(np.array(p, float), d, inner_r)
        if q is None:
            continue
        st.append((tuple((np.array(p) + q) / 2), tuple(p), tuple(q)))
    return st


def apply_overrides(S, info):
    if SRC != "sculpture":
        return
    Q, ok = S["Q"], S["ok"]
    N = len(Q)
    S["flip_idx"] = []
    for nm, spec in OVERRIDES.items():
        stations = apex_stations() if spec["stations"] == "apex" else spec["stations"]
        c0 = np.array(stations[len(stations) // 2][0], float)
        for w_ in info:
            if "i0" not in w_:
                continue
            a, b = w_["i0"], w_["i1"]
            if np.hypot(*(Q[(a + b) // 2] - c0)) > 90:
                continue
            lo, hi = max(0, a - 12), min(N - 1, b + 12)
            ok[lo:hi + 1] = False
            cs = np.array([st[0] for st in stations], float)
            if spec["even"]:
                k0 = int(lo + np.argmin(np.hypot(*(Q[lo:hi + 1] - cs[0]).T)))
                k1 = int(lo + np.argmin(np.hypot(*(Q[lo:hi + 1] - cs[-1]).T)))
                cum = np.r_[0, np.cumsum(np.hypot(*np.diff(cs, axis=0).T))]
                ks = [int(round(k0 + (k1 - k0) * c / cum[-1])) for c in cum]
            else:
                ks = [int(lo + np.argmin(np.hypot(*(Q[lo:hi + 1] - c).T))) for c in cs]
            used = []
            for k, (c, e1, e2) in zip(ks, stations):
                if k in used:
                    continue
                used.append(k)
                S["pL0"][k] = e1
                S["pR0"][k] = e2
                ok[k] = True
            used = sorted(used)
            w_["status"] = "hand rulings (%s, %d stations)" % (nm, len(used))
            S.setdefault("override_idx", []).append(used)
            if spec.get("flip"):
                kk = max(used)
                S["pL0"][kk + 1:], S["pR0"][kk + 1:] = S["pR0"][kk + 1:].copy(), S["pL0"][kk + 1:].copy()
                S["flip_idx"].append(kk + 1)
            print("override", nm, "window", w_["id"], used)


def curvature_radius(P, k=4):
    """radius of curvature at each vertex of a ~2 px resampled polyline (3-point circle, stride k)"""
    P = np.stack([ndi.gaussian_filter1d(P[:, i], 1.5, mode="nearest") for i in (0, 1)], 1)
    A, Bp, C = P[:-2 * k], P[k:-k], P[2 * k:]
    a = np.hypot(*(Bp - A).T)
    b = np.hypot(*(C - Bp).T)
    c = np.hypot(*(C - A).T)
    cross = (Bp[:, 0] - A[:, 0]) * (C[:, 1] - A[:, 1]) - (Bp[:, 1] - A[:, 1]) * (C[:, 0] - A[:, 0])
    kap = 2 * np.abs(cross) / np.maximum(a * b * c, 1e-9)
    rad = np.full(len(P), np.inf)
    rad[k:-k] = 1.0 / np.maximum(kap, 1e-9)
    return rad


def limit_curvature(P, t, rmin_of_t, max_iter=70, dmax=12.0):
    dmax = DMAX_CURV or dmax
    """Locally smooth a polyline (keeping its t parametrisation) until its curvature radius is
    >= rmin(t) everywhere; smoothing sigma grows slowly and is capped at 28 samples (56 px)."""
    s_e = arclen(P)
    M_ = max(8, int(s_e[-1] / 2.0))
    g = np.linspace(0, s_e[-1], M_)
    Pu = np.stack([np.interp(g, s_e, P[:, 0]), np.interp(g, s_e, P[:, 1])], 1)
    tu = np.interp(g, s_e, t)
    rmin = rmin_of_t(tu)
    Pu0 = Pu.copy()
    rad0 = curvature_radius(Pu)
    rmin_before = float(np.min(rad0[8:-8]))
    for it in range(max_iter):
        rad = curvature_radius(Pu)
        bad = rad < rmin * 0.98
        bad[:8] = bad[-8:] = False
        if not bad.any():
            break
        wmask = ndi.gaussian_filter1d(ndi.binary_dilation(bad, iterations=6).astype(float), 3.0)
        wmask = np.minimum(1.0, wmask * 1.5)
        sig = min(28.0, 2.5 + 0.6 * it)
        Ps = np.stack([ndi.gaussian_filter1d(Pu[:, i], sig, mode="nearest") for i in (0, 1)], 1)
        Pu = Pu * (1 - wmask[:, None]) + Ps * wmask[:, None]
        # never move an edge point further than dmax px from where the silhouette put it
        dv = Pu - Pu0
        dn = np.hypot(dv[:, 0], dv[:, 1])
        Pu = Pu0 + dv * np.minimum(1.0, dmax / np.maximum(dn, 1e-9))[:, None]
    rad = curvature_radius(Pu)
    out = np.stack([np.interp(t, tu, Pu[:, i]) for i in (0, 1)], 1)
    return out, rmin_before, float(np.min(rad[8:-8])), it


def pchip_fill(t, ok, vals):
    """PCHIP through the trusted samples (clamped at the ends); returns values at every t."""
    f = PchipInterpolator(t[ok], vals[ok], extrapolate=False)
    out = f(t)
    first, last = np.nonzero(ok)[0][[0, -1]]
    out[:first] = vals[first]
    out[last + 1:] = vals[last]
    return out


LOCAL_SMOOTH = [   # (from anchor, to anchor, px before the first, px after the second, sigma in W)
]


def reconstruct(S, info):
    """Physical edges E1/E2 (continuous labels; the +-normal labelling is E1/E2 swapped where `flip`)."""
    Q, t, n, ok, W = S["Q"], S["t"], S["n"], S["ok"], S["W"]
    N = len(Q)
    flip = np.zeros(N, bool)
    for fi in S.get("flip_idx", []):
        flip[fi:] ^= True
    # (contour chains keep the labels physically continuous: edge1 = pL, edge2 = pR
    E1 = S["pL0"].copy()
    E2 = S["pR0"].copy()
    # slit-tip spikes (an edge reversing on itself): untrusted, interpolated through
    ok = ok.copy()
    nspike = 0
    for P_ in (E1, E2):
        for i in range(3, N - 3):
            if not (ok[i] and ok[i - 3] and ok[i + 3]):
                continue
            a_, b_ = P_[i] - P_[i - 3], P_[i + 3] - P_[i]
            la, lb = np.hypot(*a_), np.hypot(*b_)
            if la > 1e-6 and lb > 1e-6 and (a_ @ b_) / (la * lb) < -0.5:
                ok[max(0, i - 4):i + 5] = False
                nspike += 1
    S["nspike"] = nspike
    S["ok_final"] = ok
    # cap the projected ruling at 1.15 x the local trusted width: shrink symmetrically about the centre
    wloc = np.hypot(*(E2 - E1).T)
    wmed = rolling_median(wloc, ok & ~S["in_turn"], int(round(3 * W / STEP)))
    wmed = np.where(np.isfinite(wmed), wmed, W)
    cap = 1.15 * np.minimum(wmed, 1.25 * W)
    scale = np.minimum(1.0, cap / np.maximum(wloc, 1e-6))
    ctr = 0.5 * (E1 + E2)
    E1 = ctr + (E1 - ctr) * scale[:, None]
    E2 = ctr + (E2 - ctr) * scale[:, None]
    S["capped"] = int((scale < 0.999).sum())
    m = 0.5 * (E1 + E2)
    hw = 0.5 * np.hypot(*(E2 - E1).T)
    phi = np.arctan2(*(E2 - E1)[:, ::-1].T)
    phi_u = phi.copy()
    phi_u[ok] = np.unwrap(phi[ok])
    # centre carried as an offset from the approved trace so that hidden spans follow the trace
    dlt = m - Q
    dx = pchip_fill(t, ok, dlt[:, 0])
    dy = pchip_fill(t, ok, dlt[:, 1])
    h_i = pchip_fill(t, ok, hw)
    p_i = pchip_fill(t, ok, phi_u)
    m_i = Q + np.stack([dx, dy], 1)
    u = np.stack([np.cos(p_i), np.sin(p_i)], 1)
    E1_i = m_i - u * h_i[:, None]
    E2_i = m_i + u * h_i[:, None]
    E1_f = np.where(ok[:, None], E1, E1_i)
    E2_f = np.where(ok[:, None], E2, E2_i)
    # tail: past the last trusted pair each edge continues straight along its own recent direction
    ids = np.nonzero(ok)[0]
    last = ids[-1]
    for e, P_f in ((0, E1_f), (1, E2_f)):
        sideL = (e == 0) != bool(flip[last])
        cls, tt = (S["cls_l"], S["tl"]) if sideL else (S["cls_r"], S["tr"])
        valid = list(ids[ids <= last])
        j = last + 1
        while j < N and np.isfinite(tt[j]) and cls[j] == 0:
            P_f[j] = (Q[j] + n[j] * tt[j]) if sideL else (Q[j] - n[j] * tt[j])
            valid.append(j)
            j += 1
        v = np.array(valid[-25:])
        A = np.stack([t[v], np.ones(len(v))], 1)
        cx = np.linalg.lstsq(A, P_f[v, 0], rcond=None)[0]
        cy = np.linalg.lstsq(A, P_f[v, 1], rcond=None)[0]
        t0, p0 = t[v[-1]], P_f[v[-1]].copy()
        slope = np.array([cx[0], cy[0]])
        for k in range(v[-1] + 1, N):
            P_f[k] = p0 + slope * (t[k] - t0)
    # smoothing cubic splines (least squares), knots every 0.75 W, 0.25 W inside turn windows
    knots = list(np.arange(0.75 * W, t[-1] - 0.5 * W, 0.75 * W))
    dense = []
    wz = [(t[w_["i0"]], t[w_["i1"]]) for w_ in info if "i0" in w_]
    for lo, hi_ in wz:
        dense += list(np.arange(lo, hi_, 0.25 * W))
        knots = [k for k in knots if not (lo - 0.2 * W < k < hi_ + 0.2 * W)]
    knots = np.array(sorted(set(np.round(knots + dense, 3))))
    knots = knots[(knots > t[0] + 2 * STEP) & (knots < t[-1] - 2 * STEP)]
    w = np.where(ok, 1.0, 0.25)
    def fit(c):
        return LSQUnivariateSpline(t, c, knots, w=w, k=3)(t)
    E1s = np.stack([fit(E1_f[:, 0]), fit(E1_f[:, 1])], 1)
    E2s = np.stack([fit(E2_f[:, 0]), fit(E2_f[:, 1])], 1)
    # curvature rule: radius >= 0.12 W inside turn windows, >= 0.1 W elsewhere
    def rmin_of_t(tt):
        r = np.full(len(tt), 0.1 * W)
        for k_, (lo, hi_) in enumerate(wz):
            r[(tt >= lo) & (tt <= hi_)] = (RMIN_WIN.get(k_ + 1, 0.12)) * W
        return r
    E1c, r1a, r1b, it1 = limit_curvature(E1s, t, rmin_of_t)
    E2c, r2a, r2b, it2 = limit_curvature(E2s, t, rmin_of_t)
    # hand-ruled windows: the smoothing splines and the curvature limiter would pull a tight hairpin inwards; here the edges are
    # a C2 cubic spline THROUGH the hand stations (clamped to the smoothed edges' end slopes 12 samples outside the stations)
    from scipy.interpolate import CubicSpline
    for ids in S.get("override_idx", []):
        ok_ns = ok.copy()
        ok_ns[ids] = False
        il = int(np.nonzero(ok_ns[:ids[0]])[0][-1]) if ok_ns[:ids[0]].any() else max(1, ids[0] - 12)
        ir = int(ids[-1] + 1 + np.nonzero(ok_ns[ids[-1] + 1:])[0][0]) if ok_ns[ids[-1] + 1:].any() else min(N - 2, ids[-1] + 12)
        for E_c, E_src in ((E1c, S["pL0"]), (E2c, S["pR0"])):
            k = np.array([il] + list(ids) + [ir], float)
            v = np.vstack([E_c[il][None], E_src[ids], E_c[ir][None]])
            d0 = (E_c[il + 1] - E_c[il - 1]) / 2.0
            d1 = (E_c[ir + 1] - E_c[ir - 1]) / 2.0
            cs_ = CubicSpline(k, v, bc_type=((1, d0), (1, d1)))
            E_c[il:ir + 1] = cs_(np.arange(il, ir + 1))
    # cloth-like ripples: edge noise of the sculpture's mask (floor reflections near the bottoms, the dark S underside) is low-passed over
    # the named spans with a Gaussian of support >= 1.5 W (sigma 0.5 W), blended in/out with a smoothstep over 1 W
    if SRC in SCUL and S.get("anchor_arcs"):
        arcs = S["anchor_arcs"]
        for (na, nb, pad_a, pad_b, sig_w) in LOCAL_SMOOTH:
            a_t, b_t = arcs[na] - pad_a, arcs[nb] + pad_b
            ia, ib = int(np.searchsorted(t, a_t)), min(N - 1, int(np.searchsorted(t, b_t)))
            sg = sig_w * W / STEP
            blend = np.zeros(N)
            blend[ia:ib + 1] = 1.0
            fw = max(2, int(round(W / STEP)))
            blend = ndi.gaussian_filter1d(blend, fw / 2.5)
            blend = np.minimum(1.0, blend * 1.0 / max(blend.max(), 1e-9))
            for ids in S.get("override_idx", []):
                blend[ids[0] - 12:ids[-1] + 13] = 0.0
            for E_c in (E1c, E2c):
                sm_ = np.stack([ndi.gaussian_filter1d(E_c[:, k], sg, mode="nearest") for k in (0, 1)], 1)
                E_c[:] = E_c * (1 - blend[:, None]) + sm_ * blend[:, None]
    flip_out = flip
    return dict(E1=E1c, E2=E2c, E1_pre=E1s, E2_pre=E2s, E1_i=E1_f, E2_i=E2_f, flip=flip_out, knots=knots,
                min_radius=dict(E1_before=r1a, E1_after=r1b, E2_before=r2a, E2_after=r2b, W=W), wz=wz)


def spans(mask):
    out = []
    i = 0
    while i < len(mask):
        if mask[i]:
            j = i
            while j + 1 < len(mask) and mask[j + 1]:
                j += 1
            out.append((i, j))
            i = j + 1
        else:
            i += 1
    return out


def review(S, R, rgb, path, S_=2):
    img = cv2.resize(rgb, None, fx=S_, fy=S_, interpolation=cv2.INTER_CUBIC)[:, :, ::-1].copy()
    img = (img * 0.55).astype(np.uint8)
    Hh, Ww = img.shape[:2]
    sh = 4
    def pt(p):
        return (int(round(p[0] * S_ * (1 << sh))), int(round(p[1] * S_ * (1 << sh))))
    ok = S["ok"]
    N = len(ok)
    # rulings every 40 px of arc
    stride = int(round(40 / STEP))
    for i in range(0, N, stride):
        cv2.line(img, pt(R["E1"][i]), pt(R["E2"][i]), (230, 230, 230), 1, cv2.LINE_AA, sh)
    GREEN, MAG = (60, 255, 60), (255, 60, 255)
    for edge, col in ((R["E1"], GREEN), (R["E2"], MAG)):
        for a, b in spans(ok):
            cv2.polylines(img, [np.array([pt(p) for p in edge[a:b + 1]], np.int32)], False, col, 2, cv2.LINE_AA, sh)
        for a, b in spans(~ok):
            a0, b0 = max(0, a - 1), min(N - 1, b + 1)
            seg = edge[a0:b0 + 1]
            for k in range(0, len(seg) - 1, 4):   # dashed: 2 samples on, 2 off
                cv2.line(img, pt(seg[k]), pt(seg[min(k + 1, len(seg) - 1)]), col, 2, cv2.LINE_AA, sh)
    # turn windows + crease arrows
    for w_ in S["info"]:
        if "i0" not in w_:
            continue
        a, b = w_["i0"], w_["i1"]
        pts = np.vstack([R["E1"][a:b + 1], R["E2"][a:b + 1]]) * S_
        x0, y0 = pts.min(0) - 14
        x1, y1 = pts.max(0) + 14
        cv2.rectangle(img, (int(x0), int(y0)), (int(x1), int(y1)), (0, 220, 255), 2, cv2.LINE_AA)
        cv2.putText(img, "turn %d" % w_["id"], (int(x0) + 4, int(y0) - 6),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 220, 255), 2, cv2.LINE_AA)
    cv2.putText(img, "edge1 green  edge2 magenta (physical labels)  rulings /40px  dashed = untrusted  box = turn window  ",
                (20, Hh - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2, cv2.LINE_AA)
    cv2.imwrite(path, img)
    return img


def write_json(S, R, info, path):
    t = S["t"]
    L = lambda a: np.round(a, 2).tolist()
    flip = R["flip"]
    # +-normal labelling (pL = +normal side): E1/E2 swapped where flip
    pL = np.where(flip[:, None], R["E2"], R["E1"])
    pR = np.where(flip[:, None], R["E1"], R["E2"])
    out = dict(
        image=dict(w=int(S["B"].W), h=int(S["B"].H)),
        W_est=round(S["W"], 2), step=STEP,
        s=L(t), centre=L(S["Q"]), visible=S["vis"].tolist(),
        edge1=L(R["E1"]), edge2=L(R["E2"]), flip=flip.tolist(), pL=L(pL), pR=L(pR),
        trusted=S["ok"].tolist(),
        untrusted_spans=[[round(float(t[a]), 1), round(float(t[b]), 1)] for a, b in spans(~S["ok"])],
        turn_windows=info,
        crossings=L(np.array(S["xpts"]).reshape(-1, 2)),
        min_radius=R["min_radius"],
        knots=L(R["knots"]),
        note="edge1/edge2 are PHYSICALLY CONTINUOUS edges (labels carried through turns); pL (= +normal side) / pR follow the +-normal labelling and equal edge1/edge2 swapped where flip is true; ruling = edge2 - edge1; px in 1672x941; samples every 4 px of arc along the smoothed approved trace; tail extended 200 px straight past the last trace point",
    )
    json.dump(out, open(path, "w"))


if __name__ == "__main__":
    M, T, X, rgb, cl, g = load()
    S = build(M, T, X, rgb, cl, g)
    info = contour_windows(S, M, T, X, rgb)
    apply_overrides(S, info)
    S["info"] = info
    if SRC in SCUL:
        _sA = arclen(prep_trace(cl)[3])
        S["anchor_arcs"] = {nm: float(_sA[200 + i]) for nm, i in cl["anchors"].items()}
    for w_ in info:
        print("window", w_)
    R = reconstruct(S, info)
    S["ok"] = S["ok_final"]
    print("spikes removed:", S["nspike"], " rulings capped at 1.15 x local width:", S["capped"])
    print("min radius", R["min_radius"])
    print("trusted %d / %d" % (S["ok"].sum(), len(S["ok"])))
    write_json(S, R, info, OUTD + "/edges.json")
    review(S, R, rgb, OUTD + "/edges_review.png")
    print("wrote", OUTD + "/edges_review.png")
