#!/usr/bin/env python3
"""Paper model: a flat strip (width W, centreline flat coordinate u, edges v = -W/2 (E1/L) .. +W/2 (E2/R)) folded by a chain of K roll
segments, then a global rigid pose.

Parameters x = [rotvec(3), t(3)] + K * [u_k, beta_k, rho_k, phi_k].
Roll k: axis line through (u_k, 0) in the flat domain at angle beta_k to the strip direction (a = (cos b, sin b), beyond-direction
ap = (sin b, -cos b), so beta in (0, pi) keeps 'beyond' on the +u side). Xp = (q - q0).ap is the flat distance past the axis.
  Xp <= 0              : flat (in the frame of the previous segment)
  0 < Xp < rho*|phi|   : wrapped on a cylinder of radius rho through the signed angle phi
  Xp >= rho*|phi|      : flat again, in the rotated frame (rigid transform E_k)
World(q) = pose( E_1 o ... o E_{k-1} o M_k(q) ): exact isometry, C1 across the roll boundaries.
"""
import numpy as np
from scipy.spatial.transform import Rotation

BETA_LO, BETA_HI = 0.2, np.pi - 0.2


def unpack(x, K):
    x = np.asarray(x, float)
    return x[:3], x[3:6], x[6:6 + 4 * K].reshape(K, 4)


def roll_frame(u, beta, rho, phi):
    a = np.array([np.cos(beta), np.sin(beta)])
    ap = np.array([np.sin(beta), -np.cos(beta)])
    sg = 1.0 if phi >= 0 else -1.0
    return np.array([u, 0.0]), a, ap, sg, rho * abs(phi)


def roll_E(q0, a, ap, sg, rho, phi):
    """rigid map (R_E, t_E) taking flat q3 = (q, 0) beyond the roll end to the rotated frame."""
    ph = abs(phi)
    tvec = np.array([np.cos(ph) * ap[0], np.cos(ph) * ap[1], sg * np.sin(ph)])
    a3 = np.array([a[0], a[1], 0.0])
    n3 = np.cross(tvec, a3)
    Rb = np.stack([tvec, a3, n3], 1)
    B = np.stack([np.array([ap[0], ap[1], 0.0]), a3, np.array([0, 0, 1.0])], 1)
    RE = Rb @ B.T
    E0 = np.array([q0[0] + rho * np.sin(ph) * ap[0], q0[1] + rho * np.sin(ph) * ap[1], sg * rho * (1 - np.cos(ph))])
    qe = np.array([q0[0] + rho * ph * ap[0], q0[1] + rho * ph * ap[1], 0.0])
    return RE, E0 - RE @ qe


def surface(x, u, v, K=3):
    """3D points of flat coordinates (u, v) (arrays of the same shape); returns (M, 3) for flattened input."""
    rv, tr, rolls = unpack(x, K)
    u = np.asarray(u, float).ravel(); v = np.asarray(v, float).ravel()
    q = np.stack([u, v], 1)
    out = np.zeros((len(q), 3))
    active = np.ones(len(q), bool)
    Rc, tc = np.eye(3), np.zeros(3)
    for k in range(K):
        q0, a, ap, sg, L = roll_frame(*rolls[k])
        rho, phi = rolls[k, 2], rolls[k, 3]
        Xp = (q - q0) @ ap
        Yp = (q - q0) @ a
        flat = active & (Xp <= 0)
        mid = active & (Xp > 0) & (Xp < L)
        P = np.zeros((len(q), 3))
        P[flat, :2] = q[flat]
        t = Xp[mid] / rho
        P[mid, :2] = q0[None] + Yp[mid, None] * a[None] + (rho * np.sin(t))[:, None] * ap[None]
        P[mid, 2] = sg * rho * (1 - np.cos(t))
        done = flat | mid
        out[done] = P[done] @ Rc.T + tc
        active = active & ~done
        RE, tE = roll_E(q0, a, ap, sg, rho, phi)
        tc = Rc @ tE + tc
        Rc = Rc @ RE
    if active.any():
        q3 = np.concatenate([q[active], np.zeros((active.sum(), 1))], 1)
        out[active] = q3 @ Rc.T + tc
    return out @ Rotation.from_rotvec(rv).as_matrix().T + tr


def edges(x, u, W, K=3):
    u = np.asarray(u, float)
    return surface(x, u, np.full(len(u), -W / 2), K), surface(x, u, np.full(len(u), W / 2), K)


def roll_span_u(x, W, K=3):
    """per roll: (lo, hi) of the u-interval that the roll region covers anywhere across the strip, and the arc length."""
    _, _, rolls = unpack(x, K)
    out = []
    for u, b, r, p in rolls:
        c = 1.0 / np.tan(b)
        s = [u + v * c for v in (-W / 2, W / 2)]
        arc = r * abs(p) / np.sin(b)
        out.append((min(s), max(s) + arc, r * abs(p)))
    return out


def overlap_gaps(x, W, K=3):
    """flat-domain gap (css, along u) between the end line of roll k and the start line of roll k+1 at both strip edges; >= 0 = no overlap."""
    _, _, rolls = unpack(x, K)
    g = []
    for k in range(K - 1):
        u0, b0, r0, p0 = rolls[k]
        u1, b1, r1, p1 = rolls[k + 1]
        for v in (-W / 2, W / 2):
            end_k = u0 + v / np.tan(b0) + r0 * abs(p0) / np.sin(b0)
            start_n = u1 + v / np.tan(b1)
            g.append(start_n - end_k)
    return np.array(g)


def _rich(f, h):
    """Richardson-extrapolated central difference of f at step h (error O(h^4))."""
    return (4 * (f(h / 2) ) - f(h)) / 3


def _boundary_ts(x, p0, p1, K):
    """parameters s in (0,1) where the flat segment p0 -> p1 crosses a roll start/end line."""
    _, _, rolls = unpack(x, K)
    ts = [0.0, 1.0]
    d = p1 - p0
    for u, b, r, p in rolls:
        q0, a, ap, sg, L = roll_frame(u, b, r, p)
        den = d @ ap
        if abs(den) < 1e-14:
            continue
        for lvl in (0.0, L):
            s = (lvl - (p0 - q0) @ ap) / den
            if 0 < s < 1:
                ts.append(float(s))
    return np.unique(ts)


def isometry_test(x, W, u_range, n=4000, seed=0, K=3):
    """(1) first fundamental form of the (u,v) -> 3D map: max |J^T J - I| with Richardson central differences (h = 2e-3 -> 1e-3),
    over random points at least 1e-2 from a roll boundary line; (2) the 3D length of random straight flat segments (split at the roll
    boundaries, 60-point Gauss-Legendre per piece, 25 pieces, |dP/ds| by Richardson central differences) vs the flat length."""
    rng = np.random.default_rng(seed)
    _, _, rolls = unpack(x, K)
    u = rng.uniform(*u_range, n); v = rng.uniform(-W / 2, W / 2, n)
    q = np.stack([u, v], 1)
    ok = np.ones(n, bool)
    for ru, b, r, p in rolls:
        q0, a, ap, sg, L = roll_frame(ru, b, r, p)
        Xp = (q - q0) @ ap
        ok &= (np.abs(Xp) > 1e-2) & (np.abs(Xp - L) > 1e-2)
    u, v = u[ok], v[ok]
    Pu = _rich(lambda h: (surface(x, u + h, v, K) - surface(x, u - h, v, K)) / (2 * h), 2e-3)
    Pv = _rich(lambda h: (surface(x, u, v + h, K) - surface(x, u, v - h, K)) / (2 * h), 2e-3)
    E = (Pu * Pu).sum(1) - 1; G = (Pv * Pv).sum(1) - 1; F = (Pu * Pv).sum(1)
    e_fund = float(max(np.abs(E).max(), np.abs(G).max(), np.abs(F).max()))
    gl_x, gl_w = np.polynomial.legendre.leggauss(60)
    errs = []
    for _ in range(40):
        p0 = np.array([rng.uniform(*u_range), rng.uniform(-W / 2, W / 2)])
        p1 = np.array([rng.uniform(*u_range), rng.uniform(-W / 2, W / 2)])
        d = p1 - p0
        Lf = np.linalg.norm(d); dh = d / Lf
        cuts = _boundary_ts(x, p0, p1, K)
        pieces = np.unique(np.concatenate([np.linspace(c0, c1, 26) for c0, c1 in zip(cuts[:-1], cuts[1:])]))
        tot = 0.0
        for a_, b_ in zip(pieces[:-1], pieces[1:]):
            s = 0.5 * (b_ - a_) * gl_x + 0.5 * (a_ + b_)
            qq = p0[None] + s[:, None] * d[None]
            f = lambda h: (surface(x, qq[:, 0] + h * dh[0], qq[:, 1] + h * dh[1], K) - surface(x, qq[:, 0] - h * dh[0], qq[:, 1] - h * dh[1], K)) / (2 * h)
            dp = _rich(f, 2e-3)
            tot += 0.5 * (b_ - a_) * (gl_w * np.linalg.norm(dp, axis=1)).sum() * Lf
        errs.append(abs(tot - Lf))
    return dict(max_abs_JtJ_minus_I=e_fund, max_abs_len_err_GL=float(max(errs)), n_pts=int(ok.sum()), n_segments=40)
