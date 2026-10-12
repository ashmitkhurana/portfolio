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
ALIGN = os.environ.get("ALIGN", "1") == "1"  # 1: resample each approved section onto the trace's rings by ARCLENGTH (not ring index) and map its ends/own range onto the trace (default on for S only = r31; aligning F/A/P adds seams, r28)
ALIGN_SECS = set(os.environ.get("ALIGN_SECS", "S").split(","))  # sections ALIGN applies to
ALIGN_ENDS = set(e_.strip() for e_ in os.environ.get("ALIGN_ENDS", "").split(",") if e_.strip())  # "NAME:lo" / "NAME:hi": a listed section aligns only the named ends by position (the other end keeps its original ring index); an unlisted section aligns both ends (F:lo tried in r35 work: resampling F's interior adds kinks at rings 288-290; rejected)
Lraw_a, Rraw_a = Lraw.copy(), Rraw.copy()  # stage a: the trace rings before the sections are crossfaded in
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
        if not ALIGN or nm not in ALIGN_SECS:
            srcs.append((lo_, hi_, int(sec.r0), int(sec.r1), res(pL), res(pR), res(L3[:, 2:3])[:, 0], res(R3[:, 2:3])[:, 0], nm))
            continue
        # ALIGN: locate the source's ends on the trace by position, resample the source onto those rings by arclength
        r0, r1 = int(sec.r0), int(sec.r1)
        Ct = (Lraw + Rraw) / 2  # trace midline (stage a: Lraw/Rraw are still the pure trace here)
        dst_ = np.linalg.norm(np.diff(Ct, axis=0), axis=1)
        if os.environ.get("ALIGN_DEDUP", "0") == "1":  # a zero-length step (the duplicate ring at an interval boundary) stalls the resampled source one ring: z (not smoothed later) then kinks; give it the mean of its neighbours' length
            for j_ in np.where(dst_ < 1e-6)[0]:
                dst_[j_] = 0.5 * (dst_[max(j_ - 1, 0)] + dst_[min(j_ + 1, len(dst_) - 1)])
        st_ = np.concatenate([[0], np.cumsum(dst_)])  # zero-length steps add zero
        Cs = (pL + pR) / 2
        ss_ = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(Cs, axis=0), axis=1))])

        def nearest_ring(q, c):
            a_, b_ = max(0, c - 60), min(n - 1, c + 60)
            return a_ + int(np.argmin(np.linalg.norm(Ct[a_:b_ + 1] - q, axis=1)))
        sec_ends = [e_ for e_ in ALIGN_ENDS if e_.split(":")[0] == nm]
        al_lo = (not sec_ends) or (nm + ":lo") in ALIGN_ENDS
        al_hi = (not sec_ends) or (nm + ":hi") in ALIGN_ENDS
        i_start = nearest_ring(Cs[0], lo_) if al_lo else lo_
        i_end = nearest_ring(Cs[-1], hi_) if al_hi else hi_
        assert i_end > i_start, "ALIGN %s: degenerate ring range %d..%d" % (nm, i_start, i_end)
        ns = len(pL)

        def src_mid(r):  # the source midpoint at the old ring r's fractional index position
            fr = float(np.clip((r - lo_) / max(hi_ - lo_, 1), 0, 1)) * (ns - 1)
            return np.array([np.interp(fr, np.arange(ns), Cs[:, k]) for k in range(2)])
        seg = np.arange(i_start, i_end + 1)

        def ring_near(q):
            return int(seg[int(np.argmin(np.linalg.norm(Ct[seg] - q, axis=1)))])
        r0a = ring_near(src_mid(r0)) if al_lo else r0
        r1a = ring_near(src_mid(r1)) if al_hi else r1
        span_t = st_[i_end] - st_[i_start]
        fidx = (seg - i_start) / float(i_end - i_start)
        if span_t > 1e-9:
            f_ = (st_[seg] - st_[i_start]) / span_t
        else:
            f_ = fidx
        sq = f_ * ss_[-1]
        itp = lambda A: np.stack([np.interp(sq, ss_, A[:, k]) for k in range(A.shape[1])], 1)  # noqa: E731
        print("  align %s: lo %d->%d hi %d->%d own %d..%d -> %d..%d" % (nm, lo_, i_start, hi_, i_end, r0, r1, r0a, r1a))
        srcs.append((i_start, i_end, r0a, r1a, itp(pL), itp(pR), itp(L3[:, 2:3])[:, 0], itp(R3[:, 2:3])[:, 0], nm))
    # weights: each section 1 over its own rings, ramping to 0 across the overlap with its neighbour (or over FADE rings into
    # the trace where it has none); the trace fills the rest. Everything blended (normalised).
    wsum = np.zeros(n)
    accL, accR = np.zeros((n, 2)), np.zeros((n, 2))
    zsrc = []
    for lo_, hi_, r0, r1, sL, sR, zl, zr, nm in srcs:
        idx = np.arange(lo_, hi_ + 1)
        nb_lo = any(o[1] >= lo_ and o[0] < lo_ and o[8] != nm for o in srcs)
        nb_hi = any(o[0] <= hi_ and o[1] > hi_ and o[8] != nm for o in srcs)
        a0, a1 = (lo_, r0 + (r0 - lo_)) if nb_lo else (r0, r0 + (float(os.environ.get('FADE_S_LO', 35)) if nm == 'S' else FADE))
        if ALIGN and 'S' in ALIGN_SECS and nm == 'S' and not nb_lo:  # the fade-in completes before the pinned trace R of the re-paired 's' window
            a1 = float(os.environ.get('S_FADE_END', 148))
            a0 = max(lo_, a1 - float(os.environ.get('FADE_S_LO', 35)))
        b1, b0 = (hi_, r1 - (hi_ - r1)) if nb_hi else (r1, r1 - FADE)
        w_ = np.clip(np.minimum((idx - a0) / max(a1 - a0, 1), (b1 - idx) / max(b1 - b0, 1)), 0, 1)
        w_ = w_ * w_ * (3 - 2 * w_)
        wsum[idx] += w_
        accL[idx] += sL * w_[:, None]; accR[idx] += sR * w_[:, None]
        zsrc.append((idx, w_, zl, zr, nm))
        print("  approved %s: rings %d..%d (own %d..%d)" % (nm, lo_, hi_, r0, r1))
    wt = np.clip(1 - wsum, 0, 1)
    tot = np.maximum(wsum + wt, 1e-9)
    Lraw = (Lraw * wt[:, None] + accL) / tot[:, None]
    Rraw = (Rraw * wt[:, None] + accR) / tot[:, None]
    SECW = (wt, tot)
    if False:
        print("  approved %s: rings %d..%d  relief %.0f..%.0f" % (nm, r0, r1, np.nanmin(RELZ[r0:r1 + 1]), np.nanmax(RELZ[r0:r1 + 1])))
EQS = os.environ.get("EQS", "125:230,620:700")  # "a:b": rings a..b keep both edge polylines but are re-paired at equal arclength FRACTIONS of each edge (kills the fan of rulings where one edge advances slowly), blended in/out over EQS_RAMP rings (default 125:230 ramp 20 = r35: removes the S fan and softens the ridge at the S's inner corner) (default 125:230,620:700 = r38: the second window removes the ruling fan/crease at the A right leg's foot)
if EQS:
    def _rang(L_, R_):
        a_ = np.arctan2(*(R_ - L_)[:, ::-1].T)
        return np.degrees((np.diff(a_) + np.pi) % (2 * np.pi) - np.pi)
    def _resamp(P_, t_):
        d_ = np.linalg.norm(np.diff(P_, axis=0), axis=1)
        s_ = np.concatenate([[0], np.cumsum(d_)]); s_ /= s_[-1]
        keep = np.concatenate([[True], d_ > 1e-9])  # ignore zero-length steps
        return np.stack([np.interp(t_, s_[keep], P_[keep, k_]) for k_ in range(P_.shape[1])], axis=1)
    def _ss(x_):
        x_ = np.clip(x_, 0, 1); return x_ * x_ * (3 - 2 * x_)
    for w_ in EQS.split(","):  # "a:b[:ramp][,a:b[:ramp]...]"
        f_ = w_.split(":")
        ea, eb = int(f_[0]), int(f_[1])
        er = int(f_[2]) if len(f_) > 2 else int(os.environ.get("EQS_RAMP", 20))
        ti = (np.arange(ea, eb + 1) - ea) / float(eb - ea)
        Lq, Rq = _resamp(Lraw[ea:eb + 1], ti), _resamp(Rraw[ea:eb + 1], ti)
        k_ = np.arange(eb - ea + 1)
        ew = _ss(np.minimum(k_, (eb - ea) - k_) / float(max(er, 1)))
        ang0 = np.abs(_rang(Lraw[ea:eb + 1], Rraw[ea:eb + 1])).max()
        Lraw[ea:eb + 1] = Lraw[ea:eb + 1] + ew[:, None] * (Lq - Lraw[ea:eb + 1])
        Rraw[ea:eb + 1] = Rraw[ea:eb + 1] + ew[:, None] * (Rq - Rraw[ea:eb + 1])
        ang1 = np.abs(_rang(Lraw[ea:eb + 1], Rraw[ea:eb + 1])).max()
        print("  EQS %d..%d ramp %d: max ruling-angle step before %.2f deg, after %.2f deg" % (ea, eb, er, ang0, ang1))
L2 = gsmooth(Lraw, float(os.environ.get('EDGE_SIG', 3.5)))
R2 = gsmooth(Rraw, float(os.environ.get('EDGE_SIG', 3.5)))
EDGE_SIGW = os.environ.get("EDGE_SIGW", "490:535:8")  # "a:b:sigma[,...]": rings a..b of the smoothed edges are blended toward a wider gsmooth(raw, sigma) (smoothstep(min(k,n-k)/10) weight) (default 490:535:8 = r39: rounds the A apex's top-left corner)
if EDGE_SIGW:
    def _ssw(x_):
        x_ = np.clip(x_, 0, 1); return x_ * x_ * (3 - 2 * x_)
    for w_ in EDGE_SIGW.split(","):
        f_ = w_.split(":")
        wa, wb, wsg = int(f_[0]), int(f_[1]), float(f_[2])
        Ls_, Rs_ = gsmooth(Lraw, wsg), gsmooth(Rraw, wsg)
        k_ = np.arange(wb - wa + 1)
        ew = _ssw(np.minimum(k_, (wb - wa) - k_) / 10.0)
        L2[wa:wb + 1] = L2[wa:wb + 1] + ew[:, None] * (Ls_[wa:wb + 1] - L2[wa:wb + 1])
        R2[wa:wb + 1] = R2[wa:wb + 1] + ew[:, None] * (Rs_[wa:wb + 1] - R2[wa:wb + 1])
        print("  EDGE_SIGW %d..%d sigma %g" % (wa, wb, wsg))
EDGE_SIGW1 = os.environ.get("EDGE_SIGW1", "")  # "a:b:sigma:L|R[,...]": like EDGE_SIGW but only the named edge (default off)
if EDGE_SIGW1:
    def _ssw(x_):
        x_ = np.clip(x_, 0, 1); return x_ * x_ * (3 - 2 * x_)
    for w_ in EDGE_SIGW1.split(","):
        f_ = w_.split(":")
        wa, wb, wsg, we_ = int(f_[0]), int(f_[1]), float(f_[2]), f_[3].strip().upper()
        k_ = np.arange(wb - wa + 1)
        ew = _ssw(np.minimum(k_, (wb - wa) - k_) / 10.0)
        if we_ == "L":
            Ls_ = gsmooth(Lraw, wsg)
            L2[wa:wb + 1] = L2[wa:wb + 1] + ew[:, None] * (Ls_[wa:wb + 1] - L2[wa:wb + 1])
        else:
            Rs_ = gsmooth(Rraw, wsg)
            R2[wa:wb + 1] = R2[wa:wb + 1] + ew[:, None] * (Rs_[wa:wb + 1] - R2[wa:wb + 1])
        print("  EDGE_SIGW1 %d..%d sigma %g edge %s" % (wa, wb, wsg, we_))
L2_TR, R2_TR = L2.copy(), R2.copy()
if os.environ.get("DUMP_EDGES"):
    np.savez(os.environ["DUMP_EDGES"], L2=L2, R2=R2, Lraw_a=Lraw_a, Rraw_a=Rraw_a, IV=IV)
# the tail's width: the mockup widens it ~4x (artistic perspective a face-on strip can't have); taper the band's width
# smoothly over the tail -> S so the narrowing reads as perspective, never as a crease at the S
TW_SIG = float(os.environ.get("TAIL_WSIG", 0))
if TW_SIG > 0:
    mt = np.where(IV <= 2)[0]
    Cm = (L2[mt] + R2[mt]) / 2; H = (R2[mt] - L2[mt]) / 2
    hl = np.linalg.norm(H, axis=1); hs = gsmooth(hl, TW_SIG)
    hs[-20:] = hl[-20:] * np.linspace(0, 1, 20) + hs[-20:] * np.linspace(1, 0, 20)  # back onto the sweep
    H = H / hl[:, None] * hs[:, None]
    L2[mt], R2[mt] = Cm - H, Cm + H
C2 = (L2 + R2) / 2
T2 = np.gradient(gsmooth(C2, 3.0), axis=0)
T2 /= np.linalg.norm(T2, axis=1, keepdims=True)
N2 = np.stack([-T2[:, 1], T2[:, 0]], 1)  # screen perpendicular
w = ((R2 - L2) * N2).sum(1)  # signed projected width, cutout px

def ax_sign(axis, ref):
    return float(axis[:2] @ ref[:2]) >= 0


# ---- centre depth by stretch (keys: interval -> (z at its start, z at its end)); windows interpolate between neighbours ---
LZ, RZ, BZ, MZ, EZ = -24.0, 37.0, -20.0, 12.0, -58.0
XB_Z = float(os.environ.get('XB_Z', 70.0))  # z the crossbar reaches at the left leg (end of iv10 = start of iv11); default r33 (default 70 = r34: the crossbar arches over the FRONT of the left leg)
WRAP_DIP = float(os.environ.get('WRAP_DIP', 40.0))  # depth of the wrap's dip behind the leg (m11)
WRAP_HOLD = float(os.environ.get('WRAP_HOLD', 0.0))  # >0: iv11 holds its start z for this fraction of the interval, then smoothsteps to its end
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
    10: (BZ, XB_Z),  # crossbar, onto the front of the left leg
    11: (XB_Z, -46.0),  # the wrap: round the leg, behind it, out as the return
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
    if kk == 11 and WRAP_HOLD > 0:
        t = np.clip((t - WRAP_HOLD) / (1 - WRAP_HOLD), 0, 1)
    zc[m] = a + (b - a) * (t * t * (3 - 2 * t))
# the wrap: dip behind the leg in the middle of its window (front pass -> curl at the edge -> behind -> out)
m11 = np.where(IV == 11)[0]
t11 = np.linspace(0, 1, len(m11))
zc[m11] += -WRAP_DIP * np.sin(np.pi * np.clip((t11 - 0.15) / 0.6, 0, 1)) ** 2
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
    # r36 defaults: refit ring (bigger, flatter), 120-point sampling, depth ramp to the K band; r35 = BK_RF= BK_NPTS= BK_WSCALE=1 BK_TURN=0.3 BK_FADE=3 BK_ZRAMP=
    if os.environ.get("BK_RF", "72.155,2.1885,0.7960"):  # "R,tau,alpha": regenerate the ring's points for another ring (R css, tau rad, alpha rad) instead of ringfit.json's
        Rr_, tau, al = (float(v) for v in os.environ.get("BK_RF", "72.155,2.1885,0.7960").split(","))
    if os.environ.get("BK_RF", "72.155,2.1885,0.7960") or os.environ.get("BK_NPTS", "120"):  # BK_NPTS=N: sample the ring at N points (default 120; 12 = a 12-sided polygon after the linear interp below)
        sys.path.insert(0, HERE); import ringmod
        rf["pts"] = [[q[0][0] * 2.185, q[0][1] * 2.185, q[1]] for q in ringmod.build((Rr_, tau, al), int(os.environ.get("BK_NPTS", "120") or 12))[0]]
    a_ = np.array([math.cos(al), math.sin(al), 0.0]); ap_ = np.array([-math.sin(al), math.cos(al), 0.0])
    # ring in screen-css xy (y down) + depth: p(th) = R (cos th a + sin th (cos tau ap + sin tau z))
    e2 = math.cos(tau) * ap_ + np.array([0, 0, math.sin(tau)])
    axis = np.cross(a_, e2); axis /= np.linalg.norm(axis)
    BK_HW_OVERRIDE = None
    if os.environ.get("BK_FIT3"):  # "path[:F3]": free-ring fit (scripts/curve/bkfit2.py params.json): P(th) = C + R (cos th e1 + sin th e2), css, replaces the ring points and the axis
        _fp, _, _fk = os.environ["BK_FIT3"].partition(":")
        _f3 = json.load(open(_fp))[_fk or "F3"]
        _C, _e1, _e2 = (np.array(_f3[k], float) for k in ("C", "e1", "e2"))
        _th = np.linspace(_f3["theta0"], _f3["theta1"], int(os.environ.get("BK_NPTS", "120") or 12))
        _P = _C[None] + _f3["R"] * (np.cos(_th)[:, None] * _e1[None] + np.sin(_th)[:, None] * _e2[None])
        rf["pts"] = [[q[0] * 2.185, q[1] * 2.185, q[2]] for q in _P]
        axis = np.cross(_e1, _e2); axis /= np.linalg.norm(axis)
        BK_HW_OVERRIDE = _f3["hw"]
        print("  BK_FIT3: R %.2f hw %.2f span %.1f deg" % (_f3["R"], _f3["hw"], math.degrees(_f3["theta1"] - _f3["theta0"])))
    P0 = np.array(rf["pts"], float)  # cutout xy, rel z (start .. end of the arc)
    Pc = np.stack([P0[:, 0] / SX, P0[:, 1] / SY, P0[:, 2]], 1)
    idx = np.where(IV == 7)[0]
    tq = np.linspace(0, 1, len(idx)); tp = np.linspace(0, 1, len(Pc))
    cen = np.stack([np.interp(tq, tp, Pc[:, k]) for k in range(3)], 1)
    cen[:, 2] += zc[idx[0]] - cen[0, 2]
    if os.environ.get("BK_ZRAMP", "smooth"):  # lin|smooth|late: a depth offset along the ring (0 at its start) so its END lands on the pre-ring centre depth at the exit ring (what the BK fade blends toward); applied to cen, so both edges shift equally
        _zm = os.environ.get("BK_ZRAMP", "smooth")
        _tt = np.linspace(0, 1, len(idx))
        _ss = lambda x: x * x * (3 - 2 * x)
        _g = {"lin": _tt, "smooth": _ss(_tt), "late": _ss(np.clip((_tt - 0.3) / 0.7, 0, 1))}[_zm]
        _tgt = float((zL[idx[-1]] + zR[idx[-1]]) / 2)
        _zb = float(cen[-1, 2])
        cen[:, 2] += (_tgt - _zb) * _g
        print("  BK_ZRAMP %s: exit z %.1f -> %.1f (target %.1f)" % (_zm, _zb, float(cen[-1, 2]), _tgt))
    # the band's width direction = the axis; sign so L -> R matches the incoming trace ring
    # sign from the EXIT (the K band's edge order); the ruling turns from the right leg's own ruling into the ring's axis over
    # the first part of the loop (the roll at the leg's foot), then stays on the axis (a cylinder band) to the exit
    trE = np.array([*(R2[idx[-1]] - L2[idx[-1]]) / SX, 0.0])
    ax = axis if ax_sign(axis, trE) else -axis
    i0 = idx[0]
    r0v = np.array([(R2[i0, 0] - L2[i0, 0]) / SX, (R2[i0, 1] - L2[i0, 1]) / SY, zR[i0] - zL[i0]]); r0v /= np.linalg.norm(r0v)
    hw = W_CSS / 2 * float(os.environ.get('BK_WSCALE', 1.297))
    if BK_HW_OVERRIDE is not None and "BK_WSCALE" not in os.environ:
        hw = BK_HW_OVERRIDE
    tin = float(os.environ.get('BK_TURN', 0.409))
    rul = []
    _tw = os.environ.get("BK_TWIST", "")  # "slerp": turn the ruling about the centre tangent (no pass through zero) instead of the linear r0v -> ax blend
    for j, t in enumerate(tq):
        f = min(1.0, t / tin); f = f * f * (3 - 2 * f)
        if _tw == "slerp":
            _n = len(cen)
            _T = cen[min(j + 1, _n - 1)] - cen[max(j - 1, 0)]; _T = _T / np.linalg.norm(_T)
            _a0 = r0v - _T * np.dot(r0v, _T); _a0 /= np.linalg.norm(_a0)
            _a1 = ax - _T * np.dot(ax, _T); _a1 /= np.linalg.norm(_a1)
            _ph = math.atan2(float(np.dot(_T, np.cross(_a0, _a1))), float(np.dot(_a0, _a1)))
            if j == 0:
                print("  BK_TWIST slerp: entry twist %.0f deg" % abs(math.degrees(_ph)))
            _ang = f * _ph
            v = _a0 * math.cos(_ang) + np.cross(_T, _a0) * math.sin(_ang)  # Rodrigues (a0 is perpendicular to T)
        else:
            v = r0v * (1 - f) + ax * f
        rul.append(v / np.linalg.norm(v))
    rul = np.array(rul)
    Lc, Rc = cen - rul * hw, cen + rul * hw
    fd = np.minimum(1.0, np.minimum(np.arange(len(idx)) / float(os.environ.get('BK_FADE', 10)), np.arange(len(idx))[::-1] / float(os.environ.get('BK_FADE_OUT', 25))))
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
    SEC_RELIEF = os.environ.get("SEC_RELIEF", "A:395:478:0.5:40")  # "NAME:a:b:k[:ramp]": scale the section NAME's half-depth-difference (zR-zL)/2 by k over rings a..b (smoothstep ramp in/out) (default = r40: halves the A section's depth relief along the left leg so it faces the light; smooth satin highlight instead of a dark leg)
    for idx, w_, zl, zr, nm_ in zsrc:
        if SEC_RELIEF and SEC_RELIEF.split(":")[0] == nm_:
            _p = SEC_RELIEF.split(":")
            _a, _b, _k = int(_p[1]), int(_p[2]), float(_p[3])
            _rp = float(_p[4]) if len(_p) > 4 else 15.0
            _zs0, _dz0 = (zl + zr) / 2, (zr - zl) / 2
            _s = np.clip(np.minimum(idx - _a, _b - idx) / max(_rp, 1e-9), 0, 1)
            _s = _s * _s * (3 - 2 * _s)
            _s[(idx < _a) | (idx > _b)] = 0
            _dz1 = _dz0 * (1 + (_k - 1) * _s)
            _in = (idx >= _a) & (idx <= _b)
            print("  SEC_RELIEF %s %d..%d k=%g: mean dz before %.2f after %.2f" % (nm_, _a, _b, _k, _dz0[_in].mean(), _dz1[_in].mean()))
            zl, zr = _zs0 - _dz1, _zs0 + _dz1
        zs = (zl + zr) / 2
        k = 10
        off0 = zc[idx[:k]].mean() - zs[:k].mean()
        off1 = zc[idx[-k:]].mean() - zs[-k:].mean()
        ramp = off0 + (off1 - off0) * np.linspace(0, 1, len(idx))
        accZL[idx] += (zl + ramp) * w_
        accZR[idx] += (zr + ramp) * w_
    zL, zR = accZL / tot, accZR / tot
    if os.environ.get("ZSM"):  # "a:b:sigma": gaussian-smooth the ring depths over rings a..b (the S relief's slope kinks), blended in/out over 8 rings
        za, zb, zs_ = os.environ["ZSM"].split(":")
        za, zb, zs_ = int(za), int(zb), float(zs_)
        k_ = np.arange(zb - za + 1)
        zw = np.clip(np.minimum(k_, (zb - za) - k_) / 8.0, 0, 1); zw = zw * zw * (3 - 2 * zw)
        zLs, zRs = gsmooth(zL, zs_), gsmooth(zR, zs_)
        zL[za:zb + 1] += zw * (zLs[za:zb + 1] - zL[za:zb + 1])
        zR[za:zb + 1] += zw * (zRs[za:zb + 1] - zR[za:zb + 1])

if os.environ.get("ZCON", "880:945>3,4:16"):  # depth constraints, "a:b>ivs:gap;a:b<ivs:gap": rings a..b IN FRONT (>) / BEHIND (<) the strand of intervals ivs (comma list) by >= gap
    from scipy.ndimage import maximum_filter1d
    from scipy.spatial import cKDTree as _KD

    def _zc_samples(rings, sub=3, sp=1.5):
        # screen-space samples along each ruling (L2 -> R2, z zL -> zR), the segments i -> i+1 sub-stepped (as chk.py); (xy, z, ring)
        X_, Z_, R_ = [], [], []
        for i, f in rings:
            j = min(i + 1, n - 1)
            L = L2[i] * (1 - f) + L2[j] * f; Rr = R2[i] * (1 - f) + R2[j] * f
            zl = zL[i] * (1 - f) + zL[j] * f; zr = zR[i] * (1 - f) + zR[j] * f
            nv = max(2, int(np.ceil(np.linalg.norm(Rr - L) / sp)) + 1); v = np.linspace(0, 1, nv)
            X_.append(L[None] * (1 - v[:, None]) + Rr[None] * v[:, None]); Z_.append(zl * (1 - v) + zr * v)
            R_.append(np.full(nv, min(i + f, n - 1.0)))
        return np.concatenate(X_), np.concatenate(Z_), np.concatenate(R_)

    ZC_ITERS, ZC_SIG, ZC_RAMP = int(os.environ.get("ZCON_ITERS", 4)), float(os.environ.get("ZCON_SIG", 6)), int(os.environ.get("ZCON_RAMP", 15))
    zcons = []
    for c_ in os.environ.get("ZCON", "880:945>3,4:16").split(";"):
        c_ = c_.strip()
        if not c_:
            continue
        op_ = ">" if ">" in c_ else "<"
        rng_, rest_ = c_.split(op_)
        a_, b_ = (int(v) for v in rng_.split(":"))
        ivs_, gap_ = rest_.split(":")
        zcons.append((a_, b_, op_, [int(v) for v in ivs_.split(",")], float(gap_)))
    for it_ in range(ZC_ITERS):
        for a_, b_, op_, ivs_, gap_ in zcons:
            sgn = 1.0 if op_ == ">" else -1.0
            fixed_ = [(i, k / 3.0) for i in range(n - 1) if int(IV[i]) in ivs_ for k in range(3)]
            Xf, Zf, _ = _zc_samples(fixed_)
            Xm, Zm, Rm = _zc_samples([(i, k / 3.0) for i in range(a_, b_) for k in range(3)] + [(b_, 0.0)])
            need = np.zeros(b_ - a_ + 1)
            for q, l_ in enumerate(_KD(Xf).query_ball_point(Xm, r=1.5)):
                if not l_:
                    continue
                zf = Zf[l_].max() if sgn > 0 else Zf[l_].min()  # worst case over the fixed samples under this point
                nd = sgn * (zf + sgn * gap_ - Zm[q])  # > : zf + gap - zm ;  < : zm - (zf - gap)
                r_ = min(max(int(round(Rm[q])), a_), b_) - a_
                if nd > need[r_]:
                    need[r_] = nd
            e = gsmooth(maximum_filter1d(need, size=9), ZC_SIG)
            pos = need > 0
            if pos.any():
                ratio = (need[pos] / np.maximum(e[pos], 1e-9)).max()
                if ratio > 1:
                    e = e * ratio
            print("  ZCON %s gap %g iter %d: max need %.2f, rings with need>0 %d" % ("%d:%d%s%s" % (a_, b_, op_, ",".join(map(str, ivs_))), gap_, it_ + 1, need.max(), int(pos.sum())))
            tot_ = np.zeros(n)
            tot_[a_:b_ + 1] = e
            for j in range(1, ZC_RAMP + 1):
                t_ = 1.0 - j / (ZC_RAMP + 1.0)
                t_ = t_ * t_ * (3 - 2 * t_)
                if a_ - j >= 0:
                    tot_[a_ - j] = e[0] * t_
                if b_ + j < n:
                    tot_[b_ + j] = e[-1] * t_
            zL += sgn * tot_
            zR += sgn * tot_

EQS_POST = os.environ.get("EQS_POST", "")  # "a:b:ramp[,a:b:ramp...]": final 3D equal-fraction re-pairing of both edges over rings a..b (blended in/out over ramp rings)
if EQS_POST:
    def _rang_p(L_, R_):
        a_ = np.arctan2(*(R_ - L_)[:, ::-1].T)
        return np.degrees((np.diff(a_) + np.pi) % (2 * np.pi) - np.pi)
    def _resamp_p(P_, t_):
        d_ = np.linalg.norm(np.diff(P_, axis=0), axis=1)
        s_ = np.concatenate([[0], np.cumsum(d_)]); s_ /= s_[-1]
        keep = np.concatenate([[True], d_ > 1e-9])  # ignore zero-length steps
        return np.stack([np.interp(t_, s_[keep], P_[keep, k_]) for k_ in range(P_.shape[1])], axis=1)
    def _ss_p(x_):
        x_ = np.clip(x_, 0, 1); return x_ * x_ * (3 - 2 * x_)
    for w_ in EQS_POST.split(","):
        pa_, pb_, pr_ = (int(x_) for x_ in w_.split(":"))
        PL_ = np.stack([L2[pa_:pb_ + 1, 0], L2[pa_:pb_ + 1, 1], zL[pa_:pb_ + 1]], axis=1)
        PR_ = np.stack([R2[pa_:pb_ + 1, 0], R2[pa_:pb_ + 1, 1], zR[pa_:pb_ + 1]], axis=1)
        ti_ = np.arange(pb_ - pa_ + 1) / float(pb_ - pa_)
        Lq_, Rq_ = _resamp_p(PL_, ti_), _resamp_p(PR_, ti_)
        k2_ = np.arange(pb_ - pa_ + 1)
        ew_ = _ss_p(np.minimum(k2_, (pb_ - pa_) - k2_) / float(max(pr_, 1)))[:, None]
        ang0_ = np.abs(_rang_p(PL_[:, :2], PR_[:, :2])).max()
        PL_ = PL_ + ew_ * (Lq_ - PL_)
        PR_ = PR_ + ew_ * (Rq_ - PR_)
        ang1_ = np.abs(_rang_p(PL_[:, :2], PR_[:, :2])).max()
        L2[pa_:pb_ + 1, 0], L2[pa_:pb_ + 1, 1], zL[pa_:pb_ + 1] = PL_[:, 0], PL_[:, 1], PL_[:, 2]
        R2[pa_:pb_ + 1, 0], R2[pa_:pb_ + 1, 1], zR[pa_:pb_ + 1] = PR_[:, 0], PR_[:, 1], PR_[:, 2]
        print("  EQS_POST %d..%d ramp %d: max ruling-angle step before %.2f deg, after %.2f deg" % (pa_, pb_, pr_, ang0_, ang1_))

CYL = os.environ.get("CYL", "1080:1290:25:-1:perp")  # "a:b:ramp:sign:zmode[,...]" constant-ruling (generalised cylinder) band over rings a..b (default = r37: the top-K loop as a constant-ruling band; removes the notch where it leaves the right leg)
if CYL:
    sys.path.insert(0, HERE)
    import cylfit

    def _ss_c(x_):
        x_ = np.clip(x_, 0, 1); return x_ * x_ * (3 - 2 * x_)
    for w_ in CYL.split(","):
        f_ = w_.split(":")
        ca_, cb_, cr_, csg_, czm_ = int(f_[0]), int(f_[1]), int(f_[2]), int(f_[3]), f_[4]
        cn_ = cb_ - ca_ + 1
        Lt_, Rt_ = L2_TR[ca_:cb_ + 1], R2_TR[ca_:cb_ + 1]
        d_, rm_, rx_ = cylfit.fit_offset(Lt_, Rt_)
        # midline from the trace
        pq_ = Lt_ + d_
        _, qq_ = cylfit.pt_seg_dist(pq_, Rt_)
        m_ = ((Lt_ + d_ / 2) + (qq_ - d_ / 2)) / 2
        m_ = gsmooth(m_, 3.0)
        ds_ = np.linalg.norm(np.diff(m_, axis=0), axis=1)
        s_ = np.concatenate([[0], np.cumsum(ds_)]); s_ /= s_[-1]
        tt_ = np.linspace(0, 1, cn_)
        m_ = np.stack([np.interp(tt_, s_, m_[:, k_]) for k_ in range(2)], axis=1)
        # ruling
        dc_ = d_ / SX
        hw_ = W_CSS / 2
        bxy_ = dc_ / (2 * hw_)
        if np.linalg.norm(bxy_) > 1:
            hw_ = np.linalg.norm(dc_) / 2
            bxy_ = bxy_ / np.linalg.norm(bxy_)
            bz_ = 0.0
        else:
            bz_ = csg_ * math.sqrt(1 - float(bxy_ @ bxy_))
        Ln_, Rn_ = m_ - d_ / 2, m_ + d_ / 2
        c0_ = (zL[ca_] + zR[ca_]) / 2
        c1_ = (zL[cb_] + zR[cb_]) / 2
        if czm_ == "keep":
            cz_ = gsmooth((zL[ca_:cb_ + 1] + zR[ca_:cb_ + 1]) / 2, 4.0)
        elif czm_ == "perp":
            dm_ = np.diff(m_ / SX, axis=0)
            if abs(bz_) > 0.15:
                dcz_ = -(dm_ @ bxy_) / bz_
            else:
                dcz_ = np.zeros(len(dm_))
            dmn_ = np.linalg.norm(dm_, axis=1)
            dcz_ = np.clip(dcz_, -3 * dmn_, 3 * dmn_)
            cz_ = np.concatenate([[0], np.cumsum(dcz_)])
            t_ = np.linspace(0, 1, cn_)
            cz_ = cz_ + c0_ + (c1_ - c0_) * t_ - (cz_[0] + (cz_[-1] - cz_[0]) * t_)
        else:
            raise SystemExit("CYL zmode must be keep or perp")
        zLn_, zRn_ = cz_ - hw_ * bz_, cz_ + hw_ * bz_
        k_ = np.arange(cn_)
        ew_ = _ss_c(np.minimum(k_, (cb_ - ca_) - k_) / float(max(cr_, 1)))
        L2[ca_:cb_ + 1] += ew_[:, None] * (Ln_ - L2[ca_:cb_ + 1])
        R2[ca_:cb_ + 1] += ew_[:, None] * (Rn_ - R2[ca_:cb_ + 1])
        zL[ca_:cb_ + 1] += ew_ * (zLn_ - zL[ca_:cb_ + 1])
        zR[ca_:cb_ + 1] += ew_ * (zRn_ - zR[ca_:cb_ + 1])
        print("  CYL %d..%d: d (%.1f,%.1f) |d| %.1f px, residual mean/max %.2f/%.2f px, |bxy| %.3f, bz %.3f, hw %.1f, %s, cz %.1f..%.1f"
              % (ca_, cb_, d_[0], d_[1], np.linalg.norm(d_), rm_, rx_, np.linalg.norm(bxy_), bz_, hw_, czm_, cz_.min(), cz_.max()))

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
