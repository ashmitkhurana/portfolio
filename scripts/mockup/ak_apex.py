#!/usr/bin/env python3
"""Real-AK apex section solve with the synth13 recipe (fold primitive -> hinge conversion -> sliding-data hinge solve).

Section = rings fl_out .. apex_out plus 25 rings each side (problem ring list, stride 1). Apex window = the problem's
'apex_in__apex_out' window mask. 2D residuals (data, coverage) are in cutout px, scaled by 1/SC (SC = px per css = 2.186) so
px and css errors balance; all 3D geometry, W, mono/obliqueness/ruling/bend/clearance are in css world units.

Usage: ak_apex.py prep | run | merge
"""
import json, math, os, sys, time
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ak_solve as AKS          # noqa: E402  (installs the AK camera into solve3d / solve3d_fast)
import ak_problem as AP         # noqa: E402
import solve3d as S             # noqa: E402
import solve3d_fast as F        # noqa: E402
import hinge as HG              # noqa: E402
import fold_primitive as FP     # noqa: E402
import emit_pose as EP          # noqa: E402
import solve3d_synth13 as T13   # noqa: E402  (SlidingData13)

ROOT = AP.ROOT
OUT = os.path.join(ROOT, 'docs/ribbon/turns/ak_apex')
os.makedirs(OUT, exist_ok=True)
SC = (AP.SX + AP.SY) / 2.0            # cutout px per css px
MARGIN_SEC = 25
MARGIN_FIT = 15
PRE_RINGS = 10
BLEND = 5
W_COV = 20.0
Z_PRIOR = 0.0        # weak depth prior of the primitive fit toward the init depth ramp (residual per css of z error)
NV_COV = 9
MAX_ITER = 300
BOX = (180, 530, 480, 760)
KW = {'hard': 1.0, 'fixed': 1.0, 'soft': 0.2}


# ====================================================================== sliding data (vectorised closest, weights, unit scale)
class SlidingDataAK(T13.SlidingData13):
    """SlidingData13 with per-ring weights, a unit scale on all residuals, and a vectorised per-run closest-point search."""

    def __init__(self, obs, vis, w, scale=1.0, anchor=0.05, nanc=3):
        super().__init__(obs, vis, anchor, nanc)
        self.w = np.asarray(w, float)
        self.scale = scale
        self.rebuild()

    @property
    def amp(self):
        return self.scale * np.sqrt(self.w)

    def rebuild(self):
        self.groups = {}
        for k, i in enumerate(self.sidx):
            self.groups.setdefault(self.run_of[i], []).append(k)
        self.groups = {r: np.array(v) for r, v in self.groups.items()}

    def restricted(self, lo, hi, scale=None):
        o = object.__new__(SlidingDataAK)
        o.__dict__.update(self.__dict__)
        o.sidx = self.sidx[(self.sidx >= lo) & (self.sidx <= hi)]
        o.aidx = self.aidx[(self.aidx >= lo) & (self.aidx <= hi)]
        if scale is not None:
            o.scale = scale
        o.rebuild()
        return o

    def closest(self, p2):
        q = np.zeros_like(p2)
        nq = np.zeros_like(p2)
        for (a0, a1), ks in self.groups.items():
            A = self.obs[a0:a1]
            B = self.obs[a0 + 1:a1 + 1]
            d = B - A
            l2 = np.maximum((d * d).sum(1), 1e-12)
            pt = p2[ks]
            t = np.clip(((pt[:, None, :] - A[None]) * d[None]).sum(-1) / l2[None], 0.0, 1.0)
            Q = A[None] + t[..., None] * d[None]
            dist = ((Q - pt[:, None, :]) ** 2).sum(-1)
            j = np.argmin(dist, axis=1)
            r = np.arange(len(ks))
            q[ks] = Q[r, j]
            tg = d[j] / np.sqrt(l2[j])[:, None]
            nq[ks] = np.stack([-tg[:, 1], tg[:, 0]], 1)
        return q, nq

    def resid(self, P):
        p2 = S.project(P)
        q, nq = self.closest(p2[self.sidx])
        a = self.amp
        slide = (nq * (p2[self.sidx] - q)).sum(1) * a[self.sidx]
        anc = self.anchor * (p2[self.aidx] - self.obs[self.aidx]) * a[self.aidx][:, None]
        return slide, anc.ravel()

    def jac(self, P):
        J = super().jac(P)
        a = self.amp
        ns = len(self.sidx)
        J[:ns] *= a[self.sidx][:, None]
        J[ns:] *= np.repeat(a[self.aidx], 2)[:, None]
        return J

    def sliding_dist(self, P):
        """unsigned distance (px) of each projected ring point to its run polyline; NaN where the ring has no sliding row."""
        p2 = S.project(P)
        out = np.full(len(P), np.nan)
        q, _ = self.closest(p2[self.sidx])
        out[self.sidx] = np.hypot(*(p2[self.sidx] - q).T)
        return out


class SlidingHingeProblemAK(HG.SlidingHingeProblem):
    """Sliding hinge problem plus the soft-fold guard: max(0, |theta_k| - pi/6) * sqrt(20) for hinges k in the apex window."""
    GUARD_W = 20.0
    GUARD_ANGLE = np.pi / 6

    def __init__(self, H_, iso_prob, sd1, sd2, guard_rings=None):
        self.sd1, self.sd2 = sd1, sd2
        self.gk = np.zeros(0, int) if guard_rings is None else np.asarray(guard_rings, int)
        self.gk = self.gk[(self.gk >= 1) & (self.gk <= H_.N - 2)]
        HG.HingeProblem.__init__(self, H_, iso_prob)

    def blocks(self, x):
        out = super().blocks(x)
        th = x[self.H.i_th:self.H.i_th + self.H.N - 2]
        out['guard'] = np.maximum(0.0, np.abs(th[self.gk - 1]) - self.GUARD_ANGLE) * np.sqrt(self.GUARD_W)
        return out

    def jac_blocks(self, x):
        out = super().jac_blocks(x)
        th = x[self.H.i_th:self.H.i_th + self.H.N - 2]
        t = th[self.gk - 1]
        J = np.zeros((len(self.gk), self.H.nx))
        J[np.arange(len(self.gk)), self.H.i_th + self.gk - 1] = np.sign(t) * (np.abs(t) > self.GUARD_ANGLE) * np.sqrt(self.GUARD_W)
        out['guard'] = J
        return out

    def jac(self, x):
        jb = self.jac_blocks(x)
        return np.concatenate([jb[n] for n in self.names] + [jb['guard']], 0)


# ====================================================================== setup
def kabsch(P, Q):
    pc, qc = P.mean(0), Q.mean(0)
    U, _, Vt = np.linalg.svd((P - pc).T @ (Q - qc))
    d = np.sign(np.linalg.det(Vt.T @ U.T))
    Rm = Vt.T @ np.diag([1, 1, d]) @ U.T
    return Rm, qc - Rm @ pc


def setup():
    P = AKS.load(1)
    d = np.load(AKS.NPZ, allow_pickle=True)
    names = [str(n) for n in d['cov_names']]
    ia = names.index('apex')
    sil = d['cov_sil']
    cin, cout = d['cov_in'], d['cov_out']
    alpha = np.array(Image.open(AP.CUTOUT).convert('RGBA'))[..., 3].astype(float) / 255.0
    a_in = ndi.map_coordinates(alpha, [cin[:, 1], cin[:, 0]], order=1, mode='nearest')
    a_out = ndi.map_coordinates(alpha, [cout[:, 1], cout[:, 0]], order=1, mode='nearest')
    mi = (sil == ia) & (a_in > 0.5)
    mo = (sil == ia) & (a_out < 0.5)
    cov_in, cov_out = cin[mi], cout[mo]
    cov_counts = dict(apex_in_total=int((sil == ia).sum()), apex_in_kept=int(mi.sum()), apex_out_kept=int(mo.sum()))
    g = d['cov_g'][sil == ia]
    lm = P['lm']
    i0 = lm['fl_out'] - MARGIN_SEC
    i1 = lm['apex_out'] + MARGIN_SEC
    sl = slice(i0, i1 + 1)
    N = i1 - i0 + 1
    k_apex = P['int_names'].index('apex_in__apex_out')
    win_full = P['interval'] == k_apex
    win = win_full[sl]
    wi = np.where(win)[0]
    assert (np.diff(wi) == 1).all()
    W = P['W']
    c = dict(P=P, i0=i0, i1=i1, N=N, W=W, thk=W / 11, e1=P['e1'][sl], e2=P['e2'][sl], vis1=P['vis1'][sl], vis2=P['vis2'][sl],
             kind1=P['kind1'][sl], kind2=P['kind2'][sl], win=win, wi=wi, ring_face=P['ring_face'][sl], cov_in=cov_in, cov_out=cov_out,
             cov_counts=cov_counts, g=g, alpha=alpha)
    w1 = np.array([KW.get(str(k), 0.0) for k in c['kind1']])
    w2 = np.array([KW.get(str(k), 0.0) for k in c['kind2']])
    c['w1'], c['w2'] = w1, w2
    c['v1'], c['v2'] = c['vis1'] & (w1 > 0), c['vis2'] & (w2 > 0)
    c['sd1'] = SlidingDataAK(c['e1'], c['v1'], w1, 1.0)
    c['sd2'] = SlidingDataAK(c['e2'], c['v2'], w2, 1.0)
    # geometric init: back-projection at a linear depth ramp -20 -> +20 over the section
    z = np.linspace(-20.0, 20.0, N)
    L0, R0 = AP.backproject(c['e1'], z), AP.backproject(c['e2'], z)
    Hg = HG.Hinge(N, W, W)
    x8, ginfo = HG.geometric_init(Hg, L0, R0)
    _, _, _, a8, b8 = Hg.unpack(x8[None])
    a8, b8 = a8[0], b8[0]
    st = (np.diff(a8) + np.diff(b8)) / 2
    H = float(np.median(st[~(win[1:] | win[:-1])]))
    Hg.h = H
    c.update(Hg=Hg, x8=x8, ginfo=ginfo, L0=L0, R0=R0, H=H, m=Hg.m, zramp=z)
    return c


# ====================================================================== primitive fit
def beta_axis(c):
    wi = c['wi']
    i0 = wi[0]
    gc = c['g'] - c['g'].mean(0)
    _, evec = np.linalg.eigh(gc.T @ gc)
    d_sil = evec[:, -1]
    C2 = (c['e1'] + c['e2']) / 2
    seg = C2[i0 - PRE_RINGS + 1:i0 + 1] - C2[i0 - PRE_RINGS:i0]
    seg = seg / np.linalg.norm(seg, axis=1, keepdims=True)
    d_strip = seg.mean(0)
    ang = lambda d: np.arctan2(-d[1], d[0])
    b = (ang(d_sil) - ang(d_strip) + np.pi / 2) % np.pi - np.pi / 2
    return float(b), d_sil, d_strip


def fit_range(c):
    wi = c['wi']
    return max(wi[0] - MARGIN_FIT, 1), min(wi[-1] + MARGIN_FIT, c['N'] - 2)


def front_fraction(pts, grp, cell=2.0):
    """pts (M,3) world, grp (M,) 0 = rings before the apex, 1 = rings after it, -1 ignore. Per cutout-px cell compare max z.
    Returns dict(frac_post_in_front, n_cells, mean_gap)."""
    ok = grp >= 0
    p2 = AP.project(pts[ok])
    z = pts[ok, 2]
    g = grp[ok]
    key = np.floor(p2 / cell).astype(np.int64)
    ids = key[:, 0] * 100000 + key[:, 1]
    uniq, inv = np.unique(ids, return_inverse=True)
    zm = np.full((len(uniq), 2), -np.inf)
    np.maximum.at(zm, (inv, g), z)
    both = np.isfinite(zm).all(1)
    if not both.any():
        return dict(frac_post_in_front=float('nan'), n_cells=0, mean_gap=float('nan'))
    gap = zm[both, 1] - zm[both, 0]
    return dict(frac_post_in_front=float((gap > 0).mean()), n_cells=int(both.sum()), mean_gap=float(gap.mean()))


def prim_dense(p, s, u_lo, u_hi, du=0.6, nv=80):
    u = np.arange(u_lo, u_hi + du, du)
    v = np.linspace(-W_GLOBAL[0] / 2, W_GLOBAL[0] / 2, nv)
    U, V = np.meshgrid(u, v, indexing='ij')
    pts = FP.fold_surface(p, U.ravel(), V.ravel(), s)
    beta, rho, u0 = p[6], p[7], p[8]
    cu = U.ravel() - V.ravel() / np.tan(beta)
    xc = (cu - u0) * np.sin(beta)
    sg = 1.0 if np.sin(beta) > 0 else -1.0
    pre = xc * 1.0 < 0 if sg > 0 else xc > np.pi * rho
    post = xc > np.pi * rho if sg > 0 else xc < 0
    grp = np.full(len(pts), -1)
    grp[pre] = 0
    grp[post] = 1
    return pts, grp


W_GLOBAL = [0.0]


def make_fit_residual(c, idx, s):
    W, H, m = c['W'], c['H'], c['m']
    n = len(idx)
    u = (idx - m) * H
    sd1 = c['sd1'].restricted(idx[0], idx[-1], 1.0)
    sd2 = c['sd2'].restricted(idx[0], idx[-1], 1.0)
    p_in, p_out = c['cov_in'], c['cov_out']
    cin = np.tile(np.arange(n - 1), (len(p_in), 1))
    cout = np.tile(np.arange(n - 1), (len(p_out), 1))
    sq = math.sqrt(W_COV)
    vs = np.linspace(-W / 2, W / 2, NV_COV)
    N = c['N']

    def dense_cov(p, pts, cand, kind):
        G = np.stack([FP.fold_surface(p, u, np.full(n, v), s) for v in vs])
        r = np.stack([S.coverage_resid(G[k], G[k + 1], pts, cand, W, kind) for k in range(NV_COV - 1)])
        if kind == 'in':
            return r.min(0)
        rp = np.where(r > 0, r, np.inf).min(0)
        return np.where(np.isfinite(rp), rp, 0.0)

    def parts(p):
        L, R = FP.fold_points(p, u, W, s)
        PL = np.zeros((N, 3)); PR = np.zeros((N, 3))
        PL[idx], PR[idx] = L, R
        s1, a1 = sd1.resid(PL)
        s2, a2 = sd2.resid(PR)
        ci = dense_cov(p, p_in, cin, 'in') * sq
        co = dense_cov(p, p_out, cout, 'out') * sq
        zp = np.concatenate([L[:, 2] - c['zf_fit'][idx], R[:, 2] - c['zf_fit'][idx]]) * Z_PRIOR
        return s1, s2, a1, a2, ci, co, zp

    def res(p):
        return np.concatenate(parts(p))
    return res, parts, u


def fit_all(c):
    t0 = time.time()
    W, H, m, N = c['W'], c['H'], c['m'], c['N']
    r0, r1 = fit_range(c)
    idx = np.arange(r0, r1 + 1)
    wi = c['wi']
    u0 = float((wi.mean() - m) * H)
    b_ax, d_sil, d_strip = beta_axis(c)
    print(f'fit rings {r0}..{r1} ({len(idx)}) (section-local; global {c["i0"] + r0}..{c["i0"] + r1}); beta_axis {np.degrees(b_ax):.2f} deg; '
          f'd_sil {d_sil}, d_strip {d_strip}; u0 start {u0:.1f}; H {H:.3f}', flush=True)
    # depth ramp for the pose init: left leg z=-20 up to the window start, right leg z=+20 from the window end, linear inside
    zf = np.interp(np.arange(N), [wi[0], wi[-1]], [-20.0, 20.0])
    c['zf_fit'] = zf
    L0w, R0w = AP.backproject(c['e1'][idx], zf[idx]), AP.backproject(c['e2'][idx], zf[idx])
    starts = []
    for beta in (b_ax, b_ax + np.pi):
        for s in (1, -1):
            res, parts, u = make_fit_residual(c, idx, s)
            for rf in (0.12, 0.18, 0.25):
                rho = rf * W
                p_id = np.array([0, 0, 0, 0, 0, 0, beta, rho, u0])
                Lp, Rp = FP.fold_points(p_id, u, W, s)
                Rm, tt = kabsch(np.concatenate([Lp, Rp]), np.concatenate([L0w, R0w]))
                p0 = p_id.copy()
                p0[:3] = Rotation.from_matrix(Rm).as_rotvec()
                p0[3:6] = tt
                lo = np.full(9, -np.inf); hi = np.full(9, np.inf)
                lo[7], hi[7] = 0.10 * W, 0.35 * W
                t1 = time.time()
                r = least_squares(res, p0, method='trf', x_scale='jac', max_nfev=2000, bounds=(lo, hi))
                s1, s2, a1, a2, ci, co, zp = parts(r.x)
                dd = np.concatenate([s1, s2])
                pts, grp = prim_dense(r.x, s, u[0] - 20, u[-1] + 20)
                ff = front_fraction(pts, grp)
                st = dict(beta0_deg=float(np.degrees(beta)), s=s, rho0=rho, cost=float(r.cost), nfev=int(r.nfev),
                          rms_slide_px=float(np.sqrt(np.mean(dd ** 2))), cov_in_cost=float(0.5 * np.sum(ci ** 2)),
                          cov_out_cost=float(0.5 * np.sum(co ** 2)), front=ff, right_front=bool(ff['frac_post_in_front'] > 0.5),
                          rho=float(r.x[7]), beta_fit_deg=float(np.degrees(r.x[6])), u0_fit=float(r.x[8]),
                          secs=time.time() - t1, p=r.x.tolist(), status=int(r.status))
                starts.append(st)
                print(f'  beta0 {st["beta0_deg"]:7.2f} s {s:+d} rho0 {rho:5.2f} -> cost {st["cost"]:10.2f} slide_rms {st["rms_slide_px"]:6.3f} '
                      f'rho {st["rho"]:6.2f} beta {st["beta_fit_deg"]:7.2f} u0 {st["u0_fit"]:7.2f} front {ff["frac_post_in_front"]:.3f} '
                      f'({ff["n_cells"]} cells) nfev {st["nfev"]} ({st["secs"]:.0f}s)', flush=True)
    ok = [q for q in starts if q['right_front']]
    pool = ok if ok else sorted(starts, key=lambda q: -q['front']['frac_post_in_front'])[:1]
    sel = min(pool, key=lambda q: q['cost'])
    print('selected', {k: v for k, v in sel.items() if k != 'p'}, 'n_right_front', len(ok), flush=True)
    return starts, sel, (r0, r1), b_ax, time.time() - t0


# ====================================================================== primitive -> hinge (handedness-checked)
def adaptive_blend(c, p):
    return max(BLEND, int(np.ceil(abs(c['W'] / np.tan(p[6])) / (1.6 * c['H']))))


def hinge_range(c, p, rng_, blend):
    m, N, H = c['m'], c['N'], c['H']
    cu = (np.arange(N) - m) * H
    Xc = (cu - p[8]) * np.sin(p[6])
    ir = np.where((Xc >= 0) & (Xc <= np.pi * p[7]))[0]
    if len(ir) == 0:
        return rng_
    return max(min(rng_[0], ir[0] - blend - 2), 1), min(max(rng_[1], ir[-1] + blend + 2), N - 2)


def prim_to_hinge_c(c, p, s, rng_, blend, sgn, swap):
    Hg, x8 = c['Hg'], c['x8']
    W, H, m, N = c['W'], c['H'], c['m'], c['N']
    r0, r1 = rng_
    omega8, t8, th8, a8, b8 = (v[0] for v in Hg.unpack(x8[None]))
    beta, rho, u0 = p[6], p[7], p[8]
    ext = np.arange(r0 - 1, r1 + 2)
    cu = (ext - m) * H
    Xc = (cu - u0) * np.sin(beta)
    inroll = (Xc >= 0) & (Xc <= np.pi * rho)
    wgt = inroll.astype(float)
    ii = np.where(inroll)[0]
    if len(ii):
        for k in range(1, blend + 1):
            w = (blend + 1 - k) / (blend + 1)
            for j in (ii[0] - k, ii[-1] + k):
                if 0 <= j < len(ext):
                    wgt[j] = max(wgt[j], w)
    obl = wgt * W / np.tan(beta)
    uE1, uE2 = cu - obl / 2, cu + obl / 2
    PL = FP.fold_surface(p, uE1, np.full(len(ext), -W / 2), s)
    PR = FP.fold_surface(p, uE2, np.full(len(ext), W / 2), s)
    if swap:
        uA, uB, TL, TR = uE2, uE1, PR, PL
    else:
        uA, uB, TL, TR = uE1, uE2, PL, PR
    th_w = sgn * S.dihedral(TL, TR)
    sl = slice(1, len(ext) - 1)
    idx = np.arange(r0, r1 + 1)
    th = th8.copy()
    th[idx] = th_w
    a_rng, b_rng = uA[sl], uB[sl]
    c0 = b8[r0] - a8[r0]
    a = a8.copy()
    b = a8 + (b8 - a8) - c0
    a[:r0] = a8[:r0] + (a_rng[0] - a8[r0])
    b[:r0] = a[:r0] + (b8[:r0] - a8[:r0]) - c0
    a[idx], b[idx] = a_rng, b_rng
    a[r1 + 1:] = a8[r1 + 1:] + (a_rng[-1] - a8[r1])
    b[r1 + 1:] = b8[r1 + 1:] + (b_rng[-1] - b8[r1])
    sh = a[m]
    a, b = a - sh, b - sh
    x = Hg.pack(np.zeros(3), np.zeros(3), th, a, b)
    L, R = Hg.points(x)
    Lp = np.zeros((N, 3)); Rp = np.zeros((N, 3))
    Lp[idx], Rp[idx] = PL[sl], PR[sl]
    wi = c['wi']
    Rm, tt = kabsch(np.concatenate([L[wi], R[wi]]), np.concatenate([Lp[wi], Rp[wi]]))
    x = Hg.pack(Rotation.from_matrix(Rm).as_rotvec(), tt, th, a, b)
    return x, Lp, Rp


def surf_samples(L, R, ns=4, nt=40):
    """Dense bilinear samples of the ring quads: (M,3), ring index (M,)."""
    N = len(L)
    t = np.linspace(0, 1, nt)[None, :, None]
    out, ri = [], []
    for k in range(ns):
        f = k / ns
        Lk = L[:-1] * (1 - f) + L[1:] * f
        Rk = R[:-1] * (1 - f) + R[1:] * f
        P = Lk[:, None, :] + (Rk - Lk)[:, None, :] * t
        out.append(P.reshape(-1, 3))
        ri.append(np.repeat(np.arange(N - 1), nt))
    return np.concatenate(out), np.concatenate(ri)


def ring_front(c, L, R, cell=2.0):
    pts, ri = surf_samples(L, R)
    w0, w1 = c['wi'][0], c['wi'][-1]
    grp = np.full(len(pts), -1)
    grp[ri < w0] = 0
    grp[ri >= w1] = 1
    return front_fraction(pts, grp, cell)


def cand_stats(c, x, Lp, Rp):
    Hg = c['Hg']
    L, R = Hg.points(x)
    wi = c['wi']
    r3 = float(np.sqrt(np.mean(np.concatenate([((L[wi] - Lp[wi]) ** 2).sum(1), ((R[wi] - Rp[wi]) ** 2).sum(1)]))))
    r2 = float(np.sqrt(np.mean(np.concatenate([((S.project(L[wi]) - S.project(Lp[wi])) ** 2).sum(1),
                                               ((S.project(R[wi]) - S.project(Rp[wi])) ** 2).sum(1)]))))
    return dict(rms3d_window=r3, rms2d_window_px=r2, front=ring_front(c, L, R))


# ====================================================================== solve
def stage_problem(c, x, wts, cov):
    Hg, N = c['Hg'], c['N']
    xf = Hg.full(x)
    p = dict(W=c['W'], h=c['H'], thk=c['thk'])
    ip = F.make_stage_problem(N, c['e1'], c['e2'], c['v1'], c['v2'], c['w1'], c['w2'], c['win'], p, wts, xf, None, 50.0, cov, 0)
    sd1 = c['sd1'].restricted(0, N - 1, 1.0 / SC)
    sd2 = c['sd2'].restricted(0, N - 1, 1.0 / SC)
    return SlidingHingeProblemAK(Hg, ip, sd1, sd2, c['wi']), ip


def validate_jac(c, x, ncols=40, seed=0):
    prob, _ = stage_problem(c, x, dict(S.ISO_WEIGHTS), None)
    Ja = prob.data_jac(x)
    f = lambda z: np.concatenate(prob.data_parts(z))
    rng = np.random.default_rng(seed)
    cols = rng.choice(len(x), ncols, replace=False)
    err = []
    for j in cols:
        h = 1e-6 * max(1.0, abs(x[j]))
        xp, xm = x.copy(), x.copy()
        xp[j] += h; xm[j] -= h
        fd = (f(xp) - f(xm)) / (2 * h)
        den = np.maximum(np.abs(Ja[:, j]), np.abs(fd))
        mk = den > 1e-8
        if mk.any():
            err.append(float((np.abs(Ja[:, j] - fd)[mk] / den[mk]).max()))
    r = dict(cols=int(ncols), max_rel=float(max(err)), p90_rel=float(np.percentile(err, 90)))
    print('jac validation', r, flush=True)
    return r


def run_stages(c, x, label):
    wbase = dict(S.ISO_WEIGHTS)
    cov_base = dict(p_in=c['cov_in'], p_out=c['cov_out'])
    cfgs = {1: dict(clear=0.0, cov=None, bend=1.0), 2: dict(clear=0.0, cov=20.0, bend=1.0),
            3: dict(clear=1.0, cov=20.0, bend=1.0), 4: dict(clear=1.0, cov=40.0, bend=0.5)}
    hist = []
    for k in (1, 2, 3, 4):
        cf = cfgs[k]
        wts = dict(wbase)
        wts['clear'] = wbase['clear'] * cf['clear']
        wts['bend'] = wbase['bend'] * cf['bend']
        cov = None if cf['cov'] is None else dict(cov_base, weight=cf['cov'] / SC ** 2)
        prob, ip = stage_problem(c, x, wts, cov)
        t0 = time.time()
        c0 = 0.5 * float(np.sum(prob.f(x) ** 2))
        x, info = HG.lm_dense(prob.f, prob.jac, x, max_iter=MAX_ITER)
        info.update(stage=k, cost_before=c0, n_pairs=int(len(ip.pairs)), n_resid=int(prob.nres), wall=time.time() - t0,
                    blocks={n: 0.5 * float(np.sum(v ** 2)) for n, v in prob.blocks(x).items()})
        hist.append(info)
        print(f'{label} stage {k}: ' + str({q: v for q, v in info.items() if q != 'blocks'}), flush=True)
        print('   blocks', {q: round(v, 4) for q, v in info['blocks'].items()}, flush=True)
    return x, hist


# ====================================================================== commands
def convert(c, p, s, rng_):
    """Four handedness candidates. Selection: all candidates whose 3D window rms is within 1e-3 css of the minimum are tied (the
    primitive's edge point set is achiral, so theta-sign alone cannot be resolved by the 3D rms); among the tied ones prefer
    those with the right leg in front (dense ring check), then the lowest rms."""
    bl = adaptive_blend(c, p)
    rr = hinge_range(c, p, rng_, bl)
    cands = []
    for sgn in (1, -1):
        for swap in (False, True):
            x, Lp, Rp = prim_to_hinge_c(c, p, s, rr, bl, sgn, swap)
            st = cand_stats(c, x, Lp, Rp)
            st.update(theta_sign=sgn, swapped=swap)
            cands.append((st, x))
            print(f'cand sgn {sgn:+d} swap {swap!s:5}: ' + str(st), flush=True)
    rmin = min(q['rms3d_window'] for q, _ in cands)
    tied = [i for i, (q, _) in enumerate(cands) if q['rms3d_window'] <= rmin + 1e-3]
    good = [i for i in tied if cands[i][0]['front']['frac_post_in_front'] > 0.5]
    best = min(good or tied, key=lambda i: cands[i][0]['rms3d_window'])
    print('tied on 3D rms:', tied, 'with right leg in front:', good, flush=True)
    print('SELECTED cand', best, cands[best][0], 'range', rr, 'blend', bl, flush=True)
    return cands, best, rr, bl


def prep():
    t0 = time.time()
    c = setup()
    W_GLOBAL[0] = c['W']
    print(f'section global rings {c["i0"]}..{c["i1"]} N {c["N"]} window local {c["wi"][0]}..{c["wi"][-1]} W_css {c["W"]:.3f} H {c["H"]:.3f} '
          f'SC {SC:.4f}; cov {c["cov_counts"]}; vis1 {int(c["v1"].sum())} vis2 {int(c["v2"].sum())}', flush=True)
    print('geometric init', c['ginfo'], flush=True)
    starts, sel, rng_, b_ax, secs = fit_all(c)
    p, s = np.array(sel['p']), sel['s']
    cands, best, rr, bl = convert(c, p, s, rng_)
    st, x = cands[best]
    json.dump(dict(starts=starts, selected={k: v for k, v in sel.items() if k != 'p'}, p=p.tolist(), s=s, beta_axis_deg=np.degrees(b_ax),
                   fit_range_local=list(map(int, rng_)), hinge_range_local=list(map(int, rr)), blend=int(bl),
                   candidates=[q for q, _ in cands], cand_selected=best, fit_seconds=secs, seconds=time.time() - t0, H=c['H'],
                   section=dict(i0=c['i0'], i1=c['i1'], N=c['N']), cov_counts=c['cov_counts']),
              open(os.path.join(OUT, 'prep.json'), 'w'), indent=2, default=float)
    np.savez(os.path.join(OUT, 'prep.npz'), x_init=x, x8=c['x8'], p=p, s=s, **{f'x_cand{i}': cands[i][1] for i in range(4)})
    print('prep done', time.time() - t0, flush=True)


def reconvert():
    """Re-run only the conversion from the stored primitive fit (prep.json)."""
    c = setup()
    W_GLOBAL[0] = c['W']
    pj = json.load(open(os.path.join(OUT, 'prep.json')))
    p, s = np.array(pj['p']), int(pj['s'])
    cands, best, rr, bl = convert(c, p, s, tuple(pj['fit_range_local']))
    pj.update(candidates=[q for q, _ in cands], cand_selected=best, hinge_range_local=list(map(int, rr)), blend=int(bl))
    json.dump(pj, open(os.path.join(OUT, 'prep.json'), 'w'), indent=2, default=float)
    np.savez(os.path.join(OUT, 'prep.npz'), x_init=cands[best][1], x8=c['x8'], p=p, s=s, **{f'x_cand{i}': cands[i][1] for i in range(4)})


def run():
    t0 = time.time()
    c = setup()
    W_GLOBAL[0] = c['W']
    x = np.load(os.path.join(OUT, 'prep.npz'))['x_init'].copy()
    jv = validate_jac(c, x)
    x, hist = run_stages(c, x, 'AP')
    L, R = c['Hg'].points(x)
    _, _, _, a, b = c['Hg'].unpack(x[None])
    np.savez(os.path.join(OUT, 'solution.npz'), x=x, L=L, R=R, a=a[0], b=b[0])
    json.dump(dict(history=hist, jac_validation=jv, seconds=time.time() - t0), open(os.path.join(OUT, 'run.json'), 'w'), indent=2, default=float)
    print('run done', time.time() - t0, flush=True)


def sil_raster(L, R, shape):
    pl, pr = AP.project(L), AP.project(R)
    im = Image.new('L', (shape[1], shape[0]), 0)
    dr = ImageDraw.Draw(im)
    for i in range(len(L) - 1):
        dr.polygon([tuple(pl[i]), tuple(pl[i + 1]), tuple(pr[i + 1]), tuple(pr[i])], fill=255)
    return np.array(im) > 0


def sil_metrics(c, L, R):
    import cv2
    alpha = c['alpha'] > 0.5
    ren = sil_raster(L, R, alpha.shape)
    x0, y0, x1, y1 = BOX
    a, b = alpha[y0:y1, x0:x1], ren[y0:y1, x0:x1]

    def bnd(m):
        er = ndi.binary_erosion(m, iterations=1)
        return m & ~er
    ba, bb = bnd(a), bnd(b)
    dta = cv2.distanceTransform((~ba).astype(np.uint8), cv2.DIST_L2, 5)
    dtb = cv2.distanceTransform((~bb).astype(np.uint8), cv2.DIST_L2, 5)
    r2a = dta[bb]            # rendered boundary -> alpha boundary
    a2r = dtb[ba]            # alpha boundary -> rendered boundary
    # one-sided restricted to alpha boundary pixels that lie within 6 px of the rendered footprint (ignores strands outside the section)
    near = ndi.distance_transform_edt(~b) < 6
    a2r_near = dtb[ba & near]
    inter = float((a & b).sum()); uni = float((a | b).sum())
    return dict(contour_err_sym=float(0.5 * (r2a.mean() + a2r.mean())), render_to_alpha_mean=float(r2a.mean()),
                render_to_alpha_rms=float(np.sqrt(np.mean(r2a ** 2))), render_to_alpha_p95=float(np.percentile(r2a, 95)),
                alpha_to_render_mean=float(a2r.mean()), alpha_to_render_rms=float(np.sqrt(np.mean(a2r ** 2))),
                alpha_to_render_p95=float(np.percentile(a2r, 95)),
                alpha_to_render_near_footprint_mean=float(a2r_near.mean()) if a2r_near.size else None,
                alpha_to_render_near_footprint_p95=float(np.percentile(a2r_near, 95)) if a2r_near.size else None,
                iou_in_box=inter / max(uni, 1), alpha_px_in_box=int(a.sum()), render_px_in_box=int(b.sum()), box=list(BOX)), ren


def reproj_metrics(c, L, R):
    d1, d2 = c['sd1'].sliding_dist(L), c['sd2'].sliding_dist(R)
    out = {}
    wi = np.zeros(c['N'], bool); wi[c['wi']] = True
    for nm, mk in (('apex_window', wi), ('section', np.ones(c['N'], bool))):
        v = np.concatenate([d1[mk][~np.isnan(d1[mk])], d2[mk][~np.isnan(d2[mk])]])
        out[nm] = dict(n=int(len(v)), rms_px=float(np.sqrt(np.mean(v ** 2))), p95_px=float(np.percentile(v, 95)), max_px=float(v.max()),
                       rms_css=float(np.sqrt(np.mean(v ** 2)) / SC), p95_css=float(np.percentile(v, 95) / SC))
    return out


def face_metrics(c, L, R):
    P = dict(vis1=c['vis1'], vis2=c['vis2'], ring_face=c['ring_face'])
    full = AKS.face_agreement(L, R, P)
    # per leg, with and without the visibility requirement
    C = (L + R) / 2
    cam = np.array([0, 0, AP.D])
    Tq = C[1:] - C[:-1]
    Dq = ((R - L)[1:] + (R - L)[:-1]) / 2
    n = np.cross(Tq, Dq)
    s = (n * (cam - (C[1:] + C[:-1]) / 2)).sum(1)
    face = np.where(s < 0, 'A', 'B')
    exp = c['ring_face'][:-1]
    vis = c['vis1'][1:] & c['vis1'][:-1] & c['vis2'][1:] & c['vis2'][:-1]
    out = dict(all_vis_required=full)
    for nm, ef in (('left_leg_A', 'A'), ('right_leg_B', 'B')):
        mk = exp == ef
        mv = mk & vis
        out[nm] = dict(n_all=int(mk.sum()), agree_all=int((face[mk] == ef).sum()), frac_all=float((face[mk] == ef).mean()) if mk.any() else None,
                       n_vis=int(mv.sum()), agree_vis=int((face[mv] == ef).sum()), frac_vis=float((face[mv] == ef).mean()) if mv.any() else None)
    return out


def mono_metrics(c, a, b):
    out = {}
    for nm, sl in (('section', slice(0, c['N'])), ('apex_window', slice(c['wi'][0], c['wi'][-1] + 1))):
        da, db = np.diff(a[sl]), np.diff(b[sl])
        out[nm] = dict(a_lt_0p5=int((da < 0.5).sum()), b_lt_0p5=int((db < 0.5).sum()), a_lt_0=int((da < 0).sum()), b_lt_0=int((db < 0).sum()),
                       n=int(len(da)), min_da=float(da.min()), min_db=float(db.min()))
    return out


def clearance_min(c, L, R, a, b):
    from ak_solve import nonadjacent_min_clear
    return nonadjacent_min_clear(L, R, (a + b) / 2, c['W'])


def metrics_for(c, L, R, a, b):
    M = dict(reproj=reproj_metrics(c, L, R), face=face_metrics(c, L, R), mono=mono_metrics(c, a, b))
    M['silhouette'], ren = sil_metrics(c, L, R)
    M['right_leg_in_front'] = ring_front(c, L, R)
    iso = S.iso_residuals(L, R, a, b, c['W'])
    pl = S.planarity(L, R)
    M['max_isometry_resid_css'] = float(max(np.abs(q).max() for q in iso))
    M['max_planarity_resid'] = float(np.abs(pl).max())
    M['min_clearance_nonadjacent_css'] = clearance_min(c, L, R, a, b)
    M['two_thk_css'] = 2 * c['thk']
    th = S.dihedral(L, R)                                  # hinge k = 1..N-2 -> th[k-1]
    k = np.arange(c['wi'][0] - 10, c['wi'][-1] + 11)
    k = k[(k >= 1) & (k <= c['N'] - 2)]
    tk = np.abs(th[k - 1])
    cs = np.cumsum(tk)
    C = (L + R) / 2
    arc = np.r_[0, np.cumsum(np.linalg.norm(np.diff(C, axis=0), axis=1))]
    s10, s90 = np.interp([0.1 * cs[-1], 0.9 * cs[-1]], cs, arc[k])
    M['roll_radius_estimate'] = dict(total_abs_theta_rad=float(cs[-1]), arc_10_90_css=float(s90 - s10), radius_css=float((s90 - s10) / np.pi),
                                     radius_over_W=float((s90 - s10) / np.pi / c['W']), max_abs_theta_window_rad=float(np.abs(th[c['wi'] - 1]).max()),
                                     n_hinges_over_pi6_window=int((np.abs(th[c['wi'] - 1]) > np.pi / 6 + 1e-6).sum()))
    M['z_range'] = [float(min(L[:, 2].min(), R[:, 2].min())), float(max(L[:, 2].max(), R[:, 2].max()))]
    return M, ren


def merge():
    c = setup()
    W_GLOBAL[0] = c['W']
    Hg = c['Hg']
    pj = json.load(open(os.path.join(OUT, 'prep.json')))
    pz = np.load(os.path.join(OUT, 'prep.npz'))
    z = np.load(os.path.join(OUT, 'solution.npz'))
    run_ = json.load(open(os.path.join(OUT, 'run.json')))
    Li, Ri = Hg.points(pz['x_init'])
    _, _, _, ai, bi = Hg.unpack(pz['x_init'][None])
    L, R, a, b = z['L'], z['R'], z['a'], z['b']
    M, ren = metrics_for(c, L, R, a, b)
    Mi, reni = metrics_for(c, Li, Ri, ai[0], bi[0])
    M['stitched_init'] = {k: Mi[k] for k in ('reproj', 'silhouette', 'right_leg_in_front', 'face')}
    M['prep'] = {k: pj[k] for k in ('selected', 'hinge_range_local', 'blend', 'candidates', 'cand_selected', 'H')}
    M['run'] = run_
    M['units'] = dict(SC_px_per_css=SC, W_css=c['W'], W_px=c['P']['W_px'], H_flat_spacing_css=c['H'], thk_css=c['thk'],
                      data_amplitude_per_px=1 / SC, cov_weight_stage2_3=20.0 / SC ** 2, cov_weight_stage4=40.0 / SC ** 2)
    json.dump(M, open(os.path.join(OUT, 'metrics.json'), 'w'), indent=2, default=float)
    print(json.dumps({k: v for k, v in M.items() if k not in ('run', 'prep', 'stitched_init')}, indent=1, default=float))
    cand = EP.emit(L, R, 'phone', os.path.join(OUT, 'apex_candidate.json'))
    Image.fromarray((ren * 255).astype(np.uint8)).save(os.path.join(OUT, 'sil_render.png'))
    print('emitted', cand)


if __name__ == '__main__':
    {'prep': prep, 'reconvert': reconvert, 'run': run, 'merge': merge}[sys.argv[1]]()
