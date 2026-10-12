"""Fast isometric ribbon solver: vectorised residual blocks + analytic / row-local finite-difference
sparse Jacobians. Same model (residuals and weights) as solve3d.solve_iso.

Variable layout x = [L (N,3) | R (N,3) | a (N) | b (N)]; column of L ring i coord c = 3i+c, R: 3N+3i+c,
a: 6N+i, b: 7N+i.
"""
import time

import numpy as np
from scipy.optimize import least_squares
from scipy.sparse import coo_matrix

import solve3d as S
from solve3d import project, project_jac, segment_dist, _norm

ISO_WEIGHTS = S.ISO_WEIGHTS
BLOCKS = ('data', 'iso', 'planar', 'mono', 'obl', 'ruling', 'bend', 'clear', 'ou', 'cov_in', 'cov_out')
FD_REL = 1e-6


def coverage_candidates_fast(L, R, pts, W, reach=2.5):
    """Vectorised S.coverage_candidates (same output): (P,K) quad indices ascending, -1 padded."""
    pl, pr = project(L), project(R)
    qc = (pl[:-1] + pl[1:] + pr[:-1] + pr[1:]) / 4
    m = _norm(pts[:, None] - qc[None]) < reach * W
    K = max(int(m.sum(1).max()), 1) if len(pts) else 1
    order = np.argsort(~m, axis=1, kind='stable')[:, :K]
    ok = np.take_along_axis(m, order, 1)
    return np.where(ok, order, -1)


def _local_fd(fn, args):
    """Central differences of fn(*args)->(n,) wrt every coord of every (n,3) arg, row-independent.
    Returns list of (n,3) derivative arrays. Step 1e-6*max(1,|x|)."""
    out = []
    for k, A in enumerate(args):
        D = np.zeros_like(A)
        for c in range(3):
            h = FD_REL * np.maximum(1.0, np.abs(A[:, c]))
            Ap, Am = A.copy(), A.copy()
            Ap[:, c] += h
            Am[:, c] -= h
            ap = list(args); ap[k] = Ap
            am = list(args); am[k] = Am
            D[:, c] = (fn(*ap) - fn(*am)) / (2 * h)
        out.append(D)
    return out


def _planar_fn(L0, L1, R0, R1):
    e1 = L1 - L0
    e2 = R0 - L0
    e3 = R1 - L0
    det = (e1 * np.cross(e2, e3)).sum(1)
    return det / (_norm(e1) * _norm(e2) * _norm(e3) + 1e-9)


def _unit(v):
    return v / (_norm(v)[:, None] + 1e-12)


def _dihedral_win(Ls, Rs):
    """Second difference of dihedral angles over a 5-ring window: Ls, Rs lists of 5 (n,3) arrays."""
    m = [_unit(np.cross(Ls[q + 1] - Ls[q], Rs[q] - Ls[q])) for q in range(4)]
    th = []
    for q in range(3):
        u = _unit(Rs[q + 1] - Ls[q + 1])
        th.append(np.arctan2((np.cross(m[q], m[q + 1]) * u).sum(1), (m[q] * m[q + 1]).sum(1)))
    return th[2] - 2 * th[1] + th[0]


def _clear_fn(thk):
    def g(Li, Ri, Lj, Rj):
        return np.maximum(0.0, 2 * thk - segment_dist(Li, Ri, Lj, Rj))
    return g


class IsoProblem:
    def __init__(self, N, obs1, obs2, vis1, vis2, w1, w2, win, p, wts, pairs, ou=None, ou_w=0.0, cov=None):
        self.N = N
        self.W, self.thk = p['W'], p['thk']
        self.obs1, self.obs2 = np.asarray(obs1, float), np.asarray(obs2, float)
        self.sq = {k: np.sqrt(v) for k, v in wts.items()}
        self.dw1 = np.sqrt(wts['data'] * np.asarray(w1) * np.asarray(vis1, float))
        self.dw2 = np.sqrt(wts['data'] * np.asarray(w2) * np.asarray(vis2, float))
        self.sb = np.sqrt(wts['bend'] * np.where(np.asarray(win)[2:N - 2], 0.1, 1.0))
        self.pairs = pairs
        self.use_clear = wts['clear'] > 0 and len(pairs) > 0
        self.ou = None
        if ou is not None and len(ou) > 0 and ou_w > 0:
            self.ou = np.asarray(ou, int)
            self.sq_ou = np.sqrt(ou_w)
        self.cov = None
        if cov is not None and cov['w'] > 0 and (len(cov['p_in']) + len(cov['p_out'])) > 0:
            self.cov = cov
            self.sq_cov = np.sqrt(cov['w'])
        self.names = [b for b in BLOCKS if self._active(b)]
        self.sizes = {}
        x0 = np.zeros(8 * N)
        for k, v in self.resid_blocks(x0 + 0.0, _size_only=True).items():
            self.sizes[k] = len(v)
        self.nres = sum(self.sizes.values())

    def _active(self, b):
        if b == 'clear':
            return self.use_clear
        if b == 'ou':
            return self.ou is not None
        if b in ('cov_in', 'cov_out'):
            return self.cov is not None
        return True

    # ------------------------------------------------------------ residuals
    def _unpack(self, x):
        N = self.N
        return x[:3 * N].reshape(N, 3), x[3 * N:6 * N].reshape(N, 3), x[6 * N:7 * N], x[7 * N:8 * N]

    def block(self, name, x, _size_only=False):
        N, W, sq = self.N, self.W, self.sq
        if _size_only:
            x = self._probe_x()
        L, R, a, b = self._unpack(x)
        if name == 'data':
            d1 = (project(L) - self.obs1) * self.dw1[:, None]
            d2 = (project(R) - self.obs2) * self.dw2[:, None]
            return np.concatenate([d1.ravel(), d2.ravel()])
        if name == 'iso':
            return np.concatenate([np.concatenate(S.iso_residuals(L, R, a, b, W)) * sq['iso']])
        if name == 'planar':
            return S.planarity(L, R) * sq['planar']
        if name == 'mono':
            return np.concatenate([np.maximum(0.0, 0.5 - (a[1:] - a[:-1])),
                                   np.maximum(0.0, 0.5 - (b[1:] - b[:-1]))]) * sq['mono']
        if name == 'obl':
            return np.maximum(0.0, np.abs(b - a) - 2.5 * W) * sq['obl']
        if name == 'ruling':
            s = (b - a) / W
            return (s[2:] - 2 * s[1:-1] + s[:-2]) * sq['ruling']
        if name == 'bend':
            th = S.dihedral(L, R)
            return (th[2:] - 2 * th[1:-1] + th[:-2]) * self.sb
        if name == 'clear':
            pi, pj = self.pairs[:, 0], self.pairs[:, 1]
            return np.maximum(0.0, 2 * self.thk - segment_dist(L[pi], R[pi], L[pj], R[pj])) * sq['clear']
        if name == 'ou':
            zc = (L[:, 2] + R[:, 2]) / 2
            o = self.ou
            return np.maximum(0.0, 2 * self.thk - (zc[o[:, 0]] - zc[o[:, 1]])) * self.sq_ou
        if name == 'cov_in':
            return S.coverage_resid(L, R, self.cov['p_in'], self.cov['c_in'], W, 'in') * self.sq_cov
        if name == 'cov_out':
            return S.coverage_resid(L, R, self.cov['p_out'], self.cov['c_out'], W, 'out') * self.sq_cov
        raise KeyError(name)

    def _probe_x(self):
        # a well-conditioned dummy point used only to learn block sizes
        N = self.N
        x = np.zeros(8 * N)
        ang = np.linspace(0, 6, N)
        x[:3 * N] = np.stack([np.cos(ang) * 50, np.sin(ang) * 50, ang * 10], 1).ravel()
        x[3 * N:6 * N] = np.stack([np.cos(ang) * 50 + 20, np.sin(ang) * 50 + 5, ang * 10 + 3], 1).ravel()
        x[6 * N:7 * N] = np.arange(N) * 5.0
        x[7 * N:] = np.arange(N) * 5.0
        return x

    def resid_blocks(self, x, _size_only=False):
        return {n: self.block(n, x, _size_only) for n in self.names}

    def f(self, x):
        return np.concatenate([self.block(n, x) for n in self.names])

    # ------------------------------------------------------------- jacobian
    def _jac_data(self, L, R):
        N = self.N
        idx = np.arange(N)
        rows, cols, vals = [], [], []
        for off_r, off_c, P, dw in ((0, 0, L, self.dw1), (2 * N, 3 * N, R, self.dw2)):
            J = project_jac(P) * dw[:, None, None]
            for k in range(2):
                for c in range(3):
                    rows.append(off_r + 2 * idx + k)
                    cols.append(off_c + 3 * idx + c)
                    vals.append(J[:, k, c])
        return rows, cols, vals

    def _jac_iso(self, L, R, a, b):
        N, W, s = self.N, self.W, self.sq['iso']
        m = N - 1
        i = np.arange(m)
        rows, cols, vals = [], [], []

        def add(r, c0, ids, v):                       # v (n,3) or (n,)
            if v.ndim == 2:
                for c in range(3):
                    rows.append(r); cols.append(c0 + 3 * ids + c); vals.append(v[:, c])
            else:
                rows.append(r); cols.append(c0 + ids); vals.append(v)

        LO, RO, AO, BO = 0, 3 * N, 6 * N, 7 * N
        u = _unit(L[1:] - L[:-1])                      # e1
        add(i, LO, i + 1, u * s); add(i, LO, i, -u * s)
        add(i, AO, i + 1, -np.full(m, s)); add(i, AO, i, np.full(m, s))
        r0 = m
        u = _unit(R[1:] - R[:-1])                      # e2
        add(r0 + i, RO, i + 1, u * s); add(r0 + i, RO, i, -u * s)
        add(r0 + i, BO, i + 1, -np.full(m, s)); add(r0 + i, BO, i, np.full(m, s))
        r0 = 2 * m
        u = _unit(R[:-1] - L[:-1])                     # e3
        dd = b[:-1] - a[:-1]
        q = np.sqrt(W ** 2 + dd ** 2)
        add(r0 + i, RO, i, u * s); add(r0 + i, LO, i, -u * s)
        add(r0 + i, BO, i, -dd / q * s); add(r0 + i, AO, i, dd / q * s)
        r0 = 3 * m
        u = _unit(R[1:] - L[:-1])                      # e4
        dd = b[1:] - a[:-1]
        q = np.sqrt(W ** 2 + dd ** 2)
        add(r0 + i, RO, i + 1, u * s); add(r0 + i, LO, i, -u * s)
        add(r0 + i, BO, i + 1, -dd / q * s); add(r0 + i, AO, i, dd / q * s)
        r0 = 4 * m                                     # e5
        u = _unit((R[-1] - L[-1])[None])
        dd = b[-1] - a[-1]
        q = np.sqrt(W ** 2 + dd ** 2)
        e = np.array([N - 1]); r = np.array([r0])
        add(r, RO, e, u * s); add(r, LO, e, -u * s)
        add(r, BO, e, np.array([-dd / q * s])); add(r, AO, e, np.array([dd / q * s]))
        return rows, cols, vals

    def _jac_localfd(self, fn, arg_rows, arg_cols, row_ids, scale):
        """arg_rows: list of (n,3) point arrays; arg_cols: list of (n,) base column per arg (3 comps follow)."""
        D = _local_fd(fn, arg_rows)
        rows, cols, vals = [], [], []
        for Dk, ck in zip(D, arg_cols):
            for c in range(3):
                rows.append(row_ids); cols.append(ck + c); vals.append(Dk[:, c] * scale)
        return rows, cols, vals

    def _jac_planar(self, L, R):
        N, m = self.N, self.N - 1
        i = np.arange(m)
        args = [L[:-1], L[1:], R[:-1], R[1:]]
        cs = [3 * i, 3 * (i + 1), 3 * N + 3 * i, 3 * N + 3 * (i + 1)]
        return self._jac_localfd(_planar_fn, args, cs, i, self.sq['planar'])

    def _jac_bend(self, L, R):
        N, m = self.N, self.N - 4
        k = np.arange(m)
        Lw = [L[q:q + m] for q in range(5)]
        Rw = [R[q:q + m] for q in range(5)]
        sb = self.sb

        def fn(*a):
            return _dihedral_win(list(a[:5]), list(a[5:])) * sb
        cs = [3 * (k + q) for q in range(5)] + [3 * N + 3 * (k + q) for q in range(5)]
        return self._jac_localfd(fn, Lw + Rw, cs, k, 1.0)

    def _jac_clear(self, L, R):
        N = self.N
        pi, pj = self.pairs[:, 0], self.pairs[:, 1]
        g = _clear_fn(self.thk)
        return self._jac_localfd(g, [L[pi], R[pi], L[pj], R[pj]],
                                 [3 * pi, 3 * N + 3 * pi, 3 * pj, 3 * N + 3 * pj],
                                 np.arange(len(pi)), self.sq['clear'])

    def _jac_cov(self, L, R, kind):
        """Residual of a point only depends (a.e.) on its active triangle: the nearest one if outside all
        ('in') or the containing one with the smallest boundary distance ('out'). Row-local FD on that
        triangle's three vertices (screen distance, via project)."""
        N, W = self.N, self.W
        pts = self.cov['p_' + kind]
        cand = self.cov['c_' + kind]
        P, K = cand.shape
        pl, pr = project(L), project(R)
        ins, dd, v2 = S._cov_tables(pl, pr, pts, cand)
        if kind == 'in':
            ok = ~(ins & v2).any(1) & v2.any(1)
            key = np.where(v2, dd, np.inf)
        else:
            key = np.where(ins & v2, dd, np.inf)
            ok = np.isfinite(key).any(1)
        t = np.argmin(key, 1)
        pid = np.nonzero(ok)[0]
        if len(pid) == 0:
            return [], [], []
        t = t[pid]
        tri, kk = t // K, t % K
        q = cand[pid, kk]
        # vertices: tri0 (L_q, L_q+1, R_q+1); tri1 (L_q, R_q+1, R_q)
        v0 = L[q]
        v1 = np.where((tri == 0)[:, None], L[q + 1], R[q + 1])
        v2_ = np.where((tri == 0)[:, None], R[q + 1], R[q])
        c0 = 3 * q
        c1 = np.where(tri == 0, 3 * (q + 1), 3 * N + 3 * (q + 1))
        c2 = np.where(tri == 0, 3 * N + 3 * (q + 1), 3 * N + 3 * q)
        pp = pts[pid]

        def fn(A, B, C):
            return S._tri_info(pp, project(A), project(B), project(C))[1]
        return self._jac_localfd(fn, [v0, v1, v2_], [c0, c1, c2], pid, self.sq_cov)

    def _jac_simple(self, L, R, a, b):
        """mono, obl, ruling blocks (linear / hinge) analytic. Returns per-block lists."""
        N, W, sq = self.N, self.W, self.sq
        out = {}
        m = N - 1
        i = np.arange(m)
        rows, cols, vals = [], [], []
        for k, (off, v) in enumerate(((6 * N, a), (7 * N, b))):
            act = (0.5 - (v[1:] - v[:-1])) > 0
            s = sq['mono'] * act
            rows += [k * m + i, k * m + i]
            cols += [off + i + 1, off + i]
            vals += [-s, s]
        out['mono'] = (rows, cols, vals)
        d = b - a
        act = (np.abs(d) - 2.5 * W) > 0
        sg = np.sign(d) * act * sq['obl']
        idx = np.arange(N)
        out['obl'] = ([idx, idx], [7 * N + idx, 6 * N + idx], [sg, -sg])
        m = N - 2
        i = np.arange(m)
        c = sq['ruling'] / W
        rows, cols, vals = [], [], []
        for off, sgn in ((7 * N, 1.0), (6 * N, -1.0)):
            for dj, co in ((0, 1.0), (1, -2.0), (2, 1.0)):
                rows.append(i); cols.append(off + i + dj); vals.append(np.full(m, sgn * co * c))
        out['ruling'] = (rows, cols, vals)
        return out

    def jac_blocks(self, x):
        L, R, a, b = self._unpack(x)
        out = {'data': self._jac_data(L, R), 'iso': self._jac_iso(L, R, a, b),
               'planar': self._jac_planar(L, R), 'bend': self._jac_bend(L, R)}
        out.update(self._jac_simple(L, R, a, b))
        if self.use_clear:
            out['clear'] = self._jac_clear(L, R)
        if self.ou is not None:
            o = self.ou
            n = len(o)
            i = np.arange(n)
            act = (2 * self.thk - ((L[o[:, 0], 2] + R[o[:, 0], 2]) / 2 - (L[o[:, 1], 2] + R[o[:, 1], 2]) / 2)) > 0
            s = self.sq_ou * act
            out['ou'] = ([i] * 4, [3 * o[:, 0] + 2, 3 * self.N + 3 * o[:, 0] + 2, 3 * o[:, 1] + 2,
                                    3 * self.N + 3 * o[:, 1] + 2], [-0.5 * s, -0.5 * s, 0.5 * s, 0.5 * s])
        if self.cov is not None:
            out['cov_in'] = self._jac_cov(L, R, 'in')
            out['cov_out'] = self._jac_cov(L, R, 'out')
        return out

    def jac(self, x, blocks=None):
        jb = self.jac_blocks(x)
        rows, cols, vals = [], [], []
        off = 0
        for n in self.names:
            r, c, v = jb[n]
            for rr, cc, vv in zip(r, c, v):
                rows.append(np.asarray(rr) + off); cols.append(np.asarray(cc)); vals.append(vv)
            off += self.sizes[n]
        J = coo_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))),
                       shape=(off, 8 * self.N)).tocsr()
        J.eliminate_zeros()
        return J


# ----------------------------------------------------------------- driver
def stage_weights(wbase, k):
    w = dict(wbase)
    if k == 1:
        w['clear'] = 0.0
        w['iso'] *= 0.1
        w['planar'] *= 0.1
    elif k == 3:
        w['iso'] *= 5.0
        w['planar'] *= 5.0
    elif k == 4:
        w['iso'] = ISO_WEIGHTS['iso'] * 20.0
        w['planar'] = ISO_WEIGHTS['planar'] * 20.0
    return w


def make_stage_problem(N, obs1, obs2, vis1, vis2, w1, w2, win, p, wts, x, overunder, ou_weight, coverage, k):
    L, R, a, b = S._unpack_iso(x, N)
    pairs = S.pair_list_iso(L, R, a, b, p['W']) if wts['clear'] > 0 else np.zeros((0, 2), int)
    ou_k = overunder if (k >= 2 and overunder is not None) else None
    cov_k = None
    if coverage is not None:
        cov_k = dict(p_in=np.asarray(coverage['p_in'], float), p_out=np.asarray(coverage['p_out'], float),
                     w=coverage.get('weight', 20.0))
        cov_k['c_in'] = coverage_candidates_fast(L, R, cov_k['p_in'], p['W'])
        cov_k['c_out'] = coverage_candidates_fast(L, R, cov_k['p_out'], p['W'])
    return IsoProblem(N, obs1, obs2, vis1, vis2, w1, w2, win, p, wts, pairs, ou_k, ou_weight, cov_k)


def solve_iso_fast(obs1, obs2, vis1, vis2, w1, w2, window_mask, init_L, init_R, params):
    N = len(init_L)
    p = dict(params)
    wbase = dict(ISO_WEIGHTS)
    wbase.update(p.get('weights', {}))
    max_nfev = p.get('max_nfev', 300)
    verbose = p.get('verbose', 0)
    tol = p.get('tol', {})
    stages = p.get('stages', (1, 2, 3))
    tr_solver = p.get('tr_solver', 'lsmr')
    ab0 = np.arange(N) * p['h']
    x = np.concatenate([np.asarray(init_L, float).ravel(), np.asarray(init_R, float).ravel(), ab0, ab0])
    history = []
    for k in stages:
        t0 = time.perf_counter()
        wts = stage_weights(wbase, k)
        prob = make_stage_problem(N, obs1, obs2, vis1, vis2, w1, w2, window_mask, p, wts, x,
                                  p.get('overunder'), p.get('overunder_weight', 50.0), p.get('coverage'), k)
        c0 = 0.5 * float(np.sum(prob.f(x) ** 2))
        res = least_squares(prob.f, x, jac=prob.jac, method='trf', x_scale='jac', loss='linear',
                            max_nfev=max_nfev, verbose=verbose, tr_solver=tr_solver, **tol)
        x = res.x
        history.append(dict(stage=k, cost_before=c0, cost_after=float(res.cost), nfev=int(res.nfev),
                            njev=int(res.njev), status=int(res.status),
                            n_pairs=int(len(prob.pairs)), n_resid=int(prob.nres),
                            seconds=time.perf_counter() - t0))
    L, R, a, b = S._unpack_iso(x, N)
    return dict(L=L.copy(), R=R.copy(), a=a.copy(), b=b.copy(), history=history)


# ------------------------------------------------------------- sparse LM
def lm_solve(fun, jac, x0, max_iter=400, mu0=1e-3):
    """Sparse Levenberg-Marquardt with Marquardt scaling. Returns (x, info)."""
    import scipy.sparse as sp
    from scipy.sparse.linalg import spsolve
    t0 = time.perf_counter()
    x = np.asarray(x0, float).copy()
    mu, nu = mu0, 2.0
    r = fun(x)
    cost = 0.5 * float(r @ r)
    it = acc = small = 0
    reason = 'max_iter'
    while it < max_iter:
        it += 1
        J = jac(x)
        g = J.T @ r
        if np.abs(g).max() < 1e-9:
            reason = 'gradient'
            break
        A = (J.T @ J).tocsc()
        d = np.maximum(A.diagonal(), 1e-6)
        D = sp.diags(d, format='csc')
        try:
            dx = spsolve((A + mu * D).tocsc(), -g, permc_spec='COLAMD')
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
    return x, dict(iterations=it, accepted=acc, cost=cost, reason=reason, seconds=time.perf_counter() - t0)


def solve_iso_lm(obs1, obs2, vis1, vis2, w1, w2, window_mask, init_L, init_R, params):
    """Same staging as solve_iso_fast but with lm_solve; records per-block cost at the end of each stage."""
    N = len(init_L)
    p = dict(params)
    wbase = dict(ISO_WEIGHTS)
    wbase.update(p.get('weights', {}))
    max_iter = p.get('max_iter', 400)
    ab0 = np.arange(N) * p['h']
    x = np.concatenate([np.asarray(init_L, float).ravel(), np.asarray(init_R, float).ravel(), ab0, ab0])
    history = []
    for k in p.get('stages', (1, 2, 3, 4)):
        wts = stage_weights(wbase, k)
        prob = make_stage_problem(N, obs1, obs2, vis1, vis2, w1, w2, window_mask, p, wts, x,
                                  p.get('overunder'), p.get('overunder_weight', 50.0), p.get('coverage'), k)
        c0 = 0.5 * float(np.sum(prob.f(x) ** 2))
        x, info = lm_solve(prob.f, prob.jac, x, max_iter=max_iter)
        blocks = {n: 0.5 * float(np.sum(v ** 2)) for n, v in prob.resid_blocks(x).items()}
        history.append(dict(stage=k, cost_before=c0, cost_after=info['cost'], iterations=info['iterations'],
                            accepted=info['accepted'], reason=info['reason'], seconds=info['seconds'],
                            n_pairs=int(len(prob.pairs)), n_resid=int(prob.nres), blocks=blocks))
        print(f'  stage {k}: {history[-1]["iterations"]} it, {info["reason"]}, {info["seconds"]:.1f}s, '
              f'cost {c0:.4g} -> {info["cost"]:.4g}', flush=True)
    L, R, a, b = S._unpack_iso(x, N)
    return dict(L=L.copy(), R=R.copy(), a=a.copy(), b=b.copy(), history=history)
