#!/usr/bin/env python3
"""chain_fit: the whole AK as ONE paper chain (docs/ribbon/turns/CHAIN_PLAN.md).

Model: paper.py (flat strip, W = W_css, folded by a chain of K rolls, then a rigid pose).
Parameters x = [rotvec(3), t(3)] + NR * [tau_k, beta_k, rho_k, phi_k] + NI * [lambda_j]
  tau   : roll position in the TRACE arc coordinate (2D centre-line arc length of the trace, css-equivalent). The flat coordinate is
          u = F(tau), F piecewise linear with slope lambda_j on interval j (lambda in [0.8, 1.25], continuous), so rolls stay attached to their rings.
  lambda: one per trace interval (16). NOTE: CHAIN_PLAN says "lambda per visibility run"; intervals subdivide the runs (a run = one lambda is the special case).
Usage:
  chain_fit.py prep                 build and cache the problem, print summary + eval timing
  chain_fit.py stage <k> [--secs S] fit stage k (1..15), load stage_{k-1}.npz, save stage_k.npz
  chain_fit.py polish [--secs S]    global polish of the last stage
  chain_fit.py report               metrics.json for the last/polished solution
  chain_fit.py export               ak_candidate.json (+ exporter checks)
"""
import json, math, os, sys, time
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ak_apex as AA        # noqa: E402  (installs the AK camera into solve3d)
import ak_solve as AKS      # noqa: E402
import ak_problem as AP     # noqa: E402
import paper as PM          # noqa: E402
import solve3d as S         # noqa: E402
import emit_pose as EP      # noqa: E402

ROOT = AP.ROOT
OUT = os.path.join(ROOT, 'docs/ribbon/turns/chain')
os.makedirs(OUT, exist_ok=True)
SC = AA.SC
NI = 16

# ---------------------------------------------------------------- roll table (CHAIN_PLAN) : name, kind, ring
ROLLS = [
    ('tail bend 1', 'bend', 40), ('tail bend 2', 'bend', 95), ('S bend', 'bend', 138), ('S obl 1', 'obl', 152), ('S obl 2', 'obl', 168), ('S obl 3', 'obl', 184), ('S obl 4', 'obl', 200), ('sweep bend', 'bend', 257),
    ('far-left fold', 'fold', 338), ('left-leg bend 1', 'bend', 420), ('left-leg bend 2', 'bend', 455), ('apex fold', 'fold', 519),
    ('right-leg bend 1', 'bend', 585), ('right-leg bend 2', 'bend', 625), ('bottom-K fold 1', 'fold', 690), ('bottom-K fold 2', 'fold', 735),
    ('k_return bend', 'bend', 790), ('back-layer bend', 'bend', 836), ('crossbar bend', 'bend', 885), ('wrap curl', 'fold', 960),
    ('wrap twist 1', 'fold', 1010), ('wrap twist 2', 'fold', 1040), ('middle-layer bend', 'bend', 1085), ('top-K front bend', 'bend', 1120),
    ('top-K tip fold', 'fold', 1185), ('end bend', 'bend', 1265)]
NR = len(ROLLS)
HIDDEN_ROLLS = {'back-layer bend', 'wrap twist 1', 'wrap twist 2', 'middle-layer bend', 'end bend', 'wrap curl'}
# visible-side rules (weight 5): +1 outer face toward camera, -1 inner face toward camera
SEEN_RULES = {'S fold': +1, 'far-left fold': +1, 'apex fold': +1, 'top-K tip fold': +1, 'wrap curl': -1}   # + bottom-K loop bottom (-1), chosen at init
WIN_NAMES = ['s', 'farleft', 'apex', 'bottomk', 'wrap', 'topk']
WINDOWS_BOX = {   # guides_overlay.WINDOWS (cutout px)
    'apex': (180, 530, 480, 760), 'farleft': (0, 960, 330, 1260), 'scurve': (540, 1240, 852, 1580), 'bottomk': (480, 880, 852, 1260),
    'wrap': (20, 740, 470, 1090), 'junction': (380, 780, 650, 1010), 'topk': (540, 640, 852, 930), 'endstrand': (480, 880, 720, 1260)}
KHURANA = dict(x=20.0, y=195.25, w=347.21875, h=77.09375, z=17.0)   # css rect of the proxy, plane depth (render __ribbonState proxies, cap +0.25)

LAM_LO, LAM_HI = 0.3, 6.0
W_TZ = 5.0
W_COV = 20.0
W_OVL = 1.0
W_OU = 0.2
W_WEAVE = 0.1
W_SEEN = 5.0
W_FACE = 20.0
W_END = 1.0
W_LAM = 10.0
W_BEND = 1.0
W_PRIOR = 0.3
W_ZR = 0.0       # no absolute z pin / range (lessons): disabled
CELL = 6.0
NVZ = 25
DU_Z = 1.7
OU_PAD = 6000
NV_COV = 9
BEND_MIN_ARC = 1.5
Z_LO, Z_HI = -140.0, 220.0
P3_SOL = os.path.join(ROOT, 'docs/ribbon/turns/paper3/solution.npz')
P3_MET = os.path.join(ROOT, 'docs/ribbon/turns/paper3/metrics.json')


class Timeout(Exception):
    pass


def log(msg, also_notes=True):
    print(msg, flush=True)
    if also_notes:
        with open(os.path.join(OUT, 'NOTES.md'), 'a') as fh:
            fh.write(msg + '\n')


# ================================================================== problem
class Chain:
    def __init__(self):
        P = AKS.load(1)
        self.P = P
        N, W = P['N'], P['W']
        self.N, self.W, self.thk = N, W, W / 11.0
        self.e1, self.e2 = P['e1'], P['e2']
        self.iv = P['interval'].astype(int)
        self.i0 = np.array([int(np.nonzero(self.iv == k)[0].min()) for k in range(NI)])
        self.i1 = np.array([int(np.nonzero(self.iv == k)[0].max()) for k in range(NI)])
        self.int_names = P['int_names']
        self.int_face = P['int_face']
        C = (self.e1 + self.e2) / 2
        seg = np.hypot(*np.diff(C, axis=0).T) / (P['W_px'] / W)
        self.tau = np.r_[0.0, np.cumsum(seg)]
        self.tau_b = np.r_[self.tau[self.i0], self.tau[-1]]               # 17 boundaries (trace coordinate)
        # data masks
        self.kw1 = np.array([AA.KW.get(str(k), 0.0) for k in P['kind1']])
        self.kw2 = np.array([AA.KW.get(str(k), 0.0) for k in P['kind2']])
        self.v1, self.v2 = P['vis1'] & (self.kw1 > 0), P['vis2'] & (self.kw2 > 0)
        self.win_iv = [k for k in range(NI) if self.int_face[k] == 'window']
        assert [self.int_names[k] for k in self.win_iv][2] == 'apex_in__apex_out'
        winmask = np.zeros(N, bool)
        for k in self.win_iv:
            winmask[self.i0[k]:self.i1[k] + 1] = True
        self.winmask = winmask
        self.out1, self.out2 = self.v1 & ~winmask, self.v2 & ~winmask
        sd1 = AA.SlidingDataAK(self.e1, self.v1, self.kw1, 1.0)
        sd2 = AA.SlidingDataAK(self.e2, self.v2, self.kw2, 1.0)
        self.sd = [(sd1.restricted(self.i0[k], self.i1[k], 1.0), sd2.restricted(self.i0[k], self.i1[k], 1.0)) for k in self.win_iv]
        # coverage points per window silhouette (alpha filtered as ak_apex.setup)
        d = np.load(AKS.NPZ, allow_pickle=True)
        names = [str(n) for n in d['cov_names']]
        assert names == WIN_NAMES, names
        alpha = np.array(Image.open(AP.CUTOUT).convert('RGBA'))[..., 3].astype(float) / 255.0
        self.alpha = alpha
        cin, cout, sil = d['cov_in'], d['cov_out'], d['cov_sil']
        a_in = ndi.map_coordinates(alpha, [cin[:, 1], cin[:, 0]], order=1, mode='nearest')
        a_out = ndi.map_coordinates(alpha, [cout[:, 1], cout[:, 0]], order=1, mode='nearest')
        self.cov = []
        for si in range(len(names)):
            self.cov.append(dict(pin=cin[(sil == si) & (a_in > 0.5)], pout=cout[(sil == si) & (a_out < 0.5)], g=d['cov_g'][sil == si]))
        # depth profile -> target centre-line
        self.z0 = AKS.depth_profile(P)
        # the tail (A face, rings 0..131) is imaged 2.1-2.75x wider than W: its depth init is the face-on width scale, blended to the profile over the S window
        w = np.hypot(*(self.e2 - self.e1).T) / P['W_px']
        w = ndi.uniform_filter1d(w, 15, mode='nearest')
        zw = AP.D * (1.0 - 1.0 / np.clip(w, 0.3, None))
        a, b = int(self.i1[0]), int(self.i1[1])
        blend = np.clip((np.arange(N) - a) / float(b - a), 0, 1)
        self.z0 = np.where(np.arange(N) <= a, zw, (1 - blend) * zw[a] + blend * self.z0)
        self.L0 = AP.backproject(self.e1, self.z0)
        self.R0 = AP.backproject(self.e2, self.z0)
        self.T0 = (self.L0 + self.R0) / 2
        # over/under rules
        ou = json.load(open(os.path.join(ROOT, 'docs/ribbon/turns/overunder_v1.json')))
        strands = list(ou['strands'])
        assert len(strands) == NI
        sid = {n: k for k, n in enumerate(strands)}
        self.strand_names = strands
        self.ou_pairs = [(sid[r['front']], sid[b], ri) for ri, r in enumerate(ou['rules']) for b in r['back']]
        self.weave_strands = [sid[n] for n in ou['text']['phone'][0]['strand']]
        self.end_strand, self.end_behind = sid[ou['end_hidden']['strand']], sid[ou['end_hidden']['behind']]
        self.ou_json = ou
        # face expectation per ring pair
        self.face_exp = P['ring_face'][:-1]
        visq = P['vis1'][1:] & P['vis1'][:-1] & P['vis2'][1:] & P['vis2'][:-1]
        self.face_ok = visq & np.isin(self.face_exp, ['A', 'B'])
        # rolls
        self.roll_tau0 = np.array([self.tau[r] for _, _, r in ROLLS])
        self.roll_iv = np.array([self.iv[r] for _, _, r in ROLLS])
        self.roll_stage = np.maximum(self.roll_iv, 1)
        self.kind = [k for _, k, _ in ROLLS]
        self.rname = [n for n, _, _ in ROLLS]
        self.cam = np.array([0.0, 0.0, AP.D])
        self._stage = {}
        arc3 = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(self.T0, axis=0), axis=1))]
        a3 = np.r_[arc3[self.i0], arc3[-1]]
        self.lam0 = np.clip(np.diff(a3) / np.diff(self.tau_b), 0.35, 5.5)
        # parameter layout and bounds
        self.nx = 6 + 4 * NR + NI
        self.lo, self.hi = self.bounds()
        self.x0 = self.x_init()
        self.bk_bottom = None

    # ------------------------------------------------------------ params
    def bounds(self):
        W = self.W
        lo = np.full(self.nx, -np.inf); hi = np.full(self.nx, np.inf)
        for k in range(NR):
            o = 6 + 4 * k
            lo[o], hi[o] = self.roll_tau0[k] - 0.8 * W, self.roll_tau0[k] + 0.8 * W
            lo[o + 1], hi[o + 1] = PM.BETA_LO, PM.BETA_HI
            if self.kind[k] == 'obl':
                lo[o + 2], hi[o + 2] = 0.25 * W, 3.0 * W
                lo[o + 3], hi[o + 3] = -1.885, 1.885
            elif self.kind[k] == 'fold':
                lo[o + 2], hi[o + 2] = 0.2 * W, 3.0 * W
                lo[o + 3], hi[o + 3] = -np.pi - 0.3, np.pi + 0.3
            else:
                lo[o + 2], hi[o + 2] = 1.0 * W, 6.0 * W
                lo[o + 3], hi[o + 3] = -0.5, 0.5
        lo[6 + 4 * NR:], hi[6 + 4 * NR:] = LAM_LO, LAM_HI
        return lo, hi

    def x_init(self):
        x = np.zeros(self.nx)
        for k in range(NR):
            o = 6 + 4 * k
            x[o:o + 4] = [self.roll_tau0[k], np.pi / 2, (3.0 if self.kind[k] == 'bend' else 0.4) * self.W, 0.0]
        x[6 + 4 * NR:] = self.lam0
        return x

    def lam(self, x):
        return x[6 + 4 * NR:]

    def F(self, x, tau):
        U = np.r_[0.0, np.cumsum(self.lam(x) * np.diff(self.tau_b))]
        return np.interp(tau, self.tau_b, U)

    def u_ring(self, x):
        return self.F(x, self.tau)

    def rolls(self, x):
        return x[6:6 + 4 * NR].reshape(NR, 4)

    def paper_x(self, x, K):
        r = self.rolls(x)[:K].copy()
        r[:, 0] = self.F(x, r[:, 0])
        return np.concatenate([x[:6], r.ravel()])

    # ------------------------------------------------------------ stage info
    def stage_info(self, K, e):
        """problem restricted to the first K rolls and rings 0..e (complete windows / strands only)"""
        key = (K, e)
        if key in self._stage:
            return self._stage[key]
        nR = e + 1
        W = self.W
        st = dict(K=K, e=e, nR=nR)
        st['strands'] = [j for j in range(NI) if self.i1[j] <= e]
        st['nlam'] = int(np.sum(self.i0 <= e))
        st['wins'] = [wi for wi, k in enumerate(self.win_iv) if self.i1[k] <= e]
        st['idx1'] = np.nonzero(self.out1[:nR])[0]
        st['idx2'] = np.nonzero(self.out2[:nR])[0]
        st['amp1'] = np.sqrt(self.kw1[st['idx1']])[:, None]
        st['amp2'] = np.sqrt(self.kw2[st['idx2']])[:, None]
        st['cov'] = []
        for wi in st['wins']:
            k = self.win_iv[wi]
            a, b = max(self.i0[k] - 15, 0), min(self.i1[k] + 15, e)
            idx = np.arange(a, b + 1)
            n = len(idx)
            cv = self.cov[wi]
            st['cov'].append(dict(wi=wi, idx=idx, pin=cv['pin'], pout=cv['pout'],
                                  cin=np.tile(np.arange(n - 1), (len(cv['pin']), 1)), cout=np.tile(np.arange(n - 1), (len(cv['pout']), 1))))
        NS = [max(6, int(np.ceil((self.tau_b[j + 1] - self.tau_b[j]) / DU_Z))) for j in st['strands']]
        st['ns'] = NS
        st['sid'] = np.concatenate([np.full(n, j) for j, n in zip(st['strands'], NS)]) if NS else np.zeros(0, int)
        st['vz'] = np.linspace(-W / 2, W / 2, NVZ)
        fo = self.face_ok[:e].copy()
        st['face_j'] = np.nonzero(fo)[0]
        st['face_sign'] = np.where(self.face_exp[st['face_j']] == 'A', 1.0, -1.0)
        st['seen'] = {k: SEEN_RULES[self.rname[k]] for k in range(K) if self.rname[k] in SEEN_RULES}
        if self.bk_bottom is not None and self.bk_bottom < K:
            st['seen'][self.bk_bottom] = -1
        if e >= self.N - 1:
            st['end_idx'] = np.arange(self.N - 20, self.N)
            st['leg_idx'] = np.arange(self.i0[self.end_behind], self.i1[self.end_behind] + 1)
        st['bend_pairs'] = [(a, a + 1) for a in range(K - 1) if self.kind[a] == 'bend' and self.kind[a + 1] == 'bend']
        st['hidden_rolls'] = [k for k in range(K) if self.rname[k] in HIDDEN_ROLLS]
        self._stage[key] = st
        return st

    # ------------------------------------------------------------ residual blocks
    def dense(self, x, st, xp):
        """strand samples: points (M,3), flat arc uf (M,), strand id"""
        W = self.W
        ur = self.u_ring(x)
        us = []
        for j, n in zip(st['strands'], st['ns']):
            ua = ur[self.i0[j]]
            ub = ur[self.i0[j + 1]] if j + 1 < NI else ur[self.i1[j]]
            us.append(np.linspace(ua, ub, n, endpoint=False))
        u = np.concatenate(us) if us else np.zeros(0)
        vz = st['vz']
        U = np.repeat(u, len(vz)); V = np.tile(vz, len(u))
        pts = PM.surface(xp, U, V, st['K'])
        return pts, U, np.repeat(st['sid'], len(vz)), V

    def ou_blocks(self, x, st, xp):
        if not st['strands']:
            return np.zeros(OU_PAD), np.zeros(0), np.zeros(0), (None, None, None, None)
        pts, U, sid, V = self.dense(x, st, xp)
        thk = self.thk
        p2 = AP.project(pts)
        key = (np.floor(p2[:, 0] / CELL).astype(np.int64) + 2000) * 4000 + (np.floor(p2[:, 1] / CELL).astype(np.int64) + 2000)
        comp = key * 32 + sid
        z = pts[:, 2]
        order = np.lexsort((z, comp))
        cs = comp[order]
        last = np.r_[cs[1:] != cs[:-1], True]
        sel = order[last]
        cmp_, zm, um = comp[sel], z[sel], U[sel]
        cell = cmp_ >> 5
        strand = cmp_ & 31
        by = {j: (cell[strand == j], zm[strand == j], um[strand == j]) for j in st['strands']}
        res = []
        for f, b, ri in self.ou_pairs:
            if f not in by or b not in by:
                continue
            cf, zf, uf = by[f]; cb, zb, ub = by[b]
            if len(cf) == 0 or len(cb) == 0:
                continue
            _, ia, ib = np.intersect1d(cf, cb, assume_unique=True, return_indices=True)
            if len(ia) == 0:
                continue
            ok = np.abs(uf[ia] - ub[ib]) >= BEND_MIN_ARC * self.W
            gap = zf[ia] - zb[ib]
            res.append(np.maximum(0.0, 2 * thk - gap[ok]) * SC * W_OU)
        r = np.concatenate(res) if res else np.zeros(0)
        out = np.zeros(OU_PAD)
        n = min(len(r), OU_PAD)
        out[:n] = r[:n]
        # text weave: apex / left leg / right leg behind the KHURANA plane inside its proxy rect
        wk = np.isin(sid, self.weave_strands)
        pc = AP.project_css(pts[wk])
        inside = (pc[:, 0] >= KHURANA['x']) & (pc[:, 0] <= KHURANA['x'] + KHURANA['w']) & (pc[:, 1] >= KHURANA['y']) & (pc[:, 1] <= KHURANA['y'] + KHURANA['h'])
        wv = np.where(inside, np.maximum(0.0, pts[wk, 2] - (KHURANA['z'] - thk)), 0.0) * SC * W_WEAVE
        wv_full = np.zeros(int(np.isin(st['sid'], self.weave_strands).sum()) * NVZ)
        wv_full[:len(wv)] = wv
        # z range
        zr = (np.maximum(0.0, pts[::7, 2] - Z_HI) + np.maximum(0.0, Z_LO - pts[::7, 2])) * W_ZR
        return out, wv_full, zr, (r, pts, sid, U)

    def seen_block(self, xp, K, k_roll, side):
        u0, b, rho, phi = xp[6 + 4 * k_roll:6 + 4 * k_roll + 4]
        W = self.W
        t = abs(phi) * np.linspace(0.15, 0.85, 15)
        vv = np.array([-0.4, -0.2, 0.0, 0.2, 0.4]) * W
        T, V = np.meshgrid(t, vv, indexing='ij')
        Xp = (rho * T).ravel(); V = V.ravel()
        Yp = (V + Xp * np.cos(b)) / np.sin(b)
        q = np.stack([u0 + Yp * np.cos(b) + Xp * np.sin(b), V], 1)
        a = np.array([np.cos(b), np.sin(b)]); ap = np.array([np.sin(b), -np.cos(b)])
        d = 0.05
        Sf = lambda qq: PM.surface(xp, qq[:, 0], qq[:, 1], K)
        P0 = Sf(q); Pp = Sf(q + d * ap); Pm = Sf(q - d * ap); Pa = Sf(q + d * a)
        N = np.cross(Pp - Pm, Pa - P0)
        N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
        acc = Pp + Pm - 2 * P0
        N = np.where(((N * acc).sum(1) > 0)[:, None], -N, N)
        vh = self.cam - P0
        vh /= np.linalg.norm(vh, axis=1, keepdims=True)
        return np.maximum(0.0, 0.2 - side * (N * vh).sum(1)) * W_SEEN

    def parts(self, x, st):
        W, K, nR = self.W, st['K'], st['nR']
        xp = self.paper_x(x, K)
        ur = self.u_ring(x)[:nR]
        PL = PM.surface(xp, ur, np.full(nR, -W / 2), K)
        PR = PM.surface(xp, ur, np.full(nR, W / 2), K)
        out = {}
        p1, p2 = AP.project(PL), AP.project(PR)
        i1, i2 = st['idx1'], st['idx2']
        out['pt'] = np.concatenate([((p1[i1] - self.e1[i1]) * st['amp1']).ravel(), ((p2[i2] - self.e2[i2]) * st['amp2']).ravel()])
        FL = np.zeros((self.N, 3)); FR = np.zeros((self.N, 3)); FL[:nR] = PL; FR[:nR] = PR
        sl, an = [], []
        for wi in st['wins']:
            s1, a1 = self.sd[wi][0].resid(FL)
            s2, a2 = self.sd[wi][1].resid(FR)
            sl += [s1, s2]; an += [a1, a2]
        out['slide'] = np.concatenate(sl) if sl else np.zeros(0)
        out['anchor'] = np.concatenate(an) if an else np.zeros(0)
        sq = math.sqrt(W_COV)
        cov = []
        for cw in st['cov']:
            idx = cw['idx']
            n = len(idx)
            G = np.stack([PM.surface(xp, ur[idx], np.full(n, v), K) for v in np.linspace(-W / 2, W / 2, NV_COV)])
            for kind, pts, cand in (('in', cw['pin'], cw['cin']), ('out', cw['pout'], cw['cout'])):
                r = np.stack([S.coverage_resid(G[k], G[k + 1], pts, cand, W, kind) for k in range(NV_COV - 1)])
                if kind == 'in':
                    rr = r.min(0)
                else:
                    rp = np.where(r > 0, r, np.inf).min(0)
                    rr = np.where(np.isfinite(rp), rp, 0.0)
                cov.append(rr * sq)
        out['cov'] = np.concatenate(cov) if cov else np.zeros(0)
        # over/under, weave, z range
        ou, wv, zr, _ = self.ou_blocks(x, st, xp)
        out['ou'], out['weave'], out['zr'] = ou, wv, zr
        # face
        j = st['face_j']
        C = (PL + PR) / 2
        Tq = C[1:] - C[:-1]
        Dq = ((PR - PL)[1:] + (PR - PL)[:-1]) / 2
        n = np.cross(Tq, Dq)
        cc = (C[1:] + C[:-1]) / 2
        vh = self.cam - cc
        sh = (n * vh).sum(1) / np.maximum(np.linalg.norm(n, axis=1) * np.linalg.norm(vh, axis=1), 1e-12)
        out['face'] = np.maximum(0.0, st['face_sign'] * sh[j] + 0.05) * W_FACE
        # roll side rules
        out['seen'] = np.concatenate([self.seen_block(xp, K, k, side) for k, side in st['seen'].items()]) if st['seen'] else np.zeros(0)
        # roll geometry penalties
        rolls = xp[6:].reshape(K, 4) if K else np.zeros((0, 4))
        og = -PM.overlap_gaps(xp, W, K) if K >= 2 else np.zeros(0)
        out['overlap'] = np.maximum(0.0, og) * SC * W_OVL
        bp = [max(0.0, BEND_MIN_ARC * W - (rolls[b, 0] - rolls[a, 0])) * SC * W_BEND for a, b in st['bend_pairs']]
        order = [max(0.0, 2.0 - (rolls[k + 1, 0] - rolls[k, 0])) * SC * 5 for k in range(K - 1)]
        out['bend'] = np.array(bp + order)
        # end hidden
        if 'end_idx' in st:
            ei, li = st['end_idx'], st['leg_idx']
            pe = np.concatenate([p1[ei], p2[ei], (p1[ei] + p2[ei]) / 2])
            cand = np.tile(np.arange(len(li) - 1), (len(pe), 1))
            out['end'] = S.coverage_resid(PL[li], PR[li], pe, cand, W, 'in') * math.sqrt(W_END)
        else:
            out['end'] = np.zeros(0)
        # lambda prior
        lam_all = self.lam(x)
        out['lam'] = (lam_all[:st['nlam']] - self.lam0[:st['nlam']]) * W_LAM * 0.3
        # tail toward the camera: z of the centre line decreases from ring 0 to the S window
        nz = min(nR, int(self.i0[1]) + 1)
        zc = (PL[:nz, 2] + PR[:nz, 2]) / 2
        out['tailz'] = np.maximum(0.0, np.diff(zc)) * W_TZ
        # weak prior of hidden rolls toward the init
        pr = []
        for k in st['hidden_rolls']:
            o = 6 + 4 * k
            pr.append((x[o:o + 4] - self.x0[o:o + 4]) / np.array([W, 1.0, W, 1.0]) * W_PRIOR * 10)
        out['prior'] = np.concatenate(pr) if pr else np.zeros(0)
        return out

    def res(self, x, st):
        return np.concatenate(list(self.parts(x, st).values()))

    # ------------------------------------------------------------ geometry helpers
    def ring_edges(self, x, st=None, K=None, upto=None):
        K = NR if K is None else K
        n = self.N if upto is None else upto
        xp = self.paper_x(x, K)
        ur = self.u_ring(x)[:n]
        W = self.W
        return PM.surface(xp, ur, np.full(n, -W / 2), K), PM.surface(xp, ur, np.full(n, W / 2), K)


# ================================================================== fitting
def set_free(pr, x, st, free_idx):
    return np.array(sorted(free_idx))


def run_fit(pr, x0, st, free, secs, label, max_nfev=2000, quiet=False):
    lo, hi = pr.lo, pr.hi
    x_full = x0.copy()
    best = [np.inf, x0[free].copy()]
    t0 = time.time()
    counter = [0]

    def f(z):
        xx = x_full.copy(); xx[free] = z
        r = pr.res(xx, st)
        c = 0.5 * float(r @ r)
        counter[0] += 1
        if c < best[0]:
            best[0], best[1] = c, z.copy()
        if time.time() - t0 > secs:
            raise Timeout()
        return r
    z0 = np.clip(x0[free], lo[free] + 1e-9, hi[free] - 1e-9)
    status = 'ok'
    try:
        r = least_squares(f, z0, method='trf', x_scale='jac', max_nfev=max_nfev, bounds=(lo[free], hi[free]), diff_step=1e-6)
        z, cost, stat = r.x, float(r.cost), int(r.status)
    except Timeout:
        z, cost, stat, status = best[1], best[0], -9, 'timeout'
    xo = x0.copy(); xo[free] = z
    if not quiet:
        log(f'    [{label}] {status} cost {cost:.1f} evals {counter[0]} ({time.time() - t0:.0f}s)')
    return xo, cost, status


# ---------------------------------------------------------------- initialisation of new rolls
def kabsch(Pm, Q):
    pc, qc = Pm.mean(0), Q.mean(0)
    U, _, Vt = np.linalg.svd((Pm - pc).T @ (Q - qc))
    d = np.sign(np.linalg.det(Vt.T @ U.T))
    Rm = Vt.T @ np.diag([1, 1, d]) @ U.T
    return Rm, qc - Rm @ pc


def init_pose(pr, x):
    """pose of the straight tail (rolls inert) by Kabsch to the back-projected rings before the first roll"""
    x = x.copy()
    r0 = int(ROLLS[0][2]) - 5
    x[:6] = 0
    xp = pr.paper_x(x, 1)
    ur = pr.u_ring(x)[:r0]
    n = r0
    PLm = PM.surface(xp, ur, np.full(n, -pr.W / 2), 1); PRm = PM.surface(xp, ur, np.full(n, pr.W / 2), 1)
    Rm, tt = kabsch(np.concatenate([PLm, PRm]), np.concatenate([pr.L0[:n], pr.R0[:n]]))
    x[:3] = Rotation.from_matrix(Rm).as_rotvec(); x[3:6] = tt
    return x


def local_frame(pr, x, k):
    """(e_u, e_v, n) world axes of the flat frame just before roll k (rolls k.. inert)"""
    K = k + 1
    xp = pr.paper_x(x, K)
    uk = xp[6 + 4 * k]
    h = 0.5
    Pa = PM.surface(xp, np.array([uk - 3.0]), np.array([0.0]), K)
    Pb = PM.surface(xp, np.array([uk - 1.0]), np.array([0.0]), K)
    eu = (Pb[0] - Pa[0]); eu /= np.linalg.norm(eu)
    Pv = PM.surface(xp, np.array([uk - 2.0, uk - 2.0]), np.array([-1.0, 1.0]), K)
    ev = Pv[1] - Pv[0]; ev /= np.linalg.norm(ev)
    ev = ev - (ev @ eu) * eu; ev /= np.linalg.norm(ev)
    n = np.cross(eu, ev)
    return eu, ev, n


def target_dir(pr, k):
    """world direction of the back-projected centre line beyond roll k (from the depth-profile targets)"""
    r = ROLLS[k][2]
    nxt = ROLLS[k + 1][2] if k + 1 < NR else pr.N - 1
    d = nxt - r
    a = int(round(r + 0.45 * d)); b = int(round(r + 0.9 * d))
    b = min(b, pr.N - 1); a = min(a, b - 3)
    t = pr.T0[b] - pr.T0[a]
    return t / np.linalg.norm(t)


def roll_from_dir(dl, beta_fixed=None):
    """(beta, phi) of the single roll that rotates e_u = (1,0,0) onto dl (local flat frame, unit vector). Model: RE = Rot(a, -phi)."""
    eu = np.array([1.0, 0, 0])
    if beta_fixed is None:
        w = dl - eu
        if np.linalg.norm(w) < 1e-3:
            return np.pi / 2, 0.0
        a = np.array([w[1], -w[0], 0.0])
        if np.linalg.norm(a) < 1e-9:
            return np.pi / 2, 0.0
        a /= np.linalg.norm(a)
        if a[1] < 0:
            a = -a
        beta = float(np.arctan2(a[1], a[0]))
    else:
        beta = beta_fixed
        a = np.array([np.cos(beta), np.sin(beta), 0.0])
    ep = eu - (eu @ a) * a
    dp = dl - (dl @ a) * a
    th = np.arctan2(a @ np.cross(ep, dp), ep @ dp)
    return beta, float(-th)


def sil_beta(pr, k):
    """fold axis angle from the silhouette principal direction (ak_apex.beta_axis), relative to the pre-window strip direction"""
    iv = pr.roll_iv[k]
    if pr.int_face[iv] != 'window':
        return None
    wi = pr.win_iv.index(iv)
    g = pr.cov[wi]['g']
    gc = g - g.mean(0)
    _, evec = np.linalg.eigh(gc.T @ gc)
    d_sil = evec[:, -1]
    C2 = (pr.e1 + pr.e2) / 2
    i0 = pr.i0[iv]
    seg = C2[i0 - 10 + 1:i0 + 1] - C2[i0 - 10:i0]
    seg = seg / np.linalg.norm(seg, axis=1, keepdims=True)
    d_strip = seg.mean(0)
    ang = lambda d: np.arctan2(-d[1], d[0])
    b = (ang(d_sil) - ang(d_strip) + np.pi / 2) % np.pi - np.pi / 2
    return float(b % np.pi)


def apex_seed(pr):
    """paper3 apex fold (beta, rho, phi) and its trace ring"""
    s = np.load(P3_SOL)
    m = json.load(open(P3_MET))
    row = m['params']['table'][2]
    ua = row['u_css']
    ur = s['u_rings']
    ring = 363.0 + float(np.interp(ua, ur, np.arange(len(ur))))     # section starts at fl_out - 25 = 363
    return dict(beta=np.radians(row['beta_deg']), rho=row['rho_css'], phi=np.radians(row['phi_deg']), ring=ring)


def rolls_candidates(pr, x, k):
    """candidate (beta, rho, phi) for roll k given x with rolls < k set"""
    xx = x.copy()
    o = 6 + 4 * k
    xx[o:o + 4] = [pr.roll_tau0[k], np.pi / 2, 3 * pr.W, 0.0]
    eu, ev, n = local_frame(pr, xx, k)
    t = target_dir(pr, k)
    dl = np.array([t @ eu, t @ ev, t @ n])
    W = pr.W
    cands = []
    if pr.rname[k] == 'S fold 2':
        p_, b_ = x[6 + 4 * (k - 1) + 3], x[6 + 4 * (k - 1) + 1]
        return [('twist2', float(b_), 0.4 * W, float(-p_)), ('twist2b', float(np.pi - b_), 0.4 * W, float(-p_))]
    if pr.kind[k] == 'bend':
        return [('bend', np.pi / 2, 3 * W, 0.0)]
    b0, p0 = roll_from_dir(dl)
    sb = sil_beta(pr, k)
    pairs = [('cf', b0, p0)]
    if sb is not None and pr.kind[k] == 'fold':
        b1, p1 = roll_from_dir(dl, sb)
        pairs.append(('sil', b1, p1))
    if pr.rname[k] == 'apex fold':
        a = apex_seed(pr)
        pairs.append(('paper3', a['beta'], a['phi']))
    for tag, b, p in pairs:
        b = float(np.clip(b, 0.3, np.pi - 0.3))
        if pr.kind[k] == 'bend':
            cands.append((tag, b, 3 * W, float(np.clip(p, -0.5, 0.5))))
            continue
        rho = 0.4 * W if pr.rname[k] != 'wrap curl' else 0.6 * W
        if tag == 'paper3':
            rho = apex_seed(pr)['rho']
        cands.append((tag, b, rho, float(np.clip(p, -np.pi, np.pi))))
        if abs(p) > 2.6 and tag != 'paper3':
            cands.append((tag + '-flip', b, rho, -float(np.clip(p, -np.pi, np.pi))))
    return cands


# ================================================================== stage driver
def stage_groups(pr, s):
    ks = [k for k in range(NR) if pr.roll_stage[k] == s]
    groups = []
    for k in ks:
        iv = pr.roll_iv[k]
        if groups and pr.int_face[iv] == 'window' and pr.roll_iv[groups[-1][-1]] == iv:
            groups[-1].append(k)
        else:
            groups.append([k])
    return groups


def stage_intervals(s):
    return [0, 1] if s == 1 else [s]


def group_range(pr, s, groups, gi):
    if gi == len(groups) - 1:
        return int(pr.i1[s])
    return int(ROLLS[groups[gi + 1][0]][2] - 1)


def free_for(pr, s, group, e):
    prev = [k for k in range(NR) if k < group[0]][-2:]
    free = list(range(6))
    for k in prev + list(group):
        free += list(range(6 + 4 * k, 6 + 4 * k + 4))
    free += [6 + 4 * NR + j for j in stage_intervals(s) if pr.i0[j] <= e]
    return np.array(sorted(set(free)))


def set_roll(x, k, tau, b, rho, phi):
    o = 6 + 4 * k
    x = x.copy()
    x[o:o + 4] = [tau, b, rho, phi]
    return x


def gen_combos(pr, x, group, i=0, tags=()):
    if i == len(group):
        yield list(tags), x
        return
    k = group[i]
    for tag, b, rho, phi in rolls_candidates(pr, x, k):
        x2 = set_roll(x, k, pr.roll_tau0[k], b, rho, phi)
        yield from gen_combos(pr, x2, group, i + 1, tags + (tag,))


def s_combos(pr, x, g):
    sb = sil_beta(pr, g[1])
    out = []
    for dd in (0, 30, -30):
        b = float(np.clip((sb + np.radians(dd)) % np.pi, 0.3, np.pi - 0.3))
        for sg, nm in ((1, '+-+-'), (-1, '-+-+')):
            xx = set_roll(x, g[0], pr.roll_tau0[g[0]], np.pi / 2, 3 * pr.W, 0.0)
            for i, k in enumerate(g[1:]):
                xx = set_roll(xx, k, pr.roll_tau0[k], b, 0.8 * pr.W, 0.8 * sg * (-1) ** i)
            out.append(([f'b{dd:+d}', nm], xx))
    return out


def pick_bk_bottom(pr, x):
    ks = [k for k in range(NR) if pr.rname[k].startswith('bottom-K fold')]
    xp = pr.paper_x(x, max(ks) + 1)
    ys = []
    for k in ks:
        u0, b, rho, phi = xp[6 + 4 * k:6 + 4 * k + 4]
        uc = u0 + 0.5 * rho * abs(phi) / max(np.sin(b), 0.2)
        P3 = PM.surface(xp, np.array([uc]), np.array([0.0]), max(ks) + 1)
        ys.append(AP.project(P3)[0, 1])
    return ks[int(np.argmax(ys))]


def block_costs(parts):
    return {k: round(0.5 * float(v @ v), 2) for k, v in parts.items() if len(v)}


def data_rms(pr, x, K, e):
    """rms / p95 / max of the visible-ring data distances (px): point-to-point outside windows, sliding inside"""
    st = pr.stage_info(K, e)
    PL, PR = pr.ring_edges(x, K=K, upto=e + 1)
    d = []
    for (P, e_, idx) in ((PL, pr.e1, st['idx1']), (PR, pr.e2, st['idx2'])):
        d.append(np.hypot(*(AP.project(P)[idx] - e_[idx]).T))
    FL = np.zeros((pr.N, 3)); FR = np.zeros((pr.N, 3)); FL[:e + 1] = PL; FR[:e + 1] = PR
    for wi in st['wins']:
        for sd, F_ in ((pr.sd[wi][0], FL), (pr.sd[wi][1], FR)):
            dd = sd.sliding_dist(F_)
            d.append(dd[~np.isnan(dd)])
    v = np.concatenate(d)
    return dict(n=int(len(v)), rms=float(np.sqrt(np.mean(v ** 2))), p95=float(np.percentile(v, 95)), max=float(v.max()))


def face_stat(pr, x, K, e):
    PL, PR = pr.ring_edges(x, K=K, upto=e + 1)
    C = (PL + PR) / 2
    Tq = C[1:] - C[:-1]
    Dq = ((PR - PL)[1:] + (PR - PL)[:-1]) / 2
    n = np.cross(Tq, Dq)
    s_ = (n * (pr.cam - (C[1:] + C[:-1]) / 2)).sum(1)
    face = np.where(s_ < 0, 'A', 'B')
    ok = pr.face_ok[:e]
    ag = int((face[ok] == pr.face_exp[:e][ok]).sum())
    return dict(checked=int(ok.sum()), agree=ag, frac=ag / max(int(ok.sum()), 1))


def ou_stat(pr, x, K, e):
    st = pr.stage_info(K, e)
    xp = pr.paper_x(x, K)
    ou, wv, zr, (r, pts, sid, U) = pr.ou_blocks(x, st, xp)
    if r is None:
        return dict(pairs=0, viol_lt_thk=0, viol_lt_2thk=0)
    gap_def = r / (SC * W_OU)            # = 2thk - gap where positive
    return dict(pairs=int(len(r)), viol_lt_2thk=int((r > 1e-9).sum()), viol_lt_thk=int((gap_def > pr.thk).sum()),
                max_shortfall_css=float(gap_def.max()) if len(r) else 0.0, weave_violations=int((wv > 0).sum()))


def stage_metrics(pr, x, K, e):
    st = pr.stage_info(K, e)
    parts = pr.parts(x, st)
    allr = np.concatenate(list(parts.values()))
    rolls = pr.rolls(x)[:K]
    folds = [rolls[k, 2] / pr.W for k in range(K) if pr.kind[k] in ('fold', 'obl')]
    return dict(K=K, e=e, cost=round(0.5 * float(allr @ allr), 1), blocks=block_costs(parts), data=data_rms(pr, x, K, e),
                face=face_stat(pr, x, K, e), ou=ou_stat(pr, x, K, e),
                min_fold_rho_over_W=float(min(folds)) if folds else None, lam=[round(float(v), 3) for v in pr.lam(x)[:st['nlam']]])


def save_state(path, x, **kw):
    np.savez(path, x=x, **{k: np.asarray(v) for k, v in kw.items()})


def stage_path(s):
    return os.path.join(OUT, f'stage_{s}.npz')


def run_stage(pr, s, secs_final=300.0, secs_group=90.0, ncand_fit=3):
    t00 = time.time()
    groups = stage_groups(pr, s)
    start_g = 0
    if s == 1:
        x = init_pose(pr, pr.x0.copy())
        np.savez(os.path.join(OUT, 'x0.npz'), x0=x)
    else:
        x = np.load(stage_path(s - 1))['x']
    pr.x0 = np.load(os.path.join(OUT, 'x0.npz'))['x0']
    part = os.path.join(OUT, f'partial_{s}.npz')
    if os.path.exists(part):
        d = np.load(part)
        x = d['x']; start_g = int(d['gi'])
        log(f'  resuming stage {s} at group {start_g}')
    if s > 7:
        pr.bk_bottom = pick_bk_bottom(pr, x)
    log(f'## stage {s}: intervals {stage_intervals(s)} rings to {pr.i1[s]}; groups {[[ROLLS[k][0] for k in g] for g in groups]}')
    for gi in range(start_g, len(groups)):
        g = groups[gi]
        e = group_range(pr, s, groups, gi)
        K = g[-1] + 1
        st = pr.stage_info(K, e)
        free = free_for(pr, s, g, e)
        if pr.rname[g[-1]] == 'S obl 4':
            combos = s_combos(pr, x, g)
        else:
            combos = list(gen_combos(pr, x, g))
        scored = []
        for tags, xc in combos:
            r = pr.res(xc, st)
            scored.append((0.5 * float(r @ r), tags, xc))
        scored.sort(key=lambda q: q[0])
        log(f'  group {[ROLLS[k][0] for k in g]} e={e} K={K} free={len(free)} candidates={len(combos)} '
            f'init costs {[(q[1], round(q[0])) for q in scored[:6]]}')
        best = None
        for c0, tags, xc in scored[:ncand_fit]:
            xo, cost, status = run_fit(pr, xc, st, free, secs_group, '/'.join(tags))
            if best is None or cost < best[0]:
                best = (cost, tags, xo)
        x = best[2]
        if any(pr.rname[k] == 'bottom-K fold 2' for k in g):
            pr.bk_bottom = pick_bk_bottom(pr, x)
            pr._stage.clear()
            log(f'    bottom-K loop bottom (inner side toward camera) = {ROLLS[pr.bk_bottom][0]}')
        for k in g:
            r_ = pr.rolls(x)[k]
            log(f'    roll {ROLLS[k][0]}: tau {r_[0]:.1f} beta {np.degrees(r_[1]):.1f} rho {r_[2]:.1f} ({r_[2] / pr.W:.2f}W) phi {np.degrees(r_[3]):.1f} [{best[1]}]')
        save_state(part, x, gi=gi + 1)
    K = max(groups[-1]) + 1
    e = int(pr.i1[s])
    st = pr.stage_info(K, e)
    new = [k for g in groups for k in g]
    free = free_for(pr, s, new, e)
    r = pr.res(x, st)
    log(f'  stage fit: free {len(free)} rings 0..{e} cost0 {0.5 * float(r @ r):.1f}')
    x, cost, status = run_fit(pr, x, st, free, secs_final, f'stage{s}')
    m = stage_metrics(pr, x, K, e)
    m.update(stage=s, status=status, seconds=time.time() - t00)
    log('  METRICS ' + json.dumps(m, default=float))
    save_state(stage_path(s), x, K=K, e=e)
    with open(os.path.join(OUT, 'stage_metrics.jsonl'), 'a') as fh:
        fh.write(json.dumps(m, default=float) + '\n')
    if os.path.exists(part):
        os.remove(part)
    return x


# ================================================================== polish / report
def final_x():
    for nm in ('polished.npz',) + tuple(f'stage_{k}.npz' for k in range(NI - 1, 0, -1)):
        if os.path.exists(os.path.join(OUT, nm)):
            return np.load(os.path.join(OUT, nm))['x'], nm
    raise SystemExit('no solution')


def run_polish(pr, secs):
    x = np.load(stage_path(NI - 1))['x']
    pr.x0 = np.load(os.path.join(OUT, 'x0.npz'))['x0']
    pr.bk_bottom = pick_bk_bottom(pr, x)
    st = pr.stage_info(NR, pr.N - 1)
    free = np.arange(pr.nx)
    r = pr.res(x, st)
    log(f'## polish: all {len(free)} params, cost0 {0.5 * float(r @ r):.1f}')
    x, cost, status = run_fit(pr, x, st, free, secs, 'polish')
    m = stage_metrics(pr, x, NR, pr.N - 1)
    log('  POLISH METRICS ' + json.dumps(m, default=float))
    np.savez(os.path.join(OUT, 'polished.npz'), x=x)


def raster_dense(pr, x, step=0.6):
    xp = pr.paper_x(x, NR)
    ur = pr.u_ring(x)
    u = np.arange(ur[0], ur[-1], step)
    W = pr.W
    L = PM.surface(xp, u, np.full(len(u), -W / 2), NR); R = PM.surface(xp, u, np.full(len(u), W / 2), NR)
    return L, R


def sil_window_metrics(pr, L, R):
    import cv2
    alpha = pr.alpha > 0.5
    ren = AA.sil_raster(L, R, alpha.shape)
    out = {}
    for nm, (x0, y0, x1, y1) in WINDOWS_BOX.items():
        a, b = alpha[y0:y1, x0:x1], ren[y0:y1, x0:x1]
        bnd = lambda m: m & ~ndi.binary_erosion(m, iterations=1)
        ba, bb = bnd(a), bnd(b)
        dta = cv2.distanceTransform((~ba).astype(np.uint8), cv2.DIST_L2, 5)
        dtb = cv2.distanceTransform((~bb).astype(np.uint8), cv2.DIST_L2, 5)
        inter, uni = float((a & b).sum()), float((a | b).sum())
        out[nm] = dict(iou=inter / max(uni, 1), contour_px=float(0.5 * (dta[bb].mean() + dtb[ba].mean())) if bb.any() and ba.any() else None)
    return out, ren


def clearance_min(pr, L, R, W):
    n = len(L)
    sub = np.arange(0, n, 2)
    Ls, Rs = L[sub], R[sub]
    C = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff((Ls + Rs) / 2, axis=0), axis=1))]
    return AKS.nonadjacent_min_clear(Ls, Rs, C, W)


def run_report(pr):
    x, nm = final_x()
    pr.x0 = np.load(os.path.join(OUT, 'x0.npz'))['x0']
    pr.bk_bottom = pick_bk_bottom(pr, x)
    K, e = NR, pr.N - 1
    M = dict(solution=nm, stage_metrics=stage_metrics(pr, x, K, e))
    L, R = raster_dense(pr, x)
    M['windows'], ren = sil_window_metrics(pr, L, R)
    Image.fromarray((ren * 255).astype(np.uint8)).save(os.path.join(OUT, 'sil_render.png'))
    PL, PR = pr.ring_edges(x, K=K)
    M['clearance_min_css'] = clearance_min(pr, PL, PR, pr.W)
    M['two_thk_css'] = 2 * pr.thk
    st = pr.stage_info(K, e)
    ei = st['end_idx']
    p2 = AP.project((PL[ei] + PR[ei]) / 2)
    M['end_cost'] = float(0.5 * np.sum(pr.parts(x, st)['end'] ** 2))
    rolls = pr.rolls(x)
    M['rolls'] = [dict(name=pr.rname[k], kind=pr.kind[k], tau=float(rolls[k, 0]), beta_deg=float(np.degrees(rolls[k, 1])), rho_css=float(rolls[k, 2]),
                       rho_over_W=float(rolls[k, 2] / pr.W), phi_deg=float(np.degrees(rolls[k, 3]))) for k in range(NR)]
    M['lambda'] = pr.lam(x).tolist()
    M['pose'] = dict(rotvec=x[:3].tolist(), t=x[3:6].tolist())
    mins = min(r['rho_over_W'] for r in M['rolls'] if r['kind'] != 'bend')
    sm = M['stage_metrics']
    gates = {
        'silhouette_iou>=0.97 (all windows)': all(v['iou'] >= 0.97 for v in M['windows'].values()),
        'contour<=2px (all windows)': all(v['contour_px'] is not None and v['contour_px'] <= 2 for v in M['windows'].values()),
        'face>=0.95': sm['face']['frac'] >= 0.95,
        'overunder violations == 0': sm['ou']['viol_lt_thk'] == 0,
        'end hidden (end cost < 1 and no ou violation)': M['end_cost'] < 1.0,
        'min fold rho>=0.2W': mins >= 0.2 - 1e-6,
        'min clearance>=2thk': M['clearance_min_css'] >= 2 * pr.thk,
    }
    M['gates'] = {k: ('PASS' if v else 'FAIL') for k, v in gates.items()}
    json.dump(M, open(os.path.join(OUT, 'metrics.json'), 'w'), indent=2, default=float)
    log('## REPORT ' + json.dumps(dict(windows=M['windows'], gates=M['gates'], data=sm['data'], face=sm['face'], ou=sm['ou'], clearance=M['clearance_min_css']), default=float))
    return M


# ================================================================== exporter
def _seg_cross(a, b, c, d):
    def o(p, q, r):
        return (q[:, 0] - p[:, 0]) * (r[:, 1] - p[:, 1]) - (q[:, 1] - p[:, 1]) * (r[:, 0] - p[:, 0])
    return (o(a, b, c) * o(a, b, d) < 0) & (o(c, d, a) * o(c, d, b) < 0)


def emit_chain(pr, x, path, max_rings=316):
    W = pr.W
    xp = pr.paper_x(x, NR)
    rolls = xp[6:].reshape(NR, 4)
    ur = pr.u_ring(x)
    u_start, u_end = ur[0], ur[-1]
    # regions: list of (uc0, uc1, f) with f(uc) -> (uL, uR) flat coordinates of the ruling ends
    def edges_roll(k):
        u0, b, rho, phi = rolls[k]
        cb, sb = np.cos(b), np.sin(b)
        return (lambda Xp: (u0 + (Xp - W / 2 * cb) / sb, u0 + (Xp + W / 2 * cb) / sb)), rho * abs(phi), u0, sb
    regs = []
    infos = [edges_roll(k) for k in range(NR)]
    gaps = []
    for k in range(NR):
        f, L, u0, sb = infos[k]
        if k == 0:
            regs.append(('flat', u_start, u0, lambda uc, f=f, u0=u0, sb=sb: f((uc - u0) * sb)))
        regs.append(('roll', u0, u0 + L / sb, lambda uc, f=f, u0=u0, sb=sb: f((uc - u0) * sb), k))
        if k + 1 < NR:
            f2, L2, u02, sb2 = infos[k + 1]
            a0, a1 = f(L), f2(0.0)
            ca, cb_ = (a0[0] + a0[1]) / 2, (a1[0] + a1[1]) / 2
            gaps.append(min(a1[0] - a0[0], a1[1] - a0[1]))
            regs.append(('flat', ca, cb_, lambda uc, a0=a0, a1=a1, ca=ca, cb_=cb_: tuple(np.array(a0) + (np.array(a1) - np.array(a0)) * ((uc - ca) / max(cb_ - ca, 1e-9)))))
        else:
            regs.append(('flat', u0 + L / sb, u_end, lambda uc, f=f, u0=u0, sb=sb: f((uc - u0) * sb)))
    if min(gaps) < 0:
        raise RuntimeError(f'rolls overlap (min edge gap {min(gaps):.2f} css): refusing to export')
    for r0, r1 in zip(regs[:-1], regs[1:]):
        if r1[1] < r0[2] - 1e-6:
            raise RuntimeError('region order violated: refusing')
    # spacing profile (centre-line arc, css): d_t = min(b, 0.2 rho / sin beta in rolls), then d <= d_t(s') + 0.25|s - s'|
    s_ = np.arange(u_start, u_end, 0.1)
    dt = np.full(len(s_), 1e9)
    for k in range(NR):
        u0, b, rho, phi = rolls[k]
        L = rho * abs(phi)
        if L > 1e-3:
            m = (s_ >= u0) & (s_ <= u0 + L / np.sin(b))
            dt[m] = np.minimum(dt[m], max(0.2 * rho / np.sin(b), 0.8))

    def build(bflat):
        d = np.minimum(dt, bflat)
        d = np.minimum.accumulate(d[::-1] + 0.25 * 0.1 * np.arange(len(d))[::-1])  # placeholder, replaced below
        return None
    def profile(bflat):
        d = np.minimum(dt, bflat)
        for _ in range(2):
            d = np.minimum(d, np.r_[d[0], d[:-1]] + 0.25 * 0.1)
            d = np.minimum(d, np.r_[d[1:], d[-1]] + 0.25 * 0.1)
            # full propagation
        fwd = d.copy()
        for i in range(1, len(fwd)):
            fwd[i] = min(fwd[i], fwd[i - 1] + 0.025)
        for i in range(len(fwd) - 2, -1, -1):
            fwd[i] = min(fwd[i], fwd[i + 1] + 0.025)
        return fwd
    lo, hi = 2.0, 200.0
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
    uc = np.interp(targets, cum, s_)
    uc[-1] = u_end
    UL = np.zeros(len(uc)); UR = np.zeros(len(uc))
    for i, c in enumerate(uc):
        for rg in regs:
            if rg[1] - 1e-9 <= c <= rg[2] + 1e-9 and rg[2] - rg[1] > 1e-9:
                a, b2 = rg[3](c)
                UL[i], UR[i] = a, b2
                break
        else:
            raise RuntimeError(f'no region for uc={c}')
    Lw = PM.surface(xp, UL, np.full(len(uc), -W / 2), NR)
    Rw = PM.surface(xp, UR, np.full(len(uc), W / 2), NR)
    # checks
    pl, pr_ = AP.project_css(Lw), AP.project_css(Rw)
    cross = int(_seg_cross(pl[:-1], pr_[:-1], pl[1:], pr_[1:]).sum())
    dev = 0.0; dev3 = 0.0
    ts = np.linspace(0, 1, 21)[1:-1]
    for t in ts:
        Ut = UL + t * (UR - UL); Vt = -W / 2 + t * W
        S3 = PM.surface(xp, Ut, np.full(len(uc), Vt), NR)
        ch = Lw + t * (Rw - Lw)
        dev3 = max(dev3, float(np.linalg.norm(S3 - ch, axis=1).max()))
        dev = max(dev, float(np.linalg.norm(AP.project_css(S3) - AP.project_css(ch), axis=1).max()))
    sp = np.diff(uc)
    chk = dict(n_rings=len(uc), cap=320, crossings=cross, max_ruling_dev_css_px=dev, max_ruling_dev_3d_css=dev3,
               min_gap_between_rolls_css=float(min(gaps)), spacing_min=float(sp.min()), spacing_max=float(sp.max()),
               max_neighbour_ratio=float(np.max(np.maximum(sp[1:] / sp[:-1], sp[:-1] / sp[1:]))), flat_spacing_css=float(hi))
    json.dump(chk, open(os.path.join(OUT, 'export_checks.json'), 'w'), indent=2)
    if cross or dev > 0.1 or len(uc) > 320:
        raise RuntimeError('exporter refuses to write: ' + json.dumps(chk))
    EP.emit(Lw, Rw, 'phone', path)
    np.savez(os.path.join(OUT, 'export_rings.npz'), L=Lw, R=Rw, uc=uc)
    return chk


def main():
    cmd = sys.argv[1]
    arg = lambda n, f: (type(f)(sys.argv[sys.argv.index('--' + n) + 1]) if '--' + n in sys.argv else f)
    pr = Chain()
    if cmd == 'prep':
        print('W', pr.W, 'nx', pr.nx)
    elif cmd == 'stage':
        run_stage(pr, int(sys.argv[2]), secs_final=arg('secs', 300.0), secs_group=arg('gsecs', 90.0), ncand_fit=arg('nc', 3))
    elif cmd == 'all':
        for st_ in range(int(sys.argv[2]), NI):
            run_stage(pr, st_, secs_final=arg('secs', 300.0), secs_group=arg('gsecs', 90.0), ncand_fit=arg('nc', 3))
            m = json.loads(open(os.path.join(OUT, 'stage_metrics.jsonl')).read().strip().splitlines()[-1])
            if m['data']['rms'] > 15.0:
                log(f'!! STOP: stage {st_} data rms {m["data"]["rms"]:.1f} px > 15')
                return
        run_polish(pr, arg('psecs', 480.0))
        run_report(pr)
    elif cmd == 'polish':
        run_polish(pr, arg('secs', 480.0))
    elif cmd == 'report':
        run_report(pr)
    elif cmd == 'export':
        x, nm = final_x()
        pr.x0 = np.load(os.path.join(OUT, 'x0.npz'))['x0']
        chk = emit_chain(pr, x, os.path.join(OUT, 'ak_candidate.json'))
        log('## EXPORT ' + json.dumps(chk))
    else:
        raise SystemExit('unknown ' + cmd)


if __name__ == '__main__':
    main()
