#!/usr/bin/env python3
"""msfit: the whole AK by multiple shooting (docs/ribbon/turns/MULTISHOOT_PLAN.md).

Each section is its own paper-model chain (own pose, own rolls, own lambdas per interval) rooted at the section's first (flat) segment, built from
chain_fit.Chain (data, windows, coverage, over/under, face, seen rules ...). Step 1 fits the sections independently, bridges B and M, step 2 joins them
(continuity continuation 1 -> 10 -> 100 -> 1000), step 3 exports / renders.

  msfit.py section <T|S|F|A|K|X|P> [--secs S] [--gsecs S] [--nc N]
  msfit.py bridges          hidden sections B, M (continuity only)
  msfit.py joint [--secs S]
  msfit.py export           ak_candidate.json (+ checks)
  msfit.py sheets           offline renders + per-window sheets (needs msfit/render from render-pose.mjs)
  msfit.py all
"""
import json, math, os, sys, time
import numpy as np
from PIL import Image, ImageDraw
from scipy.optimize import least_squares
from scipy.spatial import cKDTree
from scipy.spatial.transform import Rotation

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import chain_fit as C       # noqa: E402
import ak_problem as AP     # noqa: E402
import ak_apex as AA        # noqa: E402
import ak_solve as AKS      # noqa: E402
import paper as PM          # noqa: E402
import solve3d as S         # noqa: E402
import emit_pose as EP      # noqa: E402

ROOT = AP.ROOT
OUT = os.path.join(ROOT, 'docs/ribbon/turns/msfit')
DIRS = {k: os.path.join(OUT, k) for k in ('sections', 'joint', 'overlays', 'sheets', 'render', 'offline')}
for d in [OUT] + list(DIRS.values()):
    os.makedirs(d, exist_ok=True)
C.OUT = OUT              # chain_fit.log() / run_fit() write their NOTES here, not into docs/ribbon/turns/chain
NR, NI, SC = C.NR, C.NI, C.SC
ROLLS_IDX = C.ROLLS_IDX
ROLLS_RING = {n: r for n, _, r in C.ROLLS}
EXT = 15
log = C.log
_i = [n for n, _, _ in C.ROLLS].index('top-K front bend')
C.ROLLS[_i:_i + 1] = [('top-K front bend a', 'bend', 1108), ('top-K front bend', 'bend', 1130), ('top-K front bend c', 'bend', 1152)]
C.NR = len(C.ROLLS)
C.ROLLS_IDX = {n: i for i, (n, _, _) in enumerate(C.ROLLS)}
NR_OLD = 28
C.BEND_SP = 0.6
NR, ROLLS_IDX = C.NR, C.ROLLS_IDX
ROLLS_RING = {n: r for n, _, r in C.ROLLS}

C.W_OVL = 20.0           # roll regions must not overlap (the exporter refuses overlapping rolls)
C.W_COV = 60.0           # owner priority: window coverage x3 (realism over overlap)
DATA_HALF = math.sqrt(0.5)   # data weight halved relative to coverage / realism terms
W_ALPHA = 3.0
CONT_A = False
W_X = 5.0
W_VISW = 20.0
W_TWIST = 25.0
W_FIXED = 10.0
W_LOOP = 20.0
LOOP_POLY = [(600, 1150), (760, 1120), (790, 1215), (640, 1240)]
import guides_overlay as GO   # noqa: E402
WIN_BOXES = GO.WINDOWS
WINNAME = {1: 's', 3: 'farleft', 5: 'apex', 7: 'bottomk', 11: 'wrap', 14: 'topk'}

# (name, intervals, roll names, data weight, rms gate, hidden)
SEC_DEF = [
    ('T', [0], ['tail bend 1', 'tail bend 2'], 0.3, 12.0, False),
    ('S', [1], ['S bend', 'S obl 4'], 1.0, 6.0, False),
    ('F', [2, 3], ['sweep bend', 'far-left fold'], 1.0, 6.0, False),
    ('A', [4, 5, 6], list(C.P3_NAMES), 1.0, 6.0, False),
    ('K', [7, 8], ['bottom-K fold 1', 'k_return bend'], 1.0, 6.0, False),
    ('B', [9], ['back-layer bend'], 1.0, None, True),
    ('X', [10, 11], ['crossbar bend 1', 'wrap curl', 'wrap twist 1', 'wrap twist 2'], 1.0, 6.0, False),
    ('M', [12], ['middle-layer bend'], 1.0, None, True),
    ('P', [13, 14, 15], ['top-K front bend a', 'top-K tip fold', 'end bend'], 1.0, 6.0, False),
]
OU_PAD = 8000
CLR_PAD = 4000
W_CLR = 0.5


class Sec:
    def __init__(self, pr, name, ivs, rolls, weight, gate, hidden):
        self.name, self.ivs, self.weight, self.gate, self.hidden = name, list(ivs), weight, gate, hidden
        self.r0, self.r1 = int(pr.i0[ivs[0]]), int(pr.i1[ivs[-1]])
        self.lo, self.hi = max(0, self.r0 - EXT), min(pr.N - 1, self.r1 + EXT)
        self.rolls = list(rolls)
        self.act = sorted(ROLLS_IDX[n] for n in rolls)
        self.free = np.array(sorted(list(range(6)) + [6 + 4 * k + j for k in self.act for j in range(4)] + [6 + 4 * NR + j for j in self.ivs]))
        self.tau_in = float(pr.tau_b[ivs[0]])                    # trace coordinate of the section start ring (junction with the previous section)
        self.tau_out = float(pr.tau_b[ivs[-1] + 1])              # ... and of the end (junction with the next)


# ================================================================== section problem
class SecPrb(C.Chain):
    """chain_fit.Chain restricted to one section: root frame = first flat segment (own pose), own lambdas (neighbours extrapolated), tail weight, own face rings."""

    def __init__(self):
        super().__init__()
        self.sec = None
        self.skip_ou = False
        self.k_apex = -1                     # candidate generation: every section is grown forward from its own root
        self.secs = {n: Sec(self, *a[:3], a[3], a[4], a[5]) for a in SEC_DEF for n in [a[0]]}
        for pair in self.sd:
            for o in pair:
                o.scale = DATA_HALF
        Cc_ = (self.e1 + self.e2) / 2
        i_low = int(np.argmin(np.hypot(*(Cc_[659:765] - np.array([700.0, 1240.0])).T))) + 659
        self.roll_tau0[ROLLS_IDX['bottom-K fold 1']] = float(self.tau[i_low])
        i_arch = int(np.argmin(np.hypot(*(Cc_[859:1067] - np.array([240.0, 783.0])).T))) + 859
        self.arch_ring = i_arch
        self.roll_tau0[ROLLS_IDX['wrap curl']] = float(self.tau[i_arch]) - 0.3 * self.W
        k_ = ROLLS_IDX['S obl 4']
        self.roll_tau0[k_] = float(self.tau[218])
        self.lo, self.hi = self.bounds()
        self.x0 = self.x_init()
        self._foot = None
        self.rw = 1.0
        m = Image.new('L', (852, 1846), 0)
        ImageDraw.Draw(m).polygon(LOOP_POLY, fill=255)
        self.loop_mask = np.array(m) > 0
        ys, xs = np.nonzero(self.loop_mask[::6, ::6])
        cx_, cy_ = xs * 6 + 3, ys * 6 + 3
        self.loop_cells = np.sort((cx_ // 6 + 2000).astype(np.int64) * 4000 + (cy_ // 6 + 2000))

    def bounds(self):
        lo, hi = super().bounds()
        W = self.W
        for k in range(NR):
            if self.kind[k] in ('fold', 'obl'):
                lo[6 + 4 * k + 2] = 0.3 * W
                hi[6 + 4 * k + 2] = max(hi[6 + 4 * k + 2], 3.0 * W)
            if self.rname[k] in ('top-K front bend a', 'top-K front bend'):
                lo[6 + 4 * k + 2], hi[6 + 4 * k + 2] = 2.0 * W, 6.0 * W
            if self.rname[k] == 'S bend':
                lo[6 + 4 * k + 2], hi[6 + 4 * k + 2] = 0.3 * W, 1.2 * W
                lo[6 + 4 * k + 3], hi[6 + 4 * k + 3] = -np.pi - 0.3, np.pi + 0.3
            if self.rname[k] == 'S obl 4':
                lo[6 + 4 * k + 2], hi[6 + 4 * k + 2] = 1.5 * W, 6.0 * W
                lo[6 + 4 * k + 3], hi[6 + 4 * k + 3] = -0.6, 0.6
            if self.rname[k] == 'crossbar bend 1':
                lo[6 + 4 * k + 2] = 3.0 * W
                lo[6 + 4 * k + 3], hi[6 + 4 * k + 3] = -0.4, 0.4
            if self.rname[k] == 'wrap curl':
                lo[6 + 4 * k + 2], hi[6 + 4 * k + 2] = 0.8 * W, 2.0 * W
                lo[6 + 4 * k + 3], hi[6 + 4 * k + 3] = -np.pi - 0.8, np.pi + 0.8
            if self.rname[k] == 'top-K tip fold':
                lo[6 + 4 * k + 2], hi[6 + 4 * k + 2] = 0.35 * W, 1.0 * W
        return lo, hi

    def foot(self):
        """projected footprint of A's left leg (interval 4): distance (px) outside it"""
        if self._foot is None:
            from scipy import ndimage as ndi
            xa = ldx(self, sec_path('A'))
            sa = self.secs['A']
            keep = self.sec
            self.bind(sa)
            L, R = sec_edges(self, xa, sa, np.arange(self.i0[4], self.i1[4] + 1))
            self.sec = keep; self._active = set(keep.act) if keep is not None else set()
            pl, pr_ = AP.project(L), AP.project(R)
            im = Image.new('L', (852, 1846), 0)
            dr = ImageDraw.Draw(im)
            for i in range(len(pl) - 1):
                dr.polygon([tuple(pl[i]), tuple(pl[i + 1]), tuple(pr_[i + 1]), tuple(pr_[i])], fill=255)
            self._foot = ndi.distance_transform_edt(~(np.array(im) > 0))
        return self._foot

    def bind(self, sec):
        self.sec = sec if not isinstance(sec, str) else self.secs[sec]
        self._active = set(self.sec.act)
        return self.sec

    # --- flat coordinate: anchored so that F(tau_in) = tau_in (own lambdas; neighbour intervals extrapolate the nearest own lambda)
    def lam(self, x):
        l = x[6 + 4 * NR:6 + 4 * NR + NI].copy()
        o = self.sec.ivs
        for j in range(NI):
            if j < o[0]:
                l[j] = l[o[0]]
            elif j > o[-1]:
                l[j] = l[o[-1]]
        return l

    def F(self, x, tau):
        U = np.r_[0.0, np.cumsum(self.lam(x) * np.diff(self.tau_b))]
        tref = self.sec.tau_in
        off = np.interp(tref, self.tau_b, U) - tref
        return np.interp(tau, self.tau_b, U) - off

    def ctx(self, x, act):
        act = list(act)
        r = self.rolls(x)[act].copy()
        r[:, 0] = self.F(x, r[:, 0])
        return C.build_frames(x[:3], x[3:6], r, 0), r

    def stage_info(self, act, lo, hi):
        sec = self.sec
        key = ('ms', sec.name, tuple(sorted(act)), lo, hi, self.bk_bottom)
        if key in self._stage:
            return self._stage[key]
        st = dict(super().stage_info(act, lo, hi))
        st['ivs'] = list(sec.ivs)
        fo = self.face_ok.copy(); fo[:sec.r0] = False; fo[sec.r1:] = False
        st['face_j'] = np.nonzero(fo)[0]
        st['face_sign'] = np.where(self.face_exp[st['face_j']] == 'A', 1.0, -1.0)
        st['tailz'] = False
        st.pop('end_idx', None)
        xm = math.sqrt(2.0) if sec.name == 'X' else 1.0
        st['amp1'] = st['amp1'] * sec.weight * DATA_HALF * xm
        st['amp2'] = st['amp2'] * sec.weight * DATA_HALF * xm
        self._stage[key] = st
        return st

    # ------------------------------------------------------------ realism blocks
    def xing_block(self, cx, st):
        (G, E), r = cx
        W = self.W
        out = []
        for i in range(len(r)):
            u0, b, rho, phi = r[i]
            L = rho * abs(phi)
            n = 40
            if L < 1.0:
                out.append(np.zeros(n - 1 + n - 2 + 2 * (n - 1)))
                continue
            Xp = np.linspace(0.0, L, n)
            cb, sb = np.cos(b), np.sin(b)
            uL = u0 + (Xp - W / 2 * cb) / sb; uR = u0 + (Xp + W / 2 * cb) / sb
            L3 = C.chain_surface(G, r, uL, np.full(n, -W / 2)); R3 = C.chain_surface(G, r, uR, np.full(n, W / 2))
            pl, pr_ = AP.project_css(L3), AP.project_css(R3)

            def cross2(a, b_):
                d = pr_[a] - pl[a]; ln = np.maximum(np.linalg.norm(d, axis=1), 1e-9)
                o = lambda p: (d[:, 0] * (p[:, 1] - pl[a][:, 1]) - d[:, 1] * (p[:, 0] - pl[a][:, 0])) / ln
                sa, sb_ = o(pl[b_]), o(pr_[b_])
                d2 = pr_[b_] - pl[b_]; ln2 = np.maximum(np.linalg.norm(d2, axis=1), 1e-9)
                o2 = lambda p: (d2[:, 0] * (p[:, 1] - pl[b_][:, 1]) - d2[:, 1] * (p[:, 0] - pl[b_][:, 0])) / ln2
                sc, sd = o2(pl[a]), o2(pr_[a])
                inter = (sa * sb_ < 0) & (sc * sd < 0)
                return np.where(inter, np.minimum.reduce([np.abs(sa), np.abs(sb_), np.abs(sc), np.abs(sd)]), 0.0)
            i0_ = np.arange(n - 1); i2 = np.arange(n - 2)
            c1 = cross2(i0_, i0_ + 1); c2 = cross2(i2, i2 + 2)
            sepL = np.maximum(0.0, 0.15 * np.linalg.norm(np.diff(L3, axis=0), axis=1) - np.linalg.norm(np.diff(pl, axis=0), axis=1))
            sepR = np.maximum(0.0, 0.15 * np.linalg.norm(np.diff(R3, axis=0), axis=1) - np.linalg.norm(np.diff(pr_, axis=0), axis=1))
            out.append(np.concatenate([c1, c2, sepL, sepR]) * SC * W_X)
        return np.concatenate(out) if out else np.zeros(0)

    def ovm_block(self, r):
        """roll regions must keep >= 1 css between consecutive rolls at both edges (exporter refuses overlaps; crossings otherwise)"""
        W = self.W
        g = []
        for a in range(len(r) - 1):
            u0, b0, r0, p0 = r[a]; u1, b1, r1, p1 = r[a + 1]
            for v in (-W / 2, W / 2):
                g.append((u1 + v / np.tan(b1)) - (u0 + v / np.tan(b0) + r0 * abs(p0) / np.sin(b0)))
        return np.maximum(0.0, 1.0 - np.array(g)) * SC * 20.0 if g else np.zeros(0)

    def smooth_block(self, x, cx):
        """curvature-oscillation penalty on both projected edges: opposite-sign curvature (|k W| product) at lag 0.45 W"""
        (G, E), r = cx
        W = self.W
        sec = self.sec
        u_lo = float(self.F(x, np.array([sec.tau_in]))[0]); u_hi = float(self.F(x, np.array([sec.tau_out]))[0])
        n = max(20, int((sec.tau_out - sec.tau_in) / 1.5))
        u = np.linspace(u_lo, u_hi, n)
        ds = (u_hi - u_lo) / (n - 1)
        lag = max(2, int(0.45 * W / 1.5))
        out = []
        for v in (-W / 2, W / 2):
            P = AP.project_css(C.chain_surface(G, r, u, np.full(n, v)))
            t = np.diff(P, axis=0)
            sl = np.maximum(np.linalg.norm(t, axis=1), 1e-9)
            ang = np.arctan2(t[1:, 0] * t[:-1, 1] - t[1:, 1] * t[:-1, 0], (t[1:] * t[:-1]).sum(1))
            k = ang / ((sl[1:] + sl[:-1]) / 2) * W
            k = np.where(np.abs(k) < 0.25, 0.0, k)
            prod = -k[:-lag] * k[lag:]
            out.append(np.maximum(0.0, prod - 0.02) * 20.0)
        return np.concatenate(out)

    def parts(self, x, st):
        d = super().parts(x, st)
        cx = self.ctx(x, st['act'])
        (G, E), r = cx
        W = self.W
        d['xing'] = self.xing_block(cx, st)
        d['ovm'] = self.ovm_block(r)
        d['alpha'] = self.alpha_block(x, st, cx)
        d['smooth'] = self.smooth_block(x, cx)
        act = st['act']
        names = [self.rname[k] for k in act]
        if 'crossbar bend 1' in names:
            iic = np.array([i for i in range(int(self.i0[10]), int(self.i1[10]) + 1) if self.v1[i] and st['lo'] <= i <= st['hi']], int)
            uc_ = self.u_ring(x)[iic]
            pc_ = AP.project(C.chain_surface(G, r, uc_, np.full(len(iic), -W / 2)))
            d['bar1'] = ((pc_ - self.e1[iic]) * 1.0).ravel()
        if 'wrap curl' in names:
            ring0 = ROLLS_RING['wrap curl']
            idx = np.array([i for i in range(ring0, int(self.i1[11]) + 1) if (self.v1[i] or self.v2[i]) and st['lo'] <= i <= st['hi']], int)
            u = self.u_ring(x)[idx]
            n = len(idx)
            p1 = AP.project(C.chain_surface(G, r, u, np.full(n, -W / 2))); p2 = AP.project(C.chain_surface(G, r, u, np.full(n, W / 2)))
            wm = np.hypot(*(p2 - p1).T); wt = np.hypot(*(self.e2[idx] - self.e1[idx]).T)
            d['visw'] = np.maximum(0.0, 0.6 * wt - wm) * math.sqrt(W_VISW)
            tw = []
            dist = self.foot()
            from scipy import ndimage as ndi
            for nm_ in ('wrap twist 1', 'wrap twist 2'):
                if nm_ in names:
                    i = names.index(nm_)
                    u0, b, rho, phi = r[i]
                    P = AP.project(C.chain_surface(G, r, np.array([u0]), np.array([0.0])))
                    tw.append(ndi.map_coordinates(dist, [[P[0, 1]], [P[0, 0]]], order=1, mode='nearest') * W_TWIST)
            d['twist'] = np.concatenate(tw) if tw else np.zeros(0)
            ic = names.index('wrap curl')
            u_in = float(self.F(x, np.array([self.sec.tau_in]))[0])
            d['curlstart'] = np.array([max(0.0, 0.3 * W - (r[ic, 0] - u_in)) * SC * 20.0])
            d['curlface'] = self.curlface(x, st, cx, ic)
            idx2 = np.array([i for i in range(ring0, int(self.i1[11]) + 1) if (self.v1[i] or self.v2[i]) and st['lo'] <= i <= st['hi']], int)
            n2 = len(idx2)
            u2 = self.u_ring(x)[idx2]
            q1 = AP.project(C.chain_surface(G, r, u2, np.full(n2, -W / 2))); q2 = AP.project(C.chain_surface(G, r, u2, np.full(n2, W / 2)))
            m1 = self.v1[idx2][:, None]; m2 = self.v2[idx2][:, None]
            d['return2'] = np.concatenate([((q1 - self.e1[idx2]) * m1).ravel(), ((q2 - self.e2[idx2]) * m2).ravel()]) * math.sqrt(1.0) * C.DATA_X2 if False else np.concatenate([((q1 - self.e1[idx2]) * m1).ravel(), ((q2 - self.e2[idx2]) * m2).ravel()]) * DATA_HALF
        if 'end bend' in names:
            W_ = self.W
            for e_, v_, sg_ in ((self.e1, self.v1, -1), (self.e2, self.v2, 1)):
                ii = np.array([i for i in range(int(self.i0[15]), int(self.i1[15]) + 1) if not v_[i] and st['lo'] <= i <= st['hi']], int)
                u = self.u_ring(x)[ii]
                p_ = AP.project(C.chain_surface(G, r, u, np.full(len(ii), sg_ * W_ / 2)))
                d['hidend' + str(sg_)] = ((p_ - e_[ii]) * math.sqrt(0.3)).ravel()
        if 'top-K tip fold' in names:
            iif = np.array([i for i in range(int(self.i0[13]), int(self.i1[13]) + 1) if self.v2[i] and st['lo'] <= i <= st['hi']], int)
            uf = self.u_ring(x)[iif]
            pf = AP.project(C.chain_surface(G, r, uf, np.full(len(iif), W / 2)))
            d['front2'] = ((pf - self.e2[iif]) * 1.0).ravel()
            ii = np.array([i for i in range(int(self.i0[13]), int(self.i1[14]) + 1) if self.v2[i] and st['lo'] <= i <= st['hi']], int)
            u = self.u_ring(x)[ii]
            p_ = AP.project(C.chain_surface(G, r, u, np.full(len(ii), W / 2)))
            d['topedge2'] = ((p_ - self.e2[ii]) * DATA_HALF).ravel()
        if 'bottom-K fold 1' in names and CONT_A:
            d['contA'] = self.a_cont(x, cx)
            ir = np.array([i for i in range(765, 814) if st['lo'] <= i <= st['hi']], int)
            ur = self.u_ring(x)[ir]
            q1 = AP.project(C.chain_surface(G, r, ur, np.full(len(ir), -W / 2))); q2 = AP.project(C.chain_surface(G, r, ur, np.full(len(ir), W / 2)))
            wm_ = np.hypot(*(q2 - q1).T); wt_ = np.hypot(*(self.e2[ir] - self.e1[ir]).T)
            vis_ = (self.v1[ir] | self.v2[ir]).astype(float)
            d['retw'] = np.maximum(0.0, 0.75 * wt_ - wm_) * vis_ * math.sqrt(20.0)
            d['ret2'] = np.concatenate([((q1 - self.e1[ir]) * self.v1[ir][:, None]).ravel(), ((q2 - self.e2[ir]) * self.v2[ir][:, None]).ravel()]) * DATA_HALF
        if 'bottom-K fold 1' in names:
            ii = np.array([i for i in range(706, 724) if st['lo'] <= i <= st['hi'] and self.v1[i]], int)
            u = self.u_ring(x)[ii]
            p1 = AP.project(C.chain_surface(G, r, u, np.full(len(ii), -W / 2)))
            d['fixed1'] = ((p1 - self.e1[ii]) * math.sqrt(W_FIXED)).ravel()
            d['loopface'] = self.loopface(x, st, cx)
        return d

    def others_mask(self, name):
        key = ('om', name)
        if key not in self._stage:
            m = Image.new('L', (852, 1846), 0)
            dr = ImageDraw.Draw(m)
            keep = (self.sec, self.bk_bottom)
            for nm in SECN:
                if nm == name or not os.path.exists(sec_path(nm)):
                    continue
                sec = self.secs[nm]
                xo = ldx(self, sec_path(nm))
                self.bind(nm)
                self.bk_bottom = None
                L, R = sec_edges(self, xo, sec)
                pl, pr_ = AP.project(L), AP.project(R)
                for i in range(len(pl) - 1):
                    dr.polygon([tuple(pl[i]), tuple(pl[i + 1]), tuple(pr_[i + 1]), tuple(pr_[i])], fill=255)
            self.sec, self.bk_bottom = keep
            self._active = set(self.sec.act) if self.sec is not None else set()
            self._stage[key] = np.array(m) > 0
        return self._stage[key]

    def alpha_cells(self, wi, name):
        key = ('ac', wi, name)
        if key not in self._stage:
            nm = C.WIN_NAMES[wi]
            x0, y0, x1, y1 = C.WINDOWS_BOX['scurve' if nm == 's' else nm]
            ys, xs = np.mgrid[y0 + 2:y1:4, x0 + 2:x1:4]
            ys, xs = ys.ravel(), xs.ravel()
            a = self.alpha[ys, xs]
            oth = self.others_mask(name)[ys, xs]
            kind = np.where((a > 0.8) & ~oth, 1, np.where(a < 0.1, 0, -1))
            m = kind >= 0
            self._stage[key] = (xs[m] - x0, ys[m] - y0, kind[m], (x0, y0, x1, y1))
        return self._stage[key]

    def alpha_block(self, x, st, cx):
        from scipy import ndimage as ndi
        (G, E), r = cx
        W = self.W
        out = []
        for wi in st['wins']:
            k = self.win_iv[wi]
            xs, ys, kind, (x0, y0, x1, y1) = self.alpha_cells(wi, self.sec.name)
            idx = np.arange(max(self.i0[k] - 15, st['lo']), min(self.i1[k] + 15, st['hi']) + 1)
            u = self.u_ring(x)[idx]; n = len(idx)
            pl = AP.project(C.chain_surface(G, r, u, np.full(n, -W / 2))) - np.array([x0, y0])
            pr_ = AP.project(C.chain_surface(G, r, u, np.full(n, W / 2))) - np.array([x0, y0])
            im = Image.new('L', (x1 - x0, y1 - y0), 0)
            dr = ImageDraw.Draw(im)
            for i in range(n - 1):
                dr.polygon([tuple(pl[i]), tuple(pl[i + 1]), tuple(pr_[i + 1]), tuple(pr_[i])], fill=255)
            m = np.array(im) > 0
            d_out = ndi.distance_transform_edt(~m) if (~m).any() else np.zeros(m.shape)
            d_in = ndi.distance_transform_edt(m) if m.any() else np.zeros(m.shape)
            res = np.where(kind == 1, d_out[ys, xs], d_in[ys, xs])
            out.append(np.minimum(res, 25.0) * math.sqrt(W_ALPHA) * 0.1)
        if self.sec.name == 'X':
            out.append(self.alpha_extra(x, st, G, r, 'bar', (859, 910)))
        return np.concatenate(out) if out else np.zeros(0)

    def alpha_extra(self, x, st, G, r, tag, rr):
        from scipy import ndimage as ndi
        W = self.W
        key = ('ae', tag)
        if key not in self._stage:
            ii = np.arange(rr[0], rr[1] + 1)
            p = np.concatenate([self.e1[ii], self.e2[ii]])
            x0, y0 = np.maximum(0, p.min(0) - 30).astype(int); x1, y1 = np.minimum([852, 1846], p.max(0) + 30).astype(int)
            ys, xs = np.mgrid[y0 + 2:y1:4, x0 + 2:x1:4]
            ys, xs = ys.ravel(), xs.ravel()
            a = self.alpha[ys, xs]
            oth = self.others_mask(self.sec.name)[ys, xs]
            kind = np.where((a > 0.8) & ~oth, 1, np.where(a < 0.1, 0, -1))
            m = kind >= 0
            self._stage[key] = (xs[m] - x0, ys[m] - y0, kind[m], (int(x0), int(y0), int(x1), int(y1)))
        xs, ys, kind, (x0, y0, x1, y1) = self._stage[key]
        idx = np.arange(max(rr[0] - 10, st['lo']), min(rr[1] + 10, st['hi']) + 1)
        u = self.u_ring(x)[idx]; n = len(idx)
        pl = AP.project(C.chain_surface(G, r, u, np.full(n, -W / 2))) - np.array([x0, y0])
        pr_ = AP.project(C.chain_surface(G, r, u, np.full(n, W / 2))) - np.array([x0, y0])
        im = Image.new('L', (x1 - x0, y1 - y0), 0)
        dr = ImageDraw.Draw(im)
        for i in range(n - 1):
            dr.polygon([tuple(pl[i]), tuple(pl[i + 1]), tuple(pr_[i + 1]), tuple(pr_[i])], fill=255)
        m = np.array(im) > 0
        d_out = ndi.distance_transform_edt(~m) if (~m).any() else np.zeros(m.shape)
        d_in = ndi.distance_transform_edt(m) if m.any() else np.zeros(m.shape)
        res = np.where(kind == 1, d_out[ys, xs], d_in[ys, xs])
        return np.minimum(res, 25.0) * math.sqrt(W_ALPHA) * 0.1

    def a_ref(self):
        """locked A: 5 v-samples at A's last ring and 0.3 W before it (positions) + normals at the last ring"""
        key = ('aref',)
        if key not in self._stage:
            keep = (self.sec, self.bk_bottom)
            sa = self.bind('A')
            xa = ldx(self, os.path.join(DIRS['sections'], 'sec_A_APPROVED.npz'))
            cx = self.ctx(xa, sa.act)
            tj = self.secs['K'].tau_in
            u0 = float(self.F(xa, np.array([tj]))[0])
            W = self.W
            vv = np.array([-0.5, -0.25, 0.0, 0.25, 0.5]) * W
            P = np.concatenate([C.chain_surface(cx[0][0], cx[1], np.full(5, u0 + d * W), vv) for d in (0.0, -0.3)])
            h = 0.05
            a = C.chain_surface(cx[0][0], cx[1], np.full(5, u0 + h), vv); b = C.chain_surface(cx[0][0], cx[1], np.full(5, u0 - h), vv)
            c_ = C.chain_surface(cx[0][0], cx[1], np.full(5, u0), vv + h); e = C.chain_surface(cx[0][0], cx[1], np.full(5, u0), vv - h)
            N = np.cross(a - b, c_ - e); N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
            self.sec, self.bk_bottom = keep
            self._active = set(self.sec.act) if self.sec is not None else set()
            self._stage[key] = (P, N, vv)
        return self._stage[key]

    def a_cont(self, x, cx):
        (G, E), r = cx
        W = self.W
        P0, N0, vv = self.a_ref()
        u0 = float(self.F(x, np.array([self.sec.tau_in]))[0])
        P = np.concatenate([C.chain_surface(G, r, np.full(5, u0 + d * W), vv) for d in (0.0, -0.3)])
        h = 0.05
        a = C.chain_surface(G, r, np.full(5, u0 + h), vv); b = C.chain_surface(G, r, np.full(5, u0 - h), vv)
        c_ = C.chain_surface(G, r, np.full(5, u0), vv + h); e = C.chain_surface(G, r, np.full(5, u0), vv - h)
        N = np.cross(a - b, c_ - e); N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
        return np.concatenate([(P - P0).ravel(), ((N - N0) * W).ravel()]) * math.sqrt(200.0) * 0.5

    def curlface(self, x, st, cx, ic):
        """the visible (front-most) surface of the curl roll must show face A (dark): hinge on n.view over the curl's samples that are front-most in their cell"""
        (G, E), r = cx
        W = self.W
        u0, b, rho, phi = r[ic]
        t = abs(phi) * np.linspace(0.1, 0.9, 30)
        vv = np.linspace(-0.45, 0.45, 9) * W
        T, V = np.meshgrid(t, vv, indexing='ij')
        Xp = (rho * T).ravel(); V = V.ravel()
        Yp = (V + Xp * np.cos(b)) / np.sin(b)
        U = u0 + Yp * np.cos(b) + Xp * np.sin(b)
        h = 0.4
        P0 = C.chain_surface(G, r, U, V); Pu = C.chain_surface(G, r, U + h, V); Pv = C.chain_surface(G, r, U, V + h)
        N = np.cross(Pu - P0, Pv - P0); N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
        vh = self.cam - P0; vh /= np.linalg.norm(vh, axis=1, keepdims=True)
        sh = (N * vh).sum(1)
        # dense z-buffer of the section (cells 6 px)
        ur = np.linspace(self.F(x, np.array([self.sec.tau_in]))[0], self.F(x, np.array([self.sec.tau_out]))[0], 220)
        vz = np.linspace(-W / 2, W / 2, 15)
        Pd = C.chain_surface(G, r, np.repeat(ur, 15), np.tile(vz, 220))
        def key(P):
            p2 = AP.project(P)
            return (np.floor(p2[:, 0] / 6).astype(np.int64) + 2000) * 4000 + (np.floor(p2[:, 1] / 6).astype(np.int64) + 2000)
        kd = key(Pd); order = np.lexsort((Pd[:, 2], kd)); ks = kd[order]; last = np.r_[ks[1:] != ks[:-1], True]
        kk = ks[last]; zz = Pd[order][last][:, 2]
        k0 = key(P0); i = np.minimum(np.searchsorted(kk, k0), len(kk) - 1)
        front = (kk[i] == k0) & (P0[:, 2] >= zz[i] - 2.0)
        return np.where(front, np.maximum(0.0, sh + 0.05), 0.0) * 20.0

    def loopface(self, x, st, cx):
        (G, E), r = cx
        W = self.W
        pts, nrm = [], []
        for j in (7, 8):
            ta, tb = self.tau[self.i0[j]], self.tau[self.i0[j + 1]]
            n = max(6, int(np.ceil((tb - ta) / 1.0)))
            t = np.linspace(ta, tb, n, endpoint=False)
            u = self.F(x, t)
            vv = np.linspace(-W / 2, W / 2, 25)
            U = np.repeat(u, 25); V = np.tile(vv, n)
            h = 0.4
            P0 = C.chain_surface(G, r, U, V); Pu = C.chain_surface(G, r, U + h, V); Pv = C.chain_surface(G, r, U, V + h)
            pts.append(P0); nrm.append(np.cross(Pu - P0, Pv - P0))
        P = np.concatenate(pts); N = np.concatenate(nrm)
        N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
        vh = self.cam - P; vh /= np.linalg.norm(vh, axis=1, keepdims=True)
        sh = (N * vh).sum(1)
        p2 = AP.project(P)
        key = (np.floor(p2[:, 0] / 6).astype(np.int64) + 2000) * 4000 + (np.floor(p2[:, 1] / 6).astype(np.int64) + 2000)
        order = np.lexsort((P[:, 2], key))
        ks = key[order]
        last = np.r_[ks[1:] != ks[:-1], True]
        sel = order[last]
        kk = key[sel]; shs = sh[sel]
        i = np.searchsorted(kk, self.loop_cells)
        ic = np.minimum(i, len(kk) - 1)
        ok = kk[ic] == self.loop_cells
        return np.where(ok, np.maximum(0.0, shs[ic] + 0.05), 0.0) * W_LOOP

    def ou_blocks(self, x, st, cx):
        if self.skip_ou:
            return np.zeros(0), np.zeros(0), np.zeros(0), (None, None, None, None)
        return super().ou_blocks(x, st, cx)

    def sec_x(self, name=None):
        return self.x0.copy()


def upgrade_x(pr, x):
    """x vectors saved with the 28-roll layout -> current layout (P got two extra front bends)"""
    x = np.asarray(x, float)
    if len(x) == pr.nx:
        return x
    assert len(x) == 6 + 4 * NR_OLD + NI, len(x)
    xn = pr.x0.copy(); xn[:6] = x[:6]
    mp = {**{k: k for k in range(25)}, 25: 26, 26: 28, 27: 29}
    for ko, kn in mp.items():
        xn[6 + 4 * kn:10 + 4 * kn] = x[6 + 4 * ko:10 + 4 * ko]
    xn[6 + 4 * NR:] = x[6 + 4 * NR_OLD:]
    return xn


def ldx(pr, path):
    return upgrade_x(pr, np.load(path)['x'])


def sec_path(name):
    return os.path.join(DIRS['sections'], f'sec_{name}.npz')


# ================================================================== helpers: poses, data, overlay
def sec_edges(pr, x, sec, rings=None):
    idx = np.arange(sec.r0, sec.r1 + 1) if rings is None else np.asarray(rings)
    cx = pr.ctx(x, sec.act)
    u = pr.F(x, pr.tau[idx])
    W = pr.W
    n = len(idx)
    return (C.chain_surface(cx[0][0], cx[1], u, np.full(n, -W / 2)), C.chain_surface(cx[0][0], cx[1], u, np.full(n, W / 2)))


def kabsch_pose(pr, sec, x, tilt_deg):
    """posed section: Kabsch (rigid, 3D) of the section edges (rolls as set) onto the back-projected trace at the depth-profile z; tilt: rotate about the
    screen x-axis through the centroid, then re-solve in-plane rotation + translation (2D Procrustes)"""
    x = x.copy(); x[:6] = 0
    idx = np.arange(sec.lo, sec.hi + 1)
    cx = pr.ctx(x, sec.act)
    u = pr.F(x, pr.tau[idx]); n = len(idx); W = pr.W
    Pm = np.concatenate([C.chain_surface(cx[0][0], cx[1], u, np.full(n, -W / 2)), C.chain_surface(cx[0][0], cx[1], u, np.full(n, W / 2))])
    Q = np.concatenate([pr.L0[idx], pr.R0[idx]])
    R, t = AA.kabsch(Pm, Q)
    if tilt_deg != 0:
        Pt = Pm @ R.T + t
        cen = Pt.mean(0)
        Rt = Rotation.from_euler('x', tilt_deg, degrees=True).as_matrix()
        Ptt = (Pt - cen) @ Rt.T + cen
        pc, qc = Ptt.mean(0), Q.mean(0)
        H = (Ptt[:, :2] - pc[:2]).T @ (Q[:, :2] - qc[:2])
        U_, _, Vt = np.linalg.svd(H)
        dd = np.sign(np.linalg.det(Vt.T @ U_.T))
        R2 = Vt.T @ np.diag([1, dd]) @ U_.T
        Rz = np.eye(3); Rz[:2, :2] = R2
        tz = qc - Rz @ pc
        R = Rz @ Rt @ R
        t = Rz @ (Rt @ (t - cen) + cen) + tz
    x[:3] = Rotation.from_matrix(R).as_rotvec(); x[3:6] = t
    return x


def data_stats(pr, x, sec):
    """per-ring distances (px) over the section's OWN rings: point-to-point outside windows, sliding inside"""
    st = pr.stage_info(sec.act, sec.lo, sec.hi)
    sel = np.zeros(pr.N, bool); sel[sec.r0:sec.r1 + 1] = True
    return C.stats(C.ring_dists(pr, x, st, sel))


_cut = {}


def cutout_dim():
    if 'bg' not in _cut:
        im = Image.open(os.path.join(ROOT, 'docs/ribbon/ref/ak-signature-cutout.webp')).convert('RGBA')
        bg = Image.new('RGBA', im.size, (0, 0, 0, 255)); bg.alpha_composite(im)
        _cut['bg'] = Image.blend(bg.convert('RGB'), Image.new('RGB', im.size, (0, 0, 0)), 0.45)
    return _cut['bg'].copy()


_trace = {}


def trace_rings():
    if not _trace:
        P = AKS.load(1)
        _trace.update(e1=P['e1'], e2=P['e2'], v1=P['vis1'], v2=P['vis2'])
    return _trace


def sec_rulings(pr, x, sec, u_lo=None, u_hi=None, step=0.5, hidden=True):
    """TRUE rulings of one section (roll: segments parallel to the roll axis through the flat line at angle beta; flat runs: beta interpolated between the adjacent
    rolls, chain_fit.emit_chain rule) mapped through the surface. Returns dict(L, R, uc, inroll, hidL, hidR, regs, gaps, cx). Edge points hidden by another part of the
    same section's dense surface (z-buffer, 3 px cells) are flagged."""
    pr.bind(sec)
    W = pr.W
    cx = pr.ctx(x, sec.act)
    rolls = cx[1]
    if u_lo is None:
        u_lo = float(pr.F(x, np.array([sec.tau_in]))[0])
    if u_hi is None:
        u_hi = float(pr.F(x, np.array([sec.tau_out]))[0])
    r_lo = min([u_lo] + [r[0] for r in rolls]) - 1.0
    r_hi = max([u_hi] + [r[0] + r[2] * abs(r[3]) / np.sin(r[1]) for r in rolls]) + 1.0
    regs, gaps = sec_regions(rolls, W, r_lo, r_hi)
    n_ = max(2, int(math.ceil((u_hi - u_lo) / step)))
    uc = np.r_[np.linspace(u_lo, u_hi, n_, endpoint=False), u_hi]
    UL = np.zeros(len(uc)); UR = np.zeros(len(uc)); inroll = np.zeros(len(uc), bool)
    for i, c in enumerate(uc):
        for rg in regs:
            if rg[1] - 1e-9 <= c <= rg[2] + 1e-9 and rg[2] - rg[1] > 1e-9:
                UL[i], UR[i] = rg[3](c); inroll[i] = rg[0] == 'roll'
                break
    G = cx[0][0]
    L3 = C.chain_surface(G, rolls, UL, np.full(len(uc), -W / 2)); R3 = C.chain_surface(G, rolls, UR, np.full(len(uc), W / 2))
    out = dict(L=L3, R=R3, uc=uc, inroll=inroll, regs=regs, gaps=gaps, cx=cx, UL=UL, UR=UR)
    if hidden:
        un = np.linspace(u_lo, u_hi, max(10, int((u_hi - u_lo) / 0.8)))
        vv = np.linspace(-W / 2, W / 2, 21)
        U = np.repeat(un, 21); V = np.tile(vv, len(un))
        P = C.chain_surface(G, rolls, U, V)
        p2 = AP.project(P)
        cell = 3.0
        key = (np.floor(p2[:, 0] / cell).astype(np.int64) + 2000) * 4000 + (np.floor(p2[:, 1] / cell).astype(np.int64) + 2000)
        order = np.lexsort((P[:, 2], key))
        ks = key[order]; last = np.r_[ks[1:] != ks[:-1], True]
        kk = ks[last]; zz = P[order][last][:, 2]

        def hid(Q):
            q2 = AP.project(Q)
            k = (np.floor(q2[:, 0] / cell).astype(np.int64) + 2000) * 4000 + (np.floor(q2[:, 1] / cell).astype(np.int64) + 2000)
            i = np.minimum(np.searchsorted(kk, k), len(kk) - 1)
            return (kk[i] == k) & (zz[i] > Q[:, 2] + 2.0)
        out['hidL'], out['hidR'] = hid(L3), hid(R3)
    return out


def dashed(dr, pts, dash=6.0, gap=4.0, fill=(255, 255, 255, 160)):
    pts = [np.asarray(p, float) for p in pts]
    on = True; left = dash
    for a, b in zip(pts[:-1], pts[1:]):
        seg = np.linalg.norm(b - a)
        if seg < 1e-9:
            continue
        d = (b - a) / seg
        pos = 0.0
        while pos < seg:
            step = min(left, seg - pos)
            if on:
                dr.line([tuple(a + d * pos), tuple(a + d * (pos + step))], fill=fill, width=1)
            pos += step; left -= step
            if left <= 1e-9:
                on = not on; left = dash if on else gap


def overlay_png(path, pieces, every=12, rings=None, box=(0, 450, 852, 1846), scale=1.0, header=None, ret=False):
    """pieces: list of sec_rulings() dicts. Underneath: the APPROVED trace (edges_v3 visible samples, ring range `rings`) as thin white dashed lines (alpha 160, 6 on / 4 off);
    on top: projected TRUE-ruling edges L (magenta) / R (green) (parts hidden by the section's own surface dashed) and cyan TRUE rulings every `every` samples; cropped to `box`."""
    x0, y0, x1, y1 = box
    im = cutout_dim().crop(box).convert('RGBA')
    if scale != 1.0:
        im = im.resize((int((x1 - x0) * scale), int((y1 - y0) * scale)), Image.LANCZOS)
    tf = lambda P: (np.asarray(P, float) - np.array([x0, y0])) * scale
    lay = Image.new('RGBA', im.size, (0, 0, 0, 0))
    dl = ImageDraw.Draw(lay)
    T = trace_rings()
    for r0, r1 in (rings or [(0, len(T['e1']) - 1)]):
        for e, v in ((T['e1'], T['v1']), (T['e2'], T['v2'])):
            run = []
            for i in range(r0, r1 + 1):
                if v[i]:
                    run.append(tf(e[i]))
                else:
                    if len(run) > 1:
                        dashed(dl, run)
                    run = []
            if len(run) > 1:
                dashed(dl, run)
    im.alpha_composite(lay)
    im = im.convert('RGB')
    dr = ImageDraw.Draw(im)

    def draw_edge(P, hid, col):
        pp = tf(AP.project(P))
        i = 0
        n = len(pp)
        while i < n - 1:
            j = i
            while j < n - 1 and hid[j] == hid[i]:
                j += 1
            seg = [tuple(p) for p in pp[i:j + 1]]
            if len(seg) > 1:
                if hid[i]:
                    dashed(dr, seg, 5.0, 4.0, col)
                else:
                    dr.line(seg, fill=col, width=2)
            i = j if j > i else i + 1

    for pc in pieces:
        L3, R3 = pc['L'], pc['R']
        pl, pr_ = tf(AP.project(L3)), tf(AP.project(R3))
        for i in range(0, len(pl), every):
            dr.line([tuple(pl[i]), tuple(pr_[i])], fill=(0, 255, 255), width=1)
        draw_edge(L3, pc.get('hidL', np.zeros(len(L3), bool)), (255, 0, 255))
        draw_edge(R3, pc.get('hidR', np.zeros(len(R3), bool)), (0, 255, 0))
    ImageDraw.Draw(im).text((8, 8), 'white dashed = approved trace, magenta/green = 3D model edges', fill=(255, 255, 255))
    if ret:
        return im
    im.save(path)
    return path


KEY = np.array([0.25, 0.85, 0.45]); KEY = KEY / np.linalg.norm(KEY)


def offline_lit(L, R, box, scale):
    """z-buffer render of the ruled strip: face A #5a1c04 / face B #ff7a12; Lambert key light normalize(0.25, 0.85, 0.45) x 0.75, camera fill x 0.25, ambient 0.12, Blinn specular (shininess 40, strength 0.25)"""
    import chain_sheets as CS
    x0, y0, x1, y1 = box
    w, h = int((x1 - x0) * scale), int((y1 - y0) * scale)
    img = np.zeros((h, w, 3)); img[:] = CS.BG
    zb = np.full((h, w), -np.inf)
    cam = np.array([0, 0, AP.D])
    nv = 9
    ts = np.linspace(0, 1, nv)
    G = L[:, None, :] + ts[None, :, None] * (R - L)[:, None, :]
    p2 = AP.project(G.reshape(-1, 3)).reshape(len(L), nv, 2)
    sx = (p2[..., 0] - x0) * scale; sy = (p2[..., 1] - y0) * scale
    for i in range(len(L) - 1):
        bx0 = min(sx[i].min(), sx[i + 1].min()); bx1 = max(sx[i].max(), sx[i + 1].max())
        by0 = min(sy[i].min(), sy[i + 1].min()); by1 = max(sy[i].max(), sy[i + 1].max())
        if bx1 < 0 or by1 < 0 or bx0 > w or by0 > h:
            continue
        for j in range(nv - 1):
            q = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]
            pts3 = np.array([G[a, b] for a, b in q])
            Pu = (pts3[1] + pts3[2]) / 2 - (pts3[0] + pts3[3]) / 2
            Pv = (pts3[3] + pts3[2]) / 2 - (pts3[0] + pts3[1]) / 2
            n = np.cross(Pu, Pv); nn = np.linalg.norm(n)
            if nn < 1e-12:
                continue
            n /= nn
            vd = cam - pts3.mean(0); vd /= np.linalg.norm(vd)
            d = float(n @ vd)
            nf = n if d > 0 else -n
            hv = KEY + vd; hv /= np.linalg.norm(hv)
            shade = 0.12 + 0.75 * max(0.0, float(nf @ KEY)) + 0.25 * max(0.0, float(nf @ vd))
            spec = 0.25 * max(0.0, float(nf @ hv)) ** 40
            col = (CS.COL_A if d < 0 else CS.COL_B) * shade + 255.0 * spec
            for tri in ((0, 1, 2), (0, 2, 3)):
                X = np.array([sx[q[t]] for t in tri]); Y = np.array([sy[q[t]] for t in tri]); Z = pts3[list(tri), 2]
                xmin, xmax = int(max(np.floor(X.min()), 0)), int(min(np.ceil(X.max()), w - 1))
                ymin, ymax = int(max(np.floor(Y.min()), 0)), int(min(np.ceil(Y.max()), h - 1))
                if xmin > xmax or ymin > ymax:
                    continue
                gx, gy = np.meshgrid(np.arange(xmin, xmax + 1) + 0.5, np.arange(ymin, ymax + 1) + 0.5)
                den = (Y[1] - Y[2]) * (X[0] - X[2]) + (X[2] - X[1]) * (Y[0] - Y[2])
                if abs(den) < 1e-12:
                    continue
                l0 = ((Y[1] - Y[2]) * (gx - X[2]) + (X[2] - X[1]) * (gy - Y[2])) / den
                l1 = ((Y[2] - Y[0]) * (gx - X[2]) + (X[0] - X[2]) * (gy - Y[2])) / den
                l2 = 1 - l0 - l1
                m = (l0 >= -1e-9) & (l1 >= -1e-9) & (l2 >= -1e-9)
                if not m.any():
                    continue
                z = l0 * Z[0] + l1 * Z[1] + l2 * Z[2]
                sub = zb[ymin:ymax + 1, xmin:xmax + 1]
                upd = m & (z > sub)
                sub[upd] = z[upd]
                img[ymin:ymax + 1, xmin:xmax + 1][upd] = col
    return Image.fromarray(img.clip(0, 255).astype(np.uint8))


def shaded_img(pr, pc, box, scale):
    L, R = pc['L'], pc['R']
    m = max(1, int(len(L) / 700))
    return offline_lit(L[::m], R[::m], box, scale)


def shaded_png(pr, pc, path):
    """offline shaded render of the true-ruling rings (chain_sheets.offline: face A #5a1c04 / B #ff7a12, |n.view| shading), cropped to the bbox, next to the mockup crop"""
    import chain_sheets as CS
    L, R = pc['L'], pc['R']
    p = np.concatenate([AP.project(L), AP.project(R)])
    x0, y0 = np.maximum(0, p.min(0) - 25).astype(int); x1, y1 = np.minimum([852, 1846], p.max(0) + 25).astype(int)
    box = (int(x0), int(y0), int(x1), int(y1))
    scale = min(2.0, 900.0 / max(x1 - x0, y1 - y0))
    off = shaded_img(pr, pc, box, scale)
    mk = CS.mockup_crop(box).resize(off.size, Image.LANCZOS)
    sheet = Image.new('RGB', (off.width * 2 + 10, off.height + 24), (10, 10, 10))
    sheet.paste(mk, (0, 24)); sheet.paste(off, (off.width + 10, 24))
    d = ImageDraw.Draw(sheet)
    d.text((4, 6), 'mockup', fill=(255, 255, 255)); d.text((off.width + 14, 6), 'offline shaded (face A dark, face B orange)', fill=(255, 255, 255))
    sheet.save(path)


def zoom_sheets(pr, sec, x, tag='', pc=None, rep=None):
    """overlays/zoom_<section>_<window><tag>.png at 3x for every turn window (guides_overlay.WINDOWS) the section's strip overlaps: [mockup | overlay | shaded] + metrics header"""
    import chain_sheets as CS
    pc = pc or sec_rulings(pr, x, sec)
    rep = rep or realism(pr, sec, x)[0]
    px = np.concatenate([AP.project(pc['L']), AP.project(pc['R'])])
    ds = data_stats(pr, x, sec)
    done = []
    for wn, box in WIN_BOXES.items():
        inside = ((px[:, 0] >= box[0]) & (px[:, 0] <= box[2]) & (px[:, 1] >= box[1]) & (px[:, 1] <= box[3])).sum()
        if inside < 12:
            continue
        ow = {'scurve': 's'}.get(wn, wn)
        ol = rep['outline'].get(ow)
        hdr = (f'{sec.name}/{wn}{tag}  crossings {rep["crossings"]}  sep {rep["sep_violations"]}  min fold rho/W '
               f'{("%.2f" % rep["min_fold_rho_over_W"]) if rep["min_fold_rho_over_W"] is not None else "-"}  outline mean/max '
               f'{("%.1f/%.1f px" % (ol["mean_px"], ol["max_px"])) if ol else "-"}  kinks {rep["curv_oscillations"]}+{rep["corners"]} dips {rep["dips"]}  data rms {ds["rms"] if ds["rms"] is None else round(ds["rms"], 1)} px  fails {rep["fails"]}')
        S3 = 3
        mk = CS.mockup_crop(box).resize(((box[2] - box[0]) * S3, (box[3] - box[1]) * S3), Image.LANCZOS)
        ov = overlay_png(None, [pc], rings=[(sec.r0, sec.r1)], box=box, scale=S3, ret=True)
        sh = shaded_img(pr, pc, box, S3)
        sheet = Image.new('RGB', (mk.width * 3 + 20, mk.height + 26), (10, 10, 10))
        for i, im_ in enumerate((mk, ov, sh)):
            sheet.paste(im_.convert('RGB'), (i * (mk.width + 10), 26))
        ImageDraw.Draw(sheet).text((6, 7), hdr, fill=(255, 255, 255))
        sheet.save(os.path.join(DIRS['overlays'], f'zoom_{sec.name}_{wn}{tag}.png'))
        done.append(wn)
    log(f'REVIEW {sec.name}{tag} {done}')
    return done


def draw_section(pr, sec, x, tag='', zoom=True):
    pc = sec_rulings(pr, x, sec)
    overlay_png(os.path.join(DIRS['overlays'], f'section_{sec.name}{tag}.png'), [pc], rings=[(sec.r0, sec.r1)])
    shaded_png(pr, pc, os.path.join(DIRS['overlays'], f'section_{sec.name}{tag}_shaded.png'))
    if zoom:
        zoom_sheets(pr, sec, x, tag, pc)
    return pc


# ================================================================== section fit
def fit_section(pr, name, secs_final=300.0, secs_group=240.0, ncf=3):
    sec = pr.bind(name)
    t00 = time.time()
    W = pr.W
    act, lo, hi = sec.act, sec.lo, sec.hi
    st = pr.stage_info(act, lo, hi)
    log(f'## section {name}: rings {sec.r0}..{sec.r1} (data {lo}..{hi}), intervals {sec.ivs}, rolls {sec.rolls}, free {len(sec.free)}')
    x0 = pr.x0.copy()
    starts = []
    if name == 'A':
        x0 = seed_A(pr)
        r = pr.res(x0, st)
        log(f'  A seeded from paper3: cost0 {0.5 * float(r @ r):.1f}, data {data_stats(pr, x0, sec)}')
        starts = [(['paper3'], x0)]
    else:
        g = list(sec.act)
        for tilt in (0, 25, -25):
            xp = kabsch_pose(pr, sec, x0, tilt)
            cands = section_combos(pr, name, xp, g, st)
            for tags, xc in cands:
                r = pr.res(xc, st)
                starts.append(([f'tilt{tilt:+d}'] + list(tags), xc, 0.5 * float(r @ r)))
        starts = [(a, b) for a, b, c in sorted(starts, key=lambda q: q[2])]
        if name == 'P':
            starts.insert(0, (['seed-v1'], seed_P(pr)))
        costs = [round(0.5 * float(pr.res(b, st) @ pr.res(b, st))) for a, b in starts[:8]]
        log(f'  {len(starts)} starts; best init costs {[(a, c) for (a, b), c in zip(starts[:8], costs)]}')
    gs = secs_group
    if name in ('S', 'K'):
        ncf, gs = max(ncf, 4), max(secs_group, 360.0)
    best = None
    for tags, xc in starts[:ncf]:
        xo, cost, status = C.run_fit(pr, xc, st, sec.free, gs, '/'.join(tags))
        if best is None or cost < best[0]:
            best = (cost, tags, xo)
        np.savez(sec_path(name), x=best[2], cost=best[0], tags=np.array(best[1]), partial=1)
    x = best[2]
    xo, cost, status = C.run_fit(pr, x, st, sec.free, secs_final, 'refine')
    if cost <= best[0]:
        x = xo
    tags = best[1]
    np.savez(os.path.join(DIRS['sections'], f'sec_{name}_pre.npz'), x=x)
    rep, _ = realism(pr, sec, x)
    log(f'  v1-rules result: data {data_stats(pr, x, sec)["rms"]:.2f} px, realism fails {rep["fails"]}, outline {rep["outline"]}')
    if name in ('F', 'P', 'S', 'K', 'X') and (rep['fails'] or (sec.gate and data_stats(pr, x, sec)['rms'] > 10.0)):
        x, tags = reseed_pass(pr, sec, x, tags, rep, secs_final)
    return finish_section(pr, sec, x, t00, tags)


def score_x(pr, sec, x):
    rep, _ = realism(pr, sec, x)
    ou = [v['mean_px'] for v in rep['outline'].values()]
    rms = data_stats(pr, x, sec)['rms'] or 0.0
    return (len(rep['fails']), float(np.mean(ou)) if ou else 0.0, rms), rep


def window_fit(pr, sec, iv, x_ref, secs_start=60.0):
    """dedicated window fit (apex recipe): the window's fold rolls + one bend on each side + its own pose, data = the window +-15 rings,
    multi-start (fold sign, rho0 in {0.25, 0.4, 0.6} W, beta from the window's silhouette direction +-30 deg, pose tilts 0/+-25)"""
    W = pr.W
    wk = [k for k in sec.act if pr.roll_iv[k] == iv]
    prev = [k for k in range(min(wk) - 1, -1, -1)][:1]
    nxt = [k for k in range(max(wk) + 1, NR)][:1]
    names = [pr.rname[k] for k in prev + wk + nxt]
    wsec = Sec(pr, f'{sec.name}w{iv}', [iv], names, 1.0, None, False)
    pr.bind(wsec)
    pr.bk_bottom = None
    st = pr.stage_info(wsec.act, wsec.lo, wsec.hi)
    log(f'  window fit {wsec.name}: rings {wsec.lo}..{wsec.hi}, rolls {names}')
    starts = []
    x0 = pr.x0.copy()
    for k in wk:
        pass
    if len(wk) == 1:
        k = wk[0]
        sb = C.sil_beta(pr, k)
        sb = np.pi / 2 if sb is None else sb
        for sign in (1, -1):
            for mag in (1.6, 2.6):
                for rf in (0.25, 0.4, 0.6):
                    for db in (-30, 0, 30):
                        b = float(np.clip(sb + np.radians(db), 0.3, np.pi - 0.3))
                        xx = C.set_roll(x0, k, pr.roll_tau0[k], b, rf * W, sign * mag)
                        for tilt in (0, 25, -25):
                            xp = kabsch_pose(pr, wsec, xx, tilt)
                            r = pr.res(xp, st)
                            starts.append((0.5 * float(r @ r), [f's{sign:+d}', f'm{mag}', f'rho{rf}', f'db{db}', f't{tilt}'], xp))
    else:
        for tilt in (0, 25, -25):
            xp = kabsch_pose(pr, wsec, x0, tilt)
            pr._active = set(wsec.act)
            if sec.name == 'S':
                cands = C.s_combos(pr, xp, wk)
            elif sec.name == 'K':
                cands = C.bk_combos(pr, xp, wk)
            elif sec.name == 'X':
                cands = x_combos(pr, xp)
            else:
                cands = C.presearch(pr, xp, wk, st)
            for tags, xc in cands:
                r = pr.res(xc, st)
                starts.append((0.5 * float(r @ r), [f't{tilt}'] + list(tags), xc))
    starts.sort(key=lambda q: q[0])
    best = None
    for c0, tags, xc in starts[:6]:
        xo, cost, status = C.run_fit(pr, xc, st, wsec.free, secs_start, 'win/' + '/'.join(map(str, tags)))
        if best is None or cost < best[0]:
            best = (cost, tags, xo)
    xw = best[2]
    st_ = data_stats(pr, xw, wsec)
    log(f'  window {wsec.name} best cost {best[0]:.1f} tags {best[1]} data {st_["rms"]}')
    return wsec, xw, wk


def reseed_pass(pr, sec, x_old, tags_old, rep_old, secs_final):
    sc_old, _ = score_x(pr, sec, x_old)
    log(f'  RESEED pass for {sec.name}: old score (fails, outline, rms) = {sc_old}')
    best = (sc_old, x_old, tags_old)
    xcur = x_old.copy()
    for iv in sec.ivs:
        if pr.int_face[iv] != 'window':
            continue
        wsec, xw, wk = window_fit(pr, sec, iv, xcur)
        xn = xcur.copy()
        for k in wk:
            o = 6 + 4 * k
            xn[o:o + 4] = xw[o:o + 4]
        pr.bind(sec)
        pr.bk_bottom = pick_bk_bottom_sec(pr, xn, sec) if sec.name == 'K' else None
        st = pr.stage_info(sec.act, sec.lo, sec.hi)
        cand = [('as-is', xn), ('kabsch', kabsch_pose(pr, sec, xn, 0))]
        for tg, xc in cand:
            xo, cost, status = C.run_fit(pr, xc, st, sec.free, secs_final, f'reseed-{tg}')
            sc, rp = score_x(pr, sec, xo)
            log(f'    reseed {sec.name} iv{iv} {tg}: cost {cost:.1f} score {sc} fails {rp["fails"]}')
            if sc < best[0]:
                best = (sc, xo, ['reseed', tg])
                xcur = xo.copy()
    log(f'  RESEED result for {sec.name}: kept score {best[0]} (old {sc_old})')
    draw_section(pr, sec, best[1], '_v2')
    return best[1], best[2]


LOCKED = {'A': 'sec_A_APPROVED.npz', 'F': 'sec_F_APPROVED.npz', 'P': 'sec_P_APPROVED.npz', 'S': 'sec_S_APPROVED.npz'}


def warm_redo(pr, name, x_prev, new_rolls=(), alts=(), secs=240.0, tag='_v4', baseline=None):
    """warm-start redo: previous best x, new rolls inert + presearch on them only, then realism continuation x0.25 -> x1 -> x4 (3 LM runs);
    accepted only if realism failures do not increase and data rms <= max(1.5 x previous, 10 px)"""
    sec = pr.bind(name)
    pr.bk_bottom = pick_bk_bottom_sec(pr, x_prev, sec) if name == 'K' else None
    st = pr.stage_info(sec.act, sec.lo, sec.hi)
    pr._active = set(sec.act)
    pr.rw = 1.0
    sc0, rep0 = score_x(pr, sec, x_prev)
    rms0 = data_stats(pr, x_prev, sec)['rms']
    if baseline is not None:
        rep0 = dict(rep0, fails=['x'] * baseline[0]); rms0 = baseline[1]; sc0 = (baseline[0], sc0[1], baseline[1])
    log(f'## WARM REDO {name}{tag}: previous score (fails, outline, rms) {sc0}, fails {rep0["fails"]}')
    starts = [('warm', x_prev)]
    if new_rolls:
        for tg, xc in C.presearch(pr, x_prev, list(new_rolls), st):
            starts.append(('new:' + '/'.join(tg), xc))
    for i, xa in enumerate(alts):
        starts.append((f'alt{i}', xa))
    best = None
    for tg, xs_ in starts:
        xx = xs_.copy()
        for rw in (0.25, 1.0, 4.0):
            pr.rw = rw
            xx, cost, status = C.run_fit(pr, xx, st, sec.free, secs, f'{tg} rw{rw}')
        pr.rw = 1.0
        sc, rp = score_x(pr, sec, xx)
        log(f'    start {tg}: score {sc} fails {rp["fails"]}')
        if best is None or sc < best[0]:
            best = (sc, xx, tg, rp)
    sc, xx, tg, rp = best
    np.savez(os.path.join(DIRS['sections'], f'sec_{name}{tag}_cand.npz'), x=xx)
    rms = sc[2]
    ok = len(rp['fails']) <= len(rep0['fails']) and rms <= max(1.5 * rms0, 10.0)
    if name == 'X':
        ok = len(rp['fails']) == 0 and rms <= 10.0
    if name == 'S':
        ok = True
    log(f'  DECISION numbers: candidate fails {len(rp["fails"])} rms {rms:.1f} | previous best fails {len(rep0["fails"])} rms {rms0:.1f} | limit rms {max(1.5 * rms0, 10.0):.1f}')
    log(f'  WARM REDO {name}{tag}: best start {tg} score {sc} fails {rp["fails"]} -> {"ACCEPTED" if ok else "REJECTED (keeping previous)"}')
    if ok:
        np.savez(sec_path(name), x=xx, bk_bottom=-1)
        draw_section(pr, sec, xx, tag)
        return xx, True
    draw_section(pr, sec, xx, tag + '_rejected')
    return x_prev, False


def _ang(d):
    return math.atan2(-d[1], d[0])


def k2_combos(pr, xp, nb=3):
    """K v5: two oblique folds (paper-fold reflection rule from the trace's 2D directions) + k_return bend. beta0 = angle(a) - angle(d_in), a = normalize(d_in + d_out); starts: beta +- 15 deg, mirrors, phi signs"""
    W = pr.W
    k1, k2, k4 = ROLLS_IDX['bottom-K fold 1'], ROLLS_IDX['bottom-K fold 2'], ROLLS_IDX['k_return bend']
    Cc = (pr.e1 + pr.e2) / 2
    nz = lambda v: v / np.linalg.norm(v)
    d1in = nz(Cc[655] - Cc[645]); d_l2 = nz(np.array([710.0, 1144.0]) - np.array([638.0, 1185.0])); d2out = nz(Cc[800] - Cc[770])
    folds = []
    for din, dout in ((d1in, d_l2), (d_l2, d2out)):
        a = nz(din + dout)
        b0 = (_ang(a) - _ang(din)) % np.pi
        folds.append(b0)
    out = []
    for m1 in (0, 1):
        for m2 in (0, 1):
            for d1 in (-15, 0, 15):
                for sg in (1, -1):
                    b1 = folds[0] if not m1 else np.pi - folds[0]
                    b2 = folds[1] if not m2 else np.pi - folds[1]
                    b1 = float(np.clip(b1 + np.radians(d1), 0.3, np.pi - 0.3)); b2 = float(np.clip(b2 + np.radians(d1), 0.3, np.pi - 0.3))
                    xx = C.set_roll(xp, k1, pr.roll_tau0[k1], b1, 0.5 * W, sg * 3.0)
                    xx = C.set_roll(xx, k2, pr.roll_tau0[k2], b2, 0.5 * W, -sg * 3.0)
                    out.append(([f'm{m1}{m2}', f'd{d1}', f's{sg:+d}'], xx))
    return out


def loop_P_combos(pr, xp):
    """P v5: ONE loop roll (tip fold slot), rho 1.3 W, phi ~ +-pi, beta from the topk sil direction +-25 deg"""
    W = pr.W
    k = ROLLS_IDX['top-K tip fold']
    sb = C.sil_beta(pr, k)
    sb = np.pi / 2 if sb is None else sb
    out = []
    for db in (-25, 0, 25):
        for sg in (1, -1):
            b = float(np.clip(sb + np.radians(db), 0.3, np.pi - 0.3))
            out.append(([f'db{db}', f's{sg:+d}'], C.set_roll(xp, k, pr.roll_tau0[k], b, 1.3 * W, sg * 3.0)))
    return out


def seed_P(pr):
    """v1 P solution (pose, lambdas, tip fold, end bend) with the three gentle front bends re-seeded (rho 3W, phi 0.3-0.4)"""
    p = os.path.join(DIRS['sections'], '..', 'v1', 'sections', 'sec_P.npz')
    x = upgrade_x(pr, np.load(p)['x'])
    for nm, phi in (('top-K front bend a', 0.3), ('top-K front bend', 0.4), ('top-K front bend c', 0.3)):
        k = ROLLS_IDX[nm]
        x[6 + 4 * k:10 + 4 * k] = [pr.roll_tau0[k], np.pi / 2, 3 * pr.W, phi]
    return x


def seed_A(pr):
    """paper3 solution as the A section: pose = paper3 pose (root = the segment before left-leg bend 1), rolls/rings/lambda from the paper3 table"""
    sec = pr.secs['A']
    p3 = pr.p3
    tab = p3['table']
    x = pr.x0.copy()
    ur = p3['u_rings']
    rings = 363 + np.arange(len(ur))
    ratio, icpt = np.polyfit(pr.tau[rings], ur, 1)
    for j in sec.ivs:
        x[6 + 4 * NR + j] = ratio
        pr.lam0[j] = ratio
    pr.bind(sec)
    # F(tau) = ratio*(tau - tau_in) + tau_in ; paper3 u = ratio*tau + icpt  =>  u_chain = u_p3 + shift
    shift = (ratio * (0.0 - sec.tau_in) + sec.tau_in) - icpt
    tg = np.linspace(pr.tau[0], pr.tau[-1], 20001)
    ug = pr.F(x, tg)
    for n, row in zip(C.P3_NAMES, tab):
        k = ROLLS_IDX[n]
        o = 6 + 4 * k
        x[o:o + 4] = [float(np.interp(row['u_css'] + shift, ug, tg)), np.radians(row['beta_deg']), row['rho_css'], np.radians(row['phi_deg'])]
    rv, t0 = p3['pose'][:3], p3['pose'][3:6]
    Rp = Rotation.from_rotvec(rv).as_matrix()
    # flat (u_chain, v) = (u_p3 + shift, v): world = Rp (u_p3, v, 0) + t0 = Rp (u_chain, v, 0) + t0 - Rp e_x shift
    x[:3] = rv
    x[3:6] = t0 - Rp @ np.array([shift, 0.0, 0.0])
    return x


def section_combos(pr, name, xp, g, st):
    """starting rolls for pose start xp (list of (tags, x)); every roll gets chain_fit's coarse presearch (S / K: chain_fit's combos)"""
    pr._active = set(pr.sec.act)
    if name == 'S':
        return C.s_combos(pr, xp, g)
    if name == 'K':
        k4 = [k for k in g if pr.rname[k] == 'k_return bend'][0]
        g3 = [k for k in g if k != k4]
        out = []
        for tags, xc in C.bk_combos(pr, xp, g3):
            out.append((tags, C.set_roll(xc, k4, pr.roll_tau0[k4], np.pi / 2, 3 * pr.W, 0.0)))
        return out
    if name == 'X':
        return x_combos(pr, xp)
    return C.presearch(pr, xp, g, st)


def s_fold_combos(pr, xp):
    """S v6: ONE fold (reflection rule, d_in = tail dir rings 115-131, d_out = sweep dir rings 226-245; rho 0.5W; phi +-pi; beta +-15 deg, mirrors) + ONE gentle bend (inert start)"""
    W = pr.W
    k1, k2 = ROLLS_IDX['S bend'], ROLLS_IDX['S obl 4']
    Cc = (pr.e1 + pr.e2) / 2
    nz = lambda v: v / np.linalg.norm(v)
    din = nz(Cc[131] - Cc[115]); dout = nz(Cc[245] - Cc[226])
    a = nz(din + dout)
    b0 = (_ang(a) - _ang(din)) % np.pi
    out = []
    for m in (0, 1):
        for d in (-15, 0, 15):
            for sg in (1, -1):
                b = float(np.clip((b0 if not m else np.pi - b0) + np.radians(d), 0.3, np.pi - 0.3))
                xx = C.set_roll(xp, k1, pr.roll_tau0[k1], b, 0.5 * W, sg * 3.0)
                xx = C.set_roll(xx, k2, pr.roll_tau0[k2], np.pi / 2, 3 * W, 0.0)
                out.append(([f'm{m}', f'd{d}', f's{sg:+d}'], xx))
    return out


def loop_K_refl(pr, xp):
    """K v8: ONE loop roll, beta from the paper-fold reflection rule a = normalize(d_in + d_out): d_in = locked A's right-leg direction at its last rings (projected), d_out = k_return trace direction (rings 770-800, 2D);
    rho {0.6, 1.0, 1.4} W x phi sign x beta +- {0, 15}; gentle return bend inert"""
    W = pr.W
    k = ROLLS_IDX['bottom-K fold 1']; k4 = ROLLS_IDX['k_return bend']
    keep = pr.sec
    sa = pr.bind('A')
    xa = ldx(pr, os.path.join(DIRS['sections'], 'sec_A_APPROVED.npz'))
    La, Ra = sec_edges(pr, xa, sa, np.arange(645, 659))
    pm = AP.project((La + Ra) / 2)
    pr.bind(keep)
    nz = lambda v: v / np.linalg.norm(v)
    din = nz(pm[-1] - pm[0])
    Cc = (pr.e1 + pr.e2) / 2
    dout = nz(Cc[800] - Cc[770])
    a = nz(din + dout)
    b0 = (_ang(a) - _ang(din)) % np.pi
    log(f'  K v8 reflection seed: d_in {np.round(din, 2)} d_out {np.round(dout, 2)} a {np.round(a, 2)} beta0 {np.degrees(b0):.1f} deg')
    out = []
    for rf in (0.6, 1.0, 1.4):
        for sg in (1, -1):
            for db in (-15, 0, 15):
                b = float(np.clip(b0 + np.radians(db), 0.3, np.pi - 0.3))
                xx = C.set_roll(xp, k, pr.roll_tau0[k], b, rf * W, sg * 3.0)
                xx = C.set_roll(xx, k4, pr.roll_tau0[k4], np.pi / 2, 3 * W, 0.0)
                out.append(([f'rho{rf}', f's{sg:+d}', f'db{db}'], xx))
    return out


def loop_K_combos(pr, xp):
    """K v6: ONE loop roll at the loop's lowest point (rho 1.0 W, phi +-pi, beta from the bottomk sil direction +- {0, 25}) + gentle return bend (inert start)"""
    W = pr.W
    k = ROLLS_IDX['bottom-K fold 1']; k4 = ROLLS_IDX['k_return bend']
    sb = C.sil_beta(pr, k)
    sb = np.pi / 2 if sb is None else sb
    out = []
    for db in (-25, 0, 25):
        for sg in (1, -1):
            b = float(np.clip(sb + np.radians(db), 0.3, np.pi - 0.3))
            xx = C.set_roll(xp, k, pr.roll_tau0[k], b, 1.0 * W, sg * 3.0)
            xx = C.set_roll(xx, k4, pr.roll_tau0[k4], np.pi / 2, 3 * W, 0.0)
            out.append(([f'db{db}', f's{sg:+d}'], xx))
    return out


def x_tilt_starts(pr, xp):
    """X v7: rotate the section pose about the crossbar's long axis (mid-ring centreline tangent) by {45, 60, 70} x both signs, 2D Procrustes to the trace;
    crossbar bends beta 90, phi = 2D turning / sin(tilt) (|phi| <= 1.2)"""
    sec = pr.secs['X']
    pr.bind(sec)
    W = pr.W
    cx = pr.ctx(xp, sec.act)
    ii = np.arange(859, 911)
    u = pr.F(xp, pr.tau[ii])
    Cm = (C.chain_surface(cx[0][0], cx[1], u, np.full(len(ii), -W / 2)) + C.chain_surface(cx[0][0], cx[1], u, np.full(len(ii), W / 2))) / 2
    tdir = Cm[30] - Cm[20]; tdir /= np.linalg.norm(tdir)
    Cc = (pr.e1 + pr.e2) / 2
    nz = lambda v: v / np.linalg.norm(v)
    turn = ((_ang(nz(Cc[910] - Cc[898])) - _ang(nz(Cc[870] - Cc[859])) + np.pi) % (2 * np.pi)) - np.pi
    idx = np.arange(sec.lo, sec.hi + 1)
    Q = np.concatenate([pr.L0[idx], pr.R0[idx]])
    u2 = pr.F(xp, pr.tau[idx]); n2 = len(idx)
    Pm = np.concatenate([C.chain_surface(cx[0][0], cx[1], u2, np.full(n2, -W / 2)), C.chain_surface(cx[0][0], cx[1], u2, np.full(n2, W / 2))])
    R0 = Rotation.from_rotvec(xp[:3]).as_matrix(); t0 = xp[3:6]
    # xp[:6] pose maps the flat/chain frame to the world; Pm is already posed (ctx used the pose)
    cen = Pm.mean(0)
    k1, k2 = ROLLS_IDX['crossbar bend 1'], ROLLS_IDX['crossbar bend 2']
    out = []
    for ang in (45, 60, 70):
        for sg in (1, -1):
            Rt = Rotation.from_rotvec(tdir * np.radians(sg * ang)).as_matrix()
            Pt = (Pm - cen) @ Rt.T + cen
            pc, qc = Pt.mean(0), Q.mean(0)
            H = (Pt[:, :2] - pc[:2]).T @ (Q[:, :2] - qc[:2])
            U_, _, Vt = np.linalg.svd(H)
            dd = np.sign(np.linalg.det(Vt.T @ U_.T))
            Rz = np.eye(3); Rz[:2, :2] = Vt.T @ np.diag([1, dd]) @ U_.T
            tz = qc - Rz @ pc
            Rn = Rz @ Rt @ R0
            tn = Rz @ (Rt @ (t0 - cen) + cen) + tz
            xx = xp.copy(); xx[:3] = Rotation.from_matrix(Rn).as_rotvec(); xx[3:6] = tn
            ph = float(np.clip(abs(turn) / max(np.sin(np.radians(ang)), 0.3), 0.15, 1.2))
            for kk in (k1, k2):
                xx = C.set_roll(xx, kk, pr.roll_tau0[kk], np.pi / 2, 1.5 * W, sg * ph)
            out.append(([f'tilt{sg * ang:+d}'], xx))
    return out


def curl_starts(pr, xp):
    """X v8: crossbar = flat run (+ one gentle bend rho >= 3W, inert start); ONE large curl roll (rho 1.1 W, |phi| ~ pi, beta from the wrap sil +- {0, 20}), sign multi-start"""
    W = pr.W
    kc = ROLLS_IDX['wrap curl']; kb = ROLLS_IDX['crossbar bend 1']
    sb = C.sil_beta(pr, kc)
    sb = np.pi / 2 if sb is None else sb
    out = []
    for db in (-20, 0, 20):
        for sg in (1, -1):
            b = float(np.clip(sb + np.radians(db), 0.3, np.pi - 0.3))
            xx = C.set_roll(xp, kc, pr.roll_tau0[kc], b, 1.1 * W, sg * np.pi)
            xx = C.set_roll(xx, kb, pr.roll_tau0[kb], np.pi / 2, 3 * W, 0.0)
            out.append(([f'db{db}', f's{sg:+d}'], xx))
    return out


def x_bar_starts(pr, xp):
    """X v6: crossbar bends seeded with phi from the trace's 2D turning angle over the span (both signs)"""
    Cc = (pr.e1 + pr.e2) / 2
    nz = lambda v: v / np.linalg.norm(v)
    d0 = nz(Cc[870] - Cc[859]); d1 = nz(Cc[910] - Cc[898])
    turn = (_ang(d1) - _ang(d0) + np.pi) % (2 * np.pi) - np.pi
    ph = float(np.clip(abs(turn) / 2, 0.15, 0.9))
    k1, k2 = ROLLS_IDX['crossbar bend 1'], ROLLS_IDX['crossbar bend 2']
    out = []
    for sg in (1, -1):
        xx = C.set_roll(xp, k1, pr.roll_tau0[k1], np.pi / 2, 1.5 * pr.W, sg * ph)
        xx = C.set_roll(xx, k2, pr.roll_tau0[k2], np.pi / 2, 1.5 * pr.W, sg * ph)
        out.append(xx)
    return out


def x_combos(pr, x):
    """X: ONE curl fold (axis ~ the window's silhouette direction +-20 deg, phi ~ +-pi, rho 0.5 W) + the two half-twist folds (sign patterns); crossbar bends stay straight"""
    W = pr.W
    kc = ROLLS_IDX['wrap curl']; k1 = ROLLS_IDX['wrap twist 1']; k2 = ROLLS_IDX['wrap twist 2']
    sb = C.sil_beta(pr, kc)
    sb = np.pi / 2 if sb is None else sb
    out = []
    for db in (-20, 0, 20):
        b = float(np.clip(sb + np.radians(db), 0.3, np.pi - 0.3))
        for sg in (1, -1):
            for tw in ((1, -1), (-1, 1), (1, 1), (-1, -1)):
                xx = C.set_roll(x, kc, pr.roll_tau0[kc], b, 0.5 * W, sg * 0.95 * np.pi)
                xx = C.set_roll(xx, k1, pr.roll_tau0[k1], np.pi / 2, 0.4 * W, tw[0] * 1.6)
                xx = C.set_roll(xx, k2, pr.roll_tau0[k2], np.pi / 2, 0.4 * W, tw[1] * 1.6)
                out.append(([f'db{db}', f'c{sg:+d}', f'tw{tw[0]:+d}{tw[1]:+d}'], xx))
    return out


def pick_bk_bottom_sec(pr, x, sec):
    ks = [k for k in sec.act if pr.rname[k].startswith('bottom-K')]
    ys = []
    cx = pr.ctx(x, sec.act)
    for k in ks:
        u0, b, rho, phi = pr.rolls(x)[k]
        u0 = pr.F(x, np.array([u0]))[0]
        uc = u0 + 0.5 * rho * abs(phi) / max(np.sin(b), 0.2)
        P3 = C.chain_surface(cx[0][0], cx[1], np.array([uc]), np.array([0.0]))
        ys.append(AP.project(P3)[0, 1])
    return ks[int(np.argmax(ys))]


_guides = {}


def sil_guides():
    if not _guides:
        g = json.load(open(os.path.join(ROOT, 'docs/ribbon/turns/guides_v5.json')))
        for sgm in g['segments']:
            if sgm['kind'] == 'sil':
                _guides[sgm['turn']] = AP._resample(np.array(sgm['pts'], float), 3.0)
    return _guides


def edge_kinks(P, W_css):
    """P: projected edge polyline (css). returns (n curvature-oscillation lobes < 0.5 W (edgecheck rule), n polygonal corners: turn > 6 deg between consecutive 1-css segments, merged within 0.5 W)"""
    from scipy import ndimage as ndi
    s = np.r_[0, np.cumsum(np.hypot(*np.diff(P, axis=0).T))]
    if s[-1] < 5:
        return 0, 0
    ds = 1.0
    n = int(s[-1] / ds)
    u = np.linspace(0, s[-1], n)
    Q = np.stack([np.interp(u, s, P[:, 0]), np.interp(u, s, P[:, 1])], 1)
    Q = np.stack([ndi.gaussian_filter1d(Q[:, c], 1.5) for c in (0, 1)], 1)
    d1 = np.gradient(Q, axis=0); d2 = np.gradient(d1, axis=0)
    k = (d1[:, 0] * d2[:, 1] - d1[:, 1] * d2[:, 0]) / np.maximum(np.hypot(*d1.T), 1e-6) ** 3 * W_css
    sg = np.sign(np.where(np.abs(k) < 0.02, 0, k))
    lobes = []; a = 0
    for i in range(1, n + 1):
        if i == n or sg[i] != sg[a]:
            if sg[a] != 0:
                lobes.append((a, i - 1, sg[a], np.abs(k[a:i]).max()))
            a = i
    osc = 0
    for j in range(1, len(lobes) - 1):
        a_, b_, sgn, amp = lobes[j]
        length = (b_ - a_ + 1) * ds
        if length < 0.5 * W_css and amp > 0.25 and lobes[j - 1][3] > 0.25 and lobes[j + 1][3] > 0.25 and amp < 3.0:
            osc += 1
    # corners (refined): turning over a 0.15 W arc window > 12 deg AND a curvature spike (> 3x the median |curvature| of the surrounding 1 W)
    Qs = np.stack([ndi.gaussian_filter1d(np.stack([np.interp(u, s, P[:, 0]), np.interp(u, s, P[:, 1])], 1)[:, c], 1.0) for c in (0, 1)], 1)
    t = np.diff(Qs, axis=0)
    th = np.unwrap(np.arctan2(t[:, 1], t[:, 0]))
    w = max(2, int(0.15 * W_css / ds))
    dth = np.degrees(np.abs(th[w:] - th[:-w]))
    kap = np.abs(np.gradient(th)) / ds
    half = int(0.5 * W_css / ds)
    corners = 0; last = -10 ** 9
    a1, a2 = int(0.1 * W_css / ds), int(0.35 * W_css / ds)
    for i in np.nonzero(dth > 12.0)[0]:
        j = i + int(np.argmax(kap[i:i + w]))
        left = kap[max(0, j - a2):max(0, j - a1)]; right = kap[min(len(kap), j + a1):min(len(kap), j + a2)]
        if len(left) < 2 or len(right) < 2:
            continue          # at a section end: not a local spike
        if kap[j] > 3.0 * max(float(np.median(left)), 1e-4) and kap[j] > 3.0 * max(float(np.median(right)), 1e-4) and i - last > 0.5 * W_css / ds:
            corners += 1
            last = i
    return osc, corners


def realism(pr, sec, x, outline=True):
    """realism report of one section: crossings of consecutive true rulings INSIDE the band, adjacent-ruling separation along the edges (>= 0.15 x nominal),
    min fold rho / W, curvature oscillation + polygonal corners on both projected edges, outline distance to the window roll-outline (SIL) guide"""
    W = pr.W
    pc = sec_rulings(pr, x, sec, hidden=False)
    rolls = pc['cx'][1]; gaps = pc['gaps']; inroll = pc['inroll']; uc = pc['uc']
    L3, R3 = pc['L'], pc['R']
    rep = dict(section=sec.name, roll_overlap_min_gap=float(min(gaps)) if gaps else None)
    pl, pr_ = AP.project_css(L3), AP.project_css(R3)
    xm = C._seg_cross(pl[:-1], pr_[:-1], pl[1:], pr_[1:])
    rep['crossings'] = int(xm.sum())
    sepL = np.linalg.norm(np.diff(pl, axis=0), axis=1) < 0.15 * np.linalg.norm(np.diff(L3, axis=0), axis=1)
    sepR = np.linalg.norm(np.diff(pr_, axis=0), axis=1) < 0.15 * np.linalg.norm(np.diff(R3, axis=0), axis=1)
    rr = inroll[:-1]
    rep['sep_violations'] = int(((sepL | sepR) & rr).sum())
    folds = [rolls[i, 2] / W for i, k in enumerate(sec.act) if pr.kind[k] in ('fold', 'obl')]
    rep['min_fold_rho_over_W'] = float(min(folds)) if folds else None
    osc1, cor1 = edge_kinks(pl, W); osc2, cor2 = edge_kinks(pr_, W)
    rep['curv_oscillations'] = int(osc1 + osc2); rep['corners'] = int(cor1 + cor2)
    # surface dip check: signed dihedral between consecutive true-ruling quads; short sandwiched lobes (< 1 W of arc, >= 3 deg) = dip / crease
    rul = R3 - L3
    ed = L3[1:] - L3[:-1]
    nq = np.cross(rul[:-1], ed); nq /= np.maximum(np.linalg.norm(nq, axis=1, keepdims=True), 1e-12)
    tdir = (rul[:-2] + rul[1:-1]) / 2; tdir /= np.maximum(np.linalg.norm(tdir, axis=1, keepdims=True), 1e-12)
    cr = np.cross(nq[:-1], nq[1:])
    dh = np.degrees(np.arctan2((cr * tdir).sum(1), (nq[:-1] * nq[1:]).sum(1)))
    sg = np.sign(np.where(np.abs(dh) < 0.02, 0, dh))
    lobes = []; a0 = 0
    for i in range(1, len(sg) + 1):
        if i == len(sg) or sg[i] != sg[a0]:
            if sg[a0] != 0:
                lobes.append((a0, i - 1, float(np.abs(dh[a0:i]).sum())))
            a0 = i
    step = float(np.median(np.diff(uc)))
    dips = 0
    for j in range(1, len(lobes) - 1):
        ln = (lobes[j][1] - lobes[j][0] + 1) * step
        if ln < 1.0 * W and lobes[j][2] >= 3.0 and lobes[j - 1][2] >= 3.0 and lobes[j + 1][2] >= 3.0:
            dips += 1
    rep['dips'] = dips
    rep['outline'] = {}
    if outline:
        from scipy import ndimage as ndi
        pxl, pxr = AP.project(L3), AP.project(R3)
        im = Image.new('L', (852, 1846), 0)
        dr = ImageDraw.Draw(im)
        for i in range(len(pxl) - 1):
            dr.polygon([tuple(pxl[i]), tuple(pxl[i + 1]), tuple(pxr[i + 1]), tuple(pxr[i])], fill=255)
        m = np.array(im) > 0
        bnd = m & ~ndi.binary_erosion(m, iterations=1)
        dt = ndi.distance_transform_edt(~bnd)
        gd = sil_guides()
        for iv in sec.ivs:
            if iv in WINNAME and C.WIN_NAMES[pr.win_iv.index(iv)] in gd:
                g = gd[C.WIN_NAMES[pr.win_iv.index(iv)]]
                d = ndi.map_coordinates(dt, [g[:, 1], g[:, 0]], order=1, mode='nearest')
                rep['outline'][WINNAME[iv]] = dict(mean_px=float(d.mean()), max_px=float(d.max()), n=int(len(d)))
    fails = []
    if rep['crossings']:
        fails.append('crossing')
    if rep['sep_violations']:
        fails.append('separation')
    if rep['min_fold_rho_over_W'] is not None and rep['min_fold_rho_over_W'] < 0.3 - 1e-6:
        fails.append('rho<0.3W')
    if rep['curv_oscillations']:
        fails.append('curv-oscillation')
    if rep['corners']:
        fails.append('corners')
    if rep['dips']:
        fails.append('surface-dip')
    if rep['roll_overlap_min_gap'] is not None and rep['roll_overlap_min_gap'] < 0:
        fails.append('roll-overlap')
    rep['fails'] = fails
    return rep, (L3, R3)


def sec_metrics(pr, sec, x):
    st = pr.stage_info(sec.act, sec.lo, sec.hi)
    parts = pr.parts(x, st)
    allr = np.concatenate(list(parts.values()))
    m = dict(section=sec.name, cost=round(0.5 * float(allr @ allr), 1), blocks=C.block_costs(parts), data_own=data_stats(pr, x, sec),
             ou=C.ou_stat(pr, x, st))
    return m


def finish_section(pr, sec, x, t00, tags):
    name = sec.name
    if name == 'K':
        pr.bk_bottom = pick_bk_bottom_sec(pr, x, sec)
    m = sec_metrics(pr, sec, x)
    m['tags'] = list(tags)
    m['realism'], _ = realism(pr, sec, x)
    rms = m['data_own']['rms']
    m['gate_rms'] = sec.gate
    m['gate'] = ('PASS' if (rms is not None and rms <= sec.gate) else 'FAIL') if sec.gate else 'n/a (hidden)'
    r_ = pr.rolls(x)[sec.act]
    m['rolls'] = [dict(name=pr.rname[k], tau=float(r_[i, 0]), beta_deg=float(np.degrees(r_[i, 1])), rho_css=float(r_[i, 2]), rho_over_W=float(r_[i, 2] / pr.W),
                       phi_deg=float(np.degrees(r_[i, 3]))) for i, k in enumerate(sec.act)]
    m['lam'] = {int(j): float(x[6 + 4 * NR + j]) for j in sec.ivs}
    m['seconds'] = time.time() - t00
    np.savez(sec_path(sec.name), x=x, bk_bottom=-1 if pr.bk_bottom is None else pr.bk_bottom)
    json.dump(m, open(os.path.join(DIRS['sections'], f'sec_{sec.name}.json'), 'w'), indent=1, default=float)
    draw_section(pr, sec, x)
    log(f'  SECTION {sec.name} DONE: data rms {rms} (p95 {m["data_own"]["p95"]}, max {m["data_own"]["max"]}) gate <= {sec.gate}: {m["gate"]}; cost {m["cost"]}; {m["seconds"]:.0f}s')
    log('  METRICS ' + json.dumps(m, default=float))
    return x, m


def load_sec(pr, name):
    d = np.load(sec_path(name))
    return d['x']




# ================================================================== joint fit (multiple shooting)
SECN = [a[0] for a in SEC_DEF]
JUNC = [(SECN[i], SECN[i + 1]) for i in range(len(SECN) - 1)]       # 8 junctions
D3 = (-0.3, 0.0, 0.3)
HV = 0.05


def load_all(pr):
    XS = {}
    for n in SECN:
        XS[n] = ldx(pr, sec_path(n)).copy()
    return XS


def bk_global(pr, XS):
    pr.bind('K')
    return pick_bk_bottom_sec(pr, XS['K'], pr.secs['K'])


class Joint:
    """parameters z = [free(sec) for sec in SECN] + delta (8). Residuals: section blocks (own rings), junction continuity (weight wc), end-hidden, over/under (all sections), clearance."""

    def __init__(self, pr, XS, delta=None, wc=1.0):
        self.pr = pr
        self.XS = {n: XS[n].copy() for n in SECN}
        self.delta = np.zeros(len(JUNC)) if delta is None else np.asarray(delta, float).copy()
        self.wc = wc
        self.W = pr.W
        self.bkb = bk_global(pr, self.XS)
        self.off = {}
        n = 0
        for nm in SECN:
            k = len(pr.secs[nm].free)
            self.off[nm] = (n, n + k); n += k
        self.nd0 = n
        self.nz = n + len(JUNC)
        lo = np.full(self.nz, -np.inf); hi = np.full(self.nz, np.inf)
        for nm in SECN:
            a, b = self.off[nm]
            fr = pr.secs[nm].free
            lo[a:b], hi[a:b] = pr.lo[fr], pr.hi[fr]
        lo[n:], hi[n:] = -1.0 * self.W, 1.0 * self.W
        self.lo, self.hi = lo, hi
        self.vz = np.array([-0.5, -0.25, 0.0, 0.25, 0.5]) * self.W
        self.ou_pairs = pr.ou_pairs
        self.thk = pr.thk
        self.ou_list = None
        self.clr_list = None
        self.best = [np.inf, None]
        self.t0 = time.time()
        self.cap = 1e9

    # ---------------------------------------------------------------- packing
    def pack(self):
        z = np.zeros(self.nz)
        for nm in SECN:
            a, b = self.off[nm]
            z[a:b] = self.XS[nm][self.pr.secs[nm].free]
        z[self.nd0:] = self.delta
        return z

    def xs_from(self, z, nm):
        a, b = self.off[nm]
        x = self.XS[nm].copy()
        x[self.pr.secs[nm].free] = z[a:b]
        return x

    # ---------------------------------------------------------------- per-section evaluation
    def _junc_pts(self, pr, cx, xs, tau_j, d):
        """junction samples: 15 points (3 u offsets x 5 v) and 5 unit normals at the junction u"""
        W = self.W
        u0 = float(pr.F(xs, np.array([tau_j]))[0]) + d
        U = np.repeat([u0 + dd * W for dd in D3], 5)
        V = np.tile(self.vz, 3)
        G = cx[0][0]; r = cx[1]
        P = C.chain_surface(G, r, U, V)
        vv = self.vz
        n5 = len(vv)
        a = C.chain_surface(G, r, np.full(n5, u0 + HV), vv); b = C.chain_surface(G, r, np.full(n5, u0 - HV), vv)
        c = C.chain_surface(G, r, np.full(n5, u0), vv + HV); e = C.chain_surface(G, r, np.full(n5, u0), vv - HV)
        N = np.cross(a - b, c - e)
        N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
        return P, N

    def eval_sec(self, nm, xs, d_in, full=True):
        pr = self.pr
        sec = pr.bind(nm)
        pr.skip_ou = True
        pr.bk_bottom = self.bkb if nm == 'K' else None
        out = {}
        cx = pr.ctx(xs, sec.act)
        i = SECN.index(nm)
        if i > 0:
            out['jl'] = self._junc_pts(pr, cx, xs, sec.tau_in, d_in)
        if i < len(SECN) - 1:
            out['jr'] = self._junc_pts(pr, cx, xs, sec.tau_out, 0.0)
        if not full:
            return out
        st = pr.stage_info(sec.act, sec.r0, sec.r1)
        out['res'] = pr.res(xs, st)
        W = self.W
        # dense strand samples (tau-sampled) of the section's own strands, z-buffer per (cell, strand)
        pts, taus, sids = [], [], []
        vz = st['vz']
        for j, n in zip(st['strands'], st['ns']):
            ta = pr.tau[pr.i0[j]]
            tb = pr.tau[pr.i0[j + 1]] if j + 1 < NI else pr.tau[pr.i1[j]]
            t = np.linspace(ta, tb, n, endpoint=False)
            u = pr.F(xs, t)
            U = np.repeat(u, len(vz)); V = np.tile(vz, len(u))
            pts.append(C.chain_surface(cx[0][0], cx[1], U, V)); taus.append(np.repeat(t, len(vz))); sids.append(np.full(len(U), j))
        pts = np.concatenate(pts); taus = np.concatenate(taus); sids = np.concatenate(sids)
        out['pts'], out['tau'], out['sid'] = pts, taus, sids
        p2 = AP.project(pts)
        key = (np.floor(p2[:, 0] / C.CELL).astype(np.int64) + 2000) * 4000 + (np.floor(p2[:, 1] / C.CELL).astype(np.int64) + 2000)
        comp = key * 32 + sids
        z = pts[:, 2]
        order = np.lexsort((z, comp))
        cs = comp[order]
        last = np.r_[cs[1:] != cs[:-1], True]
        sel = order[last]
        cell = comp[sel] >> 5; strand = comp[sel] & 31
        out['zb'] = {j: (cell[strand == j], z[sel][strand == j], taus[sel][strand == j]) for j in st['strands']}
        if nm == 'A':
            li = np.arange(pr.i0[pr.end_behind], pr.i1[pr.end_behind] + 1)
            u = pr.F(xs, pr.tau[li]); n = len(li)
            out['leg'] = (C.chain_surface(cx[0][0], cx[1], u, np.full(n, -W / 2)), C.chain_surface(cx[0][0], cx[1], u, np.full(n, W / 2)))
        if nm == 'P':
            ei = np.arange(pr.N - 20, pr.N)
            u = pr.F(xs, pr.tau[ei])
            Lw = C.chain_surface(cx[0][0], cx[1], u, np.full(20, -W / 2)); Rw = C.chain_surface(cx[0][0], cx[1], u, np.full(20, W / 2))
            p1, p2_ = AP.project(Lw), AP.project(Rw)
            out['endpts'] = np.concatenate([p1, p2_, (p1 + p2_) / 2])
        return out

    def eval_all(self, z):
        outs = {}
        for i, nm in enumerate(SECN):
            d_in = z[self.nd0 + i - 1] if i > 0 else 0.0
            outs[nm] = self.eval_sec(nm, self.xs_from(z, nm), d_in)
        return outs

    # ---------------------------------------------------------------- blocks
    def junc_res(self, a_out, b_out):
        Pa, Na = a_out['jr']; Pb, Nb = b_out['jl']
        return np.concatenate([(Pa - Pb).ravel(), ((Na - Nb) * self.W).ravel()]) * SC * self.wc

    def end_res(self, outs):
        pr = self.pr
        L, R = outs['A']['leg']
        pe = outs['P']['endpts']
        cand = np.tile(np.arange(len(L) - 1), (len(pe), 1))
        return S.coverage_resid(L, R, pe, cand, self.W, 'in') * math.sqrt(C.W_END)

    def refresh(self, outs):
        """fix the (rule pair, cell) list of the over/under block and the close-point pair list of the clearance block at the current point"""
        W = self.W
        zb = {}
        for nm in SECN:
            zb.update(outs[nm]['zb'])
        pi, cells = [], []
        for p, (f, b, ri) in enumerate(self.ou_pairs):
            if f not in zb or b not in zb:
                continue
            kf, zf, tf = zb[f]; kb, zbb, tb = zb[b]
            if len(kf) == 0 or len(kb) == 0:
                continue
            cm, ia, ib = np.intersect1d(kf, kb, assume_unique=True, return_indices=True)
            ok = np.abs(tf[ia] - tb[ib]) >= C.BEND_MIN_ARC * W
            cm = cm[ok]
            pi.append(np.full(len(cm), p)); cells.append(cm)
        pi = np.concatenate(pi) if pi else np.zeros(0, int)
        cells = np.concatenate(cells) if cells else np.zeros(0, np.int64)
        if len(pi) > OU_PAD:
            keep = np.sort(np.random.default_rng(0).choice(len(pi), OU_PAD, replace=False))
            pi, cells = pi[keep], cells[keep]
        self.ou_list = (pi, cells)
        P = np.concatenate([outs[nm]['pts'] for nm in SECN]); T = np.concatenate([outs[nm]['tau'] for nm in SECN])
        tree = cKDTree(P)
        pairs = tree.query_pairs(2.0 * self.thk, output_type='ndarray')
        if len(pairs):
            m = np.abs(T[pairs[:, 0]] - T[pairs[:, 1]]) >= C.BEND_MIN_ARC * W
            pairs = pairs[m]
        if len(pairs) > CLR_PAD:
            d = np.linalg.norm(P[pairs[:, 0]] - P[pairs[:, 1]], axis=1)
            pairs = pairs[np.argsort(d)[:CLR_PAD]]
        self.clr_list = pairs

    def ou_res(self, outs):
        zb = {}
        for nm in SECN:
            zb.update(outs[nm]['zb'])
        pi, cells = self.ou_list
        r = np.zeros(OU_PAD)
        thk2 = 2 * self.thk
        for p in np.unique(pi):
            f, b, _ = self.ou_pairs[p]
            m = np.nonzero(pi == p)[0]
            c = cells[m]
            kf, zf, _ = zb[f]; kb, zbb, _ = zb[b]
            i1 = np.searchsorted(kf, c); i1c = np.minimum(i1, len(kf) - 1)
            i2 = np.searchsorted(kb, c); i2c = np.minimum(i2, len(kb) - 1)
            ok = (kf[i1c] == c) & (kb[i2c] == c)
            gap = zf[i1c] - zbb[i2c]
            r[m] = np.where(ok, np.maximum(0.0, thk2 - gap), 0.0) * SC * C.W_OU
        return r

    def clr_res(self, outs):
        r = np.zeros(CLR_PAD)
        pr_ = self.clr_list
        if len(pr_):
            P = np.concatenate([outs[nm]['pts'] for nm in SECN])
            d = np.linalg.norm(P[pr_[:, 0]] - P[pr_[:, 1]], axis=1)
            r[:len(pr_)] = np.maximum(0.0, 2 * self.thk - d) * SC * W_CLR
        return r

    def blocks(self, outs, which=None):
        B = {}
        for nm in SECN:
            B['s:' + nm] = outs[nm]['res']
        for j, (a, b) in enumerate(JUNC):
            B[f'j:{j}'] = self.junc_res(outs[a], outs[b])
        B['end'] = self.end_res(outs)
        B['ou'] = self.ou_res(outs)
        B['clr'] = self.clr_res(outs)
        return B

    # ---------------------------------------------------------------- least squares interface
    def fun(self, z):
        if time.time() - self.t0 > self.cap:
            raise C.Timeout()
        outs = self.eval_all(z)
        if self.ou_list is None:
            self.refresh(outs)
        B = self.blocks(outs)
        r = np.concatenate(list(B.values()))
        c = 0.5 * float(r @ r)
        if c < self.best[0]:
            self.best = [c, z.copy()]
        return r

    def jac(self, z):
        if time.time() - self.t0 > self.cap:
            raise C.Timeout()
        outs = self.eval_all(z)
        self.refresh(outs)
        B0 = self.blocks(outs)
        keys = list(B0.keys())
        sizes = [len(B0[k]) for k in keys]
        offs = dict(zip(keys, np.r_[0, np.cumsum(sizes)[:-1]]))
        m = int(sum(sizes))
        J = np.zeros((m, self.nz))
        for si, nm in enumerate(SECN):
            a, b = self.off[nm]
            dep = ['s:' + nm, 'end', 'ou', 'clr'] + ([f'j:{si - 1}'] if si > 0 else []) + ([f'j:{si}'] if si < len(JUNC) else [])
            if nm not in ('A', 'P'):
                dep.remove('end')
            for i in range(a, b):
                zp = z.copy()
                h = 1e-6 * max(1.0, abs(z[i]))
                zp[i] += h
                d_in = zp[self.nd0 + si - 1] if si > 0 else 0.0
                o2 = dict(outs)
                o2[nm] = self.eval_sec(nm, self.xs_from(zp, nm), d_in)
                for k in dep:
                    if k.startswith('s:'):
                        new = o2[nm]['res']
                    elif k.startswith('j:'):
                        j = int(k[2:]); new = self.junc_res(o2[JUNC[j][0]], o2[JUNC[j][1]])
                    elif k == 'end':
                        new = self.end_res(o2)
                    elif k == 'ou':
                        new = self.ou_res(o2)
                    else:
                        new = self.clr_res(o2)
                    o0 = int(offs[k])
                    J[o0:o0 + len(new), i] = (new - B0[k]) / h
            if time.time() - self.t0 > self.cap:
                raise C.Timeout()
        for j in range(len(JUNC)):
            i = self.nd0 + j
            zp = z.copy(); h = 1e-6 * max(1.0, abs(z[i])); zp[i] += h
            b = JUNC[j][1]
            ob = self.eval_sec(b, self.xs_from(zp, b), zp[i], full=False)
            o2 = dict(outs); o2[b] = dict(outs[b]); o2[b]['jl'] = ob['jl']
            new = self.junc_res(o2[JUNC[j][0]], o2[b])
            o0 = int(offs[f'j:{j}'])
            J[o0:o0 + len(new), i] = (new - B0[f'j:{j}']) / h
        return J

    def solve(self, z0, secs, label):
        self.t0 = time.time(); self.cap = secs
        self.best = [np.inf, z0.copy()]
        self.ou_list = None
        status = 'ok'
        z0c = np.clip(z0, self.lo + 1e-9, self.hi - 1e-9)
        try:
            r = least_squares(self.fun, z0c, jac=self.jac, method='trf', x_scale='jac', max_nfev=200, bounds=(self.lo, self.hi))
            z, cost = r.x, float(r.cost)
            if cost > self.best[0]:
                z, cost = self.best[1], self.best[0]
        except C.Timeout:
            z, cost, status = self.best[1], self.best[0], 'timeout'
        log(f'    [{label}] {status} cost {cost:.1f} ({time.time() - self.t0:.0f}s)')
        return z, cost, status

    def set_z(self, z):
        for nm in SECN:
            self.XS[nm] = self.xs_from(z, nm)
        self.delta = z[self.nd0:].copy()

    # ---------------------------------------------------------------- metrics
    def level_metrics(self, z, detail=True):
        pr = self.pr
        outs = self.eval_all(z)
        self.refresh(outs)
        W = self.W
        m = {}
        gaps, gaps0, angs = [], [], []
        for j, (a, b) in enumerate(JUNC):
            Pa, Na = outs[a]['jr']; Pb, Nb = outs[b]['jl']
            g = np.linalg.norm(Pa - Pb, axis=1)
            cosang = np.clip((Na * Nb).sum(1), -1, 1)
            gaps.append(float(g.max())); gaps0.append(float(g[5:10].max())); angs.append(float(np.degrees(np.arccos(cosang)).max()))
        m['junction_gap_max_css'] = gaps
        m['junction_gap_at_u_css'] = gaps0
        m['junction_normal_deg'] = angs
        m['junction_gap_max_all'] = max(gaps)
        m['junction_normal_deg_max'] = max(angs)
        m['delta'] = [float(v) for v in z[self.nd0:]]
        # data
        d = {}
        allv, notail = [], []
        for nm in SECN:
            sec = pr.bind(nm)
            pr.skip_ou = True
            pr.bk_bottom = self.bkb if nm == 'K' else None
            st = pr.stage_info(sec.act, sec.r0, sec.r1)
            xs = self.xs_from(z, nm)
            v = C.ring_dists(pr, xs, st)
            d[nm] = C.stats(v)
            if len(v):
                allv.append(v)
                if nm != 'T':
                    notail.append(v)
        m['data_rms_by_section'] = {k: (None if v['rms'] is None else round(v['rms'], 3)) for k, v in d.items()}
        m['data_rms_overall'] = C.stats(np.concatenate(allv))
        m['data_rms_excl_tail'] = C.stats(np.concatenate(notail))
        m['data_rms_tail'] = d['T']
        # over/under, evaluated afresh on the dense set (all (pair, cell) overlaps)
        zbd = {}
        for nm in SECN:
            zbd.update(outs[nm]['zb'])
        n_all = n_2 = n_1 = 0; worst = 0.0
        for f, b, ri in self.ou_pairs:
            if f not in zbd or b not in zbd:
                continue
            kf, zf, tf = zbd[f]; kb, zbb, tb = zbd[b]
            if len(kf) == 0 or len(kb) == 0:
                continue
            _, ia, ib = np.intersect1d(kf, kb, assume_unique=True, return_indices=True)
            ok = np.abs(tf[ia] - tb[ib]) >= C.BEND_MIN_ARC * W
            gap = zf[ia][ok] - zbb[ib][ok]
            n_all += len(gap); n_2 += int((gap < 2 * self.thk).sum()); n_1 += int((gap < self.thk).sum())
            if len(gap):
                worst = max(worst, float((2 * self.thk - gap).max()))
        m['ou'] = dict(cells=n_all, viol_lt_2thk=n_2, viol_lt_thk=n_1, max_shortfall_css=worst)
        # face map
        ag = ck = 0
        for nm in SECN:
            sec = pr.secs[nm]
            xs = self.xs_from(z, nm)
            pr.bind(nm)
            idx = np.arange(sec.r0, sec.r1 + 1)
            PL, PR = sec_edges(pr, xs, sec, idx)
            Cc = (PL + PR) / 2
            Tq = Cc[1:] - Cc[:-1]
            Dq = ((PR - PL)[1:] + (PR - PL)[:-1]) / 2
            nn = np.cross(Tq, Dq)
            sh = (nn * (pr.cam - (Cc[1:] + Cc[:-1]) / 2)).sum(1)
            face = np.where(sh < 0, 'A', 'B')
            j = np.nonzero(pr.face_ok[sec.r0:sec.r1])[0]
            ag += int((face[j] == pr.face_exp[sec.r0 + j]).sum()); ck += len(j)
        m['face'] = dict(checked=ck, agree=ag, frac=ag / max(ck, 1))
        m['end_cost'] = float(0.5 * np.sum(self.end_res(outs) ** 2))
        m['close_pairs_lt_2thk'] = int(len(self.clr_list))
        return m, outs

    def pieces(self, z):
        """per section true rulings over the section's trimmed u range (junction delta applied at the start)"""
        pr = self.pr
        out = []
        for i, nm in enumerate(SECN):
            sec = pr.bind(nm)
            xs = self.xs_from(z, nm)
            u_lo = float(pr.F(xs, np.array([sec.tau_in]))[0]) + (z[self.nd0 + i - 1] if i > 0 else 0.0)
            out.append(sec_rulings(pr, xs, sec, u_lo=u_lo, step=1.0))
        return out


def joint_save(path, J, z, extra=None):
    d = dict(z=z, delta=z[J.nd0:], bkb=J.bkb)
    for nm in SECN:
        d['x_' + nm] = J.xs_from(z, nm)
    np.savez(path, **d)


def joint_load(path):
    d = np.load(path)
    return {nm: d['x_' + nm] for nm in SECN}, d['delta']


# ================================================================== bridges (hidden sections B, M)
def bridge(pr, XS, nm, J0=None):
    i = SECN.index(nm)
    prev, nxt = SECN[i - 1], SECN[i + 1]
    sec = pr.secs[nm]
    J = Joint(pr, XS, None, 1.0)
    z0 = J.pack()
    ja = J.eval_sec(prev, XS[prev], 0.0, full=False)
    jb = J.eval_sec(nxt, XS[nxt], 0.0, full=False)
    ka = sec.act[0]
    free = np.array(sorted(list(range(6)) + [6 + 4 * ka + j for j in range(4)] + [6 + 4 * NR + j for j in sec.ivs]))

    def resid(zf, x_base):
        x = x_base.copy(); x[free] = zf
        o = J.eval_sec(nm, x, 0.0, full=False)
        return np.concatenate([J.junc_res(ja, o), J.junc_res(o, jb)])

    # pose start: the section's flat model matched (Kabsch) to the previous section's junction samples
    x = pr.x0.copy()
    x[6 + 4 * NR + sec.ivs[0]] = pr.lam0[sec.ivs[0]]
    pr.bind(nm)
    o = J.eval_sec(nm, x, 0.0, full=False)
    R, t = AA.kabsch(o['jl'][0], ja['jr'][0])
    x[:3] = Rotation.from_matrix(R).as_rotvec(); x[3:6] = t
    best = None
    for phi in (-0.8, -0.4, 0.0, 0.4, 0.8):
        for beta in (np.pi / 2, np.pi / 3, 2 * np.pi / 3):
            xs = x.copy(); o4 = 6 + 4 * ka
            xs[o4:o4 + 4] = [pr.roll_tau0[ka], beta, 3 * pr.W, phi]
            try:
                r = least_squares(resid, xs[free], args=(xs,), method='trf', x_scale='jac', bounds=(pr.lo[free], pr.hi[free]), diff_step=1e-6, max_nfev=300)
            except Exception as e:
                continue
            if best is None or r.cost < best[0]:
                xo = xs.copy(); xo[free] = r.x
                best = (float(r.cost), xo, phi, beta)
    log(f'  bridge {nm}: continuity-only LS cost {best[0]:.2f} (start phi {best[2]:.2f} beta {np.degrees(best[3]):.0f})')
    return best[1]


# ================================================================== export / rings
def sec_regions(rolls, W, u_start, u_end):
    """regions of true rulings for one section (chain_fit.emit_chain logic): list of (kind, uc0, uc1, f, [k]); f(uc) -> flat coords (uL, uR)"""
    K = len(rolls)

    def edges_roll(k):
        u0, b, rho, phi = rolls[k]
        cb, sb = np.cos(b), np.sin(b)
        return (lambda Xp: (u0 + (Xp - W / 2 * cb) / sb, u0 + (Xp + W / 2 * cb) / sb)), rho * abs(phi), u0, sb
    regs, gaps = [], []
    infos = [edges_roll(k) for k in range(K)]
    for k in range(K):
        f, L, u0, sb = infos[k]
        if k == 0:
            regs.append(('flat', u_start, u0, lambda uc, f=f, u0=u0, sb=sb: f((uc - u0) * sb)))
        regs.append(('roll', u0, u0 + L / sb, lambda uc, f=f, u0=u0, sb=sb: f((uc - u0) * sb), k))
        if k + 1 < K:
            f2, L2, u02, sb2 = infos[k + 1]
            a0, a1 = f(L), f2(0.0)
            ca, cb_ = (a0[0] + a0[1]) / 2, (a1[0] + a1[1]) / 2
            gaps.append(min(a1[0] - a0[0], a1[1] - a0[1]))
            regs.append(('flat', ca, cb_, lambda uc, a0=a0, a1=a1, ca=ca, cb_=cb_: tuple(np.array(a0) + (np.array(a1) - np.array(a0)) * ((uc - ca) / max(cb_ - ca, 1e-9)))))
        else:
            regs.append(('flat', u0 + L / sb, u_end, lambda uc, f=f, u0=u0, sb=sb: f((uc - u0) * sb)))
    return regs, gaps


def lookup_ruling(regs, c):
    for rg in regs:
        if rg[1] - 1e-9 <= c <= rg[2] + 1e-9 and rg[2] - rg[1] > 1e-9:
            return rg[3](c)
    raise RuntimeError(f'no region for uc={c}')


def build_rings(pr, XS, delta, max_rings=316, strict=True):
    """concatenate the sections' true-ruling rings over their own u ranges (overlaps trimmed at the junctions), weight-uniform spacing"""
    W = pr.W
    ctxs, ranges, regs_l, gap_l = {}, {}, {}, {}
    for i, nm in enumerate(SECN):
        sec = pr.bind(nm)
        xs = XS[nm]
        cx = pr.ctx(xs, sec.act)
        ctxs[nm] = cx
        u_lo = float(pr.F(xs, np.array([sec.tau_in]))[0]) + (delta[i - 1] if i > 0 else 0.0)
        u_hi = float(pr.F(xs, np.array([sec.tau_out]))[0])
        ranges[nm] = (u_lo, u_hi)
        rolls = cx[1]
        r_lo = min([u_lo] + [r[0] for r in rolls]) - 1.0
        r_hi = max([u_hi] + [r[0] + r[2] * abs(r[3]) / np.sin(r[1]) for r in rolls]) + 1.0
        regs, gaps = sec_regions(rolls, W, r_lo, r_hi)
        if gaps and min(gaps) < 0:
            raise RuntimeError(f'section {nm}: rolls overlap (min edge gap {min(gaps):.2f} css): refusing to export')
        for r0_, r1_ in zip(regs[:-1], regs[1:]):
            if r1_[1] < r0_[2] - 1e-6:
                raise RuntimeError(f'section {nm}: region order violated: refusing')
        regs_l[nm], gap_l[nm] = regs, gaps
    S0, off = {}, {}
    s = 0.0
    for nm in SECN:
        u_lo, u_hi = ranges[nm]
        S0[nm] = s; off[nm] = s - u_lo
        s += u_hi - u_lo
    s_end = s
    sg = np.arange(0.0, s_end, 0.1)
    dt = np.full(len(sg), 1e9)
    for nm in SECN:
        for r in ctxs[nm][1]:
            u0, b, rho, phi = r
            L = rho * abs(phi)
            if L > 1e-3:
                m = (sg >= u0 + off[nm]) & (sg <= u0 + off[nm] + L / np.sin(b))
                dt[m] = np.minimum(dt[m], max(0.2 * rho / np.sin(b), 0.8))

    def profile(bflat):
        d = np.minimum(dt, bflat)
        fwd = d.copy()
        for i in range(1, len(fwd)):
            fwd[i] = min(fwd[i], fwd[i - 1] + 0.025)
        for i in range(len(fwd) - 2, -1, -1):
            fwd[i] = min(fwd[i], fwd[i + 1] + 0.025)
        return fwd
    lo, hi = 0.5, 200.0
    for _ in range(40):
        mid = 0.5 * (lo + hi)
        n = np.sum(0.1 / profile(mid))
        if n > max_rings - 1:
            lo = mid
        else:
            hi = mid
    d = profile(hi)
    cum = np.r_[0.0, np.cumsum(0.1 / d)[:-1]]
    nr = int(np.floor(cum[-1])) + 1
    targets = np.linspace(0, cum[-1], nr)
    sc_ = np.interp(targets, cum, sg)
    sc_[-1] = s_end
    starts = np.array([S0[nm] for nm in SECN])
    sec_i = np.clip(np.searchsorted(starts, sc_ - 1e-9, side='right') - 1, 0, len(SECN) - 1)
    UL = np.zeros(nr); UR = np.zeros(nr)
    for i in range(nr):
        nm = SECN[sec_i[i]]
        UL[i], UR[i] = lookup_ruling(regs_l[nm], sc_[i] - off[nm])
    Lw = np.zeros((nr, 3)); Rw = np.zeros((nr, 3))
    for k, nm in enumerate(SECN):
        m = sec_i == k
        if m.any():
            G = ctxs[nm][0][0]; r = ctxs[nm][1]
            Lw[m] = C.chain_surface(G, r, UL[m], np.full(int(m.sum()), -W / 2))
            Rw[m] = C.chain_surface(G, r, UR[m], np.full(int(m.sum()), W / 2))
    # checks
    pl, pr_ = AP.project_css(Lw), AP.project_css(Rw)
    cross = int(C._seg_cross(pl[:-1], pr_[:-1], pl[1:], pr_[1:]).sum())
    dev = dev3 = 0.0
    for t in np.linspace(0, 1, 21)[1:-1]:
        S3 = np.zeros((nr, 3))
        for k, nm in enumerate(SECN):
            m = sec_i == k
            if m.any():
                S3[m] = C.chain_surface(ctxs[nm][0][0], ctxs[nm][1], UL[m] + t * (UR[m] - UL[m]), np.full(int(m.sum()), -W / 2 + t * W))
        ch = Lw + t * (Rw - Lw)
        dev3 = max(dev3, float(np.linalg.norm(S3 - ch, axis=1).max()))
        dev = max(dev, float(np.linalg.norm(AP.project_css(S3) - AP.project_css(ch), axis=1).max()))
    # junction gaps on the true rulings: the ring at the junction evaluated from each side
    jg = []
    for j, (a, b) in enumerate(JUNC):
        ua = lookup_ruling(regs_l[a], ranges[a][1]); ub = lookup_ruling(regs_l[b], ranges[b][0])
        gmax = 0.0
        for t in np.linspace(0, 1, 5):
            Pa = C.chain_surface(ctxs[a][0][0], ctxs[a][1], np.array([ua[0] + t * (ua[1] - ua[0])]), np.array([-W / 2 + t * W]))
            Pb = C.chain_surface(ctxs[b][0][0], ctxs[b][1], np.array([ub[0] + t * (ub[1] - ub[0])]), np.array([-W / 2 + t * W]))
            gmax = max(gmax, float(np.linalg.norm(Pa - Pb)))
        jg.append(gmax)
    sp = np.diff(sc_)
    chk = dict(n_rings=int(nr), cap=320, crossings=cross, max_ruling_dev_css_px=dev, max_ruling_dev_3d_css=dev3,
               min_gap_between_rolls_css=float(min([min(g) for g in gap_l.values() if g] or [0.0])),
               spacing_min=float(sp.min()), spacing_max=float(sp.max()), max_neighbour_ratio=float(np.max(np.maximum(sp[1:] / sp[:-1], sp[:-1] / sp[1:]))),
               flat_spacing_css=float(hi), junction_ruling_gap_css=jg, junction_ruling_gap_max_css=max(jg), sections_total_arc=float(s_end))
    return Lw, Rw, sec_i, chk


def export_candidate(pr, XS, delta, path):
    Lw, Rw, sec_i, chk = build_rings(pr, XS, delta, 316)
    json.dump(chk, open(os.path.join(OUT, 'export_checks.json'), 'w'), indent=2)
    fails = []
    if chk['crossings']:
        fails.append('crossings')
    if chk['max_ruling_dev_css_px'] > 0.1:
        fails.append('ruling dev > 0.1 px')
    if chk['n_rings'] > 320:
        fails.append('> 320 rings')
    if chk['junction_ruling_gap_max_css'] >= 0.5:
        fails.append('junction gap >= 0.5 css')
    chk['failures'] = fails
    if any(f != 'junction gap >= 0.5 css' for f in fails):
        json.dump(chk, open(os.path.join(OUT, 'export_checks.json'), 'w'), indent=2)
        raise RuntimeError('exporter refuses to write: ' + json.dumps(chk))
    EP.emit(Lw, Rw, 'phone', path)           # refuses lib/ribbon/poses/ak-hero.json
    np.savez(os.path.join(OUT, 'export_rings.npz'), L=Lw, R=Rw, sec=sec_i)
    json.dump(chk, open(os.path.join(OUT, 'export_checks.json'), 'w'), indent=2)
    return chk


def dense_LR(pr, XS, delta, step=0.6):
    """same-u edge polylines over each section's trimmed u range (silhouette / overlay metrics)"""
    W = pr.W
    Ls, Rs = [], []
    for i, nm in enumerate(SECN):
        sec = pr.bind(nm)
        xs = XS[nm]
        u_lo = float(pr.F(xs, np.array([sec.tau_in]))[0]) + (delta[i - 1] if i > 0 else 0.0)
        u_hi = float(pr.F(xs, np.array([sec.tau_out]))[0])
        u = np.r_[np.arange(u_lo, u_hi, step), u_hi]
        cx = pr.ctx(xs, sec.act)
        Ls.append(C.chain_surface(cx[0][0], cx[1], u, np.full(len(u), -W / 2))); Rs.append(C.chain_surface(cx[0][0], cx[1], u, np.full(len(u), W / 2)))
    return np.concatenate(Ls), np.concatenate(Rs)


def final_report(pr, XS, delta, J=None, z=None):
    J = J or Joint(pr, XS, delta, 1.0)
    z = z if z is not None else J.pack()
    m, outs = J.level_metrics(z)
    L, R = dense_LR(pr, XS, delta)
    win, ren = C.sil_window_metrics(pr, L, R)
    Image.fromarray((ren * 255).astype(np.uint8)).save(os.path.join(OUT, 'sil_render.png'))
    Lw, Rw, sec_i, chk = build_rings(pr, XS, delta, 900, strict=False)
    clr = C.clearance_min(pr, Lw, Rw, pr.W)
    W = pr.W
    ex = None
    try:
        ex = build_rings(pr, XS, delta, 316)[3]
    except Exception as e:
        ex = dict(error=str(e))
    rolls_min = min(XS[nm][6 + 4 * k + 2] / W for nm in SECN for k in pr.secs[nm].act if pr.kind[k] != 'bend')
    gates = {
        'max junction gap < 0.5 css': m['junction_gap_max_all'] < 0.5,
        'junction normal angle < 2 deg': m['junction_normal_deg_max'] < 2.0,
        'overall data RMS <= 6 px (excl. tail)': (m['data_rms_excl_tail']['rms'] or 0) <= 6.0,
        'tail data RMS <= 12 px': (m['data_rms_tail']['rms'] or 0) <= 12.0,
        'window silhouette IoU >= 0.97 (all)': all(v['iou'] >= 0.97 for v in win.values()),
        'face map >= 0.95': m['face']['frac'] >= 0.95,
        'over/under all satisfied (no gap < thk)': m['ou']['viol_lt_thk'] == 0,
        'min clearance >= 2 thk': clr >= 2 * pr.thk,
    }
    rep = dict(level=m, windows=win, clearance_min_css=clr, two_thk_css=2 * pr.thk, min_fold_rho_over_W=rolls_min, export=ex,
               gates={k: ('PASS' if v else 'FAIL') for k, v in gates.items()})
    json.dump(rep, open(os.path.join(OUT, 'report.json'), 'w'), indent=2, default=float)
    log('## FINAL REPORT ' + json.dumps(rep, default=float))
    return rep


# ================================================================== drivers
JOINT_FINAL = os.path.join(DIRS['joint'], 'final.npz')


def run_bridges(pr):
    for nm in ('B', 'M'):
        if not os.path.exists(sec_path(nm)):
            np.savez(sec_path(nm), x=pr.x0.copy(), partial=1)
    XS = load_all(pr)
    for nm in ('B', 'M'):
        pr.bind(nm)
        i = SECN.index(nm)
        for need in (SECN[i - 1], SECN[i + 1]):
            if need in ('B', 'M'):
                continue
        XS[nm] = bridge(pr, XS, nm)
        np.savez(sec_path(nm), x=XS[nm], bk_bottom=-1)
        draw_section(pr, pr.secs[nm], XS[nm])
    J = Joint(pr, XS, None, 1.0)
    z = J.pack()
    m, _ = J.level_metrics(z)
    log('## BRIDGES done; level-0 (independent sections + bridges) metrics ' + json.dumps(m, default=float))
    overlay_png(os.path.join(DIRS['overlays'], 'joint_level0.png'), J.pieces(z))
    json.dump(m, open(os.path.join(DIRS['joint'], 'level0.json'), 'w'), indent=1, default=float)
    joint_save(os.path.join(DIRS['joint'], 'level0.npz'), J, z)


def run_joint(pr, secs=480.0, levels=(1, 10, 100, 1000)):
    XS = load_all(pr)
    J = Joint(pr, XS, None, 1.0)
    z = J.pack()
    for wc in levels:
        path = os.path.join(DIRS['joint'], f'level_{wc}.npz')
        if os.path.exists(path):
            XS_, dl = joint_load(path)
            J.XS, J.delta = XS_, dl
            z = J.pack()
            log(f'## joint level wc={wc}: loaded {path}')
            continue
        J.wc = float(wc)
        log(f'## joint level wc={wc}: start')
        z, cost, status = J.solve(z, secs, f'wc={wc}')
        J.set_z(z)
        m, _ = J.level_metrics(z)
        m['wc'] = wc; m['cost'] = cost; m['status'] = status
        log(f'  LEVEL wc={wc} METRICS ' + json.dumps(m, default=float))
        json.dump(m, open(os.path.join(DIRS['joint'], f'level_{wc}.json'), 'w'), indent=1, default=float)
        overlay_png(os.path.join(DIRS['overlays'], f'joint_wc{wc}.png'), J.pieces(z))
        joint_save(path, J, z)
    joint_save(JOINT_FINAL, J, z)
    return J, z


def load_final():
    return joint_load(JOINT_FINAL)


def cmd_sheets(pr):
    import chain_sheets as CS
    XS, delta = load_final()
    Lw, Rw, _, _ = build_rings(pr, XS, delta, 1100, strict=False)
    os.makedirs(DIRS['offline'], exist_ok=True)
    for nm, box in C.WINDOWS_BOX.items():
        offline_lit(Lw, Rw, box, 2).save(os.path.join(DIRS['offline'], f'{nm}.png'))
        print('offline', nm, flush=True)
    offline_lit(Lw, Rw, (0, 0, 852, 1846), 0.5).save(os.path.join(DIRS['offline'], 'full.png'))
    H = 700
    for nm, box in C.WINDOWS_BOX.items():
        panels = [CS.mockup_crop(box), Image.open(os.path.join(DIRS['render'], f'ribbon_crop_{nm}.png')).convert('RGB'),
                  Image.open(os.path.join(DIRS['offline'], f'{nm}.png')).convert('RGB')]
        panels = [CS.fit_h(p, H) for p in panels]
        sheet = Image.new('RGB', (sum(p.width for p in panels) + 20, H + 30), (10, 10, 10))
        dr = ImageDraw.Draw(sheet)
        xo = 0
        for p, t in zip(panels, ('mockup', 'engine (ribbon only)', 'offline')):
            sheet.paste(p, (xo, 30)); dr.text((xo + 4, 8), f'{nm}: {t}', fill=(255, 255, 255)); xo += p.width + 10
        sheet.save(os.path.join(DIRS['sheets'], f'sheet_{nm}.png'))
    panels = [CS.fit_h(CS.mockup_crop((0, 0, 852, 1846)), 1000), CS.fit_h(Image.open(os.path.join(DIRS['render'], 'ribbon.png')).convert('RGB'), 1000),
              CS.fit_h(Image.open(os.path.join(DIRS['offline'], 'full.png')).convert('RGB'), 1000)]
    sheet = Image.new('RGB', (sum(p.width for p in panels) + 20, 1030), (10, 10, 10))
    xo = 0
    for p in panels:
        sheet.paste(p, (xo, 30)); xo += p.width + 10
    sheet.save(os.path.join(DIRS['sheets'], 'sheet_overview.png'))
    # final overlay of the exported rings over the dimmed mockup
    overlay_png(os.path.join(DIRS['overlays'], 'final_export.png'), [dict(L=Lw, R=Rw)], every=3)


def cmd_redraw(pr, names, zoom=True):
    table = {}
    for nm in names:
        sec = pr.secs[nm]
        x = ldx(pr, sec_path(nm))
        variants = [('', x)]
        pp = os.path.join(DIRS['sections'], f'sec_{nm}_pre.npz')
        if os.path.exists(pp):
            xp = ldx(pr, pp)
            if np.abs(xp - x).max() > 1e-6:
                variants = [('', xp), ('_v2', x)]
        for tag, xx in variants:
            pr.bind(sec)
            pr.bk_bottom = pick_bk_bottom_sec(pr, xx, sec) if nm == 'K' else None
            rep, _ = realism(pr, sec, xx)
            rep['data_rms'] = data_stats(pr, xx, sec)['rms']
            table[nm + tag] = rep
            draw_section(pr, sec, xx, tag, zoom=zoom)
            log(f'  REALISM {nm}{tag}: ' + json.dumps(rep, default=float))
    return table


def arg(name, default):
    return type(default)(sys.argv[sys.argv.index('--' + name) + 1]) if '--' + name in sys.argv else default


def main():
    cmd = sys.argv[1]
    if cmd == 'section':
        pr = SecPrb()
        for nm in sys.argv[2].split(','):
            assert nm not in LOCKED, 'approved sections are LOCKED (use redraw)'
            if os.path.exists(sec_path(nm)) and 'partial' not in np.load(sec_path(nm)).files and '--force' not in sys.argv:
                log(f'section {nm}: done already (skip; --force to redo)')
                continue
            fit_section(pr, nm, secs_final=arg('secs', 300.0), secs_group=arg('gsecs', 240.0), ncf=arg('nc', 3))
    elif cmd == 'redraw':
        pr = SecPrb()
        t = cmd_redraw(pr, sys.argv[2].split(','))
        p = os.path.join(OUT, 'realism_table.json')
        old = json.load(open(p)) if os.path.exists(p) else {}
        old.update(t)
        json.dump(old, open(p, 'w'), indent=1, default=float)
    elif cmd == 'warm':
        pr = SecPrb()
        nm = sys.argv[2]
        assert nm not in LOCKED, 'approved sections are LOCKED'
        xp = ldx(pr, sec_path(nm))
        tag = arg('tag', '_v4')
        new, alts = (), []
        kbase = None
        if nm == 'P':
            pth = os.path.join(DIRS['sections'], 'sec_P_v5.npz')
            xp = ldx(pr, pth)
            secp = pr.bind('P')
            log(f'P v7: x loaded from {pth}; roll list {[pr.rname[k] for k in secp.act]}; tip fold (loop) rho {xp[6 + 4 * ROLLS_IDX["top-K tip fold"] + 2] / pr.W:.2f}W phi {xp[6 + 4 * ROLLS_IDX["top-K tip fold"] + 3]:.2f}')
            assert 'top-K tip fold' in [pr.rname[k] for k in secp.act] and abs(xp[6 + 4 * ROLLS_IDX['top-K tip fold'] + 3]) > 2.0, 'loop roll missing'
            xl = AP.project(np.stack([ ]))[0:0] if False else None
            Lh, Rh = sec_edges(pr, xp, secp, np.array([pr.N - 1]))
            mid = AP.project((Lh + Rh) / 2)[0]
            log(f'P v7: section rings {secp.r0}..{secp.r1} (data {secp.lo}..{secp.hi}); last ring {pr.N - 1} projected midpoint {np.round(mid, 1)} (target (540,1060), dist {np.hypot(mid[0] - 540, mid[1] - 1060):.1f} px)')
            assert secp.hi == 1298 and secp.r1 == 1298
        if nm == 'S':
            new = [ROLLS_IDX['S obl 4']]
            k = ROLLS_IDX['S obl 4']
            xp = C.set_roll(xp, k, pr.roll_tau0[k], np.pi / 2, 3 * pr.W, 0.0)
        if nm == 'X' and arg('mode', 'old') == 'curl':
            sec_ = pr.bind('X')
            xp = ldx(pr, os.path.join(DIRS['sections'], 'sec_X_best.npz'))
            log(f'X v8: base sec_X_best.npz (X_v5); roll list {[pr.rname[k] for k in sec_.act]}; curl tau0 at ring {pr.arch_ring} (arch peak (240,783)) - 0.3W')
            pr._active = set(sec_.act)
            st_ = pr.stage_info(sec_.act, sec_.lo, sec_.hi)
            cs = curl_starts(pr, xp)
            sc_ = []
            for tg, xc in cs:
                r = pr.res(xc, st_); sc_.append((0.5 * float(r @ r), xc, tg))
            sc_.sort(key=lambda q: q[0])
            log('X v8 start init costs: ' + str([(q[2], round(q[0])) for q in sc_]))
            xp = sc_[0][1]; alts = [q[1] for q in sc_[1:]]
        if nm == 'X' and arg('mode', 'old') == 'tilt':
            pr.bind('X')
            cs = x_tilt_starts(pr, xp)
            sec_ = pr.secs['X']
            st_ = pr.stage_info(sec_.act, sec_.lo, sec_.hi)
            sc_ = []
            for tg, xc in cs:
                r = pr.res(xc, st_); sc_.append((0.5 * float(r @ r), xc))
            alts = [q[1] for q in sc_]
        if nm == 'K' and arg('mode', 'v6') == 'k7':
            global CONT_A
            CONT_A = True
            sec_ = pr.bind('K')
            xv6 = ldx(pr, os.path.join(DIRS['sections'], 'sec_K_v6_cand.npz'))
            log('K v7: base = v6 loop candidate sec_K_v6_cand.npz; roll list ' + str([pr.rname[k] for k in sec_.act]) + '; continuity to locked A (weight 200), return pt x2')
            pr.bk_bottom = None
            st_ = pr.stage_info(sec_.act, sec_.lo, sec_.hi)
            pr._active = set(sec_.act)
            P0, N0, vv = pr.a_ref()
            cs = []
            for tg, xc in (loop_K_refl(pr, xv6) if arg('k8', 0) else loop_K_combos(pr, xv6)):
                cs.append((['v6pose'] + tg, xc))
                xi = xc.copy(); xi[:6] = 0
                o = pr.ctx(xi, sec_.act)
                u0 = float(pr.F(xi, np.array([sec_.tau_in]))[0])
                Pk = np.concatenate([C.chain_surface(o[0][0], o[1], np.full(5, u0 + d * pr.W), vv) for d in (0.0, -0.3)])
                R_, t_ = AA.kabsch(Pk, P0)
                xi[:3] = Rotation.from_matrix(R_).as_rotvec(); xi[3:6] = t_
                cs.append((['Apose'] + tg, xi))
            sc_ = []
            for tg, xc in cs:
                pr.bk_bottom = pick_bk_bottom_sec(pr, xc, sec_)
                st2 = pr.stage_info(sec_.act, sec_.lo, sec_.hi)
                r = pr.res(xc, st2); sc_.append((0.5 * float(r @ r), xc, tg))
            sc_.sort(key=lambda q: q[0])
            log('K v7 start init costs: ' + str([(q[2], round(q[0])) for q in sc_[:8]]))
            nkeep = 18 if arg('k8', 0) else 6
            xp = sc_[0][1]; alts = [q[1] for q in sc_[1:nkeep]]
            kbase = (1, 13.6)
        elif nm == 'K':
            sec_ = pr.bind('K')
            xo = ldx(pr, os.path.join(OUT, 'v1', 'sections', 'sec_K.npz'))
            pr.bk_bottom = None
            st_ = pr.stage_info(sec_.act, sec_.lo, sec_.hi)
            pr._active = set(sec_.act)
            log('K v6 roll list: ' + str([pr.rname[k] for k in sec_.act]) + f' loop roll tau0 ring-equivalent {pr.roll_tau0[ROLLS_IDX["bottom-K fold 1"]]:.1f}')
            cs = loop_K_combos(pr, xo)
            sc_ = []
            for tg, xc in cs:
                pr.bk_bottom = pick_bk_bottom_sec(pr, xc, sec_)
                st2 = pr.stage_info(sec_.act, sec_.lo, sec_.hi)
                r = pr.res(xc, st2); sc_.append((0.5 * float(r @ r), xc))
            sc_.sort(key=lambda q: q[0])
            xp = sc_[0][1]; alts = [q[1] for q in sc_[1:]]
            kbase = (5, 13.6)
        if nm == 'X' and arg('mode', 'old') == 'bar':
            pr.bind('X')
            alts = x_bar_starts(pr, xp)
        if nm == 'S' and arg('mode', 'old') == 'fold':
            sec_ = pr.bind('S')
            xo = ldx(pr, os.path.join(DIRS['..'] if False else OUT, 'v1', 'sections', 'sec_S.npz'))
            st_ = pr.stage_info(sec_.act, sec_.lo, sec_.hi)
            pr._active = set(sec_.act)
            log('S v6 roll list: ' + str([pr.rname[k] for k in sec_.act]) + ' (all other S rolls removed)')
            cs = s_fold_combos(pr, xo)
            sc_ = []
            for tg, xc in cs:
                r = pr.res(xc, st_); sc_.append((0.5 * float(r @ r), tg, xc))
            sc_.sort(key=lambda q: q[0])
            xp = sc_[0][2]
            alts = [q[2] for q in sc_[1:6]]
            new = ()
        if nm == 'X' and arg('mode', 'old') == 'old':
            pr.bind('X')
            cs = x_combos(pr, xp)
            sc_ = []
            st_ = pr.stage_info(pr.secs['X'].act, pr.secs['X'].lo, pr.secs['X'].hi)
            for tg, xc in cs:
                r = pr.res(xc, st_); sc_.append((0.5 * float(r @ r), xc))
            sc_.sort(key=lambda q: q[0])
            alts = [q[1] for q in sc_[:2]]
        if nm == 'K':
            alts = [ldx(pr, os.path.join(DIRS['sections'], 'sec_K_v3run.npz'))]
        warm_redo(pr, nm, xp, new, alts, secs=arg('secs', 240.0), tag=tag, baseline=(kbase if nm == 'K' else None))
    elif cmd == 'v5':
        pr = SecPrb()
        nm = sys.argv[2]
        sec = pr.bind(nm)
        xp = ldx(pr, sec_path(nm))
        pr.bk_bottom = None
        st = pr.stage_info(sec.act, sec.lo, sec.hi)
        pr._active = set(sec.act)
        sc0, rep0 = score_x(pr, sec, xp)
        rms0 = data_stats(pr, xp, sec)['rms']
        log(f'## V5 {nm}: previous (fails, outline, rms) {sc0} {rep0["fails"]}')
        starts = []
        for tilt in (None, 0, 25, -25):
            xb = xp if tilt is None else kabsch_pose(pr, sec, xp, tilt)
            for tg, xc in (k2_combos(pr, xb) if nm == 'K' else loop_P_combos(pr, xb)):
                if nm == 'K':
                    pr.bk_bottom = pick_bk_bottom_sec(pr, xc, sec)
                    st = pr.stage_info(sec.act, sec.lo, sec.hi)
                r = pr.res(xc, st)
                starts.append((0.5 * float(r @ r), [f't{tilt}'] + tg, xc))
        starts.sort(key=lambda q: q[0])
        best = None
        for c0, tg, xc in starts[:arg('ns', 8)]:
            xx = xc.copy()
            if nm == 'K':
                pr.bk_bottom = pick_bk_bottom_sec(pr, xx, sec)
                st = pr.stage_info(sec.act, sec.lo, sec.hi)
            for rw in (0.25, 1.0, 4.0):
                pr.rw = rw
                xx, cost, status = C.run_fit(pr, xx, st, sec.free, arg('secs', 150.0), '/'.join(tg) + f' rw{rw}')
            pr.rw = 1.0
            if nm == 'K':
                pr.bk_bottom = pick_bk_bottom_sec(pr, xx, sec)
            sc, rp = score_x(pr, sec, xx)
            log(f'    start {tg}: score {sc} fails {rp["fails"]}')
            if best is None or sc < best[0]:
                best = (sc, xx, tg, rp)
        sc, xx, tg, rp = best
        ok = len(rp['fails']) <= len(rep0['fails']) and sc[2] <= max(1.5 * rms0, 10.0)
        log(f'  V5 {nm}: best {tg} score {sc} fails {rp["fails"]} -> {"ACCEPTED" if ok else "REJECTED (kept previous, candidate saved _v5 files)"}')
        np.savez(os.path.join(DIRS['sections'], f'sec_{nm}_v5.npz'), x=xx)
        if ok:
            np.savez(sec_path(nm), x=xx, bk_bottom=-1)
        pr.bk_bottom = pick_bk_bottom_sec(pr, xx, sec) if nm == 'K' else None
        draw_section(pr, sec, xx, '_v5' if ok else '_v5_rejected')
    elif cmd == 'bridges':
        run_bridges(SecPrb())
    elif cmd == 'joint':
        pr = SecPrb()
        run_joint(pr, secs=arg('secs', 480.0))
    elif cmd == 'report':
        pr = SecPrb()
        XS, delta = load_final()
        final_report(pr, XS, delta)
    elif cmd == 'export':
        pr = SecPrb()
        XS, delta = load_final()
        chk = export_candidate(pr, XS, delta, os.path.join(OUT, 'ak_candidate.json'))
        log('## EXPORT ' + json.dumps(chk, default=float))
    elif cmd == 'sheets':
        cmd_sheets(SecPrb())
    elif cmd == 'all':
        import subprocess
        py = sys.executable
        todo = ['T', 'S', 'F', 'A', 'K', 'X', 'P']
        procs = []
        for nm in todo:
            while len([p for p in procs if p.poll() is None]) >= 3:
                time.sleep(5)
            procs.append(subprocess.Popen([py, __file__, 'section', nm]))
        for p in procs:
            p.wait()
        run_bridges(SecPrb())
        pr = SecPrb()
        run_joint(pr, secs=arg('secs', 480.0))
        XS, delta = load_final()
        final_report(pr, XS, delta)
        export_candidate(pr, XS, delta, os.path.join(OUT, 'ak_candidate.json'))
    else:
        raise SystemExit('unknown ' + cmd)


if __name__ == '__main__':
    main()
