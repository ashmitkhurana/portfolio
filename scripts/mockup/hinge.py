"""Exact hinge-chain ribbon solver.

Flat strip: ring i has flat endpoints L_i^f = (a_i, 0, 0), R_i^f = (b_i, W, 0). Quad k = [ring k, ring k+1]
(k = 0..N-2) carries a rigid transform T_k (flat -> 3D). Root quad m = (N-1)//2 has T_m = (Rot(omega), t).
Hinge i (i = 1..N-2) joins quad i-1 and quad i about ring i's ruling, signed angle theta_i.
  k > m : T_k = T_{k-1} o Rot(axis_k, theta_k)
  k < m : T_k = T_{k+1} o Rot(axis_{k+1}, -theta_{k+1})
Isometry and planarity hold by construction.

x = [omega(3), t(3), theta_1..theta_{N-2}, a_0..a_{N-1} except a_m, b_0..b_{N-1}]
"""
import time

import numpy as np
from scipy.linalg import cho_factor, cho_solve
from scipy.spatial.transform import Rotation

import solve3d as S
import solve3d_fast as F


def _rodrigues(u, th):
    """u (B,K,3) unit axes, th (B,K) -> (B,K,3,3)."""
    c, s = np.cos(th)[..., None, None], np.sin(th)[..., None, None]
    K = np.zeros(u.shape[:-1] + (3, 3))
    K[..., 0, 1], K[..., 0, 2] = -u[..., 2], u[..., 1]
    K[..., 1, 0], K[..., 1, 2] = u[..., 2], -u[..., 0]
    K[..., 2, 0], K[..., 2, 1] = -u[..., 1], u[..., 0]
    uu = u[..., :, None] * u[..., None, :]
    return c * np.eye(3) + s * K + (1 - c) * uu


class Hinge:
    def __init__(self, N, W, h):
        self.N, self.W, self.h = N, float(W), float(h)
        self.m = (N - 1) // 2
        self.nx = 3 * N + 3
        self.i_th = 6                       # theta_1..theta_{N-2} -> 6 .. 6+N-3
        self.i_a = 6 + (N - 2)              # a without m: N-1 entries
        self.i_b = self.i_a + (N - 1)       # b: N entries
        self.a_m = 0.0

    # --------------------------------------------------- packing
    def pack(self, omega, t, th, a, b):
        m = self.m
        return np.concatenate([omega, t, th[1:self.N - 1], np.delete(a, m), b])

    def unpack(self, X):
        """X (B,nx) -> omega, t, th (B,N) (idx 0,N-1 zero), a (B,N), b (B,N)."""
        N, m = self.N, self.m
        B = X.shape[0]
        th = np.zeros((B, N))
        th[:, 1:N - 1] = X[:, self.i_th:self.i_th + N - 2]
        a = np.empty((B, N))
        ar = X[:, self.i_a:self.i_a + N - 1]
        a[:, :m], a[:, m + 1:] = ar[:, :m], ar[:, m:]
        a[:, m] = self.a_m
        return X[:, :3], X[:, 3:6], th, a, X[:, self.i_b:self.i_b + N]

    # --------------------------------------------------- forward kinematics (batched)
    def fk_quads(self, X):
        N, m, W = self.N, self.m, self.W
        omega, t, th, a, b = self.unpack(X)
        B = X.shape[0]
        Lf = np.zeros((B, N, 3)); Lf[..., 0] = a
        Rf = np.zeros((B, N, 3)); Rf[..., 0] = b; Rf[..., 1] = W
        u = Rf - Lf
        u /= np.linalg.norm(u, axis=-1, keepdims=True)
        Rg = _rodrigues(u, th)                                   # (B,N,3,3)
        tg = Lf - np.einsum('bkij,bkj->bki', Rg, Lf)
        Rgi = np.swapaxes(Rg, -1, -2)
        tgi = Lf - np.einsum('bkij,bkj->bki', Rgi, Lf)
        Rq = np.empty((B, N - 1, 3, 3))
        tq = np.empty((B, N - 1, 3))
        Rq[:, m] = Rotation.from_rotvec(omega).as_matrix()
        tq[:, m] = t
        for k in range(m + 1, N - 1):
            Rq[:, k] = Rq[:, k - 1] @ Rg[:, k]
            tq[:, k] = np.einsum('bij,bj->bi', Rq[:, k - 1], tg[:, k]) + tq[:, k - 1]
        for k in range(m - 1, -1, -1):
            Rq[:, k] = Rq[:, k + 1] @ Rgi[:, k + 1]
            tq[:, k] = np.einsum('bij,bj->bi', Rq[:, k + 1], tgi[:, k + 1]) + tq[:, k + 1]
        return Rq, tq, Lf, Rf

    def ring_quad(self):
        i = np.arange(self.N)
        return np.where(i <= self.m, i, i - 1)

    def fk(self, X, alt=False):
        """X (B,nx) -> L,R (B,N,3). alt=True uses the neighbouring quad for hinge rings (consistency test)."""
        Rq, tq, Lf, Rf = self.fk_quads(X)
        q = self.ring_quad()
        if alt:
            q = q.copy()
            hr = np.arange(1, self.N - 1)
            q[hr] = np.where(hr <= self.m, hr - 1, hr)
        Rr, tr = Rq[:, q], tq[:, q]
        L = np.einsum('bnij,bnj->bni', Rr, Lf) + tr
        R = np.einsum('bnij,bnj->bni', Rr, Rf) + tr
        return L, R

    def points(self, x):
        L, R = self.fk(x[None])
        return L[0], R[0]

    def full(self, x):
        """x -> F-layout vector [L | R | a | b]."""
        L, R = self.points(x)
        _, _, _, a, b = self.unpack(x[None])
        return np.concatenate([L.ravel(), R.ravel(), a[0], b[0]])

    # --------------------------------------------------- point jacobian
    def point_jac(self, x):
        """P (6N, nx): d(L ravel, R ravel)/dx."""
        N, m = self.N, self.m
        nx = self.nx
        P = np.zeros((2, N, 3, nx))
        L0, R0 = self.points(x)
        # t
        for c in range(3):
            P[:, :, c, 3 + c] = 1.0
        # theta (analytic)
        pts = np.stack([L0, R0])                                # (2,N,3)
        for k in range(1, N - 1):
            u = R0[k] - L0[k]
            u /= np.linalg.norm(u)
            if k > m:
                sl, s = slice(k, N), 1.0
            else:
                sl, s = slice(0, k + 1), -1.0
            d = np.cross(u, pts[:, sl] - L0[k]) * s             # (2,n,3)
            P[:, sl, :, self.i_th + k - 1] = d
        # FD columns: omega, a, b via one batched forward kinematics
        cols, steps = [], []
        for c in range(3):
            cols.append(c); steps.append(1e-6)
        for j in range(N - 1):
            cols.append(self.i_a + j); steps.append(1e-6 * max(1.0, abs(x[self.i_a + j])))
        for j in range(N):
            cols.append(self.i_b + j); steps.append(1e-6 * max(1.0, abs(x[self.i_b + j])))
        nc = len(cols)
        X = np.repeat(x[None], 2 * nc, 0)
        ar = np.arange(nc)
        X[ar, cols] += steps
        X[nc + ar, cols] -= steps
        Lb, Rb = self.fk(X)
        den = (2 * np.array(steps))[:, None, None]
        dL = (Lb[:nc] - Lb[nc:]) / den
        dR = (Rb[:nc] - Rb[nc:]) / den
        P[0][:, :, cols] = np.transpose(dL, (1, 2, 0))
        P[1][:, :, cols] = np.transpose(dR, (1, 2, 0))
        return P.reshape(6 * N, nx)


# ====================================================================== problem
BLK = ('data', 'mono', 'obl', 'ruling', 'bend', 'clear', 'cov_in', 'cov_out')


class HingeProblem:
    """Point-based blocks reuse solve3d_fast.IsoProblem (residuals and row-local jacobians);
    bending is the second difference of theta (direct)."""

    def __init__(self, H, iso_prob):
        self.H, self.ip = H, iso_prob
        self.names = [n for n in iso_prob.names if n not in ('iso', 'planar')]
        x0 = np.zeros(H.nx)
        self.sizes = {n: len(v) for n, v in self.blocks(self._probe(x0)).items()}
        self.nres = sum(self.sizes.values())

    def _probe(self, x0):
        H = self.H
        x = x0.copy()
        x[H.i_a:H.i_a + H.N - 1] = np.arange(H.N - 1) * H.h
        x[H.i_b:] = np.arange(H.N) * H.h
        x[3:6] = 0
        return x

    def blocks(self, x):
        H = self.H
        xf = H.full(x)
        out = {}
        for n in self.names:
            if n == 'bend':
                th = x[H.i_th:H.i_th + H.N - 2]
                out[n] = (th[2:] - 2 * th[1:-1] + th[:-2]) * self.ip.sb
            else:
                out[n] = self.ip.block(n, xf)
        return out

    def f(self, x):
        return np.concatenate(list(self.blocks(x).values()))

    def jac_blocks(self, x):
        """dict name -> dense (n_block, nx)."""
        H, N = self.H, self.H.N
        xf = H.full(x)
        P = H.point_jac(x)
        jb = self.ip.jac_blocks(xf)
        from scipy.sparse import coo_matrix
        out = {}
        m = H.m
        for n in self.names:
            ns = self.sizes[n]
            if n == 'bend':
                Jd = np.zeros((ns, H.nx))
                k = np.arange(ns)
                for off, co in ((0, 1.0), (1, -2.0), (2, 1.0)):
                    Jd[k, H.i_th + k + off] = co * self.ip.sb
                out[n] = Jd
                continue
            r, c, v = jb[n]
            if len(r) == 0:          # block with no active rows
                out[n] = np.zeros((ns, H.nx))
                continue
            Jf = coo_matrix((np.concatenate([np.asarray(q, float) for q in v]),
                             (np.concatenate([np.asarray(q) for q in r]), np.concatenate([np.asarray(q) for q in c]))),
                            shape=(ns, 8 * N)).tocsr()
            Jd = np.asarray(Jf[:, :6 * N] @ P)
            Ab = Jf[:, 6 * N:].toarray()
            Jd[:, H.i_a:H.i_a + m] += Ab[:, :m]
            Jd[:, H.i_a + m:H.i_a + N - 1] += Ab[:, m + 1:N]
            Jd[:, H.i_b:H.i_b + N] += Ab[:, N:2 * N]
            out[n] = Jd
        return out

    def jac(self, x):
        jb = self.jac_blocks(x)
        return np.concatenate([jb[n] for n in self.names], 0)


class PrefitProblem:
    """Residual p(x) - p_init for all ring points."""

    def __init__(self, H, L0, R0):
        self.H = H
        self.p0 = np.concatenate([np.asarray(L0, float).ravel(), np.asarray(R0, float).ravel()])
        self.nres = len(self.p0)

    def f(self, x):
        L, R = self.H.points(x)
        return np.concatenate([L.ravel(), R.ravel()]) - self.p0

    def jac(self, x):
        return self.H.point_jac(x)


# ====================================================================== dense LM
def lm_dense(fun, jac, x0, max_iter=300, mu0=1e-3):
    t0 = time.perf_counter()
    x = np.asarray(x0, float).copy()
    mu, nu = mu0, 2.0
    r = fun(x)
    cost = 0.5 * float(r @ r)
    cost0 = cost
    it = acc = small = 0
    reason = 'max_iter'
    while it < max_iter:
        it += 1
        J = jac(x)
        g = J.T @ r
        if np.abs(g).max() < 1e-9:
            reason = 'gradient'
            break
        A = J.T @ J
        d = np.maximum(np.diag(A), 1e-6)
        try:
            dx = cho_solve(cho_factor(A + mu * np.diag(d), lower=True), -g)
        except Exception:
            try:
                dx = np.linalg.lstsq(A + mu * np.diag(d), -g, rcond=None)[0]
            except Exception:
                dx = np.full_like(x, np.nan)
        if not np.all(np.isfinite(dx)):
            mu *= nu
            nu *= 2
            if mu > 1e12:
                reason = 'mu'
                break
            continue
        if np.linalg.norm(dx) <= 1e-10 * (np.linalg.norm(x) + 1e-10):
            reason = 'step'
            break
        pred = -(float(g @ dx) + 0.5 * float(dx @ (A @ dx)))
        rn = fun(x + dx)
        cn = 0.5 * float(rn @ rn)
        rho = (cost - cn) / pred if pred > 0 else -1.0
        if rho > 0:
            rel = (cost - cn) / max(cost, 1e-300)
            x = x + dx
            r, cost = rn, cn
            acc += 1
            mu *= max(1 / 3, 1 - (2 * rho - 1) ** 3)
            nu = 2.0
            small = small + 1 if rel < 1e-12 else 0
            if small >= 5:
                reason = 'ftol'
                break
        else:
            mu *= nu
            nu *= 2
            if mu > 1e12:
                reason = 'mu'
                break
    return x, dict(iterations=it, accepted=acc, cost0=cost0, cost=cost, reason=reason,
                   seconds=time.perf_counter() - t0)


# ====================================================================== geometric init (synth8)
def geometric_init(Hg, L0, R0):
    """Build hinge parameters directly from init ring points. Returns (x, info)."""
    N, m, W = Hg.N, Hg.m, Hg.W
    L0, R0 = np.asarray(L0, float), np.asarray(R0, float)
    sa = np.maximum(np.linalg.norm(np.diff(L0, axis=0), axis=1), 0.5)
    sb = np.maximum(np.linalg.norm(np.diff(R0, axis=0), axis=1), 0.5)
    a = np.concatenate([[0.0], np.cumsum(sa)])
    b = np.concatenate([[0.0], np.cumsum(sb)])
    C = (L0 + R0) / 2
    tg = C[m + 1] - C[m - 1]
    tg /= np.linalg.norm(tg)
    obl = float((R0[m] - L0[m]) @ tg)
    b = b + (obl + a[m]) - b[m]            # b_m - a_m = obl
    sh = a[m]
    a, b = a - sh, b - sh                  # gauge a_m = 0
    th = np.zeros(N)
    th[1:N - 1] = S.dihedral(L0, R0)
    # root pose: Kabsch on the root quad
    fp = np.array([[a[m], 0, 0], [a[m + 1], 0, 0], [b[m], W, 0], [b[m + 1], W, 0]])
    tp = np.array([L0[m], L0[m + 1], R0[m], R0[m + 1]])
    fc, tc = fp.mean(0), tp.mean(0)
    Hm = (fp - fc).T @ (tp - tc)
    U, _, Vt = np.linalg.svd(Hm)
    d = np.sign(np.linalg.det(Vt.T @ U.T))
    Rm = Vt.T @ np.diag([1, 1, d]) @ U.T
    omega = Rotation.from_matrix(Rm).as_rotvec()
    t = tc - Rm @ fc
    x = Hg.pack(omega, t, th, a, b)
    Lf, Rf = Hg.points(x)
    dih = S.dihedral(Lf, Rf)
    info = dict(max_dihedral_err_fk_vs_theta=float(np.abs(dih - th[1:N - 1]).max()),
                root_kabsch_rms=float(np.sqrt(np.mean((np.einsum('ij,kj->ki', Rm, fp) + t - tp) ** 2))),
                obliqueness_root=obl, flat_span_a=float(a[-1] - a[0]))
    return x, info


# ====================================================================== sliding data term (synth12)
def vis_runs(vis):
    """List of (start, end_inclusive) index runs where vis is True."""
    v = np.asarray(vis, bool)
    out, i, n = [], 0, len(v)
    while i < n:
        if v[i]:
            j = i
            while j + 1 < n and v[j + 1]:
                j += 1
            out.append((i, j))
            i = j + 1
        else:
            i += 1
    return out


class SlidingData:
    """Point-to-polyline data term for one edge. Per visible ring: n_q . (project(P_i) - q), q = closest point on the
    polyline of the ring's own visibility run; plus weak anchor 0.05 * (project(P_i) - obs_i) (2 components)."""

    def __init__(self, obs, vis, anchor=0.05):
        self.obs, self.vis, self.anchor = np.asarray(obs, float), np.asarray(vis, bool), anchor
        self.idx = np.where(self.vis)[0]
        self.run_of = {}
        self.runs = vis_runs(self.vis)
        for r in self.runs:
            for i in range(r[0], r[1] + 1):
                self.run_of[i] = r
        # sliding residual only for rings in runs with >= 2 samples
        self.sidx = np.array([i for i in self.idx if self.run_of[i][1] > self.run_of[i][0]], int)

    def closest(self, p2):
        """p2 (n,2) projected points of rings self.sidx -> q (n,2), nq (n,2)."""
        q = np.zeros_like(p2); nq = np.zeros_like(p2)
        for k, i in enumerate(self.sidx):
            a0, a1 = self.run_of[i]
            A = self.obs[a0:a1]; B = self.obs[a0 + 1:a1 + 1]
            d = B - A
            l2 = np.maximum((d * d).sum(1), 1e-12)
            t = np.clip(((p2[k] - A) * d).sum(1) / l2, 0.0, 1.0)
            Q = A + t[:, None] * d
            j = int(np.argmin(((Q - p2[k]) ** 2).sum(1)))
            q[k] = Q[j]
            tg = d[j] / np.sqrt(l2[j])
            nq[k] = (-tg[1], tg[0])
        return q, nq

    def size(self):
        return len(self.sidx) + 2 * len(self.idx)

    def resid(self, P):
        p2 = S.project(P)
        q, nq = self.closest(p2[self.sidx])
        slide = (nq * (p2[self.sidx] - q)).sum(1)
        anc = self.anchor * (p2[self.idx] - self.obs[self.idx])
        return slide, anc.ravel()

    def jac(self, P):
        """rows (size, 3N) wrt the N points P (sliding rows first, then anchor rows)."""
        N = len(P)
        pj = S.project_jac(P)                                   # (N,2,3)
        p2 = S.project(P)
        q, nq = self.closest(p2[self.sidx])
        J = np.zeros((self.size(), 3 * N))
        for k, i in enumerate(self.sidx):
            J[k, 3 * i:3 * i + 3] = nq[k] @ pj[i]
        o = len(self.sidx)
        for k, i in enumerate(self.idx):
            J[o + 2 * k:o + 2 * k + 2, 3 * i:3 * i + 3] = self.anchor * pj[i]
        return J


class SlidingHingeProblem(HingeProblem):
    """HingeProblem whose 'data' block is replaced by the sliding term (E1 then E2: sliding rows, then anchor rows)."""

    def __init__(self, H, iso_prob, obs1, obs2, vis1, vis2):
        self.sd1, self.sd2 = SlidingData(obs1, vis1), SlidingData(obs2, vis2)
        super().__init__(H, iso_prob)

    def data_parts(self, x):
        L, R = self.H.points(x)
        s1, a1 = self.sd1.resid(L)
        s2, a2 = self.sd2.resid(R)
        return s1, s2, a1, a2

    def blocks(self, x):
        out = {}
        H = self.H
        xf = None
        for n in self.names:
            if n == 'data':
                out[n] = np.concatenate(self.data_parts(x))
            elif n == 'bend':
                th = x[H.i_th:H.i_th + H.N - 2]
                out[n] = (th[2:] - 2 * th[1:-1] + th[:-2]) * self.ip.sb
            else:
                if xf is None:
                    xf = H.full(x)
                out[n] = self.ip.block(n, xf)
        return out

    def data_jac(self, x, P=None):
        H, N = self.H, self.H.N
        L, R = H.points(x)
        if P is None:
            P = H.point_jac(x)
        J1, J2 = self.sd1.jac(L), self.sd2.jac(R)
        n1s, n2s = len(self.sd1.sidx), len(self.sd2.sidx)
        Jf = np.zeros((self.sd1.size() + self.sd2.size(), 6 * N))
        # row order matches data_parts: s1, s2, a1, a2
        r = 0
        Jf[r:r + n1s, :3 * N] = J1[:n1s]; r += n1s
        Jf[r:r + n2s, 3 * N:] = J2[:n2s]; r += n2s
        Jf[r:r + J1.shape[0] - n1s, :3 * N] = J1[n1s:]; r += J1.shape[0] - n1s
        Jf[r:r + J2.shape[0] - n2s, 3 * N:] = J2[n2s:]
        return Jf @ P

    def jac_blocks(self, x):
        H, N = self.H, self.H.N
        P = H.point_jac(x)
        xf = H.full(x)
        jb = self.ip.jac_blocks(xf)
        from scipy.sparse import coo_matrix
        out, m = {}, H.m
        for n in self.names:
            ns = self.sizes[n]
            if n == 'data':
                out[n] = self.data_jac(x, P)
                continue
            if n == 'bend':
                Jd = np.zeros((ns, H.nx))
                k = np.arange(ns)
                for off, co in ((0, 1.0), (1, -2.0), (2, 1.0)):
                    Jd[k, H.i_th + k + off] = co * self.ip.sb
                out[n] = Jd
                continue
            r, c, v = jb[n]
            if len(r) == 0:
                out[n] = np.zeros((ns, H.nx))
                continue
            Jf = coo_matrix((np.concatenate([np.asarray(q, float) for q in v]),
                             (np.concatenate([np.asarray(q) for q in r]), np.concatenate([np.asarray(q) for q in c]))),
                            shape=(ns, 8 * N)).tocsr()
            Jd = np.asarray(Jf[:, :6 * N] @ P)
            Ab = Jf[:, 6 * N:].toarray()
            Jd[:, H.i_a:H.i_a + m] += Ab[:, :m]
            Jd[:, H.i_a + m:H.i_a + N - 1] += Ab[:, m + 1:N]
            Jd[:, H.i_b:H.i_b + N] += Ab[:, N:2 * N]
            out[n] = Jd
        return out

    def jac(self, x):
        jb = self.jac_blocks(x)
        return np.concatenate([jb[n] for n in self.names], 0)
