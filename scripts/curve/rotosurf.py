#!/usr/bin/env python3
"""The AK straight from the APPROVED trace (docs/ribbon/turns/out_v9/edges_v3.json): each ring's two edge points are the
trace's matched cross-section (E1, E2) exactly where they appear in the mockup; only DEPTH is added:
  - the band's roll at each ring comes from the trace's own foreshortening: signed projected width w = W cos(theta)
    (narrower = more tilted; the edges crossing = flipped), and sigma (per stretch) says which edge comes forward;
  - the centre depth follows the owner's layering (right leg in front, the K strands and the hidden layers behind it,
    the crossbar in front of the left leg, the wrap behind it, ...); the tail's depth comes from its perspective width.
So the silhouette is the mockup's by construction, as real 3D the engine renders live (a ruled pose).

  rotosurf.py <version>  ->  docs/ribbon/turns/curve/<version>/pose.json
"""
import json, math, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
VW, VH = 390.0, 844.0
D = (VH / 2) / math.tan(math.radians(26.4) / 2)
SX, SY = 852.0 / VW, 1846.0 / VH
ANCHOR = dict(left=20.0, top=118.15625, width=347.21875, height=154.1875)
W_CSS = 51.0
W_CUT = W_CSS * SX  # 111.4 cutout px at z = 0
TAIL_ZMAX = float(os.environ.get('TAIL_ZMAX', 260))  # capped (r14). TAIL_ZMAX=1100 = the true depth: the S then rounds like the mockup (r17), but the near tail renders pale (distance-dependent lighting) and steps (noisy depth from width)

d = json.load(open(os.path.join(HERE, "..", "..", "docs", "ribbon", "turns", "out_v9", "edges_v3.json")))
P = np.array(d["pairs"], float)  # (n, 2 [E1, E2], 2 [x, y]) cutout px
IV = np.array(d["pair_interval"])
n = len(P)


def gsmooth(a, sig):
    if sig <= 0:
        return a
    k = int(4 * sig)
    g = np.exp(-0.5 * (np.arange(-k, k + 1) / sig) ** 2); g /= g.sum()
    pad = np.pad(a, [(k, k)] + [(0, 0)] * (a.ndim - 1), mode="edge")
    return np.stack([np.convolve(pad[:, j], g, mode="valid") for j in range(a.shape[1])], 1) if a.ndim > 1 else np.convolve(pad, g, mode="valid")


# ---- rings: the approved cross-sections outside the turn windows; inside each window the true (slanted) rulings: pair
#      edge-1 point i with edge-2 point j(i), j monotone, chosen so the projected rulings reach the window's roll outline
#      (a rolled band's silhouette is the envelope of its rulings, beyond both edges)
E1, E2 = np.array(d["edge1"], float), np.array(d["edge2"], float)
LM = d["landmarks"]
SIL = {sl["turn"]: np.array(sl["pts"], float) for sl in d["silhouettes"]}
WINDOWS = [("s_in", "s_out", "s"), ("fl_in", "fl_out", "farleft"), ("apex_in", "apex_out", "apex"), ("bk_in", "bk_out", "bottomk"),
           ("wrap_in", "j2_in", "wrap"), ("tk_in", "tk_out", "topk")]
from scipy.optimize import minimize  # noqa: E402


def seg_dist(q, A, B):
    ab = B - A
    t = np.clip(((q - A) * ab).sum(1) / np.maximum((ab * ab).sum(1), 1e-9), 0, 1)
    return np.linalg.norm(A + ab * t[:, None] - q, axis=1)


def window_rings(a1, b1, a2, b2, sil, nr):
    t = np.linspace(0, 1, nr)
    i1 = a1 + (b1 - a1) * t
    K = 4

    def jmap(c):
        f = t + sum(c[k] * np.sin((k + 1) * np.pi * t) for k in range(K))
        f = np.maximum.accumulate(np.clip(f, 0, 1))  # monotone
        return a2 + (b2 - a2) * f

    def pts(c):
        A = np.stack([np.interp(i1, np.arange(len(E1)), E1[:, k]) for k in range(2)], 1)
        j = jmap(c)
        B = np.stack([np.interp(j, np.arange(len(E2)), E2[:, k]) for k in range(2)], 1)
        return A, B

    def cost(c):
        A, B = pts(c)
        cov = 0.0
        if sil is not None:
            # each roll-outline point should be ON the band's projected region's boundary: reached by some ruling
            cov = sum(np.min(seg_dist(q, A, B)) ** 2 for q in sil)
        return cov + 50.0 * float(np.sum(np.square(c)))

    best = None
    for c0 in ([0, 0, 0, 0], [0.15, 0, 0, 0], [-0.15, 0, 0, 0], [0, 0.1, 0, 0], [0, -0.1, 0, 0]):
        r = minimize(cost, np.array(c0, float), method="Nelder-Mead", options=dict(maxiter=600, xatol=1e-4))
        if best is None or r.fun < best.fun:
            best = r
    A, B = pts(best.x)
    return A, B, best


VIS1, VIS2 = np.array(d["vis1"], bool), np.array(d["vis2"], bool)


def densify(poly, m):
    P_ = np.array(poly, float)
    sl = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(P_, axis=0), axis=1))])
    u = np.linspace(0, sl[-1], m)
    return np.stack([np.interp(u, sl, P_[:, k]) for k in range(2)], 1)


def outline_rings(a1, b1, a2, b2, sil, nr):
    """rulings TANGENT to the roll outline (a rolled band's silhouette is the envelope of its rulings): through each outline
    point along its tangent, from the visible edge, just past the outline to the hidden edge; blended into the window's
    end sections. Returns L (edge-1 side) and R (edge-2 side) per ring."""
    vis1 = VIS1[int(a1):int(b1) + 1].mean() if b1 > a1 else 1
    vis2 = VIS2[int(a2):int(b2) + 1].mean() if b2 > a2 else 1
    ev_is1 = vis1 >= vis2  # the edge that stays visible along the outline
    Ev = E1[int(a1):int(b1) + 1] if ev_is1 else E2[int(a2):int(b2) + 1]
    O = densify(sil, 40)
    O = gsmooth(O, 1.5)
    tau = np.gradient(O, axis=0); tau /= np.linalg.norm(tau, axis=1, keepdims=True)
    rul = []
    for q, t in zip(O, tau):
        # the line q + s t meets the visible edge polyline: nearest crossing (either direction)
        best = None
        for i in range(len(Ev) - 1):
            p0, p1 = Ev[i], Ev[i + 1]
            M = np.array([t, p0 - p1]).T
            if abs(np.linalg.det(M)) < 1e-9:
                continue
            sv, uv = np.linalg.solve(M, p0 - q)
            if 0 <= uv <= 1 and abs(sv) < 2.6 * W_CUT and (best is None or abs(sv) < abs(best[0])):
                best = (sv, i + uv)
        if best is None:
            continue
        sv, ia = best
        A = q + sv * t
        Bf = q - 0.12 * sv * t  # just past the outline: the hidden edge
        rul.append((ia, A, Bf))
    rul.sort(key=lambda r: r[0])
    # the window's end sections (approved pairs at its landmarks)
    A0, B0 = E1[int(a1)], E2[int(a2)]
    A1, B1 = E1[int(b1)], E2[int(b2)]
    if not ev_is1:
        A0, B0, A1, B1 = B0, A0, B1, A1
    seqA = [A0] + [r[1] for r in rul] + [A1]
    seqB = [B0] + [r[2] for r in rul] + [B1]
    seqA, seqB = np.array(seqA), np.array(seqB)
    # resample to nr rings along the visible-edge arc
    sl = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(seqA, axis=0), axis=1) + np.linalg.norm(np.diff(seqB, axis=0), axis=1))])
    u = np.linspace(0, sl[-1], nr)
    A = np.stack([np.interp(u, sl, seqA[:, k]) for k in range(2)], 1)
    B = np.stack([np.interp(u, sl, seqB[:, k]) for k in range(2)], 1)
    A, B = gsmooth(A, 2.0), gsmooth(B, 2.0)
    A[0], B[0], A[-1], B[-1] = seqA[0], seqB[0], seqA[-1], seqB[-1]
    return (A, B) if ev_is1 else (B, A), len(rul), ev_is1


EXTEND = set(os.environ.get('EXTEND', 'none').split(','))  # 'bottomk,wrap' extends hidden-edge rulings to the roll outlines (experimental, not yet right)
REPAIR = set(os.environ.get('REPAIR', 's,farleft').split(','))  # windows whose rulings are re-paired (the others keep the approved pairs)
OUTLINE_WINDOWS = set(os.environ.get('OUTLINE_WINDOWS', '').split(','))
Lr, Rr, IVr = [], [], []
pp, piv = P, IV
# pairs of the non-window intervals, in order; windows inserted where their interval index sits (1, 3, 5, 7, 11, 14)
win_iv = {1: 0, 3: 1, 5: 2, 7: 3, 11: 4, 14: 5}
for k in range(16):
    if k in win_iv and WINDOWS[win_iv[k]][2] in REPAIR:
        a, b, name = WINDOWS[win_iv[k]]
        nr = int((IV == k).sum())
        if name in OUTLINE_WINDOWS and name in SIL:
            (A, B), nrul, ev1 = outline_rings(LM[a]["i1"], LM[b]["i1"], LM[a]["i2"], LM[b]["i2"], SIL[name], max(nr, 30))
            print("  window %-8s rings %3d  outline rulings %d (visible edge %s)" % (name, len(A), nrul, "1" if ev1 else "2"))
        else:
            A, B, res = window_rings(LM[a]["i1"], LM[b]["i1"], LM[a]["i2"], LM[b]["i2"], SIL.get(name), max(nr, 30))
            print("  window %-8s rings %3d  outline cost %.1f" % (name, len(A), res.fun))
    else:
        m = IV == k
        A, B = P[m, 0], P[m, 1]
    Lr.append(A); Rr.append(B); IVr += [k] * len(A)
Lraw, Rraw, IV = np.concatenate(Lr), np.concatenate(Rr), np.array(IVr)
n = len(Lraw)

# ---- where a window's outer edge rolls out of sight, the band's visible boundary is the roll outline: extend those rulings
#      from the visible edge out to the outline (the band then fills the mockup's silhouette)
PAIR_HID = np.zeros((len(P), 2), bool)
_e1i = np.array([np.argmin(np.linalg.norm(E1 - q, axis=1)) for q in P[:, 0]])
_e2i = np.array([np.argmin(np.linalg.norm(E2 - q, axis=1)) for q in P[:, 1]])
PAIR_HID[:, 0], PAIR_HID[:, 1] = ~VIS1[_e1i], ~VIS2[_e2i]


def ray_hit(B, A, O):
    """first crossing of the ray B -> A (beyond A, up to 2.2x) with the polyline O; None if none"""
    d_ = A - B
    best = None
    for i in range(len(O) - 1):
        p0, p1 = O[i], O[i + 1]
        Mx = np.array([d_, p0 - p1]).T
        if abs(np.linalg.det(Mx)) < 1e-9:
            continue
        t, u = np.linalg.solve(Mx, p0 - B)
        if 0 <= u <= 1 and 0.85 <= t <= 2.2 and (best is None or t < best):
            best = t
    return None if best is None else B + best * d_


for name, kiv in (("bottomk", 7), ("wrap", 11)):
    if name not in EXTEND or name not in SIL:
        continue
    O = gsmooth(densify(SIL[name], 60), 1.5)
    idx = np.where(IV == kiv)[0]
    ext = np.zeros(len(idx))
    for j, i in enumerate(idx):
        for side in (0, 1):
            if PAIR_HID[i, side]:
                A = Lraw[i] if side == 0 else Rraw[i]
                B = Rraw[i] if side == 0 else Lraw[i]
                h = ray_hit(B, A, O)
                if h is not None:
                    if side == 0:
                        Lraw[i] = h
                    else:
                        Rraw[i] = h
                    ext[j] = 1
    print("  %s: %d of %d rulings extended to the roll outline" % (name, int(ext.sum()), len(idx)))

# ---- the owner-approved paper sections (msfit: S, F, A, P): their TRUE rulings replace the rings they cover (exact screen
#      shape and roll relief); their own depths were never mutually consistent, so only their relief is kept and they are
#      re-seated on the layering below. Cross-faded into the neighbouring rings over a few rings at each end.
RELZ = np.full((n, 2), np.nan)
SECS = []
FADE = float(os.environ.get("FADE", 14))
APPROVED = [s_ for s_ in os.environ.get("APPROVED", "S:S_APPROVED,F:F_APPROVED,A:A_APPROVED,P:P_APPROVED").split(",") if s_]
if APPROVED:
    import importlib
    sys.path.insert(0, os.path.join(HERE, "..", "mockup"))
    _argv = sys.argv; sys.argv = ["msfit.py", "noop"]
    M = importlib.import_module("msfit")
    sys.argv = _argv
    pr = M.SecPrb()
    srcs = []  # (ring lo, ring hi, screen L, screen R, z L, z R)
    for item in APPROVED:
        nm, fn = item.split(":") if ":" in item else (item, item + "_APPROVED")
        sec = pr.bind(nm)
        xs = M.ldx(pr, M.sec_path(fn))
        lo_, hi_ = int(sec.lo), int(sec.hi)  # the section's full fitted range (overlaps its neighbours)
        u_lo = float(pr.F(xs, np.array([pr.tau[lo_]]))[0]); u_hi = float(pr.F(xs, np.array([pr.tau[hi_]]))[0])
        rr = M.sec_rulings(pr, xs, sec, u_lo=u_lo, u_hi=u_hi, hidden=False)
        L3, R3 = rr["L"], rr["R"]
        pL, pR = M.AP.project(L3), M.AP.project(R3)
        m = hi_ - lo_ + 1
        tt = np.linspace(0, 1, len(L3)); tq = np.linspace(0, 1, m)
        res = lambda A: np.stack([np.interp(tq, tt, A[:, k]) for k in range(A.shape[1])], 1)  # noqa: E731
        srcs.append((lo_, hi_, int(sec.r0), int(sec.r1), res(pL), res(pR), res(L3[:, 2:3])[:, 0], res(R3[:, 2:3])[:, 0], nm))
    # weights: each section 1 over its own rings, ramping to 0 across the overlap with its neighbour (or over FADE rings into
    # the trace where it has none); the trace fills the rest. Everything blended (normalised).
    wsum = np.zeros(n)
    accL, accR = np.zeros((n, 2)), np.zeros((n, 2))
    zsrc = []
    for lo_, hi_, r0, r1, sL, sR, zl, zr, nm in srcs:
        idx = np.arange(lo_, hi_ + 1)
        nb_lo = any(o[1] >= lo_ and o[0] < lo_ and o[8] != nm for o in srcs)
        nb_hi = any(o[0] <= hi_ and o[1] > hi_ and o[8] != nm for o in srcs)
        a0, a1 = (lo_, r0 + (r0 - lo_)) if nb_lo else (r0, r0 + FADE)
        b1, b0 = (hi_, r1 - (hi_ - r1)) if nb_hi else (r1, r1 - FADE)
        w_ = np.clip(np.minimum((idx - a0) / max(a1 - a0, 1), (b1 - idx) / max(b1 - b0, 1)), 0, 1)
        w_ = w_ * w_ * (3 - 2 * w_)
        wsum[idx] += w_
        accL[idx] += sL * w_[:, None]; accR[idx] += sR * w_[:, None]
        zsrc.append((idx, w_, zl, zr))
        print("  approved %s: rings %d..%d (own %d..%d)" % (nm, lo_, hi_, r0, r1))
    wt = np.clip(1 - wsum, 0, 1)
    tot = np.maximum(wsum + wt, 1e-9)
    Lraw = (Lraw * wt[:, None] + accL) / tot[:, None]
    Rraw = (Rraw * wt[:, None] + accR) / tot[:, None]
    SECW = (wt, tot)
    if False:
        print("  approved %s: rings %d..%d  relief %.0f..%.0f" % (nm, r0, r1, np.nanmin(RELZ[r0:r1 + 1]), np.nanmax(RELZ[r0:r1 + 1])))
L2 = gsmooth(Lraw, float(os.environ.get('EDGE_SIG', 3.5)))
R2 = gsmooth(Rraw, float(os.environ.get('EDGE_SIG', 3.5)))
C2 = (L2 + R2) / 2
T2 = np.gradient(gsmooth(C2, 3.0), axis=0)
T2 /= np.linalg.norm(T2, axis=1, keepdims=True)
N2 = np.stack([-T2[:, 1], T2[:, 0]], 1)  # screen perpendicular
w = ((R2 - L2) * N2).sum(1)  # signed projected width, cutout px

def ax_sign(axis, ref):
    return float(axis[:2] @ ref[:2]) >= 0


# ---- centre depth by stretch (keys: interval -> (z at its start, z at its end)); windows interpolate between neighbours ---
LZ, RZ, BZ, MZ, EZ = -24.0, 37.0, -20.0, 12.0, -58.0
KEYS = {
    1: (None, 88.0),  # S window: from the tail's end to the sweep
    2: (88.0, 46.0),  # sweep (in front of the right leg's foot)
    3: (46.0, LZ),  # far-left fold: the leg behind the sweep
    4: (LZ, LZ),  # left leg
    5: (LZ, RZ),  # apex fold: the right leg in front
    6: (RZ, RZ),  # right leg, frontmost
    7: (RZ, -18.0),  # bottom-K loop: back behind the right leg
    8: (-18.0, BZ),  # K band
    9: (BZ, BZ),  # junction 1 (hidden behind the right leg)
    10: (BZ, LZ + 30.0),  # crossbar, onto the front of the left leg
    11: (LZ + 30.0, -46.0),  # the wrap: round the leg, behind it, out as the return
    12: (-12.0, MZ - 2.0),  # junction 2 (return -> top-K front), in front of the crossbar
    13: (MZ - 2.0, MZ),  # top-K front strand
    14: (MZ, EZ),  # top-K loop: over the top and back behind
    15: (EZ, EZ),  # end strand (tip hidden behind the right leg)
}
zc = np.zeros(n)
# tail: from its perspective width (face-on there): k = w / W_CUT, z = D (1 - 1/k)
m0 = IV == 0
k0 = np.clip(np.abs(w[m0]) / W_CUT, 1.0, 3.5)
zc[m0] = gsmooth(np.minimum(D * (1 - 1 / k0), TAIL_ZMAX), 6.0)  # capped: the silhouette is fixed anyway, and a tail right at the camera blows out
for kk, (a, b) in KEYS.items():
    m = np.where(IV == kk)[0]
    if not len(m):
        continue
    if a is None:
        a = zc[m[0] - 1]
    t = np.linspace(0, 1, len(m))
    zc[m] = a + (b - a) * (t * t * (3 - 2 * t))
# the wrap: dip behind the leg in the middle of its window (front pass -> curl at the edge -> behind -> out)
m11 = np.where(IV == 11)[0]
t11 = np.linspace(0, 1, len(m11))
zc[m11] += -40.0 * np.sin(np.pi * np.clip((t11 - 0.15) / 0.6, 0, 1)) ** 2
# the junction-2 start continues the wrap's end (no step)
m12 = np.where(IV == 12)[0]
zc[m12] += (zc[m11[-1]] - zc[m12[0]]) * (1 - np.linspace(0, 1, len(m12))) ** 2
zc = gsmooth(zc, 4.0)

# ---- roll: cos(theta) = w / true projected width; sigma: which edge comes forward, per stretch ----------------------------
kz = D / (D - zc)
cth = np.clip(w / (W_CUT * kz), -1.0, 1.0)
th = gsmooth(np.arccos(cth), float(os.environ.get('ROLL_SIG', 5)))
SIGMA = {int(k): int(v) for k, v in (kv.split(":") for kv in os.environ.get("SIGMA", "").split(",") if kv)}
sig = np.array([SIGMA.get(int(i), 1) for i in IV], float)
sig = gsmooth(sig, 6.0)
dz = sig * W_CSS * np.sin(th)
zL, zR = zc - dz / 2, zc + dz / 2

# ---- the bottom-K loop as a CYLINDER BAND: a ring of ribbon (scripts/curve/ringfit.py, fitted to the trace's loop centreline)
#      whose width runs along the ring's axis, so the band stays broad all round and shows its inner face on the far side
if os.environ.get("BK_RING", "1") == "1":  # experimental (r11: the 12-ring fade fights the trace pairs; ring arc != interval 7 extent)
    rf = json.load(open(os.path.join(HERE, "..", "..", "docs", "ribbon", "turns", "curve", "ringfit.json")))
    Rr_, tau, al = rf["R"], rf["tau"], rf["alpha"]
    a_ = np.array([math.cos(al), math.sin(al), 0.0]); ap_ = np.array([-math.sin(al), math.cos(al), 0.0])
    # ring in screen-css xy (y down) + depth: p(th) = R (cos th a + sin th (cos tau ap + sin tau z))
    e2 = math.cos(tau) * ap_ + np.array([0, 0, math.sin(tau)])
    axis = np.cross(a_, e2); axis /= np.linalg.norm(axis)
    P0 = np.array(rf["pts"], float)  # cutout xy, rel z (start .. end of the arc)
    Pc = np.stack([P0[:, 0] / SX, P0[:, 1] / SY, P0[:, 2]], 1)
    idx = np.where(IV == 7)[0]
    tq = np.linspace(0, 1, len(idx)); tp = np.linspace(0, 1, len(Pc))
    cen = np.stack([np.interp(tq, tp, Pc[:, k]) for k in range(3)], 1)
    cen[:, 2] += zc[idx[0]] - cen[0, 2]
    # the band's width direction = the axis; sign so L -> R matches the incoming trace ring
    # sign from the EXIT (the K band's edge order); the ruling turns from the right leg's own ruling into the ring's axis over
    # the first part of the loop (the roll at the leg's foot), then stays on the axis (a cylinder band) to the exit
    trE = np.array([*(R2[idx[-1]] - L2[idx[-1]]) / SX, 0.0])
    ax = axis if ax_sign(axis, trE) else -axis
    i0 = idx[0]
    r0v = np.array([(R2[i0, 0] - L2[i0, 0]) / SX, (R2[i0, 1] - L2[i0, 1]) / SY, zR[i0] - zL[i0]]); r0v /= np.linalg.norm(r0v)
    hw = W_CSS / 2 * float(os.environ.get('BK_WSCALE', 1.0))
    tin = float(os.environ.get('BK_TURN', 0.3))
    rul = []
    for t in tq:
        f = min(1.0, t / tin); f = f * f * (3 - 2 * f)
        v = r0v * (1 - f) + ax * f
        rul.append(v / np.linalg.norm(v))
    rul = np.array(rul)
    Lc, Rc = cen - rul * hw, cen + rul * hw
    fd = np.minimum(1.0, np.minimum(np.arange(len(idx)) / float(os.environ.get('BK_FADE', 3)), np.arange(len(idx))[::-1] / float(os.environ.get('BK_FADE_OUT', 25))))
    fd = fd * fd * (3 - 2 * fd)
    for j, i in enumerate(idx):
        f = fd[j]
        L2[i] = L2[i] * (1 - f) + Lc[j, :2] * SX * f
        R2[i] = R2[i] * (1 - f) + Rc[j, :2] * SX * f
        zL[i] = zL[i] * (1 - f) + Lc[j, 2] * f
        zR[i] = zR[i] * (1 - f) + Rc[j, 2] * f
    print("  bottom-K cylinder band: R %.2f W, tilt %.0f deg, %d rings" % (Rr_ / W_CSS, math.degrees(tau), len(idx)))
# each approved section keeps its own 3D (folds, layer offsets, roll relief); a depth ramp along it makes it meet the layering
# at its own ends; blended with the same weights as the screen positions
if APPROVED:
    wt, tot = SECW
    accZL, accZR = zL * wt, zR * wt
    for idx, w_, zl, zr in zsrc:
        zs = (zl + zr) / 2
        k = 10
        off0 = zc[idx[:k]].mean() - zs[:k].mean()
        off1 = zc[idx[-k:]].mean() - zs[-k:].mean()
        ramp = off0 + (off1 - off0) * np.linspace(0, 1, len(idx))
        accZL[idx] += (zl + ramp) * w_
        accZR[idx] += (zr + ramp) * w_
    zL, zR = accZL / tot, accZR / tot

def _unused():
    pass


def anchor_xyz(cx, cy, z):
    sx, sy = cx / SX, cy / SY
    return [round((sx - ANCHOR["left"]) / ANCHOR["width"], 5), round((sy - ANCHOR["top"]) / ANCHOR["height"], 5), round(z / ANCHOR["height"], 5)]


rings = [dict(L=anchor_xyz(L2[i, 0], L2[i, 1], zL[i]), R=anchor_xyz(R2[i, 0], R2[i, 1], zR[i])) for i in range(n)]
ver = sys.argv[1] if len(sys.argv) > 1 else "r0"
out = os.path.join(HERE, "..", "..", "docs", "ribbon", "turns", "curve", ver, "pose.json")
os.makedirs(os.path.dirname(out), exist_ok=True)
json.dump(dict(version=1, name="ak-roto", anchor="hero-name", notes="approved trace edges + designed depth (scripts/curve/rotosurf.py)",
               orientation="curvature", variants=dict(phone=dict(points=[], faceSign=1, ruled=rings))), open(out, "w"))
np.savez(out.replace("pose.json", "roto.npz"), L2=L2, R2=R2, zL=zL, zR=zR, zc=zc, th=th, w=w, iv=IV)
print(os.path.abspath(out), n, "rings;  tail z %.0f..%.0f" % (zc[m0].max(), zc[m0].min()))
