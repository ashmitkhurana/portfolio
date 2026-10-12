#!/usr/bin/env python
"""Fit ONE smooth low-dimensional ruled ribbon to a ruled pose (the trace becomes a soft target).

  scripts/mockup/.venv/bin/python scripts/curve/fit3d.py --out docs/ribbon/turns/fit/f2 --K 160 [--init perp|raw] [--no_opt]

Model: three clamped uniform cubic B-splines on t in [0, N-1] (N = ring count): centreline c(t) (world px), ruling
direction g(t) (b = g/|g|) and half width h(t). Edges L = c - h b, R = c + h b.
Residuals (one vector, scipy least_squares trf, sparse jac): edge fit to the target polylines (screen css px / sigma),
ruling smoothness (b''), centreline jerk (c'''), ruling _|_ tangent, developability det[T,b,b'], depth prior,
half-width smoothness (h'') and a weak width prior.
Coordinates: pose <-> world as lib/ribbon/poses/resolve.ts (see rotosurf.py / desktopify.mjs).
"""
import argparse, json, math, os, time
import numpy as np
from scipy.interpolate import BSpline, make_lsq_spline
from scipy.optimize import least_squares
from scipy import sparse
from scipy.spatial import cKDTree

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
BEST = os.path.join(ROOT, "docs", "ribbon", "turns", "curve", "best")

VW, VH = 390.0, 844.0
D = (VH / 2) / math.tan(math.radians(26.4) / 2)
A = dict(left=20.0, top=118.15625, width=347.21875, height=154.1875)
SCUT = np.array([852 / 390, 1846 / 844])
WINDOWS = [(0, 131), (132, 288), (289, 483), (484, 554), (555, 658), (659, 764), (765, 940), (941, 1066), (1067, 1298)]
FOLDS = [(480, 560), (320, 400), (110, 240), (1140, 1210), (650, 700)]
CURL = (940, 1066)
LOOP = (659, 764)


_FIELD = {}


def inside_field(path=None):
    """Distance (css px) from any point to the mockup silhouette (0 inside), as a sampler f(css xy (...,2)) -> dist."""
    from PIL import Image
    from scipy import ndimage as ndi
    path = path or os.path.join(ROOT, "docs", "ribbon", "ref", "ak-signature-cutout.webp")
    if path not in _FIELD:
        al = np.asarray(Image.open(path).convert("RGBA").split()[3]) > 128
        h_, w_ = al.shape
        dist = ndi.distance_transform_edt(~al, sampling=(VH / h_, VW / w_))
        sc = np.array([w_ / VW, h_ / VH])

        def f(xy):
            q = np.asarray(xy, float).reshape(-1, 2) * sc
            v = ndi.map_coordinates(dist, [q[:, 1], q[:, 0]], order=1, mode="nearest")
            return v.reshape(np.asarray(xy).shape[:-1])
        _FIELD[path] = f
    return _FIELD[path]


UB = np.array([-1.0, -0.5, 0.0, 0.5, 1.0])
OUT_EXCL = "67:393:127:497;265:475:335:555"
_OUT = {}


def outline_points(path=None, excl=None, pitch=2.0, incl=None):
    """Mockup silhouette boundary (alpha>128 xor eroded) as css points, ~1 per `pitch` css px, minus exclusion boxes and y>820."""
    from PIL import Image
    from scipy import ndimage as ndi
    path = path or os.path.join(ROOT, "docs", "ribbon", "ref", "ak-signature-cutout.webp")
    excl = OUT_EXCL if excl is None or excl == "" else excl
    incl = incl or ""
    key = (path, excl, pitch, incl)
    if key not in _OUT:
        al = np.asarray(Image.open(path).convert("RGBA").split()[3]) > 128
        h_, w_ = al.shape
        bd = al & ~ndi.binary_erosion(al, border_value=1)
        yy, xx = np.nonzero(bd)
        P = np.stack([xx * VW / w_, yy * VH / h_], 1)
        cell = (np.floor(P[:, 0] / pitch).astype(np.int64) * 100003 + np.floor(P[:, 1] / pitch).astype(np.int64))
        _, first = np.unique(cell, return_index=True)
        P = P[np.sort(first)]
        keep = P[:, 1] <= 820
        for box in [q for q in excl.split(";") if q]:
            x0, y0, x1, y1 = [float(v) for v in box.split(":")]
            keep &= ~((P[:, 0] >= x0) & (P[:, 0] <= x1) & (P[:, 1] >= y0) & (P[:, 1] <= y1))
        ib = [q for q in incl.split(";") if q]
        if ib:
            inc = np.zeros(len(P), bool)
            for box in ib:
                x0, y0, x1, y1 = [float(v) for v in box.split(":")]
                inc |= (P[:, 0] >= x0) & (P[:, 0] <= x1) & (P[:, 1] >= y0) & (P[:, 1] <= y1)
            keep &= inc
        _OUT[key] = P[keep]
    return _OUT[key]


def _samples(pL, pR):
    """(2, 2N-1, 2): per side the ring points interleaved with ring midpoints."""
    N = len(pL)
    QQ = np.empty((2, 2 * N - 1, 2))
    for s_, P in enumerate((pL, pR)):
        QQ[s_, 0::2] = P
        QQ[s_, 1::2] = (P[:-1] + P[1:]) / 2
    return QQ


def outline_assign(pL, pR, O, dmax=12.0, margin=6.0, far=40):
    """Assign each outline point ONCE to (side, ring) = its nearest projected edge sample; drop ambiguous / far points.
    Ambiguous: a competing sample (same side with |ring diff|>far, or the other side of the same strand) within `margin`
    css px of the nearest distance. Returns side, ring, keep (bool) and counts."""
    N = len(pL)
    QQ = _samples(pL, pR)
    flat = QQ.reshape(-1, 2)
    lab_side = np.repeat(np.arange(2), 2 * N - 1)
    lab_ring = np.tile(np.arange(2 * N - 1) // 2, 2)
    tree = cKDTree(flat)
    d1, k1 = tree.query(O)
    side, ring = lab_side[k1], lab_ring[k1]
    keep = d1 <= dmax
    n_far = int((~keep).sum())
    amb = np.zeros(len(O), bool)
    for j in np.nonzero(keep)[0]:
        idx = np.array(tree.query_ball_point(O[j], d1[j] + margin), int)
        if len(idx) == 0:
            continue
        other_side = lab_side[idx] != side[j]
        far_ring = np.abs(lab_ring[idx] - ring[j]) > far
        # competitor: another strand (ring differs by > far, either side), or the other side of the same ring neighbourhood
        comp = far_ring | other_side
        if comp.any():
            amb[j] = True
    keep &= ~amb
    return side, ring, keep, dict(far=n_far, ambiguous=int(amb.sum()), kept=int(keep.sum()), total=len(O))


def outline_fixed_res(pL, pR, O, side, ring, half=8):
    """Vector from each outline point to the nearest point of its ASSIGNED edge polyline (rings ring+-half only). (M,2), (M,)."""
    N = len(pL)
    QQ = _samples(pL, pR)
    base = 2 * ring
    idx = np.clip(base[:, None] + np.arange(-2 * half, 2 * half + 1)[None, :], 0, 2 * N - 2)
    Qw = QQ[side[:, None], idx]  # (M, W, 2)
    A_, B_ = Qw[:, :-1], Qw[:, 1:]
    ab = B_ - A_
    t = np.clip(((O[:, None, :] - A_) * ab).sum(-1) / np.maximum((ab * ab).sum(-1), 1e-9), 0, 1)
    C_ = A_ + ab * t[..., None]
    d2 = ((C_ - O[:, None, :]) ** 2).sum(-1)
    j = np.argmin(d2, 1)
    C = C_[np.arange(len(O)), j]
    return C - O, np.sqrt(d2[np.arange(len(O)), j])


def parse_boxes(spec):
    return [tuple(float(v) for v in b.split(":")) for b in (spec or "").split(";") if b]


def in_boxes(P, boxes, pad=0.0):
    m = np.zeros(len(P), bool)
    for x0, y0, x1, y1 in boxes:
        m |= (P[:, 0] >= x0 - pad) & (P[:, 0] <= x1 + pad) & (P[:, 1] >= y0 - pad) & (P[:, 1] <= y1 + pad)
    return m


def box_candidates(c, boxes, rings_spec, pad=25.0):
    """Per box: candidate rings = rings whose projected centreline lies in the box (+pad), or the explicit ranges."""
    specs = (rings_spec or "").split(";") if rings_spec else []
    out = []
    for k, bx in enumerate(boxes):
        sp = specs[k] if k < len(specs) else ""
        if sp:
            idx = np.concatenate([np.arange(int(r.split(":")[0]), int(r.split(":")[1]) + 1) for r in sp.split(",")])
        else:
            idx = np.nonzero(in_boxes(c, [bx], pad))[0]
        out.append(np.unique(idx))
    return out


def runs_of(idx, gap=3):
    idx = np.sort(idx)
    if len(idx) == 0:
        return []
    r, st, pv = [], idx[0], idx[0]
    for k in idx[1:]:
        if k > pv + gap:
            r.append((int(st), int(pv))); st = k
        pv = k
    r.append((int(st), int(pv)))
    return r


def outline_centre_assign(pL, pR, P, boxes, cands, dmax=70.0, rej=1.3, far=40):
    """Assign outline points P (inside the boxes) to the nearest CENTRELINE ring of their box's candidate set (<= dmax css px);
    side from the sign of cross(screen tangent, p - c_i) mapped to whichever of the ring's projected L/R is on that side.
    Reject when a centreline ring of another strand (|ring diff| > far) is within rej x the chosen distance."""
    N = len(pL)
    c = (pL + pR) / 2
    pad = np.pad(c, ((3, 3), (0, 0)), mode="edge")
    t = pad[6:] - pad[:-6]
    t /= np.maximum(np.linalg.norm(t, axis=1, keepdims=True), 1e-9)
    tree = cKDTree(c)
    M = len(P)
    ring = np.zeros(M, int); side = np.zeros(M, int); keep = np.zeros(M, bool); dist = np.full(M, np.inf)
    cross = lambda a_, b_: a_[..., 0] * b_[..., 1] - a_[..., 1] * b_[..., 0]
    box_of = np.full(M, -1)
    for k, bx in enumerate(boxes):
        box_of[(box_of < 0) & in_boxes(P, [bx])] = k
    n_far = n_amb = 0
    for j in range(M):
        cand = cands[box_of[j]]
        d = np.linalg.norm(c[cand] - P[j], axis=1)
        m = int(np.argmin(d)); i = int(cand[m]); dj = d[m]
        ring[j], dist[j] = i, dj
        if dj > dmax:
            n_far += 1
            continue
        near = np.array(tree.query_ball_point(P[j], rej * dj), int)
        if len(near) and (np.abs(near - i) > far).any():
            n_amb += 1
            continue
        sp_ = cross(t[i], P[j] - c[i]); sl = cross(t[i], pL[i] - c[i])
        side[j] = 0 if sp_ * sl >= 0 else 1
        keep[j] = True
    return side, ring, keep, dict(far=n_far, ambiguous=n_amb, kept=int(keep.sum()), total=M, box_of=box_of)


RIM_CAND = os.path.join(ROOT, "docs", "ribbon", "turns", "rims", "candidates.json")


def rim_points(spec_path, pitch=2.0):
    """Picked interior rim polylines (cutout px in candidates.json) -> css points every `pitch` css px.
    spec: json list of {"id": "T9-01", "rings": [a, b]}. Returns list of (id, (a, b), pts (n,2) css)."""
    spec = json.load(open(spec_path))
    cand = json.load(open(RIM_CAND))
    out = []
    for e in spec:
        if "src" in e:  # ["owner", file, "solid"|"dashed", index]: owner strokes in cutout px
            _, fn, kind, idx = e["src"]
            P = np.asarray(json.load(open(os.path.join(os.path.dirname(RIM_CAND), "owner", fn)))[kind][idx], float) / SCUT
        else:
            P = np.asarray(cand[e["id"]], float) / SCUT
        seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
        cum = np.r_[0.0, np.cumsum(seg)]
        tt = np.r_[np.arange(0.0, cum[-1], pitch), cum[-1]]
        Q = np.stack([np.interp(tt, cum, P[:, 0]), np.interp(tt, cum, P[:, 1])], 1)
        out.append((e["id"], (int(e["rings"][0]), int(e["rings"][1])), Q, e.get("rel", "opposite"), e.get("box", -1)))
    return out


def own_silhouette(pL, pR, boxes, r0, r1, dmax=45.0):
    """Outline points (NO exclusion boxes) inside `boxes` whose nearest centreline ring over ALL rings is in r0..r1 and <= dmax css px:
    the strand's own silhouette points, for strands the default outline exclusion / centre assignment leaves without any (the left leg).
    Returns (ring, side) with the side by the sign rule."""
    c = (pL + pR) / 2
    pad = np.pad(c, ((3, 3), (0, 0)), mode="edge")
    t = pad[6:] - pad[:-6]
    t /= np.maximum(np.linalg.norm(t, axis=1, keepdims=True), 1e-9)
    O = outline_points(excl="0:0:0:0")
    O = O[in_boxes(O, boxes)]
    dd, ii = cKDTree(c).query(O)
    m = (ii >= r0) & (ii <= r1) & (dd <= dmax)
    cross = lambda a_, b_: a_[..., 0] * b_[..., 1] - a_[..., 1] * b_[..., 0]
    sd = np.array([0 if cross(t[i], P - c[i]) * cross(t[i], pL[i] - c[i]) >= 0 else 1 for P, i in zip(O[m], ii[m])], int)
    return ii[m], sd, O[m]


def rim_assign(pL, pR, entries, sil=None, boxes=None, win=10, ksp=3):
    """Assign each rim point ONCE to (side, ring): ring = nearest projected centreline ring inside the entry's ring range,
    side from the sign of cross(screen tangent, p - c_i) mapped to that ring's projected L/R (as outline_centre_assign).
    sil=(ring, side, box index, xy) of the box silhouette points (centre assignment): the side is then FORCED, ONE side per line:
    rel "opposite": 1 - S_out, S_out = majority side of the same-box silhouette points whose ring lies in [min ring, max ring] of the
    line's points (+-win); rel "same": the majority side of the ksp silhouette points nearest in the screen to each line point (the
    line coincides with that silhouette edge). Entries with no same-box silhouette points in range use the strand's own outline
    (own_silhouette). Returns pts (M,2), side (M,), ring (M,), eid (M,), dist (M,) to the centre ring."""
    c = (pL + pR) / 2
    pad = np.pad(c, ((3, 3), (0, 0)), mode="edge")
    t = pad[6:] - pad[:-6]
    t /= np.maximum(np.linalg.norm(t, axis=1, keepdims=True), 1e-9)
    cross = lambda a_, b_: a_[..., 0] * b_[..., 1] - a_[..., 1] * b_[..., 0]
    PT, SD, RG, EI, DS = [], [], [], [], []
    for k, (nm, (r0, r1), Q, rel, bx) in enumerate(entries):
        cand = np.arange(r0, r1 + 1)
        rr, ss, dd_, sd0 = [], [], [], []
        for q in Q:
            d = np.linalg.norm(c[cand] - q, axis=1)
            m = int(np.argmin(d)); i = int(cand[m])
            sp_ = cross(t[i], q - c[i]); sl = cross(t[i], pL[i] - c[i])
            rr.append(i); dd_.append(d[m]); sd0.append(0 if sp_ * sl >= 0 else 1)
        rr = np.array(rr)
        if sil is None:
            sdv = np.array(sd0)
        else:
            sm = (sil[0] >= r0) & (sil[0] <= r1) & (sil[2] == bx)
            if sm.any():
                sr_, ss_, sx_ = sil[0][sm], sil[1][sm], sil[3][sm]
            else:
                sr_, ss_, sx_ = own_silhouette(pL, pR, boxes, r0, r1)
                print("rim_assign: %s rings %d:%d has no box-assigned silhouette points; own strand outline (no exclusion): %d pts, L %d R %d" % (nm, r0, r1, len(sr_), (ss_ == 0).sum(), (ss_ == 1).sum()))
                if len(sr_) == 0:
                    raise SystemExit("rim_assign: no silhouette points for rings %d:%d" % (r0, r1))
            if rel == "same":
                votes = []
                for q in Q:
                    nn = np.argsort(np.linalg.norm(sx_ - q, axis=1))[:ksp]
                    votes.extend(ss_[nn].tolist())
                sout = 1 if np.mean(votes) > 0.5 else 0
                sdv = np.full(len(Q), sout)
            else:
                w = (sr_ >= rr.min() - win) & (sr_ <= rr.max() + win)
                if not w.any():
                    w = np.argsort(np.abs(sr_ - np.median(rr)))[:15]
                sout = 1 if ss_[w].mean() > 0.5 else 0
                sdv = np.full(len(Q), 1 - sout)
            print("rim_assign: %-6s rel %-8s rings %d..%d -> forced side %s" % (nm, rel, rr.min(), rr.max(), "L" if sdv[0] == 0 else "R"))
        for j in range(len(Q)):
            PT.append(Q[j]); SD.append(int(sdv[j])); RG.append(int(rr[j])); EI.append(k); DS.append(dd_[j])
    return np.array(PT).reshape(-1, 2), np.array(SD, int), np.array(RG, int), np.array(EI, int), np.array(DS)


def draw_assign(prob, path):
    from PIL import Image, ImageDraw
    cut = Image.open(os.path.join(ROOT, "docs", "ribbon", "ref", "ak-signature-cutout.webp")).convert("RGBA")
    bg = Image.new("RGBA", cut.size, (17, 17, 17, 255)); bg.alpha_composite(cut)
    im = bg.convert("RGB").resize((780, 1688), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    S2 = 2.0
    for x0, y0, x1, y1 in prob.box_boxes:
        d.rectangle([x0 * S2, y0 * S2, x1 * S2, y1 * S2], outline=(255, 255, 255), width=1)
    bL, bR = prob.box_cpose
    c = (bL + bR) / 2
    d.line([tuple(q) for q in c * S2], fill=(255, 255, 0), width=1)
    for pt, kp, sd in zip(prob.box_all, prob.box_keep, prob.box_side_all):
        col = ((0, 255, 255) if sd == 0 else (255, 0, 255)) if kp else (130, 130, 130)
        x, y = pt * S2
        d.ellipse([x - 2, y - 2, x + 2, y + 2], fill=col)
    # connect each kept point to its assigned centre ring
    for pt, kp, ri in zip(prob.box_all, prob.box_keep, prob.box_ring_all):
        if kp:
            d.line([tuple(pt * S2), tuple(c[ri] * S2)], fill=(90, 90, 40), width=1)
    im.save(path)


def soft_l1(vec, f=2.0):
    r = np.linalg.norm(vec, axis=1, keepdims=True)
    rho = np.sqrt(2.0 * (np.sqrt(1.0 + (r / f) ** 2) - 1.0)) * f
    return vec * rho / np.maximum(r, 1e-9)


def outline_match(pL, pR, O, rmax=25.0):
    """For each outline point O (M,2): vector to the nearest point of the projected band-edge polylines (rings + midpoints), the
    nearest ring index and distance. pL, pR: (N,2) css. Distance > rmax -> matched False."""
    N = len(pL)
    res = []
    for P in (pL, pR):
        Q = np.empty((2 * N - 1, 2))
        Q[0::2] = P
        Q[1::2] = (P[:-1] + P[1:]) / 2
        tree = cKDTree(Q)
        d, k = tree.query(O)
        best = None
        cand = []
        for dk in (-1, 0):  # segments (k-1,k) and (k,k+1)
            a_ = np.clip(k + dk, 0, len(Q) - 2)
            A_, B_ = Q[a_], Q[a_ + 1]
            ab = B_ - A_
            t = np.clip(((O - A_) * ab).sum(1) / np.maximum((ab * ab).sum(1), 1e-9), 0, 1)
            C_ = A_ + ab * t[:, None]
            cand.append((((C_ - O) ** 2).sum(1), C_))
        use = cand[1][0] < cand[0][0]
        C_ = np.where(use[:, None], cand[1][1], cand[0][1])
        res.append((np.sqrt(np.where(use, cand[1][0], cand[0][0])), C_, np.minimum(k // 2, N - 1)))
    useR = res[1][0] < res[0][0]
    dist = np.where(useR, res[1][0], res[0][0])
    C = np.where(useR[:, None], res[1][1], res[0][1])
    ring = np.where(useR, res[1][2], res[0][2])
    return C - O, dist, ring, dist <= rmax


def pose_to_world(p):
    p = np.asarray(p, float)
    sx = A["left"] + p[:, 0] * A["width"]
    sy = A["top"] + p[:, 1] * A["height"]
    zw = p[:, 2] * A["height"]
    k = (D - zw) / D
    return np.stack([(sx - VW / 2) * k, (VH / 2 - sy) * k, zw], 1)


def world_to_pose(W):
    k = D / (D - W[:, 2])
    sx = VW / 2 + W[:, 0] * k
    sy = VH / 2 - W[:, 1] * k
    return np.stack([(sx - A["left"]) / A["width"], (sy - A["top"]) / A["height"], W[:, 2] / A["height"]], 1)


def project(W):
    k = D / (D - W[..., 2])
    return np.stack([VW / 2 + W[..., 0] * k, VH / 2 - W[..., 1] * k], -1)


def unit(v):
    return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-12)


def knots(N, K):
    inner = np.linspace(0, N - 1, K - 2)[1:-1]
    return np.r_[[0.0] * 4, inner, [float(N - 1)] * 4]


class Basis:
    def __init__(self, N, K):
        self.N, self.K = N, K
        self.kn = knots(N, K)
        self.t = np.arange(N, dtype=float)
        sp = BSpline(self.kn, np.eye(K), 3)
        self.B = sp(self.t)
        self.B1 = sp.derivative(1)(self.t)
        self.B2 = sp.derivative(2)(self.t)
        self.t2 = np.linspace(0, N - 1, 2 * N - 1)
        self.Bh = sp(self.t2)
        self.B1h = sp.derivative(1)(self.t2)
        self.B3 = sp.derivative(3)(self.t)

    def fit(self, Y):
        Y = np.asarray(Y, float)
        return make_lsq_spline(self.t, Y, self.kn, 3).c

    def dense(self, M):
        td = np.linspace(0, self.N - 1, M)
        sp = BSpline(self.kn, np.eye(self.K), 3)
        return td, sp(td), sp.derivative(1)(td)


def moving_avg(a, w=5):
    pad = w // 2
    ap = np.pad(a, [(pad, pad)] + [(0, 0)] * (a.ndim - 1), mode="edge")
    return np.stack([np.convolve(ap[:, j], np.ones(w) / w, mode="valid") for j in range(a.shape[1])], 1)


def make_init(L, R, bs, mode):
    c = (L + R) / 2
    v = R - L
    if mode == "raw":
        b = unit(v)
        h = np.linalg.norm(v, axis=1) / 2
    else:
        T = unit(moving_avg(unit(np.gradient(c, axis=0)), 5))
        vp = v - (v * T).sum(1, keepdims=True) * T
        b = unit(vp)
        h = np.linalg.norm(vp, axis=1) / 2
    return bs.fit(c), bs.fit(b), bs.fit(h[:, None])[:, 0]


class Problem:
    def __init__(self, a, L, R, tgtL, tgtR, bs, C0):
        self.a, self.bs = a, bs
        sp0 = np.linalg.norm(bs.B1 @ C0, axis=1)
        pad = np.pad(sp0, (12, 12), mode="edge")
        self.s0 = np.maximum(np.convolve(pad, np.ones(25) / 25, mode="valid"), 1e-6)
        N, K = bs.N, bs.K
        self.N, self.K = N, K
        self.c0z = ((L + R) / 2)[:, 2]
        i = np.arange(N)
        off = np.arange(-25, 26)
        idx = np.clip(i[:, None] + off[None, :], 0, N - 2)
        self.idx = idx
        self.SA_L, self.SB_L = tgtL[idx], tgtL[idx + 1]
        self.SA_R, self.SB_R = tgtR[idx], tgtR[idx + 1]
        we = np.ones(N)
        we[CURL[0]:CURL[1] + 1] = 0.3
        we[LOOP[0]:LOOP[1] + 1] = 0.5
        self.we = we / a.sigma * a.trace_w
        self.outline_pts = outline_points(a.mask or None, a.outline_excl, incl=a.outline_incl) if a.outline > 0 else None
        self.out_rings = None
        self.out_info = None
        self.out_fixed = False
        if a.outline > 0 and a.outline_fixed:
            ap_ = json.load(open(a.outline_pose or a.pose))["variants"]["phone"]["ruled"]
            qL = project(pose_to_world([r["L"] for r in ap_])); qR = project(pose_to_world([r["R"] for r in ap_]))
            self.box_pts = np.zeros((0, 2)); self.box_side = np.zeros(0, int); self.box_ring = np.zeros(0, int); self.box_info = None
            boxes = parse_boxes(a.outline_boxes) if a.outline_assign == "centre" else []
            if boxes:
                bp = json.load(open(a.box_pose or a.outline_pose or a.pose))["variants"]["phone"]["ruled"]
                bL = project(pose_to_world([r["L"] for r in bp])); bR = project(pose_to_world([r["R"] for r in bp]))
                inb = in_boxes(self.outline_pts, boxes)
                Pin = self.outline_pts[inb]
                self.outline_pts = self.outline_pts[~inb]
                cands = box_candidates((bL + bR) / 2, boxes, a.box_rings)
                bs_, br_, bk_, binfo = outline_centre_assign(bL, bR, Pin, boxes, cands)
                self.box_all = Pin; self.box_keep = bk_; self.box_side_all = bs_; self.box_ring_all = br_
                self.box_pts, self.box_side, self.box_ring = Pin[bk_], bs_[bk_], br_[bk_]
                self.box_info = binfo; self.box_cands = cands; self.box_boxes = boxes
                self.box_cpose = (bL, bR)
                # trace weight x0.15 for rings whose init centreline lies inside a box
                inr = in_boxes((bL + bR) / 2, boxes)
                self.we = self.we * np.where(inr, a.box_trace, 1.0)
            if a.outline_drop_near:
                sites = []
                for spec in [q for q in a.outline_drop_near.split(",") if q]:
                    a0, b0 = spec.split(":")
                    sites.append(np.vstack([qL[int(a0):int(b0) + 1], qR[int(a0):int(b0) + 1]]))
                sites = np.vstack(sites)
                dn, _ = cKDTree(sites).query(self.outline_pts)
                nd = dn < 10.0
                self.outline_pts = self.outline_pts[~nd]
                n_drop_near = int(nd.sum())
            else:
                n_drop_near = 0
            side, ring, keep, info = outline_assign(qL, qR, self.outline_pts)
            info["near_dropped"] = n_drop_near
            self.outline_pts = self.outline_pts[keep]
            self.out_side, self.out_ring = side[keep], ring[keep]
            self.out_rings = self.out_ring
            self.out_info = info
            self.out_fixed = True
        self.rim_pts = np.zeros((0, 2)); self.rim_side = np.zeros(0, int); self.rim_ring = np.zeros(0, int)
        self.rim_eid = np.zeros(0, int); self.rim_entries = []
        if a.rimlines and a.w_rim > 0:
            rp_ = json.load(open(a.rim_pose or a.box_pose or a.outline_pose or a.pose))["variants"]["phone"]["ruled"]
            rL = project(pose_to_world([r["L"] for r in rp_])); rR = project(pose_to_world([r["R"] for r in rp_]))
            self.rim_entries = rim_points(a.rimlines)
            sil = None
            if a.rim_side_mode == "opposite":
                if not hasattr(self, "box_ring_all"):
                    raise SystemExit("--rim_side_mode opposite needs --outline_assign centre --outline_boxes")
                sil = (self.box_ring_all[self.box_keep], self.box_side_all[self.box_keep], self.box_info["box_of"][self.box_keep], self.box_all[self.box_keep])
            self.rim_pts, self.rim_side, self.rim_ring, self.rim_eid, self.rim_dist = rim_assign(rL, rR, self.rim_entries, sil, boxes=self.box_boxes)
            for k_, (nm_, rg_, _, rel_, _) in enumerate(self.rim_entries):
                m_ = self.rim_eid == k_
                print("rim line %-6s rings %d:%d rel %-8s forced sides L %d R %d" % (nm_, rg_[0], rg_[1], rel_ if sil is not None else "-", (self.rim_side[m_] == 0).sum(), (self.rim_side[m_] == 1).sum()), flush=True)
            self.rim_cpose = (rL, rR)
        self.mulL = np.ones(N)
        self.mulR = np.ones(N)
        for spec in [q for q in a.edge_w.split(",") if q]:
            a0, b0, side, w0 = spec.split(":")
            (self.mulL if side.upper() == "L" else self.mulR)[int(a0):int(b0) + 1] *= float(w0)
        fw = np.zeros(N)
        if a.faceon:
            a0, b0, w0 = a.faceon.split(":")
            a0, b0 = int(a0), int(b0)
            k = np.arange(N)
            ramp = lambda x: x * x * (3 - 2 * x)
            r = np.minimum(ramp(np.clip((k - a0) / 10.0, 0, 1)), ramp(np.clip((b0 - k) / 10.0, 0, 1)))
            fw = float(w0) * np.where((k >= a0) & (k <= b0), r, 0.0)
        self.fw = fw
        self.bzw = np.zeros(N); self.bzt = np.zeros(N)
        if getattr(a, "bz", ""):
            kk = np.arange(N).astype(float)
            smc = lambda x: np.clip(x, 0, 1) ** 2 * (3 - 2 * np.clip(x, 0, 1))
            for spec in [q for q in a.bz.split(",") if q]:
                a0, b0, t0, w0 = spec.split(":"); a0, b0, t0, w0 = int(a0), int(b0), float(t0), float(w0)
                r = smc((kk - a0 + 0.5) / 4.0) * smc((b0 - kk + 0.5) / 4.0)
                r = np.where((kk >= a0) & (kk <= b0), r, 0.0)
                m = (w0 * r) > self.bzw
                self.bzw = np.where(m, w0 * r, self.bzw)
                self.bzt = np.where(m, t0, self.bzt)
                print("bz rings %d..%d t %.2f w %.1f" % (a0, b0, t0, w0), flush=True)
        self.litw = np.zeros(N); self.litt = np.zeros(N)
        if getattr(a, "lit", ""):
            kk = np.arange(N).astype(float)
            smc = lambda x: np.clip(x, 0, 1) ** 2 * (3 - 2 * np.clip(x, 0, 1))
            for spec in [q for q in a.lit.split(",") if q]:
                a0, b0, t0, w0 = spec.split(":"); a0, b0, t0, w0 = int(a0), int(b0), float(t0), float(w0)
                r = smc((kk - a0 + 0.5) / 4.0) * smc((b0 - kk + 0.5) / 4.0)
                r = np.where((kk >= a0) & (kk <= b0), r, 0.0)
                m = (w0 * r) > self.litw
                self.litw = np.where(m, w0 * r, self.litw)
                self.litt = np.where(m, t0, self.litt)
                print("lit rings %d..%d t %.2f w %.1f" % (a0, b0, t0, w0), flush=True)
        self.fz = np.zeros(N)
        self.Rz = np.full(N, 1e9)
        self.wz = np.zeros(N)
        ramp8 = lambda x: x * x * (3 - 2 * x)
        for spec in [q for q in a.fold.split(",") if q]:
            a0, b0, R0, w0 = spec.split(":")
            a0, b0 = int(a0), int(b0)
            k = np.arange(N)
            r = np.minimum(ramp8(np.clip((k - a0) / 8.0, 0, 1)), ramp8(np.clip((b0 - k) / 8.0, 0, 1)))
            r = np.where((k >= a0) & (k <= b0), r, 0.0)
            m = r > self.fz
            self.fz = np.where(m, r, self.fz)
            self.Rz = np.where(m, float(R0), self.Rz)
            self.wz = np.where(m, float(w0), self.wz)
        self.eqw = np.zeros(N)
        self.legw = np.zeros(N)
        self.cvxw = np.zeros(N)
        cvx_map, cvx_all = {}, 0.0
        for q in [q for q in str(a.fold_convex).split(",") if q]:
            if ":" in q:
                cq, wq = q.split(":"); cvx_map[int(cq)] = float(wq)
            else:
                cvx_all = float(q)
        self.fold_n = {}
        len_map, len_all = {}, 20.0
        for q in [q for q in str(a.fold_legs_len).split(",") if q]:
            if ":" in q:
                cq, wq = q.split(":"); len_map[int(cq)] = float(wq)
            else:
                len_all = float(q)
        self.ew = np.ones(N)
        for q in [q for q in str(a.energy_ranges).split(",") if q]:
            e0, e1, ef = q.split(":")
            kk_ = np.arange(N).astype(float)
            smr = lambda x: np.clip(x, 0, 1) ** 2 * (3 - 2 * np.clip(x, 0, 1))
            win = smr((kk_ - int(e0) + 3.0) / 6.0) * smr((int(e1) - kk_ + 3.0) / 6.0)
            self.ew = self.ew * (1.0 + (float(ef) - 1.0) * win)
        if a.fold2:
            cc_ = (np.asarray(L) + np.asarray(R)) / 2
            dsr = np.linalg.norm(np.diff(cc_, axis=0), axis=1)
            k = np.arange(N).astype(float)
            sm = lambda x: np.clip(x, 0, 1) ** 2 * (3 - 2 * np.clip(x, 0, 1))
            for spec in [q for q in a.fold2.split(",") if q]:
                c0, R0, w0 = spec.split(":")
                c0, R0, w0 = int(c0), float(R0), float(w0)
                dsm = float(dsr[max(c0 - 15, 0):c0 + 15].mean())
                n = int(round(math.pi * R0 / (2 * dsm)))
                d = np.abs(k - c0)
                eq = sm((n + 0.5 - d) / 4.0)
                rl = sm((n + 6 + 0.5 - d) / 4.0)
                nl = len_map.get(c0, len_all)
                self.fold_n[c0] = n
                lg = sm((d - (n + 6) + 2.0) / 4.0) * sm((n + nl + 0.5 - d) / 4.0) * (1.0 - rl)
                lg = np.where(d > n + 4, lg, 0.0)
                m = rl > self.fz
                self.fz = np.where(m, rl, self.fz)
                zone_ = np.maximum(rl, np.maximum(eq, lg)) > 0
                self.Rz = np.where(zone_, R0, self.Rz)
                self.wz = np.where(zone_, w0, self.wz)
                self.eqw = np.maximum(self.eqw, eq)
                self.cvxw = np.maximum(self.cvxw, eq * cvx_map.get(c0, cvx_all))
                self.legw = np.maximum(self.legw, lg)
                print("fold2 crease %d R %.0f: ds %.2f n %d (eq %d..%d, ruling %d..%d, legs to +-%d)" % (c0, R0, dsm, n, c0 - n, c0 + n, c0 - n - 6, c0 + n + 6, n + int(nl)), flush=True)
        self.curlz = np.zeros(N); self.curlw = np.zeros(N); self.curlR = np.full(N, 1e9)
        if a.curl:
            kk = np.arange(N).astype(float)
            smc = lambda x: np.clip(x, 0, 1) ** 2 * (3 - 2 * np.clip(x, 0, 1))
            for spec in [q for q in a.curl.split(",") if q]:
                a0, b0, R0, w0 = spec.split(":"); a0, b0, R0, w0 = int(a0), int(b0), float(R0), float(w0)
                r = smc((kk - a0 + 0.5) / 4.0) * smc((b0 - kk + 0.5) / 4.0)
                r = np.where((kk >= a0) & (kk <= b0), r, 0.0)
                m = r > self.curlz
                self.curlz = np.where(m, r, self.curlz)
                self.curlw = np.where(m, w0 * r, self.curlw)
                self.curlR = np.where(m, R0, self.curlR)
                print("curl rings %d..%d R %.0f w %.1f" % (a0, b0, R0, w0), flush=True)
        self.flatw = np.zeros(N)
        if a.flat > 0:
            if a.flat_ranges:
                for q in [q for q in str(a.flat_ranges).split(",") if q]:
                    f0, f1 = q.split(":")
                    self.flatw[int(f0):int(f1) + 1] = a.flat
            else:
                self.flatw[:] = a.flat
        self.axw = np.zeros(N)
        self.axL = np.zeros((N, 3))
        self.ax_info = []
        for q in [q for q in str(a.fold_axis).split(",") if q]:
            cq, wq = q.split(":")
            cq, wq = int(cq), float(wq)
            nq = self.fold_n[cq]
            dd = np.abs(np.arange(N) - cq).astype(float)
            smx = lambda x: np.clip(x, 0, 1) ** 2 * (3 - 2 * np.clip(x, 0, 1))
            self.axw = np.maximum(self.axw, wq * smx((nq + 6 + 0.5 - dd) / 4.0))
            self.ax_info.append((cq, nq, wq))
        self.face_e = np.zeros(N)
        self.sign_A = 1.0
        if a.faces and a.w_face > 0:
            fj = json.load(open(a.faces))
            e = np.zeros(N)
            for sg in fj["segments"]:
                e[int(sg["rings"][0]):int(sg["rings"][1]) + 1] = 1.0 if sg["face"] == "A" else -1.0
            zone = np.zeros(N, bool)
            for z0, z1 in fj.get("flip_zones", []):
                zone[int(z0):int(z1) + 1] = True
            dist = np.full(N, 1e9)
            zi = np.nonzero(zone)[0]
            if len(zi):
                dist = np.abs(np.arange(N)[:, None] - zi[None, :]).min(1).astype(float)
            ramp_ = np.clip(dist / 6.0, 0.0, 1.0)
            self.face_e = e * ramp_ * a.w_face  # signed expectation scaled by weight/ramp (hinge uses sign and weight separately below)
            self.face_s = np.sign(e)
            self.face_wt = np.abs(e) * ramp_ * a.w_face
        sw = np.zeros(N)
        swt = np.ones(N)
        ramp = lambda x: x * x * (3 - 2 * x)
        for spec in [q for q in a.screenw.split(",") if q]:
            a0, b0, tg, w0 = spec.split(":")
            a0, b0 = int(a0), int(b0)
            k = np.arange(N)
            r = np.minimum(ramp(np.clip((k - a0) / 10.0, 0, 1)), ramp(np.clip((b0 - k) / 10.0, 0, 1)))
            m = (k >= a0) & (k <= b0)
            sw = np.where(m, float(w0) * r, sw)
            swt = np.where(m, float(tg), swt)
        self.sw, self.swt = sw, swt
        wfW = np.full(N, float(a.wfloor))
        for spec in [q for q in a.wfloor_ranges.split(",") if q]:
            a0, b0, W0 = spec.split(":")
            wfW[int(a0):int(b0) + 1] = float(W0)
        for spec in [q for q in a.wfloor_except.split(",") if q]:
            a0, b0 = spec.split(":")
            wfW[int(a0):int(b0) + 1] = 0.0
        self.wfW = wfW
        nu = np.ones(N)
        for lo, hi in FOLDS:
            nu[lo:hi + 1] = a.nu_fold
        self.nu = nu
        self.base_sparsity = self._sparsity()
        self.jac_sparsity = self.base_sparsity
        self.x0 = None
        self.ts_pin = np.array([0, 5, 10, N - 11, N - 6, N - 1])
        self.pin_w = np.full(len(self.ts_pin), float(a.end_pin))
        if a.pin_range:
            a0, b0, st, w0 = a.pin_range.split(":")
            ex = [k for k in range(int(a0), int(b0) + 1, int(st)) if k not in set(self.ts_pin.tolist())]
            self.ts_pin = np.r_[self.ts_pin, ex].astype(int)
            self.pin_w = np.r_[self.pin_w, np.full(len(ex), float(w0))]
        self.ts_keep = np.zeros(0, int)
        self.kw_keep = np.zeros(0)
        self.b0keep = np.zeros((0, 3))
        if a.keep > 0:
            kw = np.ones(N)
            kidx = np.arange(N)
            for spec in [q for q in a.keep_free.split(",") if q]:
                fa, fb = [int(v) for v in spec.split(":")]
                dist = np.where(kidx < fa, fa - kidx, np.where(kidx > fb, kidx - fb, 0)).astype(float)
                xx = np.clip(dist / 10.0, 0.0, 1.0)
                kw *= xx * xx * (3.0 - 2.0 * xx)
            kw *= float(a.keep)
            self.ts_keep = np.where(kw > 1e-6)[0].astype(int)
            self.kw_keep = kw[self.ts_keep]
            have = set(self.ts_pin.tolist())
            ex = [k for k in self.ts_keep.tolist() if k not in have]
            self.ts_pin = np.r_[self.ts_pin, ex].astype(int)
            self.pin_w = np.r_[self.pin_w, kw[ex]]
            print("keep: %d rings held (w=%.2f), %d new centreline pins" % (len(self.ts_keep), a.keep, len(ex)), flush=True)
        self.use_pin = a.end_pin > 0 or bool(a.pin_range) or a.keep > 0
        self.field = inside_field(a.mask or None) if a.inside > 0 else None
        self.c0pin = bs.B[self.ts_pin] @ C0
        self.pairs_c = (np.zeros(0, int), np.zeros(0, int))
        self.pairs_o = (np.zeros(0, int), np.zeros(0, int))
        self.n_extra = 0

    def set_keep_ruling(self, G0):
        if len(self.ts_keep):
            self.b0keep = unit(self.bs.B[self.ts_keep] @ G0)

    # ---- parameters
    def unpack(self, x):
        K = self.K
        return x[:3 * K].reshape(K, 3), x[3 * K:6 * K].reshape(K, 3), x[6 * K:]

    def pack(self, C, G, H):
        return np.r_[C.ravel(), G.ravel(), H]

    def curves(self, x):
        C, G, H = self.unpack(x)
        bs = self.bs
        c = bs.B @ C
        g = bs.B @ G
        h = bs.B @ H
        b = unit(g)
        return c, b, h

    def edges(self, x):
        c, b, h = self.curves(x)
        return c - h[:, None] * b, c + h[:, None] * b

    @staticmethod
    def near(P, SA, SB):
        ab = SB - SA
        t = np.clip(((P[:, None, :] - SA) * ab).sum(-1) / np.maximum((ab * ab).sum(-1), 1e-9), 0, 1)
        Q = SA + ab * t[..., None]
        d2 = ((Q - P[:, None, :]) ** 2).sum(-1)
        j = np.argmin(d2, 1)
        return Q[np.arange(len(P)), j]

    def blocks(self, x):
        a, bs = self.a, self.bs
        C, G, H = self.unpack(x)
        self._G = G
        c = bs.B @ C
        g = bs.B @ G
        h = bs.B @ H
        b = unit(g)
        c1 = bs.B1 @ C
        c3 = bs.B3 @ C
        T = unit(c1)
        c2 = bs.B2 @ C
        kap = np.linalg.norm(np.cross(c1, c2), axis=1) / np.maximum(np.linalg.norm(c1, axis=1), 1e-9) ** 3
        Lw, Rw = c - h[:, None] * b, c + h[:, None] * b
        pL, pR = project(Lw), project(Rw)
        eL = (pL - self.near(pL, self.SA_L, self.SB_L)) * (self.we * self.mulL)[:, None]
        eR = (pR - self.near(pR, self.SA_R, self.SB_R)) * (self.we * self.mulR)[:, None]
        edge = np.concatenate([eL, eR], 1)  # (N, 4)
        wscr = np.linalg.norm(pR - pL, axis=1)
        if a.wfloor > 0 or a.wfloor_ranges:
            if a.wfloor_mode == "perp":
                cs = (pL + pR) / 2
                pad = np.pad(cs, ((3, 3), (0, 0)), mode="edge")
                tt = pad[6:] - pad[:-6]
                tt = tt / np.maximum(np.linalg.norm(tt, axis=1, keepdims=True), 1e-9)
                dd = pR - pL
                wvis = np.abs(dd[:, 0] * tt[:, 1] - dd[:, 1] * tt[:, 0])
            else:
                wvis = wscr
            wf = a.w_wfloor * np.maximum(0.0, self.wfW - wvis) / np.maximum(self.wfW, 1e-9) * (self.wfW > 0)
        else:
            wf = np.zeros(self.N)
        b2 = np.zeros_like(b)
        b2[1:-1] = b[2:] - 2 * b[1:-1] + b[:-2]
        bp = np.gradient(b, axis=0)
        h2 = np.zeros(self.N)
        h2[1:-1] = h[2:] - 2 * h[1:-1] + h[:-2]
        spd = np.linalg.norm(c1, axis=1)
        speed = np.where(spd < 0.6 * self.s0, a.kappa * (spd - self.s0) / self.s0, 0.0)
        return dict(
            edge=edge,
            smooth=a.mu * b2,
            jerk=a.lam * c3,
            perp=((self.nu * (1.0 - self.fz) + self.curlw) * (b * T).sum(1))[:, None],
            dev=a.delta * np.einsum("ij,ij->i", np.cross(T, b), bp)[:, None],
            depth=(a.eps * (c[:, 2] - self.c0z))[:, None],
            hsm=(a.lam_h * h2)[:, None],
            wpr=(a.omega * (h - 25.5))[:, None],
            speed=speed[:, None],
            hmin=(a.w_hmin * np.maximum(0.0, a.hmin - h))[:, None],
            hmax=(a.w_hmin * np.maximum(0.0, h - a.hmax))[:, None],
            face=(self.fw * b[:, 2] + self.bzw * (np.sqrt(b[:, 2] ** 2 + 1e-6) - self.bzt))[:, None],
            fcr=(self.face_rule(c, T, b) + self.lit_term(c, T, b))[:, None],
            **self.elastic(c1, c2, T, b, g, kap),
            rmin=((((1.0 - self.fz) * (1.0 - self.curlz) * a.w_rmin * a.rmin * np.maximum(0.0, kap - 1.0 / a.rmin)) if a.rmin > 0 else 0.0) + self.curlw * self.curlR * np.maximum(0.0, kap - 1.0 / self.curlR))[:, None] if (a.rmin > 0 or a.curl) else np.zeros((self.N, 1)),
            **self.fold_terms(c1, g, b, kap, c2, c, T),
            scrw=(self.sw * (wscr - self.swt) / self.swt)[:, None],
            wf=wf[:, None],
            ins=(a.inside * self.field(project(c[:, None, :] + UB[None, :, None] * h[:, None, None] * b[:, None, :]))) if self.field is not None else np.zeros((self.N, 5)),
        )

    def update_axis(self, x, tag=""):
        """per fold: unit(T_in + T_out) (mean tangents over [c-n-20, c-n-5] / [c+n+5, c+n+20]) = the physical fold line; stored per ring in the zone."""
        if not self.ax_info:
            return
        C, G, H = self.unpack(x)
        T = unit(self.bs.B1 @ C)
        b = unit(self.bs.B @ G)
        for cq, nq, wq in self.ax_info:
            lo1, hi1 = max(cq - nq - 20, 0), max(cq - nq - 5, 1)
            lo2, hi2 = min(cq + nq + 5, self.N - 2), min(cq + nq + 20, self.N - 1)
            Tin = unit(T[lo1:hi1 + 1].mean(0, keepdims=True))[0]
            Tout = unit(T[lo2:hi2 + 1].mean(0, keepdims=True))[0]
            lh = unit((Tin + Tout)[None, :])[0]
            zone = np.abs(np.arange(self.N) - cq) <= nq + 7
            self.axL[zone] = lh
            ang = math.degrees(math.acos(np.clip(Tin @ (-Tout), -1, 1)))
            print("fold_axis %s crease %d: |b.T| at crease %.3f, |b.l| %.3f, expected cos(half angle(T_in,-T_out)=%.1f deg) = %.3f" % (tag, cq, abs(b[cq] @ T[cq]), abs(b[cq] @ lh), ang, math.cos(math.radians(ang / 2))), flush=True)

    def fold_terms(self, c1, g, b, kap, c2=None, c=None, T=None):
        z1, z3 = np.zeros((self.N, 1)), np.zeros((self.N, 3))
        if not (self.a.fold or self.a.fold2 or self.a.curl):
            return dict(rmf=z1, crl=z3, lgb=z1, cvx=z1)
        ds = np.maximum(np.linalg.norm(c1, axis=1), 1e-9)
        g1 = self.bs.B1 @ self._G
        gn = np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-9)
        bp = (g1 - b * (b * g1).sum(1, keepdims=True)) / gn
        wf = (self.wz * self.fz)[:, None]
        if self.a.fold2:
            rmf = self.wz * self.eqw * self.Rz * np.abs(kap - 1.0 / self.Rz)
        else:
            rmf = self.wz * self.fz * self.Rz * (np.abs(kap - 1.0 / self.Rz) if self.a.fold_eq else np.maximum(0.0, kap - 1.0 / self.Rz))
        cvx = z1
        if self.cvxw.any() and self.a.fold2:
            Nn = unit(np.cross(T, b))
            v = unit(np.array([0.0, 0.0, D]) - c)
            sg = np.tanh(np.einsum("ij,ij->i", Nn, v) / 0.1)
            kv = (c2 - (c2 * T).sum(1, keepdims=True) * T) / ds[:, None] ** 2
            sv = self.Rz * np.einsum("ij,ij->i", kv, Nn) * sg
            cvx = (self.cvxw * np.maximum(0.0, 0.3 + sv))[:, None]
        return dict(rmf=rmf[:, None], crl=(wf + self.curlw[:, None]) * bp / ds[:, None], lgb=(self.a.fold_legs * self.legw * self.Rz * kap)[:, None], cvx=cvx)

    def elastic(self, c1, c2, T, b, g, kap):
        a = self.a
        z = np.zeros((self.N, 1))
        if not (a.bend > 0 or a.twist > 0 or a.dbend > 0 or a.dtwist > 0):
            return dict(bnd=z, twi=z, dbn=z, dtw=z)
        ds = np.maximum(np.linalg.norm(c1, axis=1), 1e-9)
        sq = np.sqrt(ds)
        g1 = self.bs.B1 @ self._G
        gn = np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-9)
        bp = (g1 - b * (b * g1).sum(1, keepdims=True)) / gn  # db/dt
        tau = (bp / ds[:, None] * np.cross(T, b)).sum(1)
        dk = np.gradient(kap) / ds
        dt = np.gradient(tau) / ds
        of = 1.0 - self.fz
        return dict(bnd=(a.bend * sq * kap)[:, None], twi=(of * a.twist * sq * tau)[:, None],
                    dbn=(self.ew * a.dbend * sq * dk)[:, None], dtw=(self.ew * of * a.dtwist * sq * dt)[:, None])

    def lit_term(self, c, T, b):
        """--lit: w*r*max(0, t - n_vis_y), n_vis = the face normal that points at the camera (smooth sign)."""
        if not np.any(self.litw):
            return 0.0
        Nn = unit(np.cross(T, b))
        v = unit(np.array([0.0, 0.0, D]) - c)
        nvy = Nn[:, 1] * np.tanh(np.einsum("ij,ij->i", Nn, v) / 0.1)
        return self.litw * np.maximum(0.0, self.litt - nvy)

    def face_rule(self, c, T, b):
        """w * max(0, m - e * s), s = sign_A * (N . unit(cam - c)), N = unit(T x b); zero where no face is expected / flip zones."""
        if not (self.a.faces and self.a.w_face > 0):
            return np.zeros(self.N)
        Nn = unit(np.cross(T, b))
        v = unit(np.array([0.0, 0.0, D]) - c)
        s_ = self.sign_A * np.einsum("ij,ij->i", Nn, v)
        return self.face_wt * np.maximum(0.0, self.a.face_margin - self.face_s * s_)

    def calib_face(self, x):
        """sign_A so that the tail (pose rings 20..80) shows face A (s > 0) at x."""
        if not (self.a.faces and self.a.w_face > 0):
            return
        c, b, h = self.curves(x)
        C, G, H = self.unpack(x)
        T = unit(self.bs.B1 @ C)
        s_ = np.einsum("ij,ij->i", unit(np.cross(T, b)), unit(np.array([0.0, 0.0, D]) - c))
        self.sign_A = 1.0 if np.median(s_[20:81]) >= 0 else -1.0
        print("face rule: sign_A %.0f (tail median N.v %.3f)" % (self.sign_A, np.median(s_[20:81])), flush=True)

    U = np.array([-1.0, -0.5, 0.0, 0.5, 1.0])

    def surface(self, x):
        c, b, h = self.curves(x)
        return c[:, None, :] + self.U[None, :, None] * h[:, None, None] * b[:, None, :]  # (N, 5, 3)

    def set_x0(self, x0):
        self.x0 = x0
        self.Zinit = self.surface(x0).reshape(-1, 3)[:, 2]

    def fun(self, x):
        bl = self.blocks(x)
        out = [np.concatenate([bl[k].reshape(self.N, -1) for k in ORDER], 1).ravel()]
        a = self.a
        if self.use_pin:
            c, _, _ = self.curves(x)
            out.append((self.pin_w[:, None] * (c[self.ts_pin] - self.c0pin)).ravel())
        if a.keep > 0:
            _, G_, _ = self.unpack(x)
            b_k = unit(self.bs.B[self.ts_keep] @ G_)
            out.append((self.kw_keep[:, None] * 30.0 * (b_k - self.b0keep)).ravel())
        if (a.clear > 0 and len(self.pairs_c[0])) or (a.order > 0 and len(self.pairs_o[0])):
            P = self.surface(x).reshape(-1, 3)
            if a.clear > 0 and len(self.pairs_c[0]):
                d = np.linalg.norm(P[self.pairs_c[0]] - P[self.pairs_c[1]], axis=1)
                out.append(a.clear * np.maximum(0.0, a.gap - d))
            if a.order > 0 and len(self.pairs_o[0]):
                dz = P[self.pairs_o[0], 2] - P[self.pairs_o[1], 2]
                out.append(a.order * np.maximum(0.0, a.gap - dz))
        if self.outline_pts is not None:
            Lw, Rw = self.edges(x)
            if self.out_fixed:
                vec, _ = outline_fixed_res(project(Lw), project(Rw), self.outline_pts, self.out_side, self.out_ring)
                if a.outline_loss == "soft":
                    vec = soft_l1(vec, 2.0)
                out.append((a.outline * vec).ravel())
                if len(self.box_pts):
                    vb, _ = outline_fixed_res(project(Lw), project(Rw), self.box_pts, self.box_side, self.box_ring, half=10)
                    out.append((a.w_box * vb).ravel())
            else:
                vec, dist, ring, ok = outline_match(project(Lw), project(Rw), self.outline_pts, 25.0)
                out.append((a.outline * np.where(ok[:, None], vec, 0.0)).ravel())
        if len(self.rim_pts):
            Lw, Rw = self.edges(x)
            vr, _ = outline_fixed_res(project(Lw), project(Rw), self.rim_pts, self.rim_side, self.rim_ring, half=10)
            out.append((a.w_rim * vr).ravel())
        if a.redge > 0 and a.w_redge > 0:
            C, G, H = self.unpack(x)
            bs = self.bs
            c2, g2, h2 = bs.Bh @ C, bs.Bh @ G, bs.Bh @ H
            b2 = unit(g2)
            kap_all = []
            for sg in (-1.0, 1.0):
                E = c2 + sg * h2[:, None] * b2
                d1 = (E[2:] - E[:-2]) / 1.0  # per 2 samples = per ring
                d2 = (E[2:] - 2 * E[1:-1] + E[:-2]) * 4.0  # step 0.5 ring
                kk = np.linalg.norm(np.cross(d1, d2), axis=1) / np.maximum(np.linalg.norm(d1, axis=1), 1e-9) ** 3
                kap_all.append(np.r_[0.0, kk, 0.0])
            kap = np.concatenate(kap_all)
            fzh = np.interp(np.linspace(0, self.N - 1, 2 * self.N - 1), np.arange(self.N), self.fz)
            out.append(a.w_redge * a.redge * np.maximum(0.0, kap - 1.0 / a.redge) * np.tile(1.0 - fzh, 2))
        if a.edge_fair > 0:
            C, G, H = self.unpack(x)
            bs = self.bs
            c2, g2, h2 = bs.Bh @ C, bs.Bh @ G, bs.Bh @ H
            b2 = unit(g2)
            for sg in (-1.0, 1.0):
                E = c2 + sg * h2[:, None] * b2
                d1 = (E[2:] - E[:-2]) / 1.0
                d2 = (E[2:] - 2 * E[1:-1] + E[:-2]) * 4.0
                kk = np.linalg.norm(np.cross(d1, d2), axis=1) / np.maximum(np.linalg.norm(d1, axis=1), 1e-9) ** 3
                sl = np.maximum(np.linalg.norm(E[2:] - E[1:-1], axis=1), 1e-9)[:-1]
                out.append(a.edge_fair * np.diff(kk) / sl * np.sqrt(sl))
        if a.flip_guard > 0:
            C, G, H = self.unpack(x)
            bs = self.bs
            bh = unit(bs.Bh @ G)
            Th = unit(bs.B1h @ C)
            Nh = unit(np.cross(Th, bh))
            out.append(a.flip_guard * np.maximum(0.0, 0.9 - (bh[1:] * bh[:-1]).sum(1)))
            out.append(a.flip_guard * np.maximum(0.0, 0.9 - (Nh[1:] * Nh[:-1]).sum(1)))
        if a.fold_axis:
            C, G, H = self.unpack(x)
            bq = unit(self.bs.B @ G)
            out.append(self.axw * (1.0 - (bq * self.axL).sum(1) ** 2))
        if a.flat > 0:
            C, G, H = self.unpack(x)
            out.append(self.flatw * unit(self.bs.B1 @ C)[:, 2])
        return np.concatenate(out)

    # ---- outline sparsity: rings the nearest edge point belongs to, +-10 ring window
    def update_outline(self, x):
        if self.outline_pts is None or self.out_fixed:
            return
        Lw, Rw = self.edges(x)
        _, _, ring, _ = outline_match(project(Lw), project(Rw), self.outline_pts, 25.0)
        self.out_rings = ring

    # ---- pair lists (rebuilt per outer round)
    def build_pairs(self, x, want_c=True, want_o=True, rebuild_only=False):
        a, N = self.a, self.N
        P = self.surface(x).reshape(-1, 3)
        ring = np.repeat(np.arange(N), 5)
        res = {}
        if want_c:
            tree = cKDTree(P)
            pr = tree.query_pairs(a.gap + 8.0, output_type="ndarray")
            pr = pr[np.abs(ring[pr[:, 0]] - ring[pr[:, 1]]) > 60]
            if a.clear_range:
                ri_, rj_ = ring[pr[:, 0]], ring[pr[:, 1]]
                keep_ = np.zeros(len(pr), bool)
                for spec in [q for q in a.clear_range.split(",") if q]:
                    r1, r2 = spec.split("-")
                    a0, a1 = [int(v) for v in r1.split(":")]
                    b0, b1 = [int(v) for v in r2.split(":")]
                    keep_ |= ((ri_ >= a0) & (ri_ <= a1) & (rj_ >= b0) & (rj_ <= b1)) | ((rj_ >= a0) & (rj_ <= a1) & (ri_ >= b0) & (ri_ <= b1))
                pr = pr[keep_]
            res["c"] = (pr[:, 0], pr[:, 1])
        if want_o:
            sc = project(P)
            tree = cKDTree(sc)
            pr = tree.query_pairs(3.0, output_type="ndarray")
            pr = pr[np.abs(ring[pr[:, 0]] - ring[pr[:, 1]]) > 60]
            pa, pb = pr[:, 0], pr[:, 1]
            i, j = ring[pa], ring[pb]
            inr = lambda r, lo, hi: (r >= lo) & (r <= hi)
            front = np.zeros(len(pa), int)
            def setf(mask, val):
                m = mask & (front == 0)
                front[m] = val
            ia, ja = inr(i, 555, 658), inr(j, 555, 658)
            setf(ia & ~ja, 1); setf(ja & ~ia, -1)
            setf(inr(i, 859, 945) & inr(j, 388, 483), 1); setf(inr(j, 859, 945) & inr(i, 388, 483), -1)
            setf(inr(j, 946, 1066) & inr(i, 388, 483), 1); setf(inr(i, 946, 1066) & inr(j, 388, 483), -1)
            dz0 = self.Zinit[pa] - self.Zinit[pb]
            # R4 for still-undecided: handled below
            und = front == 0
            front = np.where(und, np.where(dz0 >= 0, 1, -1), front)
            fr = np.where(front > 0, pa, pb)
            bk = np.where(front > 0, pb, pa)
            res["o"] = (fr, bk)
        return res

    def set_pairs(self, c_pairs, o_pairs):
        self.pairs_c, self.pairs_o = c_pairs, o_pairs
        a, N, K, bs = self.a, self.N, self.K, self.bs
        blocks = [self.base_sparsity]
        Bn = (abs(sparse.csr_matrix(bs.B)) > 0).astype(float)
        ones3 = sparse.csr_matrix(np.ones((1, 3)))
        Sup = sparse.hstack([sparse.kron(Bn, ones3, format="csr")] * 2 + [Bn], format="csr")  # N x 7K
        if self.use_pin:
            Cm = sparse.kron(Bn[self.ts_pin], ones3, format="csr")
            rows = sparse.kron(Cm, sparse.csr_matrix(np.ones((3, 1))), format="csr")
            blocks.append(sparse.hstack([rows, sparse.csr_matrix((rows.shape[0], 4 * K))], format="csr"))
        if a.keep > 0:
            Gk = sparse.kron(Bn[self.ts_keep], ones3, format="csr")
            rowsk = sparse.kron(Gk, sparse.csr_matrix(np.ones((3, 1))), format="csr")
            blocks.append(sparse.hstack([sparse.csr_matrix((rowsk.shape[0], 3 * K)), rowsk, sparse.csr_matrix((rowsk.shape[0], K))], format="csr"))
        for use, pr in ((a.clear > 0, c_pairs), (a.order > 0, o_pairs)):
            if use and len(pr[0]):
                ring = np.repeat(np.arange(N), 5)
                n = len(pr[0])
                sel = lambda idx: sparse.csr_matrix((np.ones(n), (np.arange(n), ring[idx])), shape=(n, N))
                M = sel(pr[0]) @ Sup + sel(pr[1]) @ Sup
                M.data[:] = 1.0
                blocks.append(M.tocsr())
        if self.outline_pts is not None:
            ring = self.out_rings if self.out_rings is not None else np.zeros(len(self.outline_pts), int)
            if self.out_fixed and len(self.box_pts):
                ring = np.r_[ring, self.box_ring]
            M = len(ring)
            rows, cols = [], []
            for off in range(-12, 13):
                rows.append(np.arange(M))
                cols.append(np.clip(ring + off, 0, N - 1))
            W = sparse.csr_matrix((np.ones(M * 25), (np.concatenate(rows), np.concatenate(cols))), shape=(M, N))
            Wm = (W @ Sup)
            Wm.data[:] = 1.0
            Wm = Wm.tocsr()
            # two residual rows per outline point, interleaved (x, y)
            R2 = sparse.csr_matrix((np.ones(2 * M), (np.arange(2 * M), np.repeat(np.arange(M), 2))), shape=(2 * M, M))
            blocks.append((R2 @ Wm).tocsr())
        if len(self.rim_pts):
            M = len(self.rim_ring)
            rows, cols = [], []
            for off in range(-12, 13):
                rows.append(np.arange(M))
                cols.append(np.clip(self.rim_ring + off, 0, N - 1))
            W = sparse.csr_matrix((np.ones(M * 25), (np.concatenate(rows), np.concatenate(cols))), shape=(M, N))
            Wm = (W @ Sup)
            Wm.data[:] = 1.0
            R2 = sparse.csr_matrix((np.ones(2 * M), (np.arange(2 * M), np.repeat(np.arange(M), 2))), shape=(2 * M, M))
            blocks.append((R2 @ Wm.tocsr()).tocsr())
        if a.redge > 0 and a.w_redge > 0:
            M2 = 2 * N - 1
            Bhn = (abs(sparse.csr_matrix(bs.Bh)) > 0).astype(float)
            Sh3 = sparse.diags([1, 1, 1], [-1, 0, 1], (M2, M2))
            Bhd = (abs(Sh3 @ Bhn) > 0).astype(float)
            ones3_ = sparse.csr_matrix(np.ones((1, 3)))
            Rr = sparse.hstack([sparse.kron(Bhd, ones3_, format="csr")] * 2 + [Bhd], format="csr")
            blocks.append(sparse.vstack([Rr, Rr], format="csr"))
        if a.edge_fair > 0:
            M2 = 2 * N - 1
            Bhn = (abs(sparse.csr_matrix(bs.Bh)) > 0).astype(float)
            Sh4 = sparse.diags([1, 1, 1, 1], [0, 1, 2, 3], (M2, M2))
            Bf = (abs(Sh4 @ Bhn) > 0).astype(float)[:M2 - 3]
            ones3_ = sparse.csr_matrix(np.ones((1, 3)))
            Rf = sparse.hstack([sparse.kron(Bf, ones3_, format="csr")] * 2 + [Bf], format="csr")
            blocks.append(sparse.vstack([Rf, Rf], format="csr"))
        if a.flip_guard > 0:
            M2 = 2 * N - 1
            Bhn = (abs(sparse.csr_matrix(bs.Bh)) > 0).astype(float)
            B1hn = (abs(sparse.csr_matrix(bs.B1h)) > 0).astype(float)
            Sh3 = sparse.diags([1, 1, 1], [-1, 0, 1], (M2, M2))
            Bg = (abs(Sh3 @ (Bhn + B1hn)) > 0).astype(float)[:-1]
            ones3_ = sparse.csr_matrix(np.ones((1, 3)))
            Rg = sparse.hstack([sparse.kron(Bg, ones3_, format="csr")] * 2 + [sparse.csr_matrix((Bg.shape[0], K))], format="csr")
            blocks.append(sparse.vstack([Rg, Rg], format="csr"))
        if a.fold_axis:
            Bn_ = (abs(sparse.csr_matrix(bs.B)) > 0).astype(float)
            ones3_ = sparse.csr_matrix(np.ones((1, 3)))
            blocks.append(sparse.hstack([sparse.csr_matrix((N, 3 * K)), sparse.kron(Bn_, ones3_, format="csr"), sparse.csr_matrix((N, K))], format="csr"))
        if a.flat > 0:
            B1n_ = (abs(sparse.csr_matrix(bs.B1)) > 0).astype(float)
            ones3_ = sparse.csr_matrix(np.ones((1, 3)))
            blocks.append(sparse.hstack([sparse.kron(B1n_, ones3_, format="csr"), sparse.csr_matrix((N, 3 * K)), sparse.csr_matrix((N, K))], format="csr"))
        self.jac_sparsity = sparse.vstack(blocks, format="csr")

    def _sparsity(self):
        bs = self.bs
        N, K = self.N, self.K
        nz = lambda M: (abs(sparse.csr_matrix(M)) > 0).astype(float)
        Bn = nz(bs.B)
        B1n = nz(bs.B1)
        B3n = nz(bs.B3)
        B2n = nz(bs.B2)
        Sh = sparse.diags([1, 1, 1], [-1, 0, 1], (N, N))
        Bd = nz(Sh @ Bn)  # +-1 sample dilation (finite differences)
        Bd1 = nz(Sh @ B1n)
        Sh7 = sparse.diags([1] * 7, list(range(-3, 4)), (N, N))
        B7 = nz(Sh7 @ Bn)
        B7h = nz(Sh7 @ Bn)
        ones3 = sparse.csr_matrix(np.ones((1, 3)))
        k3 = lambda M: sparse.kron(M, ones3, format="csr")  # N x 3K
        zero = lambda cols: sparse.csr_matrix((N, cols))
        Z3, ZH = zero(3 * K), zero(K)

        def row(Cm, Gm, Hm):
            return sparse.hstack([Cm, Gm, Hm], format="csr")

        spec = dict(
            edge=(4, row(k3(Bn), k3(Bn), Bn)),
            smooth=(3, row(Z3, k3(Bd), ZH)),
            jerk=(3, row(k3(B3n), Z3, ZH)),
            perp=(1, row(k3(B1n), k3(Bn), ZH)),
            dev=(1, row(k3(Bd1), k3(Bd), ZH)),
            depth=(1, row(k3(Bn), Z3, ZH)),
            hsm=(1, row(Z3, Z3, Bd)),
            wpr=(1, row(Z3, Z3, Bn)),
            speed=(1, row(k3(B1n), Z3, ZH)),
            hmin=(1, row(Z3, Z3, Bn)),
            hmax=(1, row(Z3, Z3, Bn)),
            face=(1, row(Z3, k3(Bn), ZH)),
            rmin=(1, row(k3(nz(B1n + B2n)), Z3, ZH)),
            scrw=(1, row(k3(Bn), k3(Bn), Bn)),
            ins=(5, row(k3(Bn), k3(Bn), Bn)),
            wf=(1, row(k3(B7), k3(B7), B7h)),
            fcr=(1, row(k3(nz(B1n + Bn)), k3(Bn), ZH)),
            bnd=(1, row(k3(nz(B1n + B2n)), Z3, ZH)),
            twi=(1, row(k3(B1n), k3(nz(B1n + Bn)), ZH)),
            dbn=(1, row(k3(nz(Sh @ nz(B1n + B2n))), Z3, ZH)),
            dtw=(1, row(k3(nz(Sh @ B1n)), k3(nz(Sh @ nz(B1n + Bn))), ZH)),
            rmf=(1, row(k3(nz(B1n + B2n)), Z3, ZH)),
            crl=(3, row(k3(B1n), k3(nz(B1n + Bn)), ZH)),
            lgb=(1, row(k3(nz(B1n + B2n)), Z3, ZH)),
            cvx=(1, row(k3(nz(Bn + B1n + B2n)), k3(Bn), ZH)),
        )
        tot = sum(spec[k][0] for k in ORDER)
        # assemble explicit coo with the per-sample row layout
        data_r, data_c = [], []
        off = 0
        for k in ORDER:
            m, S = spec[k]
            S = S.tocoo()
            for j in range(m):
                data_r.append(S.row * tot + off + j)
                data_c.append(S.col)
            off += m
        r = np.concatenate(data_r)
        c = np.concatenate(data_c)
        return sparse.csr_matrix((np.ones(len(r)), (r, c)), shape=(N * tot, 7 * K))


ORDER = ["edge", "smooth", "jerk", "perp", "dev", "depth", "hsm", "wpr", "speed", "hmin", "hmax", "face", "rmin", "scrw", "wf", "ins", "fcr", "bnd", "twi", "dbn", "dtw", "rmf", "crl", "lgb", "cvx"]


def hide_targets(tgtL, tgtR, a, b, ha, hb, nblend=8):
    """Replace the edge targets of rings a..b by a synthetic hidden path (quadratic Bezier through the host strand)."""
    ctr = (tgtL + tgtR) / 2
    P0, P2 = ctr[a], ctr[b]
    mid = (P0 + P2) / 2
    host = ctr[ha:hb + 1]
    P1 = host[np.argmin(np.linalg.norm(host - mid, axis=1))]
    n = b - a + 1
    s = np.linspace(0, 1, n)[:, None]
    m = (1 - s) ** 2 * P0 + 2 * (1 - s) * s * P1 + s ** 2 * P2
    dm = 2 * (1 - s) * (P1 - P0) + 2 * s * (P2 - P1)
    nh = np.stack([-dm[:, 1], dm[:, 0]], 1)
    nh /= np.maximum(np.linalg.norm(nh, axis=1, keepdims=True), 1e-9)
    wa = np.linalg.norm(tgtR[a] - tgtL[a]) / 2
    wb = np.linalg.norm(tgtR[b] - tgtL[b]) / 2
    ws = (wa + (wb - wa) * s)
    sign_a = 1.0 if np.dot(tgtR[a] - tgtL[a], nh[0]) >= 0 else -1.0
    sign_b = 1.0 if np.dot(tgtR[b] - tgtL[b], nh[-1]) >= 0 else -1.0
    newR = m + sign_a * ws * nh
    newL = m - sign_a * ws * nh
    al = np.ones(n)
    k = np.arange(n)
    ramp = lambda x: x * x * (3 - 2 * x)
    al = np.minimum(ramp(np.clip(k / nblend, 0, 1)), ramp(np.clip((n - 1 - k) / nblend, 0, 1)))[:, None]
    oldL, oldR = tgtL.copy(), tgtR.copy()
    tgtL, tgtR = tgtL.copy(), tgtR.copy()
    tgtL[a:b + 1] = (1 - al) * oldL[a:b + 1] + al * newL
    tgtR[a:b + 1] = (1 - al) * oldR[a:b + 1] + al * newR
    return tgtL, tgtR, oldL, oldR, dict(P0=P0, P1=P1, P2=P2, sign_a=sign_a, sign_b=sign_b)


def hide_auto(tgtL, tgtR, l0, l1, start, nblend=8, nout=10, hw_frac=0.35, sig=4.0):
    """Hidden path for the wrap curl INSIDE the left leg's screen footprint (rings l0..l1 targets)."""
    from PIL import Image, ImageDraw
    N = len(tgtL)
    ctr = (tgtL + tgtR) / 2
    poly = np.vstack([tgtL[l0:l1 + 1], tgtR[l0:l1 + 1][::-1]])
    W_, H_ = 852, 1846
    mk = Image.new("L", (W_, H_), 0)
    ImageDraw.Draw(mk).polygon([tuple(q) for q in (poly * SCUT)], fill=1)
    mk = np.asarray(mk, bool)
    def inside(P):
        q = np.round(P * SCUT).astype(int)
        ok = (q[:, 0] >= 0) & (q[:, 0] < W_) & (q[:, 1] >= 0) & (q[:, 1] < H_)
        out = np.zeros(len(P), bool)
        out[ok] = mk[q[ok, 1], q[ok, 0]]
        return out
    ins = inside(ctr)
    leg = ctr[l0:l1 + 1]
    lhw = np.linalg.norm(tgtR[l0:l1 + 1] - tgtL[l0:l1 + 1], axis=1) / 2
    order_ = np.argsort(leg[:, 1])
    xleg = lambda y: np.interp(y, leg[order_, 1], leg[order_, 0])
    a = next(k for k in range(start, N) if ins[k])
    b = None
    for k in range(a + 1, N - nout):
        if not ins[k:k + nout].any() and ctr[k, 0] > xleg(ctr[k, 1]):
            b = k - 0  # the first ring after which the centres stay outside, on the leg's right side
            break
    if b is None:
        raise SystemExit("hide_auto: no exit ring found")
    # the "first ring after which centres stay outside" = last inside ring + 1; take b as that ring
    b = max(a + 2 * nblend + 2, b)
    P0, P2 = ctr[a], ctr[b]
    q0 = int(np.argmin(np.linalg.norm(leg - P0, axis=1)))
    q1 = int(np.argmin(np.linalg.norm(leg - P2, axis=1)))
    walk = list(range(q0, q1 + 1)) if q1 >= q0 else list(range(q0, q1 - 1, -1))
    poly_ = np.vstack([P0[None], leg[walk], P2[None]])
    hwp = np.r_[lhw[walk[0]], lhw[walk], lhw[walk[-1]]]
    seg = np.linalg.norm(np.diff(poly_, axis=0), axis=1)
    cum = np.r_[0, np.cumsum(seg)]
    n = b - a + 1
    tt = np.linspace(0, cum[-1], n)
    m = np.stack([np.interp(tt, cum, poly_[:, 0]), np.interp(tt, cum, poly_[:, 1])], 1)
    hl = np.interp(tt, cum, hwp)
    # gaussian smoothing, endpoints fixed
    kk = int(4 * sig)
    gk = np.exp(-0.5 * (np.arange(-kk, kk + 1) / sig) ** 2); gk /= gk.sum()
    pad = np.pad(m, [(kk, kk), (0, 0)], mode="edge")
    ms = np.stack([np.convolve(pad[:, c], gk, mode="valid") for c in range(2)], 1)
    ms += (m[0] - ms[0]) * np.linspace(1, 0, n)[:, None] + (m[-1] - ms[-1]) * np.linspace(0, 1, n)[:, None]
    dm = np.gradient(ms, axis=0)
    nh = np.stack([-dm[:, 1], dm[:, 0]], 1)
    nh /= np.maximum(np.linalg.norm(nh, axis=1, keepdims=True), 1e-9)
    wa = np.linalg.norm(tgtR[a] - tgtL[a]) / 2
    wb = np.linalg.norm(tgtR[b] - tgtL[b]) / 2
    k = np.arange(n)
    ramp = lambda x: x * x * (3 - 2 * x)
    ra = ramp(np.clip(k / nblend, 0, 1))   # 0 at ring a -> 1 inside
    rb = ramp(np.clip((n - 1 - k) / nblend, 0, 1))
    inner = hw_frac * hl
    w = inner.copy()
    w = np.where(k < nblend, (1 - ra) * wa + ra * inner, w)
    w = np.where(k > n - 1 - nblend, (1 - rb) * wb + rb * w, w)
    sign_a = 1.0 if np.dot(tgtR[a] - tgtL[a], nh[0]) >= 0 else -1.0
    sign_b = 1.0 if np.dot(tgtR[b] - tgtL[b], nh[-1]) >= 0 else -1.0
    sg = sign_a + (sign_b - sign_a) * ramp(np.clip((k / (n - 1) - 0.4) / 0.2, 0, 1))  # twist while hidden (L stays L)
    newR = ms + (sg * w)[:, None] * nh
    newL = ms - (sg * w)[:, None] * nh
    tL, tR = tgtL.copy(), tgtR.copy()
    tL[a:b + 1], tR[a:b + 1] = newL, newR
    return tL, tR, a, b, dict(poly=poly, q0=q0, q1=q1, sign_a=sign_a, sign_b=sign_b, leg=(l0, l1))


def hide_overlay(path, oldL, oldR, newL, newR, a, b, ha, hb, poly=None):
    from PIL import Image, ImageDraw
    cut = Image.open(os.path.join(ROOT, "docs", "ribbon", "ref", "ak-signature-cutout.webp")).convert("RGBA")
    bg = Image.new("RGBA", cut.size, (17, 17, 17, 255))
    bg.alpha_composite(cut)
    im = bg.convert("RGB")
    d = ImageDraw.Draw(im)
    lo, hi = max(a - 20, 0), min(b + 20, len(oldL) - 1)
    if poly is not None:
        d.line([tuple(q) for q in (np.vstack([poly, poly[:1]]) * SCUT)], fill=(255, 255, 0), width=2)
    cutpx = lambda P: [tuple(p) for p in (P * SCUT)]
    for P, col in ((oldL, (255, 60, 60)), (oldR, (255, 60, 60)), (newL, (60, 255, 255)), (newR, (60, 255, 255))):
        d.line(cutpx(P[lo:hi + 1]), fill=col, width=2)
    allp = np.vstack([oldL[lo:hi + 1], oldR[lo:hi + 1], newL[lo:hi + 1], newR[lo:hi + 1]]) * SCUT
    x0, y0 = allp.min(0) - 60
    x1, y1 = allp.max(0) + 60
    im.crop((int(max(x0, 0)), int(max(y0, 0)), int(min(x1, im.width)), int(min(y1, im.height)))).resize((int((min(x1, im.width) - max(x0, 0)) * 2), int((min(y1, im.height) - max(y0, 0)) * 2)), Image.LANCZOS).save(path)


def seg_stats(e, lo, hi):
    s = e[lo:hi + 1]
    return "mean %6.2f  p95 %6.2f  max %6.2f" % (s.mean(), np.percentile(s, 95), s.max())


def metrics(x, prob, tgtL, tgtR, tag, elapsed, a, info=""):
    bs = prob.bs
    N = bs.N
    c, b, h = prob.curves(x)
    Lw, Rw = c - h[:, None] * b, c + h[:, None] * b
    pL, pR = project(Lw), project(Rw)
    eL = np.linalg.norm(pL - Problem.near(pL, prob.SA_L, prob.SB_L), axis=1)
    eR = np.linalg.norm(pR - Problem.near(pR, prob.SA_R, prob.SB_R), axis=1)
    e = np.r_[eL, eR]
    ering = np.maximum(eL, eR)
    lines = ["%s  K=%d  %s" % (tag, bs.K, info), "args: " + json.dumps(vars(a), sort_keys=True), ""]
    lines.append("edge residual css px, point-to-polyline (L and R pooled): mean %.3f  p95 %.3f  max %.3f" % (e.mean(), np.percentile(e, 95), e.max()))
    C, G, H = prob.unpack(x)
    T = unit(bs.B1 @ C)
    bt = np.abs((b * T).sum(1))
    lines.append("")
    lines.append("%-12s %-44s %-22s %-13s %s" % ("window", "edge resid (L,R pooled)", "h min/med/max", "median |b.T|", "#|c'|<0.6 s0"))
    worst = None
    spd = np.linalg.norm(bs.B1 @ C, axis=1)
    slow = spd < 0.6 * prob.s0
    for lo, hi in WINDOWS:
        ew = np.r_[eL[lo:hi + 1], eR[lo:hi + 1]]
        st = "mean %6.2f  p95 %6.2f  max %6.2f" % (ew.mean(), np.percentile(ew, 95), ew.max())
        hw_ = h[lo:hi + 1]
        lines.append("[%4d,%4d]  %-44s %5.1f/%5.1f/%5.1f      %.3f         %d" % (lo, hi, st, hw_.min(), np.median(hw_), hw_.max(), np.median(bt[lo:hi + 1]), slow[lo:hi + 1].sum()))
        if worst is None or ew.mean() > worst[0]:
            worst = (ew.mean(), lo, hi)
    lines.append("worst window by mean: [%d,%d] %.2f px" % (worst[1], worst[2], worst[0]))
    # dense surface normal
    td, Bd, B1d = bs.dense(4 * N)
    cd = Bd @ C
    Td = unit(B1d @ C)
    bd = unit(Bd @ G)
    Nn = unit(np.cross(Td, bd))
    ang = np.degrees(np.arccos(np.clip((Nn[1:] * Nn[:-1]).sum(1), -1, 1)))
    ds = np.linalg.norm(np.diff(cd, axis=0), axis=1)
    lines.append("")
    lines.append("dense (4N=%d samples) surface normal N=TxB: angle change per sample  max %.3f deg  p99 %.3f deg" % (len(td), ang.max(), np.percentile(ang, 99)))
    lines.append("   angle per world px of centreline arclength: max %.4f deg/px  (p99 %.4f)" % ((ang / np.maximum(ds, 1e-6)).max(), np.percentile(ang / np.maximum(ds, 1e-6), 99)))
    top = np.argsort(-ang)[:5]
    btd = np.abs((bd * Td).sum(1))
    lines.append("   worst dense samples (t, deg, |b.T|): " + "; ".join("%.2f, %.1f, %.3f" % (td[i], ang[i], btd[i]) for i in top))
    n_gt = lambda thr: int(((ang > thr)).sum())
    lines.append("   dense steps > 3 deg: %d, > 6 deg: %d" % (n_gt(3), n_gt(6)))
    if len(Nn) > 2:
        dsr = 0.5 * (np.linalg.norm(cd[2:] - cd[1:-1], axis=1) + np.linalg.norm(cd[1:-1] - cd[:-2], axis=1))
        rip = np.linalg.norm(Nn[2:] - 2 * Nn[1:-1] + Nn[:-2], axis=1) / np.maximum(dsr, 1e-6) ** 2
        lines.append("ripple (|second difference of unit N| per world px^2, dense): max %.3e  p99 %.3e  median %.3e" % (rip.max(), np.percentile(rip, 99), np.median(rip)))
    out = np.ones(N, bool)
    for lo, hi in FOLDS:
        out[lo:hi + 1] = False
    lines.append("max |b.T| outside fold windows: %.3f   (inside: %.3f)" % (bt[out].max(), bt[~out].max()))
    pr = prob.build_pairs(x, True, True)
    P = prob.surface(x).reshape(-1, 3)
    dmin = np.linalg.norm(P[pr["c"][0]] - P[pr["c"][1]], axis=1)
    dz = P[pr["o"][0], 2] - P[pr["o"][1], 2]
    lines.append("GATE: min 3D distance between non-adjacent rings (|i-j|>60, surface samples): %s px; pairs < gap %.1f: %d" % (("%.2f" % dmin.min()) if len(dmin) else ">%.1f" % (a.gap + 8), a.gap, int((dmin < a.gap).sum())))
    lines.append("GATE: screen-overlap pairs (3 px) %d, order violations (z_front - z_back < 0): %d, (< gap): %d; unique ring pairs violating: %d" % (len(dz), int((dz < 0).sum()), int((dz < a.gap).sum()), len({(min(a_, b_), max(a_, b_)) for a_, b_ in zip(np.repeat(np.arange(prob.N), 5)[pr["o"][0][dz < 0]] // 5 * 5, np.repeat(np.arange(prob.N), 5)[pr["o"][1][dz < 0]] // 5 * 5)})))
    lines.append("end centreline offset from init: ring0 %.1f px, ring N-1 %.1f px" % (np.linalg.norm(prob.curves(x)[0][0] - prob.c0pin[0]), np.linalg.norm(prob.curves(x)[0][-1] - prob.c0pin[-1])))
    fld = inside_field(a.mask or None)
    dd = fld(project(c[:, None, :] + UB[None, :, None] * h[:, None, None] * b[:, None, :]))
    lines.append("outside-mockup distance (5 pts across band, css px): mean %.3f  max %.2f  frac>0.5px %.3f" % (dd.mean(), dd.max(), (dd > 0.5).mean()))
    O = outline_points(a.mask or None, a.outline_excl, incl=a.outline_incl)
    if prob.out_info is not None:
        lines.append("outline_fixed: kept %(kept)d of %(total)d (dropped: %(far)d farther than 12 px, %(ambiguous)d ambiguous, %(near_dropped)d near pinch sites; total counted after near-drop)" % prob.out_info)
        if getattr(prob, 'box_info', None) is not None:
            bi = prob.box_info
            lines.append("box centre assignment: kept %d of %d box points (far %d, ambiguous %d); candidate ring runs per box: %s" % (bi["kept"], bi["total"], bi["far"], bi["ambiguous"], "; ".join("B%d %s" % (k + 1, runs_of(cd)) for k, cd in enumerate(prob.box_cands))))
            vb, db = outline_fixed_res(pL, pR, prob.box_pts, prob.box_side, prob.box_ring, half=10)
            lines.append("box residual to ASSIGNED edge: mean %.3f  p95 %.3f  max %.2f" % (db.mean(), np.percentile(db, 95), db.max()))
        vf, df = outline_fixed_res(pL, pR, prob.outline_pts, prob.out_side, prob.out_ring)
        lines.append("outline residual to ASSIGNED edge (kept pts): mean %.3f  p95 %.3f  max %.2f" % (df.mean(), np.percentile(df, 95), df.max()))
    vec, dist_, _, ok = outline_match(pL, pR, O)
    lines.append("outline residual (css px, matched <=25 px: %d of %d pts): mean %.3f  p95 %.3f  max %.2f" % (ok.sum(), len(O), dist_[ok].mean(), np.percentile(dist_[ok], 95), dist_[ok].max()))
    if len(prob.rim_pts):
        vr, dr = outline_fixed_res(pL, pR, prob.rim_pts, prob.rim_side, prob.rim_ring, half=10)
        lines.append("rim lines: %d points, residual to ASSIGNED edge: mean %.3f  p95 %.3f  max %.2f" % (len(dr), dr.mean(), np.percentile(dr, 95), dr.max()))
        for k, (nm, rg_, _, _, _) in enumerate(prob.rim_entries):
            mk = prob.rim_eid == k
            lines.append("   %-6s rings %d:%d  n %3d  mean %.2f  p95 %.2f" % (nm, rg_[0], rg_[1], mk.sum(), dr[mk].mean(), np.percentile(dr[mk], 95)))
    lines.append("run time: %.1f s" % elapsed)
    return "\n".join(lines), e


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pose", default=os.path.join(BEST, "pose.json"))
    ap.add_argument("--roto", default=os.path.join(BEST, "roto.npz"))
    ap.add_argument("--out", required=True)
    ap.add_argument("--K", type=int, default=160)
    ap.add_argument("--init", default="perp", choices=["perp", "raw"])
    ap.add_argument("--no_opt", action="store_true")
    ap.add_argument("--sigma", type=float, default=2.0)
    ap.add_argument("--mu", type=float, default=40.0)
    ap.add_argument("--lam", type=float, default=2.0)
    ap.add_argument("--nu_fold", type=float, default=0.15)
    ap.add_argument("--delta", type=float, default=20.0)
    ap.add_argument("--eps", type=float, default=0.05)
    ap.add_argument("--lam_h", type=float, default=5.0)
    ap.add_argument("--omega", type=float, default=0.01)
    ap.add_argument("--max_nfev", type=int, default=300)
    ap.add_argument("--kappa", type=float, default=2.0)
    ap.add_argument("--hmin", type=float, default=22.0)
    ap.add_argument("--hmax", type=float, default=60.0)
    ap.add_argument("--w_hmin", type=float, default=10.0)
    ap.add_argument("--end_pin", type=float, default=0.0)
    ap.add_argument("--clear", type=float, default=0.0)
    ap.add_argument("--order", type=float, default=0.0)
    ap.add_argument("--gap", type=float, default=12.4)
    ap.add_argument("--outer", type=int, default=4)
    ap.add_argument("--hide", default="")
    ap.add_argument("--edge_w", default="", help="a:b:SIDE:w[,...] multiply the edge-fit weight of one edge (L or R)")
    ap.add_argument("--faceon", default="", help="a:b:w residual w*b_z (pull the ruling into the screen plane)")
    ap.add_argument("--bz", default="", help="a:b:t:w[,...] target |b_z| = t (ruling depth component; 0 face-on width, 1 pointing at the camera) over pose rings a..b with 4-ring smoothstep ramps: w*(sqrt(b_z^2+1e-6)-t); default off")
    ap.add_argument("--lit", default="", help="a:b:t:w[,...] the visible face's normal must tilt up (world +y) by >= t over pose rings a..b (4-ring ramps): w*max(0, t - n_vis_y); default off")
    ap.add_argument("--hide_auto", default="", help="l0:l1:start, e.g. 388:483:945 (hidden path inside the left leg footprint)")
    ap.add_argument("--rmin", type=float, default=0.0, help="curvature hinge: radius R (world px); residual w_rmin*R*max(0, kappa-1/R)")
    ap.add_argument("--w_rmin", type=float, default=0.0)
    ap.add_argument("--screenw", default="", help="a:b:target:w residual w*(|proj(R)-proj(L)|-target)/target for rings a..b (10-ring smoothstep ramps)")
    ap.add_argument("--inside", type=float, default=0.0, help="w: residual w*dist(mockup silhouette) at 5 points across the band (0 inside the mockup)")
    ap.add_argument("--mask", default="", help="cutout image whose alpha is the mockup silhouette (default docs/ribbon/ref/ak-signature-cutout.webp)")
    ap.add_argument("--keep", type=float, default=0.0, help="w: pin the centreline AND the ruling to the starting pose at every ring outside --keep_free windows; 10-ring smoothstep release at the window borders; default off")
    ap.add_argument("--keep_free", default="", help="a:b[,...] pose-ring windows released from --keep")
    ap.add_argument("--pin_range", default="", help="a:b:step:w extra centreline pins every `step` rings over a..b")
    ap.add_argument("--outline", type=float, default=0.0, help="w: pull the band edges onto the mockup silhouette boundary (2D vector to nearest edge point within 25 css px)")
    ap.add_argument("--outline_excl", default="", help="x0:y0:x1:y1;... css exclusion boxes for the outline points (default: %s; y>820 always dropped)" % OUT_EXCL)
    ap.add_argument("--outline_incl", default="", help="x0:y0:x1:y1;... css boxes: when given only outline points inside them are used (after the exclusions)")
    ap.add_argument("--outline_fixed", action="store_true", help="assign each outline point once (side, ring) from --outline_pose (default: the init pose); drop ambiguous / far points")
    ap.add_argument("--outline_pose", default="", help="pose.json used for the fixed assignment")
    ap.add_argument("--outline_loss", default="linear", choices=["linear", "soft"], help="soft: soft-L1 shape (f=2 css px) on the outline residuals only")
    ap.add_argument("--wfloor", type=float, default=0.0, help="W: hinge w_wfloor*max(0, W - visible width)/W at every ring (visible width: see --wfloor_mode)")
    ap.add_argument("--w_wfloor", type=float, default=0.0)
    ap.add_argument("--wfloor_mode", default="perp", choices=["perp", "ring"], help="perp: |(pR-pL) x t_screen| (band width perpendicular to the screen centreline tangent); ring: |pR-pL|")
    ap.add_argument("--wfloor_ranges", default="", help="a:b:W,... per-range floor override")
    ap.add_argument("--wfloor_except", default="", help="a:b,... ranges with no floor (edge-on allowed)")
    ap.add_argument("--outline_drop_near", default="", help="a:b,... ring ranges (of --outline_pose): drop outline points within 10 css px of their edges")
    ap.add_argument("--redge", type=float, default=0.0, help="R: bound the curvature of both edge curves L(t), R(t) (world px): residual w_redge*R*max(0, kappa-1/R)")
    ap.add_argument("--w_redge", type=float, default=0.0)
    ap.add_argument("--outline_assign", default="nearest", choices=["nearest", "centre"], help="centre: assign outline points inside --outline_boxes to the nearest CENTRELINE ring (<=70 px)")
    ap.add_argument("--outline_boxes", default="", help="x0:y0:x1:y1;... css boxes for --outline_assign centre")
    ap.add_argument("--box_rings", default="", help="per box (';' separated) candidate ring ranges a:b,c:d (empty = rings whose init centreline is in the box +25 px)")
    ap.add_argument("--box_pose", default="", help="pose.json for the centre assignment (default --outline_pose)")
    ap.add_argument("--w_box", type=float, default=2.0, help="outline weight inside the boxes")
    ap.add_argument("--box_trace", type=float, default=0.15, help="trace edge weight multiplier for rings inside the boxes")
    ap.add_argument("--trace_w", type=float, default=1.0, help="scale of every trace edge-fit weight")
    ap.add_argument("--rimlines", default="", help="json [{\"id\": \"T9-01\", \"rings\": [a, b]}, ...]: picked interior rim polylines (docs/ribbon/turns/rims/candidates.json), each point assigned once to (side, ring) from --rim_pose")
    ap.add_argument("--w_rim", type=float, default=0.0, help="weight of the rim-line residual (point -> assigned edge polyline, rings i+-10)")
    ap.add_argument("--rim_side_mode", default="centre", choices=["centre", "opposite"], help="centre: side from the sign rule vs the init centreline; opposite: forced from the box silhouette points' side (per rim entry rel opposite/same)")
    ap.add_argument("--rim_pose", default="", help="pose.json used for the rim assignment (default --box_pose, --outline_pose, --pose)")
    ap.add_argument("--zprior", default="", help="pose.json whose centre z the depth prior points at")
    ap.add_argument("--faces", default="", help="json {segments:[{rings:[a,b],face:A|B}], flip_zones:[[a,b],...]}: visible-face rule (pose rings), default off")
    ap.add_argument("--w_face", type=float, default=0.0, help="weight of the visible-face hinge w*max(0, m - e*s), s = sign_A*(N . unit(cam-c))")
    ap.add_argument("--face_margin", type=float, default=0.3)
    ap.add_argument("--bend", type=float, default=0.0, help="w: elastic bending w*sqrt(ds)*kappa (kappa=|c'xc''|/|c'|^3), default off")
    ap.add_argument("--twist", type=float, default=0.0, help="w: w*sqrt(ds)*tau_r, tau_r=(db/ds).(TxB)")
    ap.add_argument("--dbend", type=float, default=0.0, help="w: w*sqrt(ds)*dkappa/ds")
    ap.add_argument("--dtwist", type=float, default=0.0, help="w: w*sqrt(ds)*dtau_r/ds")
    ap.add_argument("--fold", default="", help="a:b:R:w[,...] true-fold zones (pose rings): inside, --rmin/--redge/ruling-perp/--twist/--dtwist are off, curvature radius >= R (w), constant ruling (w*|db/ds|); 8-ring smoothstep ramps")
    ap.add_argument("--fold2", default="", help="c:R:w[,...] fold at crease pose ring c: radius TARGET R over c+-n (n=round(pi R/(2 ds))), constant ruling + rmin/redge/perp/twist off over c+-(n+6), leg bending penalty (--fold_legs) over n+6..n+20; 4-ring smoothstep ramps")
    ap.add_argument("--curl", default="", help="a:b:R:w[,...] curl (cylinder-band) zones over pose rings a..b (4-ring smoothstep ramps inside the window): constant ruling w*|db/ds|, ruling perpendicular to the centreline w*(b.T), curvature radius >= R w*R*max(0,kappa-1/R); the global --rmin hinge is faded out inside; default off")
    ap.add_argument("--fold_legs", type=float, default=0.0, help="w: w*R*kappa on the legs leaving a --fold2 roll")
    ap.add_argument("--fold_convex", default="", help="w or c:w,...(per fold crease c): over each --fold2 roll the visible surface must be the OUTSIDE of the roll: w*max(0, 0.3 + s), s = R * kvec.n_vis (kvec = curvature vector of the centreline, n_vis = visible-face normal); default off")
    ap.add_argument("--fold_legs_len", default="20", help="L or c:L,...: outer end (rings beyond the roll end n) of the --fold2 leg ramp (default 20; the ramp starts at n+6)")
    ap.add_argument("--energy_ranges", default="", help="a:b:f[,...] multiply the --dbend/--dtwist weights by f over pose rings a..b (3-ring smoothstep edges); default off")
    ap.add_argument("--edge_fair", type=float, default=0.0, help="w: both edge curves E = c -+ h b (half-ring samples): w*sqrt(ds)*dkappa_E/ds, everywhere incl. fold zones (fair edges, no wobble); default off")
    ap.add_argument("--fold_axis", default="", help="c:w[,...] physical fold line: inside each --fold2 roll c+-(n+6) (smoothstep edge), w*(1-(b.l)^2) with l = unit(T_in + T_out), T_in/T_out = mean centreline tangents over [c-n-20,c-n-5] / [c+n+5,c+n+20], recomputed each outer round; default off")
    ap.add_argument("--flat", type=float, default=0.0, help="w: residual w*T_z (depth component of the unit centreline tangent) at every ring (or --flat_ranges); default off")
    ap.add_argument("--flat_ranges", default="", help="a:b[,...] pose rings the --flat term applies to (default all)")
    ap.add_argument("--flip_guard", type=float, default=0.0, help="w: at consecutive half-ring samples w*max(0, 0.9 - b_i.b_(i+1)) and w*max(0, 0.9 - N_i.N_(i+1)): forbids instantaneous ruling / normal flips; default off")
    ap.add_argument("--fold_eq", action="store_true", help="with --fold: curvature TARGETS 1/R inside the zone (two-sided residual w*R*|kappa-1/R|) instead of only bounding the radius from below")
    ap.add_argument("--clear_range", default="", help="a:b-c:d[,...] restrict the --clear pairs to rings a..b x c..d (default: all non-adjacent pairs)")
    a = ap.parse_args()
    t0 = time.time()
    d = json.load(open(a.pose))
    var = d["variants"]["phone"]
    rg = var["ruled"]
    L = pose_to_world([r["L"] for r in rg])
    R = pose_to_world([r["R"] for r in rg])
    N = len(L)
    roto = np.load(a.roto)
    tgtL = roto["L2"] / SCUT
    tgtR = roto["R2"] / SCUT
    hide_info = None
    tgtL0, tgtR0 = tgtL, tgtR
    if a.hide and not a.hide_auto:
        ha_, hb_, hha, hhb = [int(v) for v in a.hide.split(":")]
        tgtL, tgtR, oL, oR, hide_info = hide_targets(tgtL, tgtR, ha_, hb_, hha, hhb)
        os.makedirs(a.out, exist_ok=True)
        hide_overlay(os.path.join(a.out, "hide_targets.png"), oL, oR, tgtL, tgtR, ha_, hb_, hha, hhb)
        print("hide:", {k: (np.round(v, 2).tolist() if hasattr(v, "tolist") else v) for k, v in hide_info.items()}, flush=True)
    if a.hide_auto:
        l0_, l1_, st_ = [int(v) for v in a.hide_auto.split(":")]
        oL, oR = tgtL.copy(), tgtR.copy()
        tgtL, tgtR, ha_, hb_, hide_info = hide_auto(tgtL, tgtR, l0_, l1_, st_)
        os.makedirs(a.out, exist_ok=True)
        hide_overlay(os.path.join(a.out, "hide_targets.png"), oL, oR, tgtL, tgtR, ha_, hb_, l0_, l1_, hide_info["poly"])
        print("hide_auto: a=%d b=%d leg q0=%d q1=%d signs %s %s" % (ha_, hb_, hide_info["q0"], hide_info["q1"], hide_info["sign_a"], hide_info["sign_b"]), flush=True)
        a.hide = "auto:%d:%d" % (ha_, hb_)
    bs = Basis(N, a.K)
    C, G, H = make_init(L, R, bs, a.init)
    prob = Problem(a, L, R, tgtL, tgtR, bs, C)
    prob.set_keep_ruling(G)
    if getattr(prob, "box_info", None) is not None:
        os.makedirs(a.out, exist_ok=True)
        draw_assign(prob, os.path.join(a.out, "assign_boxes.png"))
    if a.hide:
        prob.we[ha_:hb_ + 1] = 0.5 / a.sigma
    if a.zprior:
        zp = json.load(open(a.zprior))["variants"]["phone"]["ruled"]
        zL = pose_to_world([r["L"] for r in zp]); zR = pose_to_world([r["R"] for r in zp])
        prob.c0z = ((zL + zR) / 2)[:, 2]
    x0 = prob.pack(C, G, H)
    prob.calib_face(x0)
    prob.set_x0(x0)
    prob.update_axis(x0, "init")
    x = x0
    info = "init=%s" % a.init
    if not a.no_opt:
        r0 = prob.fun(x0)
        print("init cost %.3f, residuals %d, params %d" % (0.5 * r0 @ r0, len(r0), len(x0)), flush=True)
        rounds = a.outer if (a.clear > 0 or a.order > 0 or a.outline > 0) else 1
        x = x0
        nf = 0
        for rd in range(rounds):
            if rounds > 1 or a.end_pin > 0 or a.pin_range or a.keep > 0 or a.outline > 0 or a.redge > 0:
                prob.update_outline(x)
                pr = prob.build_pairs(x, a.clear > 0, a.order > 0) if rounds > 1 else {}
                prob.set_pairs(pr.get("c", prob.pairs_c), pr.get("o", prob.pairs_o))
                print("round %d: clearance pairs %d, order pairs %d, residuals %d" % (rd, len(prob.pairs_c[0]), len(prob.pairs_o[0]), prob.jac_sparsity.shape[0]), flush=True)
            prob.update_axis(x, "round %d" % rd)
            res = least_squares(prob.fun, x, jac_sparsity=prob.jac_sparsity, method="trf", x_scale="jac", max_nfev=a.max_nfev, verbose=2)
            x = res.x
            nf += res.nfev
            info += "  [round %d nfev=%d status=%d (%s) cost %.3f]" % (rd, res.nfev, res.status, res.message.strip("`").split(" ")[0], res.cost)
    prob.update_axis(x, "final")
    elapsed = time.time() - t0
    os.makedirs(a.out, exist_ok=True)
    rep, _ = metrics(x, prob, tgtL, tgtR, os.path.basename(os.path.normpath(a.out)), elapsed, a, info)
    # block breakdown
    bl = prob.blocks(x)
    rep += "\nresidual block norms (sum of squares): " + ", ".join("%s %.2f" % (k, (bl[k] ** 2).sum()) for k in ORDER)
    open(os.path.join(a.out, "report.txt"), "w").write(rep + "\n")
    print(rep)
    Lw, Rw = prob.edges(x)
    Lp, Rp = world_to_pose(Lw), world_to_pose(Rw)
    notes = "ak-fit: smooth B-spline ribbon fitted to r40 (scripts/curve/fit3d.py) " + " ".join("--%s %s" % (k, v) for k, v in sorted(vars(a).items()) if k not in ("pose", "roto", "out"))
    pose = dict(
        version=d.get("version", 1), name="ak-fit", anchor=d["anchor"], notes=notes, orientation=d["orientation"],
        variants=dict(phone=dict(points=[], faceSign=var["faceSign"], ruled=[
            dict(L=[round(float(v), 6) for v in Lp[i]], R=[round(float(v), 6) for v in Rp[i]]) for i in range(N)
        ])),
    )
    json.dump(pose, open(os.path.join(a.out, "pose.json"), "w"))


if __name__ == "__main__":
    main()
