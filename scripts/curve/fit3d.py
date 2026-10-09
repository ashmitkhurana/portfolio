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
        self.we = we / a.sigma
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
        self.use_pin = a.end_pin > 0 or bool(a.pin_range)
        self.field = inside_field(a.mask or None) if a.inside > 0 else None
        self.c0pin = bs.B[self.ts_pin] @ C0
        self.pairs_c = (np.zeros(0, int), np.zeros(0, int))
        self.pairs_o = (np.zeros(0, int), np.zeros(0, int))
        self.n_extra = 0

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
            perp=(self.nu * (b * T).sum(1))[:, None],
            dev=a.delta * np.einsum("ij,ij->i", np.cross(T, b), bp)[:, None],
            depth=(a.eps * (c[:, 2] - self.c0z))[:, None],
            hsm=(a.lam_h * h2)[:, None],
            wpr=(a.omega * (h - 25.5))[:, None],
            speed=speed[:, None],
            hmin=(a.w_hmin * np.maximum(0.0, a.hmin - h))[:, None],
            hmax=(a.w_hmin * np.maximum(0.0, h - a.hmax))[:, None],
            face=(self.fw * b[:, 2])[:, None],
            rmin=(a.w_rmin * a.rmin * np.maximum(0.0, kap - 1.0 / a.rmin))[:, None] if a.rmin > 0 else np.zeros((self.N, 1)),
            scrw=(self.sw * (wscr - self.swt) / self.swt)[:, None],
            ins=(a.inside * self.field(project(c[:, None, :] + UB[None, :, None] * h[:, None, None] * b[:, None, :]))) if self.field is not None else np.zeros((self.N, 5)),
        )

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
        if (a.clear > 0 and len(self.pairs_c[0])) or (a.order > 0 and len(self.pairs_o[0])):
            P = self.surface(x).reshape(-1, 3)
            if a.clear > 0 and len(self.pairs_c[0]):
                d = np.linalg.norm(P[self.pairs_c[0]] - P[self.pairs_c[1]], axis=1)
                out.append(a.clear * np.maximum(0.0, a.gap - d))
            if a.order > 0 and len(self.pairs_o[0]):
                dz = P[self.pairs_o[0], 2] - P[self.pairs_o[1], 2]
                out.append(a.order * np.maximum(0.0, a.gap - dz))
        return np.concatenate(out)

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
        for use, pr in ((a.clear > 0, c_pairs), (a.order > 0, o_pairs)):
            if use and len(pr[0]):
                ring = np.repeat(np.arange(N), 5)
                n = len(pr[0])
                sel = lambda idx: sparse.csr_matrix((np.ones(n), (np.arange(n), ring[idx])), shape=(n, N))
                M = sel(pr[0]) @ Sup + sel(pr[1]) @ Sup
                M.data[:] = 1.0
                blocks.append(M.tocsr())
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


ORDER = ["edge", "smooth", "jerk", "perp", "dev", "depth", "hsm", "wpr", "speed", "hmin", "hmax", "face", "rmin", "scrw", "ins"]


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
    ap.add_argument("--hide_auto", default="", help="l0:l1:start, e.g. 388:483:945 (hidden path inside the left leg footprint)")
    ap.add_argument("--rmin", type=float, default=0.0, help="curvature hinge: radius R (world px); residual w_rmin*R*max(0, kappa-1/R)")
    ap.add_argument("--w_rmin", type=float, default=0.0)
    ap.add_argument("--screenw", default="", help="a:b:target:w residual w*(|proj(R)-proj(L)|-target)/target for rings a..b (10-ring smoothstep ramps)")
    ap.add_argument("--inside", type=float, default=0.0, help="w: residual w*dist(mockup silhouette) at 5 points across the band (0 inside the mockup)")
    ap.add_argument("--mask", default="", help="cutout image whose alpha is the mockup silhouette (default docs/ribbon/ref/ak-signature-cutout.webp)")
    ap.add_argument("--pin_range", default="", help="a:b:step:w extra centreline pins every `step` rings over a..b")
    ap.add_argument("--zprior", default="", help="pose.json whose centre z the depth prior points at")
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
    if a.hide:
        prob.we[ha_:hb_ + 1] = 0.5 / a.sigma
    if a.zprior:
        zp = json.load(open(a.zprior))["variants"]["phone"]["ruled"]
        zL = pose_to_world([r["L"] for r in zp]); zR = pose_to_world([r["R"] for r in zp])
        prob.c0z = ((zL + zR) / 2)[:, 2]
    x0 = prob.pack(C, G, H)
    prob.set_x0(x0)
    x = x0
    info = "init=%s" % a.init
    if not a.no_opt:
        r0 = prob.fun(x0)
        print("init cost %.3f, residuals %d, params %d" % (0.5 * r0 @ r0, len(r0), len(x0)), flush=True)
        rounds = a.outer if (a.clear > 0 or a.order > 0) else 1
        x = x0
        nf = 0
        for rd in range(rounds):
            if rounds > 1 or a.end_pin > 0 or a.pin_range:
                pr = prob.build_pairs(x, a.clear > 0, a.order > 0) if rounds > 1 else {}
                prob.set_pairs(pr.get("c", prob.pairs_c), pr.get("o", prob.pairs_o))
                print("round %d: clearance pairs %d, order pairs %d, residuals %d" % (rd, len(prob.pairs_c[0]), len(prob.pairs_o[0]), prob.jac_sparsity.shape[0]), flush=True)
            res = least_squares(prob.fun, x, jac_sparsity=prob.jac_sparsity, method="trf", x_scale="jac", max_nfev=a.max_nfev, verbose=2)
            x = res.x
            nf += res.nfev
            info += "  [round %d nfev=%d status=%d (%s) cost %.3f]" % (rd, res.nfev, res.status, res.message.strip("`").split(" ")[0], res.cost)
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
