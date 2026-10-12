#!/usr/bin/env python3
"""The AK signature as an EXPLICIT surface: every ring (centre, ruling, half width, face normal) is computed here, then
handed to the engine as a ruled pose (the engine draws exactly these edges: no curvature frames, no folds of its own, no
face-flip lottery).

Construction, End 1 -> End 2, as a chain of pieces, each starting from the previous piece's exit frame:
  connector  a C1 cubic path through design anchors (screen = the approved trace, depth = the layering), with the band's
             roll: face-on to the camera (face A or B) on straight runs, eased from / to the neighbouring pieces' frames,
             plus designed twist ramps (the S, the hidden half twist behind the left leg)
  fold       an exact paper fold (scripts/mockup/paper.py rolls) from the entry frame: the strip rolls over a crease
             (rounded, radius rho) and leaves on the far side, face flipped, 2 rho away
  helix      the wrap: half a turn round the left leg, the band's normal pointing to the leg's axis (a bracelet)
Positions only depend on the design anchors and the pieces, so nothing drifts: each connector absorbs the small
mismatch between a piece's exit and the next anchor.

  python3 surface.py <version>  ->  docs/ribbon/turns/curve/<version>/pose.json  (+ surface.npz for checks)
"""
import json, math, os, sys
import numpy as np
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "mockup"))
import paper  # noqa: E402

# ---- camera / layout (phone, 390 x 844 css; the cutout is 852 x 1846) ------------------------------------------------
VW, VH = 390.0, 844.0
D = (VH / 2) / math.tan(math.radians(26.4) / 2)  # 1799.2: the engine camera distance
SX, SY = 852.0 / VW, 1846.0 / VH
ANCHOR = dict(left=20.0, top=118.15625, width=347.21875, height=154.1875)
CAM = np.array([0.0, 0.0, D])
W = 51.0  # ribbon width, css (the engine's 34 x the pose width 1.5)
DS = 2.0  # ring spacing along the strip, css


def world(cx, cy, z):
    """cutout px + depth (css) -> world (x right, y up, z towards the camera); the point APPEARS at (cx, cy)"""
    sx, sy = cx / SX, cy / SY
    k = (D - z) / D
    return np.array([(sx - VW / 2) * k, (VH / 2 - sy) * k, z])


def screen(p):
    p = np.atleast_2d(p)
    k = D / (D - p[:, 2])
    return np.stack([(p[:, 0] * k + VW / 2) * SX, (VH / 2 - p[:, 1] * k) * SY], 1)


def unit(v):
    v = np.asarray(v, float)
    n = np.linalg.norm(v, axis=-1, keepdims=True)
    return v / np.maximum(n, 1e-12)


def smooth5(t):
    t = np.clip(t, 0.0, 1.0)
    return t * t * t * (t * (t * 6 - 15) + 10)


# ---- rings ------------------------------------------------------------------------------------------------------------
class Strip:
    """rings: centre c, tangent T, face-A normal NA, ruling direction B (unit, L -> R), half width h"""

    def __init__(self):
        self.c, self.T, self.NA, self.B, self.h, self.tag = [], [], [], [], [], []

    def add(self, c, T, NA, B, h, tag):
        self.c.append(c); self.T.append(T); self.NA.append(NA); self.B.append(B); self.h.append(h); self.tag.append(tag)

    def exit(self):
        return dict(pos=self.c[-1].copy(), T=self.T[-1].copy(), NA=self.NA[-1].copy())

    def arrays(self):
        return {k: np.array(getattr(self, k)) for k in ("c", "T", "NA", "B", "h")}, list(self.tag)


def cam_normal(c, T, face):
    """face-on normal of face A: towards the camera if face == 'A', away if 'B'"""
    v = unit(CAM - c)
    n = unit(v - (v @ T) * T)
    return n if face == "A" else -n


def roll(NA, T, th):
    return NA * math.cos(th) + np.cross(T, NA) * math.sin(th)


def roll_angle(n_from, n_to, T):
    """signed angle about T taking n_from to n_to (both perpendicular to T)"""
    return math.atan2(np.cross(n_from, n_to) @ T, n_from @ n_to)


# ---- connector: C1 cubic path + roll ------------------------------------------------------------------------------------
def catmull(P, n_per):
    """centripetal Catmull-Rom through P (first / last points are phantoms), dense samples"""
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        t0 = 0.0
        t1 = t0 + max(np.linalg.norm(p1 - p0), 1e-6) ** 0.5
        t2 = t1 + max(np.linalg.norm(p2 - p1), 1e-6) ** 0.5
        t3 = t2 + max(np.linalg.norm(p3 - p2), 1e-6) ** 0.5
        m = max(4, int(np.linalg.norm(p2 - p1) / 0.5))
        for t in np.linspace(t1, t2, m, endpoint=False):
            a1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1
            a2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2
            a3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3
            b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2
            b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3
            out.append((t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2)
    out.append(P[-2])
    return np.array(out)


def resample(Q, ds):
    seg = np.linalg.norm(np.diff(Q, axis=0), axis=1)
    s = np.concatenate([[0], np.cumsum(seg)])
    n = max(3, int(round(s[-1] / ds)) + 1)
    t = np.linspace(0, s[-1], n)
    return np.stack([np.interp(t, s, Q[:, k]) for k in range(3)], 1), s[-1]


def connector(st, start, anchors, end_T, face, twists=(), name="", end_frame=None, ease=1.2, target=None, smooth_w=0.6, wind=0, smooth_fn=None):
    """Path from start['pos'] (tangent start['T']) through `anchors` (world points) ending at anchors[-1] with tangent
    end_T. Roll: from start['NA'] eased (over `ease` W) into face-on `face`, plus twist ramps [(s0 frac, s1 frac, dtheta)],
    eased at the end into end_frame['NA'] when given."""
    P = [start["pos"]] + list(anchors)
    lead = 0.4 * np.linalg.norm(P[1] - P[0])
    tail = 0.4 * np.linalg.norm(P[-1] - P[-2])
    P = [P[0] - start["T"] * lead] + P + [P[-1] + unit(end_T) * tail]
    Q, L = resample(catmull(P, 8), DS)
    T = unit(np.gradient(Q, axis=0))
    T[0], T[-1] = unit(start["T"]), unit(end_T)
    n = len(Q)
    s = np.linspace(0, 1, n)
    # arc fraction of each anchor (nearest sample)
    afr = [float(np.argmin(np.linalg.norm(Q - p, axis=1))) / (n - 1) for p in anchors]
    # roll relative to the face-on frame of `face`; twists = [(anchor index a, anchor index b, dtheta)]
    th_tw = np.zeros(n)
    for ia, ib, dth in twists:
        a, b = afr[ia], afr[ib]
        th_tw += dth * smooth5((s - a) / max(b - a, 1e-6))
    base = np.array([cam_normal(Q[i], T[i], face) for i in range(n)])
    # target frames (e.g. the bracelet round the left leg): the roll from the face-on frame to the target, unwrapped and
    # low-passed along the strip so the band turns into / out of them gradually
    if target is not None:
        tg = np.zeros(n)
        have = np.zeros(n, bool)
        for i in range(n):
            t_ = target(i, Q[i], T[i], afr, s[i])
            if t_ is not None:
                tg[i] = roll_angle(base[i], unit(t_ - (t_ @ T[i]) * T[i]), T[i]); have[i] = True
        if have.any():
            # one continuous roll sequence: each sample's target taken at the 2 pi branch nearest the previous sample
            # (face-on samples are 0), so every transition takes the short way round unless a twist is asked for
            seq = np.zeros(n)
            prev = 0.0
            for i in range(n):
                v = tg[i] if have[i] else 0.0
                v = v - 2 * math.pi * round((v - prev) / (2 * math.pi))
                seq[i] = prev = v
            seq += 2 * math.pi * wind * have
            sigs = np.array([max(1.0, (smooth_fn(afr, s[i]) if smooth_fn else smooth_w) * W / DS) for i in range(n)])
            out = np.zeros(n)
            for i in range(n):
                k = int(4 * sigs[i])
                j0, j1 = max(0, i - k), min(n, i + k + 1)
                wgt = np.exp(-0.5 * ((np.arange(j0, j1) - i) / sigs[i]) ** 2)
                out[i] = (seq[j0:j1] * wgt).sum() / wgt.sum()
            th_tw += out
    # entry ease: the angle from the face-on frame to the incoming frame, faded out over `ease` widths
    th0 = roll_angle(base[0], unit(start["NA"] - (start["NA"] @ T[0]) * T[0]), T[0])
    fade0 = 1 - smooth5(s * L / (ease * W))
    th1 = 0.0
    fade1 = np.zeros(n)
    if end_frame is not None:
        target = unit(end_frame["NA"] - (end_frame["NA"] @ T[-1]) * T[-1])
        ref = roll(base[-1], T[-1], th_tw[-1])
        th1 = roll_angle(ref, target, T[-1])
        fade1 = smooth5(1 - (1 - s) * L / (ease * W))
    first = len(st.c) > 0
    for i in range(n):
        if first and i == 0:
            continue  # the previous piece's exit ring is this one (no duplicate ring at the join)
        th = th_tw[i] + th0 * fade0[i] + th1 * fade1[i]
        NA = roll(base[i], T[i], th)
        st.add(Q[i], T[i], NA, unit(np.cross(T[i], NA)) * -1.0, W / 2, name)
    return st.exit()


# ---- paper fold piece -----------------------------------------------------------------------------------------------------
def fold_piece(st, start, rolls, length, name):
    """exact paper strip from the entry frame (local x -> T, z -> NA): rolls = [(u, beta, rho, phi)]"""
    T0, N0 = unit(start["T"]), unit(start["NA"] - (start["NA"] @ start["T"]) * start["T"])
    R0 = np.stack([T0, np.cross(N0, T0), N0], 1)
    x = np.concatenate([Rotation.from_matrix(R0).as_rotvec(), start["pos"], np.array(rolls, float).ravel()])
    K = len(rolls)
    n = max(5, int(round(length / DS)) + 1)
    us = np.linspace(0, length, n)
    # sections: inside a roll the straight line across the strip is parallel to its crease; in the flat gaps the
    # direction rotates smoothly from one crease to the next (and from / back to the perpendicular)
    th, sK, eK, rK = [], [], [], []
    for (u, b, r, p) in rolls:
        a = (math.cos(b), math.sin(b))
        if a[1] < 0:
            a = (-a[0], -a[1])
        th.append(math.atan2(a[1], a[0]))
        sK.append(u); eK.append(u + r * abs(p) / max(math.sin(b), 1e-6))
        rK.append((W / 2) * abs(a[0] / max(a[1], 1e-6)) + 0.25 * W)

    def ang(u):
        if u < sK[0]:
            return math.pi / 2 + (th[0] - math.pi / 2) * smooth5((u - (sK[0] - rK[0])) / rK[0])
        if u > eK[-1]:
            return th[-1] + (math.pi / 2 - th[-1]) * smooth5((u - eK[-1]) / rK[-1])
        for k in range(K):
            if sK[k] <= u <= eK[k]:
                return th[k]
            if k + 1 < K and eK[k] < u < sK[k + 1]:
                return th[k] + (th[k + 1] - th[k]) * smooth5((u - eK[k]) / max(sK[k + 1] - eK[k], 1e-6))
        return math.pi / 2

    first = len(st.c) > 0
    for i, u in enumerate(us):
        if first and i == 0:
            continue
        a = ang(u)
        d = np.array([math.cos(a), math.sin(a)])
        sv = (W / 2) / max(d[1], 1e-6)
        Lp, Rp, c0, c1 = paper.surface(x, np.array([u - sv * d[0], u + sv * d[0], u - 0.25, u + 0.25]),
                                       np.array([-sv * d[1], sv * d[1], 0, 0]), K=K)
        cen = (Lp + Rp) / 2
        T = unit(c1 - c0)
        B = unit(Rp - Lp)
        NA = unit(np.cross(B, T))  # B = T x NA convention below: NA = B x T
        st.add(cen, T, NA, B, np.linalg.norm(Rp - Lp) / 2, name)
    # exit frame: T along the strip, NA = the folded normal
    e0, e1, v0, v1 = paper.surface(x, np.array([length - 0.25, length + 0.25, length, length]), np.array([0, 0, -0.25, 0.25]), K=K)
    T = unit(e1 - e0)
    NA = unit(np.cross(T, unit(v1 - v0)))
    st.c[-1] = (e0 + e1) / 2
    return dict(pos=(e0 + e1) / 2, T=T, NA=NA)


def fold_len(u0, b, rho, phi, tail=0.6):
    return u0 + rho * abs(phi) / max(math.sin(b), 0.2) + (W / 2) * abs(math.cos(b) / max(math.sin(b), 0.2)) + tail * W


def solve_fold(start, target, rho, phi, u0, beta0):
    """one fold: the crease angle beta so the strip leaves towards `target` (screen direction); the strip ends just past
    the roll (the next connector carries on from there). Returns rolls, length, cost"""
    T0, N0 = unit(start["T"]), unit(start["NA"] - (start["NA"] @ start["T"]) * start["T"])
    R0 = np.stack([T0, np.cross(N0, T0), N0], 1)
    rv = Rotation.from_matrix(R0).as_rotvec()
    tgt = screen(target)[0]

    def res(v):
        b = v[0]
        L = fold_len(u0, b, rho, phi)
        x = np.concatenate([rv, start["pos"], [u0, b, rho, phi]])
        e = paper.surface(x, np.array([L - 1.0, L]), np.zeros(2), K=1)
        se = screen(e)
        d = unit(se[1] - se[0]); want = unit(tgt - se[1])
        return [(d[0] * want[1] - d[1] * want[0]) * 50, (1 - d @ want) * 50]

    best = None
    for b in np.linspace(0.3, math.pi - 0.3, 12):
        r = least_squares(res, [b], bounds=([0.25], [math.pi - 0.25]))
        if best is None or r.cost < best.cost:
            best = r
    b = best.x[0]
    return [(u0, b, rho, phi)], fold_len(u0, b, rho, phi), best.cost


# ---- helix (the wrap round the left leg) ------------------------------------------------------------------------------------
L0c, Uc, Vc = (115.0, 1000.0), (0.45, -0.89), (0.89, 0.45)  # leg frame (cutout px): axis point, up the leg, across


def leg_world(su, sv, z):
    return world(L0c[0] + su * Uc[0] + sv * Vc[0], L0c[1] + su * Uc[1] + sv * Vc[1], z)


def helix_piece(st, start, LZ, a, b, s0, s1, name, n=90):
    """half a turn round the left leg's axis: front pass -> outer edge -> behind; the band's face-A normal points to the
    axis (a bracelet: the outer face shows on the front pass)"""
    pts = []
    for k in range(n + 1):
        ph = math.pi * k / n
        su = s0 + (s1 - s0) * (0.5 - 0.5 * math.cos(ph))
        pts.append(leg_world(su, -a * math.sin(ph), LZ + b * math.cos(ph)))
    Q, L = resample(np.array(pts), DS)
    T = unit(np.gradient(Q, axis=0))
    axis_pt = lambda q: leg_world(0, 0, LZ)  # noqa: E731 (the axis line through the leg)
    ax_dir = unit(leg_world(100, 0, LZ) - leg_world(0, 0, LZ))
    for i in range(1, len(Q)):
        r = Q[i] - axis_pt(Q[i]); r = r - (r @ ax_dir) * ax_dir  # radial, away from the axis
        NA = unit(-r - (-r @ T[i]) * T[i])  # face A towards the axis: the outer face B shows outside
        st.add(Q[i], T[i], NA, unit(np.cross(T[i], NA)) * -1.0, W / 2, name)
    return st.exit()



# ---- tilted ring fit (ringfit.py, generalised): a circle of radius R tilted by tau about the in-screen axis at alpha ------
_RING_CACHE = os.path.join(HERE, "..", "..", "docs", "ribbon", "turns", "curve", "ring_cache.json")


def fit_ring(in_p, in_d, out_p, out_d, trace, R0=50.0, min_span=2.6):
    key = json.dumps([in_p, in_d, out_p, out_d, trace, R0, min_span])
    cache = json.load(open(_RING_CACHE)) if os.path.exists(_RING_CACHE) else {}
    if key in cache:
        pts, cen = cache[key]
        return [tuple(q) for q in pts], tuple(cen)
    pts, cen = _fit_ring(in_p, in_d, out_p, out_d, trace, R0, min_span)
    cache[key] = [pts, cen]
    json.dump(cache, open(_RING_CACHE, "w"))
    return pts, cen


def _fit_ring(in_p, in_d, out_p, out_d, trace, R0=50.0, min_span=2.6):
    """A circular arc that leaves the entry line (point in_p, direction in_d; cutout px / screen dirs) tangentially and joins
    the exit line tangentially, fitted to `trace` (cutout points). Orthographic design in css units. Returns the arc as
    cutout xy + relative depth samples, its centre (cutout xy, depth) and the tilt."""
    Kc = 2.185
    tr = np.array(trace, float) / Kc
    L1p, L1d = np.array(in_p, float) / Kc, unit(np.array(in_d, float))
    L2p, L2d = np.array(out_p, float) / Kc, unit(np.array(out_d, float))

    def ring(R, tau, al):
        a = np.array([math.cos(al), math.sin(al)]); ap = np.array([-a[1], a[0]])
        p = lambda th: (R * (math.cos(th) * a + math.sin(th) * math.cos(tau) * ap), R * math.sin(th) * math.sin(tau))  # noqa: E731
        def t(th):
            v = R * (-math.sin(th) * a + math.cos(th) * math.cos(tau) * ap)
            return v / max(np.linalg.norm(v), 1e-9)
        return p, t

    ths = np.linspace(0, 2 * math.pi, 1441)

    def solve_th(t, d):
        return ths[int(np.argmax([t(x) @ d for x in ths]))]

    def build_(v, n):
        R, tau, al = v
        p, t = ring(R, tau, al)
        th0, th1 = solve_th(t, L1d), solve_th(t, L2d)
        if th1 <= th0:
            th1 += 2 * math.pi
        Dv = p(th1)[0] - p(th0)[0]
        cr = lambda w: w[0] * L2d[1] - w[1] * L2d[0]  # noqa: E731
        sdist = -cr(L1p + Dv - L2p) / cr(L1d)
        Ein = L1p + sdist * L1d
        C = Ein - p(th0)[0]
        return [(C + p(th)[0], p(th)[1]) for th in np.linspace(th0, th1, n)], th0, th1, C

    def cost(v):
        try:
            pts, th0, th1, _ = build_(v, 50)
        except Exception:
            return 1e9
        P = np.array([q[0] for q in pts])
        dmin = [np.min(np.linalg.norm(P - q, axis=1)) for q in tr]
        return float(np.mean(np.square(dmin))) + 50 * max(0, min_span - (th1 - th0)) ** 2

    from scipy.optimize import minimize
    best = None
    for tau in (0.7, 0.9, 1.1, 2.0, 2.4):
        for al in np.linspace(-math.pi, math.pi, 9):
            r = minimize(cost, [R0, tau, al], method="Nelder-Mead", options=dict(maxiter=400))
            if best is None or r.fun < best.fun:
                best = r
    pts, th0, th1, C = build_(best.x, 16)
    R, tau, al = best.x
    print("  ring: cost %.1f  R %.2f W  tilt %.0f deg  sweep %.0f deg" % (best.fun, R / W, math.degrees(tau), math.degrees(th1 - th0)))
    return [(float(q[0][0] * Kc), float(q[0][1] * Kc), float(q[1])) for q in pts], (float(C[0] * Kc), float(C[1] * Kc))


# ---- the design ------------------------------------------------------------------------------------------------------------
def fold_auto(st, ex, target, rho, z_want, u0, name, phim=0.999):
    """a flat fold (phi = +-pi) towards `target`, the side chosen so the far layer lands nearest depth z_want"""
    best = None
    for phi in (math.pi * phim, -math.pi * phim):
        rolls, L, cost = solve_fold(ex, target, rho=rho, phi=phi, u0=u0, beta0=1.2)
        T0, N0 = unit(ex["T"]), unit(ex["NA"] - (ex["NA"] @ ex["T"]) * ex["T"])
        R0 = np.stack([T0, np.cross(N0, T0), N0], 1)
        x = np.concatenate([Rotation.from_matrix(R0).as_rotvec(), ex["pos"], np.array(rolls[0])])
        ze = paper.surface(x, np.array([L]), np.zeros(1), K=1)[0][2]
        sc = abs(ze - z_want) + 100 * cost
        if best is None or sc < best[0]:
            best = (sc, rolls, L, ze)
    _, rolls, L, ze = best
    print("  %s: beta %.0f deg phi %+.0f deg  exit z %.0f (wanted %.0f)" % (name, math.degrees(rolls[0][1]), math.degrees(rolls[0][3]), ze, z_want))
    return fold_piece(st, ex, rolls, L, name)


def solve_double(ex, x_out, d_out, trace, z_mid_max, z_out, rho_lo, rho_hi):
    """the bottom-K double fold: 2 rolls from the entry frame, leaving at x_out (cutout) heading d_out (screen), the loop
    through `trace` (cutout points), its middle section behind (z <= z_mid_max) and steep, the exit at depth z_out"""
    T0, N0 = unit(ex["T"]), unit(ex["NA"] - (ex["NA"] @ ex["T"]) * ex["T"])
    R0 = np.stack([T0, np.cross(N0, T0), N0], 1)
    rv, p0 = Rotation.from_matrix(R0).as_rotvec(), ex["pos"]
    d_out = unit(np.array(d_out, float)); x_out = np.array(x_out, float); trace = np.array(trace, float)

    def xv(v):
        L, u1, b1, r1, p1, du, b2, r2, p2 = v
        return np.concatenate([rv, p0, [u1, b1, r1, p1, u1 + du, b2, r2, p2]]), L

    def res(v):
        x, L = xv(v)
        us = np.linspace(0, L, 70)
        C = paper.surface(x, us, np.zeros_like(us), K=2)
        S_ = screen(C)
        dd = unit(S_[-1] - S_[-2])
        r = list((S_[-1] - x_out) / 5.0)
        r += [(dd[0] * d_out[1] - dd[1] * d_out[0]) * 20, (1 - dd @ d_out) * 20]
        r.append((C[-1][2] - z_out) / 8.0)
        A_ = paper.surface(x, np.array([L - 0.5, L, L, L]), np.array([0, 0, -0.5, 0.5]), K=2)
        ne = unit(np.cross(A_[1] - A_[0], A_[3] - A_[2]))
        ve = unit(CAM - C[-1])
        r.append(max(0.0, 0.7 - abs(ne @ ve)) * 4)  # the K band starts near face-on (no twist right after the fold)
        mid = C[len(C) // 2][2]
        r.append(max(0.0, mid - z_mid_max) / 6.0)
        r += [np.min(np.linalg.norm(S_ - q, axis=1)) / 15.0 for q in trace]
        for f in (0.42, 0.5, 0.58):
            um = f * L
            A_ = paper.surface(x, np.array([um - 0.5, um + 0.5, um, um]), np.array([0, 0, -0.5, 0.5]), K=2)
            nn = unit(np.cross(A_[1] - A_[0], A_[3] - A_[2]))
            r.append(max(0.0, abs(nn[2]) - 0.5) * 6)
        _, _, rr = paper.unpack(x, 2)
        ramp = lambda b: (W / 2) * abs(1 / math.tan(b)) + 0.3 * W  # noqa: E731
        r.append(min(0.0, rr[0][0] - ramp(rr[0][1])) / 3.0)
        end2 = rr[1][0] + rr[1][2] * abs(rr[1][3]) / math.sin(rr[1][1])
        r.append(min(0.0, L - end2 - ramp(rr[1][1])) / 3.0)
        r += list(np.minimum(paper.overlap_gaps(x, W, K=2) - 4.0, 0) / 2.0)
        return r

    best = None
    for sg in ((1, 1), (-1, -1), (1, -1), (-1, 1)):
        for b1 in (0.6, 1.0, 2.1, 2.5):
            for b2 in (0.6, 1.0, 1.4, 2.0, 2.5):
                lo = [200, 5, 0.25, rho_lo * W, -2.7, 60, 0.25, rho_lo * W, -2.7]
                hi = [560, 160, math.pi - 0.25, rho_hi * W, 2.7, 300, math.pi - 0.25, rho_hi * W, 2.7]
                for j, k in ((0, 4), (1, 8)):
                    if sg[j] > 0: lo[k], hi[k] = 1.2, 2.7
                    else: lo[k], hi[k] = -2.7, -1.2
                x0 = [380, 60, b1, (rho_lo + 0.1) * W, sg[0] * 1.9, 150, b2, (rho_lo + 0.1) * W, sg[1] * 1.9]
                try:
                    r = least_squares(res, x0, bounds=(lo, hi), max_nfev=250)
                except Exception:
                    continue
                if best is None or r.cost < best.cost:
                    best = r
    x, L = xv(best.x)
    _, _, rr = paper.unpack(x, 2)
    print("  bottom-K double fold: cost %.2f L %.0f  rolls %s" % (best.cost, L, [(round(u), round(math.degrees(b)), round(r / W, 2), round(math.degrees(p))) for u, b, r, p in rr]))
    return [tuple(r) for r in rr], L


def build(stage=99):
    st = Strip()
    LZ = -24.0  # left leg plane
    # 1. tail (face A) -> the S bend -> the sweep: one smooth path; the band rolls over its edge AFTER the bend's apex,
    #    spread along the start of the sweep (edge-on only where the path is nearly straight: no pinch), face B after
    tail = [world(265, 1846, 430), world(350, 1700, 300), world(478, 1600, 200), world(600, 1540, 150)]
    S = [world(700, 1488, 126), world(762, 1420, 110), world(770, 1350, 100), world(730, 1300, 92)]
    sweep = [world(640, 1268, 86), world(520, 1240, 76), world(400, 1208, 62), world(280, 1182, 46)]
    p0 = world(200, 1960, 540)
    start = dict(pos=p0, T=unit(tail[0] - p0), NA=cam_normal(p0, unit(tail[0] - p0), "A"))
    st.add(start["pos"], start["T"], start["NA"], unit(np.cross(start["T"], start["NA"])) * -1.0, W / 2, "tail")
    fl_entry = world(170, 1162, 32)
    anchors = tail + S + sweep + [fl_entry]
    ex = connector(st, start, anchors, unit(world(110, 1152, 30) - fl_entry), "A",
                   twists=[(TW_A, TW_B, TW_SIGN * math.pi)], name="tail-S-sweep")
    if stage < 2:
        return st, ex
    # 2. far-left fold up into the left leg (face A), the leg 2 rho behind the sweep
    ex = fold_auto(st, ex, world(250, 720, LZ), 0.6 * W, 32 - 1.2 * W, 0.6 * W, "far-left")
    # 3. left leg (face A) to the apex
    ap_entry = world(318, 600, LZ)
    ex = connector(st, ex, [world(215, 820, LZ), ap_entry], unit(ap_entry - world(215, 820, LZ)), "A", name="left-leg")
    # 4. apex fold down into the right leg (face B), frontmost
    RZ = LZ + 1.2 * W
    ex = fold_auto(st, ex, world(480, 950, RZ), 0.6 * W, RZ, 0.5 * W, "apex")
    # 5. right leg (face B) down to the bottom-K ring
    bk, bkc = fit_ring((531, 1105), (0.244, 0.970), (553, 937), (-0.79, -0.61),
                       [(565, 1169), (616, 1204), (680, 1207), (732, 1171), (753, 1122), (718, 1068)], R0=52.0)
    bz0 = RZ - 6.0 - bk[0][2]
    bk_pts = [world(x, y, z + bz0) for x, y, z in bk]
    bk_c = world(bkc[0], bkc[1], bz0)
    ex = connector(st, ex, [world(470, 900, RZ), bk_pts[0]], unit(bk_pts[1] - bk_pts[0]), "B", name="right-leg")
    if stage < 3:
        return st, ex
    # 6-12. one continuous path: the bottom-K RING (a tilted bracelet: outer face B on the near arc, the inner face A on the
    #       far arc) -> K band -> junction (behind the right leg) -> crossbar -> the wrap round the left leg (bracelet) ->
    #       the hidden half twist -> the return -> junction -> top-K front -> the top-K RING (bracelet, tilted back) -> the
    #       back section and the end strand (face A), tip hidden behind the right leg
    BZ = -20.0
    hx = []
    for k in range(1, 7):
        ph = math.pi * k / 6
        su = 208.0 + (WR_S1 - 208.0) * (0.5 - 0.5 * math.cos(ph))
        hx.append(leg_world(su, -WR_A * math.sin(ph), LZ + 30.0 * math.cos(ph) - 14.0 * (1 - math.cos(ph)) / 2))
    pre = [world(611, 968, -18), world(553, 937, BZ), world(468, 911, BZ), world(374, 883, BZ - 4), world(290, 840, -4),
           leg_world(208.0, 0.0, LZ + 30.0)]
    post = [world(140, 1056, -74), world(200, 1046, -62), world(254, 1036, -46), world(346, 992, -12), world(429, 938, 2),
            world(482, 893, 8), world(543, 843, 10)]
    tk, tkc = fit_ring((610, 789), (0.777, -0.629), (709, 854), (-0.639, 0.769),
                       [(716, 717), (770, 702), (797, 711), (777, 759), (744, 810)], R0=40.0, min_span=2.8)
    tz0 = 12.0 - tk[0][2]
    tk_pts = [world(x, y, z + tz0) for x, y, z in tk]
    tk_c = world(tkc[0], tkc[1], tz0)
    tb = screen(tk_pts[-1])[0]
    td = unit(np.array([-0.639, 0.769]))
    end_pts = [world(*(tb + 90 * td), tk_pts[-1][2] - 4), world(*(tb + 180 * td), tk_pts[-1][2] - 6)]
    end = world(505, 1012, tk_pts[-1][2] - 6)  # the tip, fully behind the right leg
    anchors = bk_pts[1:] + pre + hx + post + tk_pts + end_pts + [end]
    nb = len(bk_pts) - 1
    i_b1 = nb - 1  # the bottom-K ring ends (anchor index)
    i_h0, i_h1 = nb + len(pre) - 1, nb + len(pre) + len(hx)  # the bracelet round the left leg
    i_t0 = nb + len(pre) + len(hx) + len(post)  # the top-K ring starts
    i_t1 = i_t0 + len(tk_pts) - 1
    ax0, axd = leg_world(0, 0, LZ), unit(leg_world(100, 0, LZ) - leg_world(0, 0, LZ))

    def ring_axis(pts):
        P_ = np.array(pts); Cc = P_.mean(0)
        _, _, vt = np.linalg.svd(P_ - Cc)
        return unit(vt[2])

    bk_ax, tk_ax = ring_axis(bk_pts), ring_axis(tk_pts)

    def cone(q, cen, ax, psi):
        """face-A normal of a conical band on the ring: the inward radial tilted by psi towards the axis; the axis sign is
        chosen so the band turns towards the camera (a lampshade seen from the front shows its faces broad)"""
        rin = -unit(q - cen); rin = unit(rin - (rin @ ax) * ax)
        v = unit(CAM - q)
        best = None
        for sg in (1, -1):
            n_ = unit(rin * math.cos(psi) + sg * ax * math.sin(psi))
            sc = abs(n_ @ v)
            if best is None or sc > best[0]:
                best = (sc, n_)
        return best[1]

    def frames(i, q, t, afr, si):
        if si <= afr[i_b1]:
            return cone(q, bk_c, bk_ax, BK_PSI)  # bottom-K ring: a lampshade band, face A inside
        if afr[i_h0] <= si <= afr[i_h1]:
            r = q - ax0; r = r - (r @ axd) * axd
            return -unit(r)  # the wrap: face A towards the leg's axis
        if afr[i_t0] <= si <= afr[i_t1]:
            return cone(q, tk_c, tk_ax, TK_PSI)  # top-K ring: a lampshade band, face A inside
        if si > afr[i_t1]:
            return roll(cam_normal(q, t, "A"), t, END_ROLL)  # the back section / end strand: face A, turned away (a dark sliver)
        return None

    def sm_fn(afr, si):
        return 1.0 if afr[i_h1] - 0.005 < si < afr[i_h1 + 3] else WR_SMOOTH

    ex = connector(st, ex, anchors, unit(end - end_pts[-1]), "B", name="bk-kband-crossbar-wrap-return-topk-end",
                   target=frames, smooth_w=WR_SMOOTH, wind=WR_WIND, smooth_fn=sm_fn, ease=0.3)
    return st, ex


WR_A, WR_S1, TK_RHO, TK_PHIM, WR_SMOOTH, WR_WIND = 70.0, -40.0, 0.8, 0.82, 0.5, 0
TK_R, TK_TILT = 0.62, 35.0
BK_PSI, TK_PSI = math.radians(float(os.environ.get('BK_PSI', 0))), math.radians(float(os.environ.get('TK_PSI', 0)))
END_ROLL = math.radians(float(os.environ.get('END_ROLL', 60)))
WR_SMOOTH = 0.8




TW_A, TW_B, TW_SIGN = [int(v) for v in os.environ.get("SURF_TW", "5,10,1").split(",")]  # anchors: 0-3 tail, 4-7 S (apex ~5-6), 8-11 sweep, 12 far-left entry


S_RHO, S_PHI, S_U0, S_BETA = 0.8, -2.6, 20.0, 1.2


def emit(st, out_path):
    A, tags = st.arrays()
    c, B, h = A["c"], A["B"], A["h"]
    Lw, Rw = c - B * h[:, None], c + B * h[:, None]
    rings = []
    for Lp, Rp in zip(Lw, Rw):
        r = []
        for P in (Lp, Rp):
            sxy = screen(P)[0]
            r.append([round((sxy[0] / SX - ANCHOR["left"]) / ANCHOR["width"], 5), round((sxy[1] / SY - ANCHOR["top"]) / ANCHOR["height"], 5),
                      round(P[2] / ANCHOR["height"], 5)])
        rings.append(dict(L=r[0], R=r[1]))
    pose = dict(version=1, name="ak-surface", anchor="hero-name", notes="explicit surface (scripts/curve/surface.py)",
                orientation="curvature", variants=dict(phone=dict(points=[], faceSign=1, ruled=rings)))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    json.dump(pose, open(out_path, "w"))
    np.savez(out_path.replace("pose.json", "surface.npz"), **A, tags=np.array(tags))
    return len(rings)


if __name__ == "__main__":
    ver = sys.argv[1] if len(sys.argv) > 1 else "s0"
    st, ex = build(int(sys.argv[2]) if len(sys.argv) > 2 else 99)
    out = os.path.join(HERE, "..", "..", "docs", "ribbon", "turns", "curve", ver, "pose.json")
    print(os.path.abspath(out), emit(st, out), "rings")
