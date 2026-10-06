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


# ------------------------------------------------------------------ io
def gray(path):
    return np.array(Image.open(path).convert("L")) > 127


def load():
    M = gray(FIT + "/ribbon_mask.png")
    T = gray(FIT + "/text_mask.png")
    X = gray(FIT + "/exclusion_mask.png")
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

    def cast(self, c, n, rmax, step=0.5):
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


def build(M, T, X, rgb, cl, g, verbose=True):
    B = Boundaries(M, T, X)
    Q, t, vis, P, s_orig = prep_trace(cl)
    d, n = tangent_normal(Q)
    N = len(Q)
    V = ndi.gaussian_filter(rgb.max(2).astype(np.float32) / 255.0, 1.2)
    # first pass: W estimate
    W0 = 115.0
    tl, cls_l, tr, cls_r = pair_edges(B, Q, n, 1.4 * W0)
    ok0 = (cls_l == 0) & (cls_r == 0) & np.isfinite(tl) & np.isfinite(tr)
    W = float(np.median((tl + tr)[ok0]))
    if verbose:
        print("W_est (median apparent width) = %.1f px" % W)
    rmax = 1.4 * W
    tl, cls_l, tr, cls_r = pair_edges(B, Q, n, rmax)
    # turn windows (>= 0.5 W of arc; shorter ones are kinks, not turns)
    wins, th, turn = turn_windows(Q, t, W)
    wins = [(a, b) for a, b in wins if (b - a) * STEP >= 0.5 * W]
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


def contour_windows(S, M):
    """Turn windows: replace the paired samples by the outer silhouette contour and the inner
    (hole) contour between the trusted pairs on each side of the window, matched by fraction of
    chain length."""
    Q, n, ok, W, B = S["Q"], S["n"], S["ok"], S["W"], S["B"]
    N = len(Q)
    pL0 = Q + n * np.nan_to_num(S["tl"])[:, None]
    pR0 = Q - n * np.nan_to_num(S["tr"])[:, None]
    CH = contour_chains(M)
    # inner-face aware mask: the dark inner face (V channel) is cut out, so its boundary with the
    # bright outer face becomes a contour too
    dark = M & (S["V"] < 0.30)
    dark = ndi.binary_opening(dark, np.ones((3, 3)))
    lab, nl = ndi.label(dark)
    sz = ndi.sum(dark, lab, range(1, nl + 1))
    dark = np.isin(lab, [i + 1 for i, z in enumerate(sz) if z > 150])
    CH2 = contour_chains(M & ~dark)
    log = []
    for k, (a, b) in enumerate(S["wins"]):
        inner_L = bool(S["inner_pos"][a])
        pad = int(round(0.25 * W / STEP))
        a2, b2 = max(0, a - pad), min(N - 1, b + pad)
        prev = np.nonzero(ok[:a2])[0]
        nxt = np.nonzero(ok[b2 + 1:])[0]
        if len(prev) == 0 or len(nxt) == 0:
            log.append((k + 1, "no trusted sample on one side"))
            continue
        ia, ib = prev[-1], nxt[0] + b2 + 1
        Qwin = Q[ia:ib + 1]
        res = {}
        span = arclen(Qwin)[-1]
        for side, (P0, P1) in (("L", (pL0[ia], pL0[ib])), ("R", (pR0[ia], pR0[ib]))):
            res[side] = chain_between(CH, P0, P1, Qwin, W, B, max_len=3.0 * span)
            if res[side] is None:
                res[side] = chain_between(CH2, P0, P1, Qwin, W, B, snap=24, max_len=3.0 * span)
        if res["L"] is None or res["R"] is None:
            log.append((k + 1, "contour chain failed L=%s R=%s" % (res["L"] is not None, res["R"] is not None)))
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
        log.append((k + 1, "contour edges s=%d..%d (chain L %d px, R %d px)" % (S["t"][ia], S["t"][ib], len(res["L"]), len(res["R"]))))
    S["pL0"], S["pR0"] = pL0, pR0
    return log


def pchip_fill(t, ok, vals):
    """PCHIP through the trusted samples (clamped at the ends); returns values at every t."""
    f = PchipInterpolator(t[ok], vals[ok], extrapolate=False)
    out = f(t)
    first, last = np.nonzero(ok)[0][[0, -1]]
    out[:first] = vals[first]
    out[last + 1:] = vals[last]
    return out


def reconstruct(S):
    Q, t, n, ok, W = S["Q"], S["t"], S["n"], S["ok"], S["W"]
    N = len(Q)
    pL = S["pL0"]
    pR = S["pR0"]
    m = 0.5 * (pL + pR)
    hw = 0.5 * np.hypot(*(pR - pL).T)
    phi = np.arctan2(*(pR - pL)[:, ::-1].T)
    phi_u = phi.copy()
    phi_u[ok] = np.unwrap(phi[ok])
    pL_m, pR_m = pL, pR
    # centre carried as an offset from the approved trace so that hidden spans follow the trace
    dlt = m - Q
    dx = pchip_fill(t, ok, dlt[:, 0])
    dy = pchip_fill(t, ok, dlt[:, 1])
    h_i = pchip_fill(t, ok, hw)
    p_i = pchip_fill(t, ok, phi_u)
    m_i = Q + np.stack([dx, dy], 1)
    u = np.stack([np.cos(p_i), np.sin(p_i)], 1)
    pL_i = m_i - u * h_i[:, None]
    pR_i = m_i + u * h_i[:, None]
    # trusted samples keep their measured points; others use the interpolated rebuild
    pL_f = np.where(ok[:, None], pL_m, pL_i)
    pR_f = np.where(ok[:, None], pR_m, pR_i)
    pL, pR = pL_m, pR_m
    # tail: past the last trusted pair each edge continues straight along its own recent direction
    # (the trace itself hugs the lower edge here and bends away); measured single-edge hits are kept
    ids = np.nonzero(ok)[0]
    last = ids[-1]
    for E, cls, tt, P_f in ((0, S["cls_l"], S["tl"], pL_f), (1, S["cls_r"], S["tr"], pR_f)):
        valid = list(ids[ids <= last])
        j = last + 1
        while j < N and np.isfinite(tt[j]) and cls[j] == 0:
            P_f[j] = (Q[j] + n[j] * tt[j]) if E == 0 else (Q[j] - n[j] * tt[j])
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
    for a, b in S["wins"]:
        lo = t[max(0, a - int(0.25 * W / STEP))]
        hi_ = t[min(N - 1, b + int(0.25 * W / STEP))]
        dense += list(np.arange(lo, hi_, 0.25 * W))
        knots = [k for k in knots if not (lo - 0.2 * W < k < hi_ + 0.2 * W)]
    knots = np.array(sorted(set(np.round(knots + dense, 3))))
    knots = knots[(knots > t[0] + 2 * STEP) & (knots < t[-1] - 2 * STEP)]
    w = np.where(ok, 1.0, 0.25)
    def fit(c):
        return LSQUnivariateSpline(t, c, knots, w=w, k=3)(t)
    pLs = np.stack([fit(pL_f[:, 0]), fit(pL_f[:, 1])], 1)
    pRs = np.stack([fit(pR_f[:, 0]), fit(pR_f[:, 1])], 1)
    return dict(pL_raw=pL, pR_raw=pR, pL_i=pL_f, pR_i=pR_f, pL=pLs, pR=pRs, knots=knots,
                hw=hw, h_i=h_i, phi_i=p_i)


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
        cv2.line(img, pt(R["pL"][i]), pt(R["pR"][i]), (230, 230, 230), 1, cv2.LINE_AA, sh)
    GREEN, MAG = (60, 255, 60), (255, 60, 255)
    for edge, col in ((R["pL"], GREEN), (R["pR"], MAG)):
        for a, b in spans(ok):
            cv2.polylines(img, [np.array([pt(p) for p in edge[a:b + 1]], np.int32)], False, col, 2, cv2.LINE_AA, sh)
        for a, b in spans(~ok):
            a0, b0 = max(0, a - 1), min(N - 1, b + 1)
            seg = edge[a0:b0 + 1]
            for k in range(0, len(seg) - 1, 4):   # dashed: 2 samples on, 2 off
                cv2.line(img, pt(seg[k]), pt(seg[min(k + 1, len(seg) - 1)]), col, 2, cv2.LINE_AA, sh)
    # turn windows
    for k, (a, b) in enumerate(S["wins"]):
        pts = np.vstack([R["pL"][a:b + 1], R["pR"][a:b + 1]]) * S_
        x0, y0 = pts.min(0) - 14
        x1, y1 = pts.max(0) + 14
        cv2.rectangle(img, (int(x0), int(y0)), (int(x1), int(y1)), (0, 220, 255), 2, cv2.LINE_AA)
        cv2.putText(img, "turn %d" % (k + 1), (int(x0) + 4, int(y0) - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 220, 255), 2, cv2.LINE_AA)
    cv2.putText(img, "pL green  pR magenta  rulings /40px  dashed = untrusted (interpolated)  box = turn window",
                (20, Hh - 20), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2, cv2.LINE_AA)
    cv2.imwrite(path, img)
    return img


def write_json(S, R, path):
    t = S["t"]
    L = lambda a: np.round(a, 2).tolist()
    out = dict(
        image=dict(w=int(S["B"].W), h=int(S["B"].H)),
        W_est=round(S["W"], 2), step=STEP,
        s=L(t), centre=L(S["Q"]), visible=S["vis"].tolist(),
        pL=L(R["pL"]), pR=L(R["pR"]), pL_raw=L(R["pL_raw"]), pR_raw=L(R["pR_raw"]),
        trusted=S["ok"].tolist(),
        untrusted_spans=[[round(float(t[a]), 1), round(float(t[b]), 1)] for a, b in spans(~S["ok"])],
        turn_windows=[dict(id=k + 1, s0=round(float(t[a]), 1), s1=round(float(t[b]), 1), i0=int(a), i1=int(b),
                           inner_side=("L" if S["inner_pos"][a] else "R")) for k, (a, b) in enumerate(S["wins"])],
        crossings=L(np.array(S["xpts"]).reshape(-1, 2)),
        knots=L(R["knots"]),
        note="pL = +normal side (left in image coords), pR = -normal side; ruling = pR - pL; edges in 1672x941 px; samples every 4 px of arc along the (smoothed) approved trace; tail extended 200 px straight past the last trace point",
    )
    json.dump(out, open(path, "w"))


if __name__ == "__main__":
    M, T, X, rgb, cl, g = load()
    S = build(M, T, X, rgb, cl, g)
    for r in contour_windows(S, M):
        print("window", r)
    R = reconstruct(S)
    print("trusted %d / %d" % (S["ok"].sum(), len(S["ok"])))
    print("turn windows:", [(round(S["t"][a]), round(S["t"][b]), tuple(np.round(S["Q"][(a + b) // 2]).astype(int))) for a, b in S["wins"]])
    write_json(S, R, OUTD + "/edges.json")
    review(S, R, rgb, OUTD + "/edges_review.png")
    print("wrote", OUTD + "/edges_review.png")
