"""Twist primitive: a band along a straight or circular centreline whose ruling direction rotates about the tangent.

Local frame: centreline C(s) in the xy plane, C(0) = origin, tangent T(s) = (cos ks, sin ks, 0), in-plane normal
N(s) = (-sin ks, cos ks, 0), Z = (0, 0, 1); k = curvature (1/Rc, 0 = straight). Ruling direction
r(s) = cos(psi) N + sin(psi) Z with psi(s) = psi0 + phi * clip((s - s0) / Ls, 0, 1) (twist only inside [s0, s0 + Ls];
constant before/after). Band point (s, v) = C(s) + v r(s); edge points at v = -/+ W/2 (L / R, matching the hinge model,
where R is on the +N side).
p = [rotvec(3), t(3), kappa, psi0, phi, s0, Ls]   (11). Not exactly developable; an initialisation only.
"""
import numpy as np
from scipy.spatial.transform import Rotation

W_DEFAULT = 112.0


def twist_surface(p, s, v):
    """World points for arc-length s and across-strip coordinate v (arrays (M,))."""
    p = np.asarray(p, float)
    s = np.asarray(s, float)
    v = np.broadcast_to(np.asarray(v, float), s.shape)
    kap, psi0, phi, s0, Ls = p[6], p[7], p[8], p[9], p[10]
    ks = kap * s
    small = np.abs(kap) < 1e-9
    ksafe = np.where(small, 1.0, kap)
    cx = np.where(small, s, np.sin(ks) / ksafe)
    cy = np.where(small, 0.0, (1 - np.cos(ks)) / ksafe)
    psi = psi0 + phi * np.clip((s - s0) / max(Ls, 1e-6), 0.0, 1.0)
    cp, sp = np.cos(psi), np.sin(psi)
    P = np.stack([cx - v * cp * np.sin(ks), cy + v * cp * np.cos(ks), v * sp], 1)
    return P @ Rotation.from_rotvec(p[:3]).as_matrix().T + p[3:6]


def twist_points(p, u_samples, W=W_DEFAULT):
    """(L, R) edge points at arc-length samples u_samples: L at v = -W/2, R at v = +W/2."""
    u = np.asarray(u_samples, float)
    return twist_surface(p, u, np.full(len(u), -W / 2)), twist_surface(p, u, np.full(len(u), W / 2))
