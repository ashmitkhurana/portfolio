"""Exact developable paper-fold primitive, parametrised like the synthetic GT (solve3d_synth.make_gt).

A flat strip of width W (strip direction +x, v across, E1 at v = -W/2, E2 at v = +W/2) is folded about an axis through
(u0, 0) at flat angle beta relative to the strip direction: layer 1 flat (Xp <= 0), half-cylinder roll of radius rho
(0 < Xp < pi*rho), layer 2 flat and offset by 2*rho (Xp >= pi*rho), then placed by the rigid pose (rotvec, t).
Xp = (q - q0) . ap is the flat distance from the axis; ap = (sin beta, -cos beta).
p = [rotvec(3), t(3), beta, rho, u0].   s = +1/-1 mirrors the z offset (layer 2 toward / away from +z).
"""
import numpy as np
from scipy.spatial.transform import Rotation

W_DEFAULT = 112.0


def fold_flat(q, q0, a, ap, rho, s=1.0):
    """Same construction as solve3d_synth.fold; q (M,2) flat -> (M,3), z optionally mirrored by s."""
    Xp = (q - q0) @ ap
    Yp = (q - q0) @ a
    out = np.zeros((len(q), 3))
    base = q0[None] + Yp[:, None] * a[None]
    flat = Xp <= 0
    mid = (Xp > 0) & (Xp < np.pi * rho)
    top = Xp >= np.pi * rho
    out[flat, :2] = q[flat]
    phi = Xp[mid] / rho
    out[mid, :2] = base[mid] + (rho * np.sin(phi))[:, None] * ap[None]
    out[mid, 2] = s * rho * (1 - np.cos(phi))
    out[top, :2] = base[top] - (Xp[top] - np.pi * rho)[:, None] * ap[None]
    out[top, 2] = s * 2 * rho
    return out


def fold_surface(p, u, v, s=1.0):
    """3D points of flat coordinates (u, v) (arrays, same shape (M,)) for parameters p."""
    p = np.asarray(p, float)
    beta, rho, u0 = p[6], p[7], p[8]
    a = np.array([np.cos(beta), np.sin(beta)])
    ap = np.array([np.sin(beta), -np.cos(beta)])
    q = np.stack([np.asarray(u, float), np.asarray(v, float)], 1)
    P = fold_flat(q, np.array([u0, 0.0]), a, ap, rho, s)
    return P @ Rotation.from_rotvec(p[:3]).as_matrix().T + p[3:6]


def fold_points(p, u_samples, W=W_DEFAULT, s=1.0):
    """(L, R) edge points at flat-u values u_samples: L = E1 (v = -W/2), R = E2 (v = +W/2)."""
    u = np.asarray(u_samples, float)
    return fold_surface(p, u, np.full(len(u), -W / 2), s), fold_surface(p, u, np.full(len(u), W / 2), s)
