"""Whole-strip discrete-ribbon 3D solver (synthetic de-risk of docs/ribbon/turns/SOLVE_SPEC.md).

World: +x right, +y up, +z toward camera; camera at (0,0,D) looking down -z.
"""
import numpy as np
from scipy.optimize import least_squares
from scipy.sparse import coo_matrix

VIEW_W, VIEW_H = 390, 844
CX, CY = 195.0, 422.0
D = 422.0 / np.tan(np.radians(13.2))

DEFAULT_WEIGHTS = dict(data=1.0, width=50.0, inext=50.0, inplane=20.0, perp=20.0,
                       bend=2.0, twist=2.0, clear=50.0)


# ----------------------------------------------------------------- camera
def project(P):
    P = np.asarray(P, float)
    s = D / (D - P[:, 2])
    return np.stack([CX + P[:, 0] * s, CY - P[:, 1] * s], axis=1)


def project_jac(P):
    """Analytic Jacobian of project: (N,2,3)."""
    P = np.asarray(P, float)
    den = D - P[:, 2]
    s = D / den
    ds = D / den ** 2
    J = np.zeros((len(P), 2, 3))
    J[:, 0, 0] = s
    J[:, 0, 2] = P[:, 0] * ds
    J[:, 1, 1] = -s
    J[:, 1, 2] = -P[:, 1] * ds
    return J


def backproject(xy, z):
    z = np.broadcast_to(np.asarray(z, float), (len(xy),))
    k = (D - z) / D
    return np.stack([(xy[:, 0] - CX) * k, -(xy[:, 1] - CY) * k, z], axis=1)


# --------------------------------------------------------------- geometry
def _norm(v):
    return np.linalg.norm(v, axis=-1)


def segment_dist(p1, q1, p2, q2):
    """Minimum distance between segments [p1,q1] and [p2,q2], vectorised (...,3)."""
    d1 = q1 - p1
    d2 = q2 - p2
    r = p1 - p2
    a = (d1 * d1).sum(-1)
    e = (d2 * d2).sum(-1)
    f = (d2 * r).sum(-1)
    c = (d1 * r).sum(-1)
    b = (d1 * d2).sum(-1)
    eps = 1e-12
    denom = a * e - b * b
    with np.errstate(divide='ignore', invalid='ignore'):
        s = np.where(denom > eps, np.clip((b * f - c * e) / denom, 0, 1), 0.0)
        t = (b * s + f) / e
        s_lo = np.clip(-c / a, 0, 1)
        s_hi = np.clip((b - c) / a, 0, 1)
    lo = t < 0
    hi = t > 1
    s = np.where(lo, s_lo, np.where(hi, s_hi, s))
    t = np.clip(t, 0, 1)
    c1 = p1 + d1 * s[..., None]
    c2 = p2 + d2 * t[..., None]
    return _norm(c1 - c2)


def frames(L, R):
    C = (L + R) / 2
    r = (R - L) / _norm(R - L)[:, None]
    t = np.gradient(C, axis=0)
    t /= _norm(t)[:, None]
    n = np.cross(t, r)
    return C, r, t, n


def pair_list(L, R, W, h, reach=3.0):
    N = len(L)
    C = (L + R) / 2
    dist = _norm(C[:, None] - C[None])
    I, J = np.meshgrid(np.arange(N), np.arange(N), indexing='ij')
    m = (J - I > 3 * W / h) & (dist < reach * W)
    return np.stack([I[m], J[m]], axis=1)


def min_clearance(L, R, W, h):
    N = len(L)
    I, J = np.meshgrid(np.arange(N), np.arange(N), indexing='ij')
    m = (J - I > 3 * W / h)
    i, j = I[m], J[m]
    return segment_dist(L[i], R[i], L[j], R[j]).min()


# ----------------------------------------------------------------- solver
def _make_problem(N, obs1, obs2, vis1, vis2, w1, w2, win, p, wts, pairs):
    W, h, thk = p['W'], p['h'], p['thk']
    sq = {k: np.sqrt(v) for k, v in wts.items()}
    dw1 = np.sqrt(wts['data'] * np.asarray(w1) * np.asarray(vis1, float))
    dw2 = np.sqrt(wts['data'] * np.asarray(w2) * np.asarray(vis2, float))
    wj = np.where(np.asarray(win)[2:N - 2], 0.1, 1.0)
    sb = np.sqrt(wts['bend'] * wj)[:, None]
    st = np.sqrt(wts['twist'] * wj)
    use_clear = wts['clear'] > 0 and len(pairs) > 0
    if use_clear:
        pi, pj = pairs[:, 0], pairs[:, 1]

    def f(x):
        X = x.reshape(N, 2, 3)
        L, R = X[:, 0], X[:, 1]
        d1 = (project(L) - obs1) * dw1[:, None]
        d2 = (project(R) - obs2) * dw2[:, None]
        data = np.concatenate([d1, d2], axis=1).ravel()
        rr = R - L
        wl = _norm(rr)
        width = (wl - W) * sq['width']
        C = (L + R) / 2
        inext = (_norm(C[1:] - C[:-1]) - h) * sq['inext']
        r = rr / wl[:, None]
        B = (C[2:] - 2 * C[1:-1] + C[:-2]) / h ** 2
        inplane = (B * r[1:-1]).sum(1) * sq['inplane']
        t = C[2:] - C[:-2]
        t /= _norm(t)[:, None] + 1e-12
        perp = (r[1:-1] * t).sum(1) * sq['perp']
        bend = ((B[2:] - 2 * B[1:-1] + B[:-2]) * sb).ravel()
        n = np.cross(t, r[1:-1])
        tau = ((r[2:] - r[:-2]) * n).sum(1) / (2 * h)
        twist = (tau[2:] - 2 * tau[1:-1] + tau[:-2]) * st
        out = [data, width, inext, inplane, perp, bend, twist]
        if use_clear:
            d = segment_dist(L[pi], R[pi], L[pj], R[pj])
            out.append(np.maximum(0.0, 2 * thk - d) * sq['clear'])
        return np.concatenate(out)

    idx = np.arange(N)
    rows, cols = [], []

    def put(row_ids, ring_ids):
        for c in range(6):
            rows.append(row_ids)
            cols.append(6 * ring_ids + c)

    row = 0
    for k in range(4):
        put(row + 4 * idx + k, idx)
    row += 4 * N
    put(row + idx, idx); row += N                                   # width
    m = N - 1
    for off in (0, 1):
        put(row + np.arange(m), np.arange(m) + off)
    row += m                                                        # inext
    m = N - 2
    for off in (0, 1, 2):
        put(row + np.arange(m), np.arange(m) + off)
    row += m                                                        # inplane
    for off in (0, 1, 2):
        put(row + np.arange(m), np.arange(m) + off)
    row += m                                                        # perp
    m = N - 4
    for comp in range(3):
        for off in range(5):
            put(row + 3 * np.arange(m) + comp, np.arange(m) + off)
    row += 3 * m                                                    # bend
    for off in range(5):
        put(row + np.arange(m), np.arange(m) + off)
    row += m                                                        # twist
    if use_clear:
        m = len(pairs)
        put(row + np.arange(m), pairs[:, 0])
        put(row + np.arange(m), pairs[:, 1])
        row += m
    S = coo_matrix((np.ones(sum(len(a) for a in rows), bool),
                    (np.concatenate(rows), np.concatenate(cols))), shape=(row, 6 * N)).tocsr()
    return f, S


def solve(obs1, obs2, vis1, vis2, w1, w2, window_mask, init_L, init_R, params):
    N = len(init_L)
    p = dict(params)
    wbase = dict(DEFAULT_WEIGHTS)
    wbase.update(p.get('weights', {}))
    max_nfev = p.get('max_nfev', 200)
    verbose = p.get('verbose', 0)

    def stage_w(k):
        w = dict(wbase)
        if k == 1:
            w['clear'] = 0.0
            w['inext'] *= 0.1
            w['width'] *= 0.1
        elif k == 3:
            for key in ('width', 'inext', 'inplane'):
                w[key] *= 5.0
        return w

    x = np.stack([init_L, init_R], axis=1).ravel()
    history = []
    for k in (1, 2, 3):
        wts = stage_w(k)
        X = x.reshape(N, 2, 3)
        pairs = (pair_list(X[:, 0], X[:, 1], p['W'], p['h']) if wts['clear'] > 0
                 else np.zeros((0, 2), int))
        f, S = _make_problem(N, obs1, obs2, vis1, vis2, w1, w2, window_mask, p, wts, pairs)
        c0 = 0.5 * float(np.sum(f(x) ** 2))
        res = least_squares(f, x, jac_sparsity=S, method='trf', x_scale='jac',
                            loss='linear', max_nfev=max_nfev, verbose=verbose)
        x = res.x
        history.append(dict(stage=k, cost_before=c0, cost_after=float(res.cost),
                            nfev=int(res.nfev), status=int(res.status),
                            n_pairs=int(len(pairs)), n_resid=int(len(res.fun))))
    X = x.reshape(N, 2, 3)
    return dict(L=X[:, 0].copy(), R=X[:, 1].copy(), history=history)


# ================================================================ isometric solver
ISO_WEIGHTS = dict(data=1.0, iso=200.0, planar=200.0, mono=200.0, obl=50.0,
                   ruling=5.0, bend=2.0, clear=50.0)


def _unpack_iso(x, N):
    return (x[:3 * N].reshape(N, 3), x[3 * N:6 * N].reshape(N, 3), x[6 * N:7 * N], x[7 * N:8 * N])


def iso_residuals(L, R, a, b, W):
    """Unweighted isometry residuals: 4 arrays of (N-1) plus the final one (1,)."""
    e1 = _norm(L[1:] - L[:-1]) - (a[1:] - a[:-1])
    e2 = _norm(R[1:] - R[:-1]) - (b[1:] - b[:-1])
    e3 = _norm(R[:-1] - L[:-1]) - np.sqrt(W ** 2 + (b[:-1] - a[:-1]) ** 2)
    e4 = _norm(R[1:] - L[:-1]) - np.sqrt(W ** 2 + (b[1:] - a[:-1]) ** 2)
    e5 = (_norm(R[-1] - L[-1]) - np.sqrt(W ** 2 + (b[-1] - a[-1]) ** 2))[None]
    return e1, e2, e3, e4, e5


def planarity(L, R):
    e1 = L[1:] - L[:-1]
    e2 = R[:-1] - L[:-1]
    e3 = R[1:] - L[:-1]
    det = (e1 * np.cross(e2, e3)).sum(1)
    return det / (_norm(e1) * _norm(e2) * _norm(e3) + 1e-9)


def dihedral(L, R):
    """Signed dihedral angle theta_i between adjacent quad normals, i = 1..N-2."""
    m = np.cross(L[1:] - L[:-1], R[:-1] - L[:-1])
    m = m / (_norm(m)[:, None] + 1e-12)
    u = R[1:-1] - L[1:-1]
    u = u / (_norm(u)[:, None] + 1e-12)
    return np.arctan2((np.cross(m[:-1], m[1:]) * u).sum(1), (m[:-1] * m[1:]).sum(1))


def pair_list_iso(L, R, a, b, W, reach=3.0, sep=1.5):
    N = len(L)
    ca = (a + b) / 2
    C = (L + R) / 2
    I, J = np.meshgrid(np.arange(N), np.arange(N), indexing='ij')
    m = (J > I) & (np.abs(ca[I] - ca[J]) > sep * W) & (_norm(C[I] - C[J]) < reach * W)
    return np.stack([I[m], J[m]], axis=1)


def _make_problem_iso(N, obs1, obs2, vis1, vis2, w1, w2, win, p, wts, pairs, ou=None, ou_w=0.0):
    W, thk = p['W'], p['thk']
    use_ou = ou is not None and len(ou) > 0 and ou_w > 0
    if use_ou:
        ou = np.asarray(ou, int)
        sq_ou = np.sqrt(ou_w)
    sq = {k: np.sqrt(v) for k, v in wts.items()}
    dw1 = np.sqrt(wts['data'] * np.asarray(w1) * np.asarray(vis1, float))
    dw2 = np.sqrt(wts['data'] * np.asarray(w2) * np.asarray(vis2, float))
    sb = np.sqrt(wts['bend'] * np.where(np.asarray(win)[2:N - 2], 0.1, 1.0))
    use_clear = wts['clear'] > 0 and len(pairs) > 0
    if use_clear:
        pi, pj = pairs[:, 0], pairs[:, 1]

    def f(x):
        L, R, a, b = _unpack_iso(x, N)
        d1 = (project(L) - obs1) * dw1[:, None]
        d2 = (project(R) - obs2) * dw2[:, None]
        out = [d1.ravel(), d2.ravel()]
        out += [e * sq['iso'] for e in iso_residuals(L, R, a, b, W)]
        out.append(planarity(L, R) * sq['planar'])
        out.append(np.maximum(0.0, 0.5 - (a[1:] - a[:-1])) * sq['mono'])
        out.append(np.maximum(0.0, 0.5 - (b[1:] - b[:-1])) * sq['mono'])
        out.append(np.maximum(0.0, np.abs(b - a) - 2.5 * W) * sq['obl'])
        s = (b - a) / W
        out.append((s[2:] - 2 * s[1:-1] + s[:-2]) * sq['ruling'])
        th = dihedral(L, R)
        out.append((th[2:] - 2 * th[1:-1] + th[:-2]) * sb)
        if use_clear:
            d = segment_dist(L[pi], R[pi], L[pj], R[pj])
            out.append(np.maximum(0.0, 2 * thk - d) * sq['clear'])
        if use_ou:
            zc = (L[:, 2] + R[:, 2]) / 2
            out.append(np.maximum(0.0, 2 * thk - (zc[ou[:, 0]] - zc[ou[:, 1]])) * sq_ou)
        return np.concatenate(out)

    idx = np.arange(N)
    rows, cols = [], []

    def put(row_ids, ring_ids):
        for c in range(3):
            rows.append(row_ids); cols.append(3 * ring_ids + c)
            rows.append(row_ids); cols.append(3 * N + 3 * ring_ids + c)
        rows.append(row_ids); cols.append(6 * N + ring_ids)
        rows.append(row_ids); cols.append(7 * N + ring_ids)

    row = 0
    for _ in range(2):                                   # data
        for k in range(2):
            put(row + 2 * idx + k, idx)
        row += 2 * N
    m = N - 1
    for k in range(4):                                   # iso e1..e4
        for off in (0, 1):
            put(row + k * m + np.arange(m), np.arange(m) + off)
    row += 4 * m
    put(np.array([row]), np.array([N - 1])); row += 1    # iso e5
    for off in (0, 1):                                   # planarity
        put(row + np.arange(m), np.arange(m) + off)
    row += m
    for k in range(2):                                   # monotone
        for off in (0, 1):
            put(row + k * m + np.arange(m), np.arange(m) + off)
    row += 2 * m
    put(row + idx, idx); row += N                        # obliqueness
    m = N - 2
    for off in range(3):                                 # ruling smoothness
        put(row + np.arange(m), np.arange(m) + off)
    row += m
    m = N - 4
    for off in range(5):                                 # bending
        put(row + np.arange(m), np.arange(m) + off)
    row += m
    if use_clear:
        m = len(pairs)
        put(row + np.arange(m), pairs[:, 0])
        put(row + np.arange(m), pairs[:, 1])
        row += m
    if use_ou:
        m = len(ou)
        put(row + np.arange(m), ou[:, 0])
        put(row + np.arange(m), ou[:, 1])
        row += m
    Sp = coo_matrix((np.ones(sum(len(r) for r in rows), bool),
                     (np.concatenate(rows), np.concatenate(cols))), shape=(row, 8 * N)).tocsr()
    return f, Sp


def solve_iso(obs1, obs2, vis1, vis2, w1, w2, window_mask, init_L, init_R, params):
    N = len(init_L)
    p = dict(params)
    wbase = dict(ISO_WEIGHTS)
    wbase.update(p.get('weights', {}))
    max_nfev = p.get('max_nfev', 300)
    verbose = p.get('verbose', 0)
    overunder = p.get('overunder')
    ou_weight = p.get('overunder_weight', 50.0)
    tol = p.get('tol', {})

    def stage_w(k):
        w = dict(wbase)
        if k == 1:
            w['clear'] = 0.0
            w['iso'] *= 0.1
            w['planar'] *= 0.1
        elif k == 3:
            w['iso'] *= 5.0
            w['planar'] *= 5.0
        return w

    ab0 = np.arange(N) * p['h']
    x = np.concatenate([np.asarray(init_L, float).ravel(), np.asarray(init_R, float).ravel(), ab0, ab0])
    history = []
    for k in (1, 2, 3):
        wts = stage_w(k)
        L, R, a, b = _unpack_iso(x, N)
        pairs = (pair_list_iso(L, R, a, b, p['W']) if wts['clear'] > 0 else np.zeros((0, 2), int))
        ou_k = overunder if (k >= 2 and overunder is not None) else None
        f, Sp = _make_problem_iso(N, obs1, obs2, vis1, vis2, w1, w2, window_mask, p, wts, pairs, ou_k, ou_weight)
        c0 = 0.5 * float(np.sum(f(x) ** 2))
        res = least_squares(f, x, jac_sparsity=Sp, method='trf', x_scale='jac',
                            loss='linear', max_nfev=max_nfev, verbose=verbose, **tol)
        x = res.x
        history.append(dict(stage=k, cost_before=c0, cost_after=float(res.cost),
                            nfev=int(res.nfev), status=int(res.status),
                            n_pairs=int(len(pairs)), n_resid=int(len(res.fun))))
    L, R, a, b = _unpack_iso(x, N)
    return dict(L=L.copy(), R=R.copy(), a=a.copy(), b=b.copy(), history=history)
