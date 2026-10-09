"""Re-set the band ruling per ring between knots, keeping centreline and half-width.
usage: rulsched.py IN_POSE OUT_POSE KNOTS   (KNOTS: ring:spec,... spec = orig | flat | ax(x;y;z) | mirror)
mirror: exact 3D reflection of the original ruling across the plane spanned by T and e1 (when any knot is
mirror, only orig/mirror specs are allowed; orig-orig segments keep b0 exactly)."""
import json, os, sys, re
import numpy as np
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from fit3d import pose_to_world, world_to_pose, unit

src, dst, kn = sys.argv[1], sys.argv[2], sys.argv[3]
knots = []
for tok in kn.split(","):
    r, s = tok.split(":", 1)
    knots.append((int(r), s.strip()))
assert all(knots[i][0] < knots[i + 1][0] for i in range(len(knots) - 1)), "knots must increase"
P = json.load(open(src))
rg = P["variants"]["phone"]["ruled"]
n = len(rg)
L = np.array([r["L"] for r in rg], float)
R = np.array([r["R"] for r in rg], float)
Lw, Rw = pose_to_world(L), pose_to_world(R)
c = (Lw + Rw) / 2
h = np.linalg.norm(Rw - Lw, axis=1) / 2
b0 = unit(Rw - Lw)
T = unit(np.gradient(c, axis=0))
ker = np.ones(5) / 5
Ts = np.stack([np.convolve(np.pad(T[:, i], 2, mode="edge"), ker, mode="valid") for i in range(3)], 1)
T = unit(Ts)
ez = np.array([0.0, 0.0, 1.0])
A, B = knots[0][0], knots[-1][0]
e1 = np.zeros((n, 3))
e2 = np.zeros((n, 3))
for k in range(A, B + 1):
    e = unit(np.cross(ez, T[k:k + 1]))[0]
    if k == A:
        if np.dot(e, b0[A]) < 0:
            e = -e
    else:
        if np.dot(e, e1[k - 1]) < 0:
            e = -e
    e1[k] = e
    e2[k] = np.cross(T[k], e)

bm = np.zeros((n, 3))
for k in range(A, B + 1):
    bm[k] = b0[k] - 2 * np.dot(b0[k], e2[k]) * e2[k]
bm = unit(bm)
has_mirror = any(s_ == "mirror" for _, s_ in knots)
if has_mirror:
    assert all(s_ in ("orig", "mirror") or s_.startswith("ax(") for _, s_ in knots), "with mirror only orig/mirror/ax specs are allowed"
direct = np.zeros(n, bool)
bdir = np.zeros((n, 3))

def target(spec, k):
    if spec == "orig":
        return b0[k]
    if spec == "flat":
        return e1[k]
    m = re.fullmatch(r"ax\(([^;]+);([^;]+);([^)]+)\)", spec)
    assert m, "bad spec " + spec
    v = np.array([float(m.group(i)) for i in (1, 2, 3)])
    v = v / np.linalg.norm(v)
    t = v - np.dot(v, T[k]) * T[k]
    return t / np.linalg.norm(t)

def theta_spec(spec, k):
    t = target(spec, k)
    return np.arctan2(np.dot(t, e2[k]), np.dot(t, e1[k]))

theta = np.full(n, np.nan)
blends = []
for i in range(len(knots) - 1):
    k0, s0 = knots[i]
    k1, s1 = knots[i + 1]
    if has_mirror:
        ks = np.arange(k0, k1 + 1)
        if s0 == "mirror" and s1 == "mirror":
            bdir[ks] = bm[ks]
            print("segment %d..%d: mirror exact per-ring" % (k0, k1))
        elif s0 == "orig" and s1 == "orig":
            bdir[ks] = b0[ks]
            print("segment %d..%d: orig exact per-ring" % (k0, k1))
        elif s0.startswith("ax(") and s0 == s1:
            m_ = re.fullmatch(r"ax\(([^;]+);([^;]+);([^)]+)\)", s0)
            assert m_, "bad spec " + s0
            v_ = np.array([float(m_.group(j)) for j in (1, 2, 3)])
            v_ = v_ / np.linalg.norm(v_)
            seg = np.zeros((len(ks), 3))
            for j, k in enumerate(ks):
                q = v_ - np.dot(v_, T[k]) * T[k]
                seg[j] = q / np.linalg.norm(q)
            flipped = False
            if direct[k0] and np.dot(seg[0], bdir[k0]) < 0:
                seg = -seg
                flipped = True
            bdir[ks] = seg
            print("segment %d..%d: ax per-ring%s" % (k0, k1, " (sign flipped for continuity)" if flipped else ""))
        elif s0 == "mirror" and s1.startswith("ax("):
            m_ = re.fullmatch(r"ax\(([^;]+);([^;]+);([^)]+)\)", s1)
            assert m_, "bad spec " + s1
            v_ = np.array([float(m_.group(j)) for j in (1, 2, 3)])
            v_ = v_ / np.linalg.norm(v_)
            def perp(v, k):
                q = v - np.dot(v, T[k]) * T[k]
                return q / np.linalg.norm(q)
            u0e, u1e = perp(bm[k1], k1), perp(v_, k1)
            P_ = np.arctan2(np.dot(np.cross(u0e, u1e), T[k1]), np.dot(u0e, u1e))
            for k in ks:
                x = (k - k0) / (k1 - k0)
                sv_ = x * x * (3 - 2 * x)
                phi = P_ * sv_
                u0 = perp(bm[k], k)
                rot = u0 * np.cos(phi) + np.cross(T[k], u0) * np.sin(phi)
                a_ = (1 - sv_) * np.dot(bm[k], T[k])
                bdir[k] = rot * np.sqrt(max(0.0, 1 - a_ * a_)) + a_ * T[k]
                bdir[k] /= np.linalg.norm(bdir[k])
            print("segment %d..%d: mirror->ax rotation %.2f deg" % (k0, k1, np.degrees(P_)))
        else:
            assert "orig" in (s0, s1) and "mirror" in (s0, s1), "unsupported segment %s -> %s" % (s0, s1)
            ka, kb = (k0, k1) if s0 == "orig" else (k1, k0)  # ka = orig end, kb = mirror end
            def perp(v, k):
                q = v - np.dot(v, T[k]) * T[k]
                return q / np.linalg.norm(q)
            ub, vb = perp(b0[kb], kb), perp(bm[kb], kb)
            P_ = np.arctan2(np.dot(np.cross(ub, vb), T[kb]), np.dot(ub, vb))
            if abs(np.degrees(P_)) > 179:
                P_ = abs(P_)
            if s0 == "mirror":
                P_ = P_  # rotation measured at the mirror end, applied mirrored below
            for k in ks:
                x = (k - k0) / (k1 - k0)
                x = x if s0 == "orig" else 1 - x  # x=0 at orig end, 1 at mirror end
                sv_ = x * x * (3 - 2 * x)
                phi = P_ * sv_
                u0 = perp(b0[k], k)
                rot = u0 * np.cos(phi) + np.cross(T[k], u0) * np.sin(phi)
                a_ = (1 - sv_) * np.dot(b0[k], T[k]) + sv_ * np.dot(bm[k], T[k])
                bdir[k] = rot * np.sqrt(max(0.0, 1 - a_ * a_)) + a_ * T[k]
                bdir[k] /= np.linalg.norm(bdir[k])
            print("segment %d..%d: %s rotation %.2f deg" % (k0, k1, "orig->mirror" if s0 == "orig" else "mirror->orig", np.degrees(P_)))
        direct[ks] = True
        continue
    th_start = theta_spec(s0, k0) if i == 0 else theta[k0]
    if s0 == s1:
        vals = np.unwrap(np.array([theta_spec(s0, k) for k in range(k0, k1 + 1)]))
        vals = vals + 2 * np.pi * np.round((th_start - vals[0]) / (2 * np.pi))
        theta[k0:k1 + 1] = vals
        print("segment %d..%d: same spec '%s' per-ring" % (k0, k1, s0))
    else:
        th0 = th_start
        t1 = theta_spec(s1, k1)
        th1 = t1 + 2 * np.pi * np.round((th0 - t1) / (2 * np.pi))
        for k in range(k0, k1 + 1):
            x = (k - k0) / (k1 - k0)
            theta[k] = th0 + (th1 - th0) * x * x * (3 - 2 * x)
        print("segment %d..%d: rotation %.2f deg" % (k0, k1, np.degrees(th1 - th0)))
        if (s0 == "orig") != (s1 == "orig"):
            blends.append((k0, k1, s0 == "orig"))

bn = b0.copy()
for k in range(A, B + 1):
    bn[k] = np.cos(theta[k]) * e1[k] + np.sin(theta[k]) * e2[k]
for k in np.where(direct)[0]:
    bn[k] = bdir[k]
bn = unit(bn)
ang = lambda a, b: np.degrees(np.arccos(np.clip((a * b).sum(-1), -1, 1)))
sm = lambda x: x * x * (3 - 2 * x)
for k0, k1, orig_first in blends:
    for k in range(k0, k1 + 1):
        sv = sm((k - k0) / (k1 - k0))
        ba = bn[k].copy()
        if orig_first:
            u, v = b0[k], ba
            w = (1 - sv) * u + sv * v
        else:
            u, v = ba, b0[k]
            w = (1 - sv) * u + sv * v
        a = np.degrees(np.arccos(np.clip(np.dot(u, v) / (np.linalg.norm(u) * np.linalg.norm(v)), -1, 1)))
        if a > 150:
            print("WARNING: ring %d blend vectors differ by %.1f deg" % (k, a))
        bn[k] = w / np.linalg.norm(w)
    print("segment %d..%d: exact orig blend (%s)" % (k0, k1, "orig->other" if orig_first else "other->orig"))
print("angle bn[A] vs b0[A]: %.3f deg" % ang(bn[A], b0[A]))
print("angle bn[B] vs b0[B]: %.3f deg" % ang(bn[B], b0[B]))
dch = ang(bn[A + 1:B + 1], bn[A:B])
print("max per-ring change of bn: %.3f deg (at ring %d)" % (dch.max(), A + 1 + int(np.argmax(dch))))
dall = ang(bn, b0)
for k in range(A, B + 1, 5):
    print("ring %d  theta %.2f deg  angle(b0,bn) %.2f deg  bn_z %.4f" % (k, np.degrees(theta[k]), dall[k], bn[k, 2]))
Lw2, Rw2 = c - h[:, None] * bn, c + h[:, None] * bn
L2, R2 = world_to_pose(Lw2), world_to_pose(Rw2)
for k in range(A, B + 1):
    rg[k]["L"] = [float(v) for v in L2[k]]
    rg[k]["R"] = [float(v) for v in R2[k]]
json.dump(P, open(dst, "w"))
