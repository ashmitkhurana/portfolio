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
    ('right-leg bend 1', 'bend', 585), ('right-leg bend 2', 'bend', 625), ('bottom-K fold 1', 'fold', 690), ('bottom-K curl', 'fold', 712), ('bottom-K fold 2', 'fold', 735),
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
W_WEAVE = 0.0    # weave dropped from the fit (CHAIN_PLAN status 2026-10-08)
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
BEND_MIN_ARC = 1.5      # over/under pairs closer than this in flat arc are ignored
BEND_SP = 1.0           # bends at least this far apart (flat u, in W)
BEND_PHI = float(os.environ.get('BEND_PHI', '1.2'))
Z_LO, Z_HI = -140.0, 220.0
P3_SOL = os.path.join(ROOT, 'docs/ribbon/turns/paper3/solution.npz')
P3_MET = os.path.join(ROOT, 'docs/ribbon/turns/paper3/metrics.json')


ROLLS_IDX = {n: i for i, (n, _, _) in enumerate(ROLLS)}
P3_NAMES = ['left-leg bend 1', 'left-leg bend 2', 'apex fold', 'right-leg bend 1', 'right-leg bend 2']


def p3_mapping(tau, N):
    s = np.load(P3_SOL)
    m = json.load(open(P3_MET))
    ur = s['u_rings']
    rings = []
    for row in m['params']['table']:
        rings.append(363.0 + float(np.interp(row['u_css'], ur, np.arange(len(ur)))))
    return dict(rings=rings, table=m['params']['table'], pose=np.array(m['params']['pose']['rotvec'] + m['params']['pose']['t']), u_rings=ur)


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
        # rolls: the 5 paper3 rolls (left bends, apex, right bends) take paper3's positions
        self.p3 = p3_mapping(self.tau, N)
        self.p3_rolls = [ROLLS_IDX[n] for n in P3_NAMES]
        for n, ring in zip(P3_NAMES, self.p3['rings']):
            ROLLS[ROLLS_IDX[n]] = (n, ROLLS[ROLLS_IDX[n]][1], int(round(ring)))
        self.roll_tau0 = np.array([self.tau[r] for _, _, r in ROLLS])
        for n, ring in zip(P3_NAMES, self.p3['rings']):
            self.roll_tau0[ROLLS_IDX[n]] = float(np.interp(ring, np.arange(N), self.tau))
        self.roll_iv = np.array([self.iv[r] for _, _, r in ROLLS])
        self.roll_stage = np.maximum(self.roll_iv, 1)
        self.kind = [k for _, k, _ in ROLLS]
        self.rname = [n for n, _, _ in ROLLS]
        self.cam = np.array([0.0, 0.0, AP.D])
        self.k_apex = self.rname.index('apex fold')
        self.tau_root = float(self.tau[ROLLS[self.k_apex][2]])
        self._stage = {}
        arc3 = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(self.T0, axis=0), axis=1))]
        a3 = np.r_[arc3[self.i0], arc3[-1]]
        self.lam0 = np.clip(np.diff(a3) / np.diff(self.tau_b), 0.35, 5.5)
        # parameter layout and bounds
        self.nx = 6 + 4 * NR + NI
        self.lo, self.hi = self.bounds()
        self.x0 = self.x_init()
        self.bk_bottom = None
        self._active = set(range(NR))

    # ------------------------------------------------------------ params
    def bounds(self):
        W = self.W
        lo = np.full(self.nx, -np.inf); hi = np.full(self.nx, np.inf)
        for k in range(NR):
            o = 6 + 4 * k
            lo[o], hi[o] = self.roll_tau0[k] - 2.0 * W, self.roll_tau0[k] + 2.0 * W
            lo[o + 1], hi[o + 1] = PM.BETA_LO, PM.BETA_HI
            if self.kind[k] == 'obl':
                lo[o + 2], hi[o + 2] = 0.25 * W, 3.0 * W
                lo[o + 3], hi[o + 3] = -1.885, 1.885
            elif self.kind[k] == 'fold':
                lo[o + 2], hi[o + 2] = 0.2 * W, 3.0 * W
                lo[o + 3], hi[o + 3] = -np.pi - 0.3, np.pi + 0.3
            else:
                lo[o + 2], hi[o + 2] = 0.5 * W, 6.0 * W
                lo[o + 3], hi[o + 3] = -BEND_PHI, BEND_PHI
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
        """flat coordinate of the trace coordinate tau, anchored so that F(tau_root) = tau_root (the apex entry stays put when lambdas change)"""
        U = np.r_[0.0, np.cumsum(self.lam(x) * np.diff(self.tau_b))]
        off = np.interp(self.tau_root, self.tau_b, U) - self.tau_root
        return np.interp(tau, self.tau_b, U) - off

    def u_ring(self, x):
        return self.F(x, self.tau)

    def rolls(self, x):
        return x[6:6 + 4 * NR].reshape(NR, 4)

    # ------------------------------------------------------------ re-rooted kinematics
    def ctx(self, x, act):
        """frames of the chain re-rooted at the apex entry segment: returns (G, rollsU, s_r)"""
        act = list(act)
        r = self.rolls(x)[act].copy()
        r[:, 0] = self.F(x, r[:, 0])
        s_r = int(sum(1 for k in act if k < self.k_apex))
        return build_frames(x[:3], x[3:6], r, s_r), r

    def surf(self, x, u, v, act=None, cx=None):
        act = list(range(NR)) if act is None else act
        (G, E), r = cx if cx is not None else self.ctx(x, act)
        return chain_surface(G, r, u, v)

    # ------------------------------------------------------------ stage info
    def stage_info(self, act, lo, hi):
        act = tuple(sorted(act))
        key = (act, lo, hi, self.bk_bottom)
        if key in self._stage:
            return self._stage[key]
        W = self.W
        nR = hi - lo + 1
        st = dict(act=list(act), lo=lo, hi=hi)
        st['strands'] = [j for j in range(NI) if self.i0[j] >= lo and self.i1[j] <= hi]
        st['ivs'] = [j for j in range(NI) if self.i0[j] >= lo and self.i1[j] <= hi]
        st['wins'] = [wi for wi, k in enumerate(self.win_iv) if self.i0[k] >= lo and self.i1[k] <= hi]
        inr = (np.arange(self.N) >= lo) & (np.arange(self.N) <= hi)
        st['idx1'] = np.nonzero(self.out1 & inr)[0]
        st['idx2'] = np.nonzero(self.out2 & inr)[0]
        st['amp1'] = np.sqrt(self.kw1[st['idx1']])[:, None]
        st['amp2'] = np.sqrt(self.kw2[st['idx2']])[:, None]
        st['cov'] = []
        for wi in st['wins']:
            k = self.win_iv[wi]
            a, b = max(self.i0[k] - 15, lo), min(self.i1[k] + 15, hi)
            idx = np.arange(a, b + 1)
            n = len(idx)
            cv = self.cov[wi]
            st['cov'].append(dict(wi=wi, idx=idx, pin=cv['pin'], pout=cv['pout'],
                                  cin=np.tile(np.arange(n - 1), (len(cv['pin']), 1)), cout=np.tile(np.arange(n - 1), (len(cv['pout']), 1))))
        NS = [max(6, int(np.ceil((self.tau_b[j + 1] - self.tau_b[j]) / DU_Z))) for j in st['strands']]
        st['ns'] = NS
        st['sid'] = np.concatenate([np.full(n, j) for j, n in zip(st['strands'], NS)]) if NS else np.zeros(0, int)
        st['vz'] = np.linspace(-W / 2, W / 2, NVZ)
        fo = self.face_ok.copy(); fo[:lo] = False; fo[hi:] = False
        st['face_j'] = np.nonzero(fo)[0]
        st['face_sign'] = np.where(self.face_exp[st['face_j']] == 'A', 1.0, -1.0)
        pos = {k: i for i, k in enumerate(act)}
        st['seen'] = {pos[k]: SEEN_RULES[self.rname[k]] for k in act if self.rname[k] in SEEN_RULES}
        if self.bk_bottom is not None and self.bk_bottom in pos:
            st['seen'][pos[self.bk_bottom]] = -1
        if hi >= self.N - 1 and self.i0[self.end_behind] >= lo:
            st['end_idx'] = np.arange(self.N - 20, self.N)
            st['leg_idx'] = np.arange(self.i0[self.end_behind], self.i1[self.end_behind] + 1)
        st['bend_pairs'] = [(a, a + 1) for a in range(len(act) - 1) if self.kind[act[a]] == 'bend' and self.kind[act[a + 1]] == 'bend']
        st['hidden_rolls'] = [k for k in act if self.rname[k] in HIDDEN_ROLLS]
        st['tailz'] = lo == 0
        self._stage[key] = st
        return st

    # ------------------------------------------------------------ residual blocks
    def dense(self, x, st, cx):
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
        pts = self.surf(x, U, V, st['act'], cx)
        return pts, U, np.repeat(st['sid'], len(vz)), V

    def ou_blocks(self, x, st, cx):
        if not st['strands']:
            return np.zeros(OU_PAD), np.zeros(0), np.zeros(0), (None, None, None, None)
        pts, U, sid, V = self.dense(x, st, cx)
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
        wk = np.isin(sid, self.weave_strands)
        pc = AP.project_css(pts[wk])
        inside = (pc[:, 0] >= KHURANA['x']) & (pc[:, 0] <= KHURANA['x'] + KHURANA['w']) & (pc[:, 1] >= KHURANA['y']) & (pc[:, 1] <= KHURANA['y'] + KHURANA['h'])
        wv = np.where(inside, np.maximum(0.0, pts[wk, 2] - (KHURANA['z'] - thk)), 0.0) * SC * W_WEAVE
        return out, wv, np.zeros(0), (r, pts, sid, U)

    def seen_block(self, cx, k_roll, side):
        (G, E), r = cx
        u0, b, rho, phi = r[k_roll]
        W = self.W
        t = abs(phi) * np.linspace(0.15, 0.85, 15)
        vv = np.array([-0.4, -0.2, 0.0, 0.2, 0.4]) * W
        T, V = np.meshgrid(t, vv, indexing='ij')
        Xp = (rho * T).ravel(); V = V.ravel()
        Yp = (V + Xp * np.cos(b)) / np.sin(b)
        q = np.stack([u0 + Yp * np.cos(b) + Xp * np.sin(b), V], 1)
        a = np.array([np.cos(b), np.sin(b)]); ap = np.array([np.sin(b), -np.cos(b)])
        d = 0.05
        Sf = lambda qq: chain_surface(G, r, qq[:, 0], qq[:, 1])
        P0 = Sf(q); Pp = Sf(q + d * ap); Pm = Sf(q - d * ap); Pa = Sf(q + d * a)
        N = np.cross(Pp - Pm, Pa - P0)
        N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
        acc = Pp + Pm - 2 * P0
        N = np.where(((N * acc).sum(1) > 0)[:, None], -N, N)
        vh = self.cam - P0
        vh /= np.linalg.norm(vh, axis=1, keepdims=True)
        return np.maximum(0.0, 0.2 - side * (N * vh).sum(1)) * W_SEEN

    def parts(self, x, st):
        W = self.W
        lo, hi = st['lo'], st['hi']
        act = st['act']
        cx = self.ctx(x, act)
        (G, E), r = cx
        ufull = self.u_ring(x)
        ur = ufull[lo:hi + 1]
        n = hi - lo + 1
        FL = np.zeros((self.N, 3)); FR = np.zeros((self.N, 3))
        FL[lo:hi + 1] = chain_surface(G, r, ur, np.full(n, -W / 2))
        FR[lo:hi + 1] = chain_surface(G, r, ur, np.full(n, W / 2))
        out = {}
        p1, p2 = AP.project(FL), AP.project(FR)
        i1, i2 = st['idx1'], st['idx2']
        out['pt'] = np.concatenate([((p1[i1] - self.e1[i1]) * st['amp1']).ravel(), ((p2[i2] - self.e2[i2]) * st['amp2']).ravel()])
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
            m = len(idx)
            G3 = np.stack([chain_surface(G, r, ufull[idx], np.full(m, v)) for v in np.linspace(-W / 2, W / 2, NV_COV)])
            for kind, pts, cand in (('in', cw['pin'], cw['cin']), ('out', cw['pout'], cw['cout'])):
                rr_ = np.stack([S.coverage_resid(G3[k], G3[k + 1], pts, cand, W, kind) for k in range(NV_COV - 1)])
                if kind == 'in':
                    rr = rr_.min(0)
                else:
                    rp = np.where(rr_ > 0, rr_, np.inf).min(0)
                    rr = np.where(np.isfinite(rp), rp, 0.0)
                cov.append(rr * sq)
        out['cov'] = np.concatenate(cov) if cov else np.zeros(0)
        ou, wv, _, _ = self.ou_blocks(x, st, cx)
        out['ou'], out['weave'] = ou, wv
        j = st['face_j']
        C = (FL + FR) / 2
        Tq = C[1:] - C[:-1]
        Dq = ((FR - FL)[1:] + (FR - FL)[:-1]) / 2
        nn = np.cross(Tq, Dq)
        cc = (C[1:] + C[:-1]) / 2
        vh = self.cam - cc
        sh = (nn * vh).sum(1) / np.maximum(np.linalg.norm(nn, axis=1) * np.linalg.norm(vh, axis=1), 1e-12)
        out['face'] = np.maximum(0.0, st['face_sign'] * sh[j] + 0.05) * W_FACE
        out['seen'] = np.concatenate([self.seen_block(cx, k, side) for k, side in st['seen'].items()]) if st['seen'] else np.zeros(0)
        K = len(act)
        og = np.zeros(0)
        if K >= 2:
            g = []
            for a in range(K - 1):
                u0, b0, r0, p0 = r[a]; u1, b1, r1, p1_ = r[a + 1]
                for v in (-W / 2, W / 2):
                    end_k = u0 + v / np.tan(b0) + r0 * abs(p0) / np.sin(b0)
                    start_n = u1 + v / np.tan(b1)
                    g.append(start_n - end_k)
            og = -np.array(g)
        out['overlap'] = np.maximum(0.0, og) * SC * W_OVL
        bp = [max(0.0, BEND_SP * W - (r[b, 0] - r[a, 0])) * SC * W_BEND for a, b in st['bend_pairs']]
        order = [max(0.0, 2.0 - (r[k + 1, 0] - r[k, 0])) * SC * 5 for k in range(K - 1)]
        out['bend'] = np.array(bp + order)
        if 'end_idx' in st:
            ei, li = st['end_idx'], st['leg_idx']
            pe = np.concatenate([p1[ei], p2[ei], (p1[ei] + p2[ei]) / 2])
            cand = np.tile(np.arange(len(li) - 1), (len(pe), 1))
            out['end'] = S.coverage_resid(FL[li], FR[li], pe, cand, W, 'in') * math.sqrt(W_END)
        else:
            out['end'] = np.zeros(0)
        lam_all = self.lam(x)
        out['lam'] = (lam_all[st['ivs']] - self.lam0[st['ivs']]) * W_LAM * 0.3
        if st['tailz']:
            nz = int(self.i0[1]) + 1
            zc = (FL[:nz, 2] + FR[:nz, 2]) / 2
            out['tailz'] = np.maximum(0.0, np.diff(zc)) * W_TZ
        else:
            out['tailz'] = np.zeros(0)
        pr = []
        for k in st['hidden_rolls']:
            o = 6 + 4 * k
            pr.append((x[o:o + 4] - self.x0[o:o + 4]) / np.array([W, 1.0, W, 1.0]) * W_PRIOR * 10)
        out['prior'] = np.concatenate(pr) if pr else np.zeros(0)
        return out

    def res(self, x, st):
        return np.concatenate(list(self.parts(x, st).values()))

    def ring_edges(self, x, act=None, lo=0, hi=None):
        act = list(range(NR)) if act is None else list(act)
        hi = self.N - 1 if hi is None else hi
        cx = self.ctx(x, act)
        u = self.u_ring(x)[lo:hi + 1]
        W = self.W
        n = len(u)
        return self.surf(x, u, np.full(n, -W / 2), act, cx), self.surf(x, u, np.full(n, W / 2), act, cx)


# ================================================================== re-rooted chain kinematics (isometric, C1; inverse frames walk toward u = 0)
def build_frames(rotvec, t, rolls, s_r):
    """segment frames G_s (R, t): flat (q, 0) of segment s (between roll s-1 and roll s) -> world. G_{s_r} = pose.
    G_{s+1} = G_s o E_s (forward), G_s = G_{s+1} o E_s^{-1} (reverse)"""
    K = len(rolls)
    E = []
    for (u, b, rho, phi) in rolls:
        q0, a_, ap_, sg_, L_ = PM.roll_frame(u, b, rho, phi)
        E.append(PM.roll_E(q0, a_, ap_, sg_, rho, phi))
    G = [None] * (K + 1)
    G[s_r] = (Rotation.from_rotvec(rotvec).as_matrix(), np.asarray(t, float))
    for s in range(s_r + 1, K + 1):
        R, tt = G[s - 1]; RE, tE = E[s - 1]
        G[s] = (R @ RE, R @ tE + tt)
    for s in range(s_r - 1, -1, -1):
        R, tt = G[s + 1]; RE, tE = E[s]
        G[s] = (R @ RE.T, tt - R @ RE.T @ tE)
    return G, E


def chain_surface(G, rolls, u, v):
    K = len(rolls)
    u = np.asarray(u, float).ravel(); v = np.asarray(v, float).ravel()
    q = np.stack([u, v], 1)
    out = np.zeros((len(q), 3))
    active = np.ones(len(q), bool)
    for k in range(K):
        q0, a, ap, sg, L = PM.roll_frame(*rolls[k])
        rho = rolls[k, 2]
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
        R, tt = G[k]
        out[done] = P[done] @ R.T + tt
        active = active & ~done
    if active.any():
        q3 = np.concatenate([q[active], np.zeros((active.sum(), 1))], 1)
        R, tt = G[K]
        out[active] = q3 @ R.T + tt
    return out


# ================================================================== fitting
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
        z, cost = r.x, float(r.cost)
    except Timeout:
        z, cost, status = best[1], best[0], 'timeout'
    xo = x0.copy(); xo[free] = z
    if not quiet:
        log(f'    [{label}] {status} cost {cost:.1f} evals {counter[0]} ({time.time() - t0:.0f}s)')
    return xo, cost, status


# ---------------------------------------------------------------- seeding from paper3 (apex root)
def apex_seed(pr):
    t = pr.p3['table'][2]
    return dict(beta=np.radians(t['beta_deg']), rho=t['rho_css'], phi=np.radians(t['phi_deg']))


def seed_x(pr):
    """all five paper3 rolls and the root pose (frame of paper3's entry segment after its two left bends) mapped into the chain flat u"""
    p3 = pr.p3
    tab = p3['table']
    x = pr.x0.copy()
    # lambdas of the covered intervals: paper3 flat-u per ring vs the trace coordinate
    ur = p3['u_rings']
    rings = 363 + np.arange(len(ur))
    ratio = float(np.polyfit(pr.tau[rings], ur, 1)[0])
    for j in (3, 4, 5, 6):
        x[6 + 4 * NR + j] = ratio
        pr.lam0[j] = ratio
    ka = ROLLS_IDX['apex fold']
    for n, row, ring in zip(P3_NAMES, tab, p3['rings']):
        k = ROLLS_IDX[n]
        o = 6 + 4 * k
        x[o:o + 4] = [pr.roll_tau0[k], np.radians(row['beta_deg']), row['rho_css'], np.radians(row['phi_deg'])]
    u_chain_apex = float(pr.F(x, np.array([x[6 + 4 * ka]]))[0])
    shift = u_chain_apex - tab[2]['u_css']
    # put every paper3 roll at u_p3 + shift: invert F
    tg = np.linspace(pr.tau[0], pr.tau[-1], 20001)
    ug = pr.F(x, tg)
    for n, row in zip(P3_NAMES, tab):
        k = ROLLS_IDX[n]
        x[6 + 4 * k] = float(np.interp(row['u_css'] + shift, ug, tg))
    rv, t0 = p3['pose'][:3], p3['pose'][3:6]
    Rp = Rotation.from_rotvec(rv).as_matrix()
    Rc = np.eye(3); tc = np.zeros(3)
    for row in tab[:2]:
        u, b, rho, phi = row['u_css'], np.radians(row['beta_deg']), row['rho_css'], np.radians(row['phi_deg'])
        q0, aa, ap, sg, L = PM.roll_frame(u, b, rho, phi)
        RE, tE = PM.roll_E(q0, aa, ap, sg, rho, phi)
        tc = Rc @ tE + tc
        Rc = Rc @ RE
    R_root = Rp @ Rc
    t_root = Rp @ tc + t0 - R_root @ np.array([shift, 0.0, 0.0])
    x[:3] = Rotation.from_matrix(R_root).as_rotvec(); x[3:6] = t_root
    return x


# ---------------------------------------------------------------- initialisation of new rolls (closed form against the depth-profile targets)
def local_frame(pr, x, k):
    """world axes (e_u, e_v, n) of the flat frame at roll k (roll k inert there)"""
    act = [j for j in range(NR) if j in pr._active]
    cx = pr.ctx(x, act)
    uk = pr.F(x, np.array([x[6 + 4 * k]]))[0]
    sf = lambda u, v: pr.surf(x, np.array([u]), np.array([v]), act, cx)[0]
    eu = sf(uk + 3.0, 0.0) - sf(uk + 1.0, 0.0); eu /= np.linalg.norm(eu)
    ev = sf(uk + 2.0, 1.0) - sf(uk + 2.0, -1.0); ev = ev - (ev @ eu) * eu; ev /= np.linalg.norm(ev)
    return eu, ev, np.cross(eu, ev)


def target_dir(pr, k, reverse):
    r = ROLLS[k][2]
    if not reverse:
        nxt = ROLLS[k + 1][2] if k + 1 < NR else pr.N - 1
        d = nxt - r
        a = int(round(r + 0.45 * d)); b = int(round(r + 0.9 * d))
        b = min(b, pr.N - 1); a = min(a, b - 3)
    else:
        prv = ROLLS[k - 1][2] if k > 0 else 0
        d = r - prv
        a = int(round(r - 0.45 * d)); b = int(round(r - 0.9 * d))
        b = max(b, 0); a = max(a, b + 3)
    t = pr.T0[b] - pr.T0[a]
    return t / np.linalg.norm(t)


def roll_from_vecs(vf, vt, beta_fixed=None):
    """(beta, phi) of the single roll with RE(vf) = vt in the local flat frame (RE = Rot(a, -phi))"""
    w = vt - vf
    if beta_fixed is None:
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
    ep = vf - (vf @ a) * a
    dp = vt - (vt @ a) * a
    th = np.arctan2(a @ np.cross(ep, dp), ep @ dp)
    return beta, float(-th)


def sil_beta(pr, k):
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


def rolls_candidates(pr, x, k):
    """candidate (tag, beta, rho, phi) for roll k (x has the other active rolls set; roll k is made inert and active)"""
    W = pr.W
    if pr.rname[k] == 'apex fold':
        a = apex_seed(pr)
        return [('paper3', a['beta'], a['rho'], a['phi'])]
    if pr.kind[k] == 'bend':
        return [('bend', np.pi / 2, 3 * W, 0.0)]
    reverse = k < pr.k_apex
    xx = set_roll(x, k, pr.roll_tau0[k], np.pi / 2, 3 * W, 0.0)
    pr._active = set(pr._active) | {k}
    eu, ev, n = local_frame(pr, xx, k)
    t = target_dir(pr, k, reverse)
    dl = np.array([t @ eu, t @ ev, t @ n])
    pairs = []
    e1_ = np.array([1.0, 0, 0])
    mk = (lambda bf=None: roll_from_vecs(e1_, dl, bf)) if not reverse else (lambda bf=None: roll_from_vecs(dl, -e1_, bf))
    pairs.append(('cf',) + mk())
    sb = sil_beta(pr, k)
    if sb is not None:
        pairs.append(('sil',) + mk(sb))
    cands = []
    for tag, b, p in pairs:
        b = float(np.clip(b, 0.3, np.pi - 0.3))
        rho = 0.4 * W if pr.rname[k] != 'wrap curl' else 0.6 * W
        p = float(np.clip(p, -np.pi, np.pi))
        cands.append((tag, b, rho, p))
        if abs(p) > 2.6:
            cands.append((tag + '-flip', b, rho, -p))
    return cands


# ================================================================== stage driver (apex-rooted growth)
ORDER = ['P3', 3, 2, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 1, 0]
GATE_NEW = {1: (12, 20)}


FOLD_WINDOW_IV = {0, 1, 3, 5, 7, 11, 14}   # S, far-left, apex, bottom-K, wrap, top-K tip (+ tail): stop at 35 px


def gate_for(iv):
    tgt = 20.0 if iv in (0, 1) else 12.0
    return (tgt, 35.0 if iv in FOLD_WINDOW_IV else 25.0)


def state_after(pr, n):
    ivs = [4, 5] + [o for o in ORDER[1:n]]
    lo, hi = 363, 580
    for i in ivs[2:]:
        lo = min(lo, int(pr.i0[i])); hi = max(hi, int(pr.i1[i]))
    act = [k for k in range(NR) if pr.roll_iv[k] in ivs or k in pr.p3_rolls]
    return ivs, lo, hi, sorted(set(act))


def stage_groups_iv(pr, iv):
    ks = [k for k in range(NR) if pr.roll_iv[k] == iv and k not in pr.p3_rolls]
    groups = []
    for k in ks:
        if groups and pr.int_face[iv] == 'window':
            groups[-1].append(k)
        else:
            groups.append([k])
    return groups


def nearest_prev(pr, act_prev, group, n=2):
    c = np.mean([ROLLS[k][2] for k in group])
    return sorted(act_prev, key=lambda k: abs(ROLLS[k][2] - c))[:n]


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


def bk_combos(pr, x, g):
    """bottom-K: fold 1, loop-bottom curl, fold 2. 4 starts = fold sign pattern x curl sign"""
    W = pr.W
    k1, kc, k2 = g
    base = {}
    for k in (k1, k2):
        c = rolls_candidates(pr, x, k)[0]
        base[k] = (c[1], max(abs(c[3]), np.pi / 2))
    bc = sil_beta(pr, kc)
    bc = float(np.clip(bc if bc is not None else np.pi / 2, 0.3, np.pi - 0.3))
    out = []
    for fs, fn in ((1, '+-'), (-1, '-+')):
        for cs, cn in ((1, 'c+'), (-1, 'c-')):
            xx = set_roll(x, k1, pr.roll_tau0[k1], base[k1][0], 0.4 * W, fs * base[k1][1])
            xx = set_roll(xx, kc, pr.roll_tau0[kc], bc, 0.5 * W, cs * np.pi / 2)
            xx = set_roll(xx, k2, pr.roll_tau0[k2], base[k2][0], 0.4 * W, -fs * base[k2][1])
            out.append(([fn, cn], xx))
    return out


def pick_bk_bottom(pr, x):
    ks = [k for k in range(NR) if pr.rname[k].startswith('bottom-K')]
    ys = []
    act = list(range(NR))
    cx = pr.ctx(x, act)
    for k in ks:
        u0, b, rho, phi = pr.rolls(x)[k]
        u0 = pr.F(x, np.array([u0]))[0]
        uc = u0 + 0.5 * rho * abs(phi) / max(np.sin(b), 0.2)
        P3 = pr.surf(x, np.array([uc]), np.array([0.0]), act, cx)
        ys.append(AP.project(P3)[0, 1])
    return ks[int(np.argmax(ys))]


def block_costs(parts):
    return {k: round(0.5 * float(v @ v), 2) for k, v in parts.items() if len(v)}


def ring_dists(pr, x, st, ring_sel=None):
    """per-ring data distances (px) for visible rings: point-to-point outside windows, sliding inside. returns concatenated array over rings in ring_sel"""
    lo, hi = st['lo'], st['hi']
    PL, PR = pr.ring_edges(x, st['act'], lo, hi)
    FL = np.zeros((pr.N, 3)); FR = np.zeros((pr.N, 3)); FL[lo:hi + 1] = PL; FR[lo:hi + 1] = PR
    d = []
    sel = np.ones(pr.N, bool) if ring_sel is None else ring_sel
    for (P, e_, idx) in ((FL, pr.e1, st['idx1']), (FR, pr.e2, st['idx2'])):
        ii = idx[sel[idx]]
        d.append(np.hypot(*(AP.project(P)[ii] - e_[ii]).T))
    for wi in st['wins']:
        for sd, F_ in ((pr.sd[wi][0], FL), (pr.sd[wi][1], FR)):
            sl, _ = sd.resid(F_)
            dd = np.abs(sl) / np.maximum(sd.amp[sd.sidx], 1e-9)       # normal distance to the run polyline (sliding along it)
            d.append(dd[sel[sd.sidx]])
    return np.concatenate(d) if d else np.zeros(0)


def stats(v):
    if len(v) == 0:
        return dict(n=0, rms=None, p95=None, max=None)
    return dict(n=int(len(v)), rms=float(np.sqrt(np.mean(v ** 2))), p95=float(np.percentile(v, 95)), max=float(v.max()))


def face_stat(pr, x, st):
    lo, hi = st['lo'], st['hi']
    PL, PR = pr.ring_edges(x, st['act'], lo, hi)
    C = (PL + PR) / 2
    Tq = C[1:] - C[:-1]
    Dq = ((PR - PL)[1:] + (PR - PL)[:-1]) / 2
    n = np.cross(Tq, Dq)
    s_ = (n * (pr.cam - (C[1:] + C[:-1]) / 2)).sum(1)
    face = np.where(s_ < 0, 'A', 'B')
    j = st['face_j']
    ag = int((face[j - lo] == pr.face_exp[j]).sum())
    return dict(checked=int(len(j)), agree=ag, frac=ag / max(len(j), 1))


def ou_stat(pr, x, st):
    cx = pr.ctx(x, st['act'])
    ou, wv, zr, (r, pts, sid, U) = pr.ou_blocks(x, st, cx)
    if r is None:
        return dict(pairs=0, viol_lt_thk=0, viol_lt_2thk=0)
    gap_def = r / (SC * W_OU)
    return dict(pairs=int(len(r)), viol_lt_2thk=int((r > 1e-9).sum()), viol_lt_thk=int((gap_def > pr.thk).sum()),
                max_shortfall_css=float(gap_def.max()) if len(r) else 0.0, weave_violations=int((wv > 0).sum()))


def stage_metrics(pr, x, st, new_iv=None):
    parts = pr.parts(x, st)
    allr = np.concatenate(list(parts.values()))
    r = pr.rolls(x)[st['act']]
    folds = [r[i, 2] / pr.W for i, k in enumerate(st['act']) if pr.kind[k] in ('fold', 'obl')]
    m = dict(act=len(st['act']), lo=st['lo'], hi=st['hi'], cost=round(0.5 * float(allr @ allr), 1), blocks=block_costs(parts),
             data_all=stats(ring_dists(pr, x, st)), face=face_stat(pr, x, st), ou=ou_stat(pr, x, st),
             min_fold_rho_over_W=float(min(folds)) if folds else None)
    if new_iv is not None:
        sel = np.zeros(pr.N, bool); sel[pr.i0[new_iv]:pr.i1[new_iv] + 1] = True
        m['new_interval'] = new_iv
        m['data_new'] = stats(ring_dists(pr, x, st, sel))
    return m


def save_state(path, x, **kw):
    np.savez(path, x=x, **{k: np.asarray(v) for k, v in kw.items()})


def stage_path(n):
    return os.path.join(OUT, f'stage_{n}.npz')


def init_chain(pr):
    pr.x0 = seed_x(pr)
    np.savez(os.path.join(OUT, 'x0.npz'), x0=pr.x0, tau_apex=pr.roll_tau0[pr.k_apex], lam0=pr.lam0)
    return pr.x0


def load_chain(pr):
    d = np.load(os.path.join(OUT, 'x0.npz'))
    pr.x0 = d['x0']
    pr.lam0 = d['lam0']


def run_stage(pr, n, secs_final=300.0, secs_group=90.0, ncand_fit=3):
    t00 = time.time()
    iv = ORDER[n - 1]
    if n == 1:
        x = init_chain(pr)
    else:
        load_chain(pr)
        x = np.load(stage_path(n - 1))['x']
    ivs_prev, lo_p, hi_p, act_prev = state_after(pr, n - 1) if n > 1 else ([], None, None, [])
    ivs, lo, hi, act = state_after(pr, n)
    if n == 1:
        pr._active = set(act)
        st = pr.stage_info(act, lo, hi)
        m0 = stage_metrics(pr, x, st, None)
        log(f'## stage 1 (paper3 section, rings {lo}..{hi}, 5 seeded rolls): seed cost {m0["cost"]} data_all {m0["data_all"]} (paper3 section rms 5.98 px)')
        free = np.array(sorted(list(range(6)) + [6 + 4 * k + j for k in act for j in range(4)] + [6 + 4 * NR + j for j in (3, 4, 5, 6)]))
        x, cost, status = run_fit(pr, x, st, free, secs_final, 'stage1')
        m = stage_metrics(pr, x, st, None)
        sel = np.zeros(pr.N, bool); sel[lo:hi + 1] = True
        m['data_new'] = stats(ring_dists(pr, x, st, sel)); m['new_interval'] = 'P3'
        g_ok, g_stop = 12.0, 25.0
    else:
        reverse = isinstance(iv, int) and iv < 5
        groups = stage_groups_iv(pr, iv)
        order = list(reversed(groups)) if reverse else groups
        if any(pr.rname[k] == 'bottom-K fold 2' for k in act_prev):
            pr.bk_bottom = pick_bk_bottom(pr, x)
        part = os.path.join(OUT, f'partial_{n}.npz')
        start_g = 0
        if os.path.exists(part):
            d = np.load(part)
            x = d['x']; start_g = int(d['gi'])
            log(f'  resuming stage {n} at group {start_g}')
        log(f'## stage {n}: interval {iv} ({pr.int_names[iv]}) rings {lo}..{hi}; groups {[[ROLLS[k][0] for k in g] for g in order]}')
        done_new = [k for g in order[:start_g] for k in g]
        for gi in range(start_g, len(order)):
            g = order[gi]
            pr._active = set(act_prev) | set(done_new) | set(g)
            if not reverse:
                ghi = (ROLLS[order[gi + 1][0]][2] - 1) if gi + 1 < len(order) else hi
                glo = lo_p
            else:
                glo = (ROLLS[order[gi + 1][-1]][2] + 1) if gi + 1 < len(order) else lo
                ghi = hi_p
            gact = sorted(pr._active)
            st = pr.stage_info(gact, glo, ghi)
            near = nearest_prev(pr, act_prev + done_new, g)
            free = np.array(sorted([6 + 4 * k + j for k in list(g) + near for j in range(4)] + [6 + 4 * NR + iv]))
            if pr.rname[g[-1]] == 'S obl 4':
                combos = s_combos(pr, x, g)
                ncf, gs = 6, max(secs_group, 360.0)
            elif pr.rname[g[0]] == 'bottom-K fold 1':
                combos = bk_combos(pr, x, g)
                ncf, gs = 4, 360.0
            else:
                combos = list(gen_combos(pr, x, g))
                ncf, gs = ncand_fit, secs_group
            scored = []
            for tags, xc in combos:
                r = pr.res(xc, st)
                scored.append((0.5 * float(r @ r), tags, xc))
            scored.sort(key=lambda q: q[0])
            log(f'  group {[ROLLS[k][0] for k in g]} rings {glo}..{ghi} free={len(free)} candidates={len(combos)} '
                f'init costs {[(q[1], round(q[0])) for q in scored[:6]]}')
            best = None
            for c0, tags, xc in scored[:ncf]:
                xo, cost, status = run_fit(pr, xc, st, free, gs, '/'.join(tags))
                if best is None or cost < best[0]:
                    best = (cost, tags, xo)
            x = best[2]
            done_new += list(g)
            if any(pr.rname[k] == 'bottom-K fold 2' for k in g):
                pr.bk_bottom = pick_bk_bottom(pr, x)
                pr._stage.clear()
                log(f'    bottom-K loop bottom (inner side toward camera) = {ROLLS[pr.bk_bottom][0]}')
            for k in g:
                r_ = pr.rolls(x)[k]
                log(f'    roll {ROLLS[k][0]}: tau {r_[0]:.1f} beta {np.degrees(r_[1]):.1f} rho {r_[2]:.1f} ({r_[2] / pr.W:.2f}W) phi {np.degrees(r_[3]):.1f} [{best[1]}]')
            save_state(part, x, gi=gi + 1)
        pr._active = set(act)
        st = pr.stage_info(act, lo, hi)
        new = [k for g in groups for k in g]
        near = nearest_prev(pr, act_prev, new if new else [int(np.mean([pr.i0[iv], pr.i1[iv]]))] and [min(act_prev, key=lambda k: abs(ROLLS[k][2] - (pr.i0[iv] + pr.i1[iv]) / 2))])
        free = np.array(sorted([6 + 4 * k + j for k in new + near for j in range(4)] + [6 + 4 * NR + iv]))
        r = pr.res(x, st)
        log(f'  stage fit: free {len(free)} rings {lo}..{hi} cost0 {0.5 * float(r @ r):.1f}')
        x, cost, status = run_fit(pr, x, st, free, secs_final, f'stage{n}')
        m = stage_metrics(pr, x, st, iv)
        g_ok, g_stop = gate_for(iv)
        if os.path.exists(part):
            os.remove(part)
    m.update(stage=n, status=status, seconds=time.time() - t00, gate_target=g_ok, gate_stop=g_stop,
             gate='PASS' if m['data_new']['rms'] is not None and m['data_new']['rms'] <= g_ok else 'FAIL')
    log('  METRICS ' + json.dumps(m, default=float))
    save_state(stage_path(n), x, iv=str(iv))
    with open(os.path.join(OUT, 'stage_metrics.jsonl'), 'a') as fh:
        fh.write(json.dumps(m, default=float) + '\n')
    return x, m


# ================================================================== polish / report
def final_x():
    for nm in ['polished.npz'] + [f'stage_{k}.npz' for k in range(len(ORDER), 0, -1)]:
        if os.path.exists(os.path.join(OUT, nm)):
            return np.load(os.path.join(OUT, nm))['x'], nm
    raise SystemExit('no solution')


def run_polish(pr, secs):
    load_chain(pr)
    x = np.load(stage_path(len(ORDER)))['x']
    pr.bk_bottom = pick_bk_bottom(pr, x)
    pr._active = set(range(NR))
    st = pr.stage_info(list(range(NR)), 0, pr.N - 1)
    free = np.arange(pr.nx)
    r = pr.res(x, st)
    log(f'## polish: all {len(free)} params, cost0 {0.5 * float(r @ r):.1f}')
    x, cost, status = run_fit(pr, x, st, free, secs, 'polish')
    m = stage_metrics(pr, x, st)
    log('  POLISH METRICS ' + json.dumps(m, default=float))
    np.savez(os.path.join(OUT, 'polished.npz'), x=x)


def raster_dense(pr, x, step=0.6):
    ur = pr.u_ring(x)
    u = np.arange(ur[0], ur[-1], step)
    W = pr.W
    cx = pr.ctx(x, list(range(NR)))
    return pr.surf(x, u, np.full(len(u), -W / 2), None, cx), pr.surf(x, u, np.full(len(u), W / 2), None, cx)


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


def isometry_check(pr, x):
    """paper.py isometry test on the re-rooted model + C1 check at roll boundaries"""
    act = list(range(NR))
    cx = pr.ctx(x, act)
    (G, E), r = cx
    orig = PM.surface
    PM.surface = lambda xx, u, v, K=3: chain_surface(G, r, u, v)
    try:
        xpap = np.concatenate([x[:6], r.ravel()])
        iso = PM.isometry_test(xpap, pr.W, (pr.u_ring(x).min(), pr.u_ring(x).max()), n=3000, K=NR)
    finally:
        PM.surface = orig
    # C1: unit normals just inside / outside every roll boundary line at v = 0 and v = +-W/4
    worst = 0.0
    for k in range(NR):
        q0, a, ap, sg, L = PM.roll_frame(*r[k])
        for lvl in (0.0, L):
            if L < 1e-9:
                continue
            for v in (-pr.W / 4, 0.0, pr.W / 4):
                Yp = (v) / np.sin(r[k, 1]) if False else 0.0
                pts = []
                for side in (-1e-4, 1e-4):
                    Xp = lvl + side
                    # flat point at (Xp, v): u = u0 + (Xp + v cos b)/sin b
                    u = r[k, 0] + (Xp + v * np.cos(r[k, 1])) / np.sin(r[k, 1])
                    pts.append((u, v))
                nn = []
                for (u, v_) in pts:
                    P0 = chain_surface(G, r, np.array([u, u + 1e-3, u]), np.array([v_, v_, v_ + 1e-3]))
                    n_ = np.cross(P0[1] - P0[0], P0[2] - P0[0]); nn.append(n_ / np.linalg.norm(n_))
                worst = max(worst, float(np.linalg.norm(nn[0] - nn[1])))
    iso['max_normal_jump_across_boundaries'] = worst
    return iso


def run_report(pr):
    x, nm = final_x()
    load_chain(pr)
    pr.bk_bottom = pick_bk_bottom(pr, x)
    pr._active = set(range(NR))
    st = pr.stage_info(list(range(NR)), 0, pr.N - 1)
    M = dict(solution=nm, stage_metrics=stage_metrics(pr, x, st))
    L, R = raster_dense(pr, x)
    M['windows'], ren = sil_window_metrics(pr, L, R)
    Image.fromarray((ren * 255).astype(np.uint8)).save(os.path.join(OUT, 'sil_render.png'))
    PL, PR = pr.ring_edges(x)
    M['clearance_min_css'] = clearance_min(pr, PL, PR, pr.W)
    M['two_thk_css'] = 2 * pr.thk
    M['end_cost'] = float(0.5 * np.sum(pr.parts(x, st)['end'] ** 2))
    rolls = pr.rolls(x)
    M['rolls'] = [dict(name=pr.rname[k], kind=pr.kind[k], tau=float(rolls[k, 0]), beta_deg=float(np.degrees(rolls[k, 1])), rho_css=float(rolls[k, 2]),
                       rho_over_W=float(rolls[k, 2] / pr.W), phi_deg=float(np.degrees(rolls[k, 3]))) for k in range(NR)]
    M['lambda'] = pr.lam(x).tolist()
    M['pose_root'] = dict(rotvec=x[:3].tolist(), t=x[3:6].tolist())
    M['isometry'] = isometry_check(pr, x)
    mins = min(r['rho_over_W'] for r in M['rolls'] if r['kind'] != 'bend')
    sm = M['stage_metrics']
    gates = {
        'silhouette_iou>=0.97 (all windows)': all(v['iou'] >= 0.97 for v in M['windows'].values()),
        'contour<=2px (all windows)': all(v['contour_px'] is not None and v['contour_px'] <= 2 for v in M['windows'].values()),
        'face>=0.95': sm['face']['frac'] >= 0.95,
        'overunder violations == 0': sm['ou']['viol_lt_thk'] == 0,
        'end hidden (end cost < 1)': M['end_cost'] < 1.0,
        'min fold rho>=0.2W': mins >= 0.2 - 1e-6,
        'min clearance>=2thk': M['clearance_min_css'] >= 2 * pr.thk,
    }
    M['gates'] = {k: ('PASS' if v else 'FAIL') for k, v in gates.items()}
    json.dump(M, open(os.path.join(OUT, 'metrics.json'), 'w'), indent=2, default=float)
    log('## REPORT ' + json.dumps(dict(windows=M['windows'], gates=M['gates'], data=sm['data_all'], face=sm['face'], ou=sm['ou'], clearance=M['clearance_min_css'],
                                       isometry=M['isometry']), default=float))
    return M


# ================================================================== exporter
def _seg_cross(a, b, c, d):
    def o(p, q, r):
        return (q[:, 0] - p[:, 0]) * (r[:, 1] - p[:, 1]) - (q[:, 1] - p[:, 1]) * (r[:, 0] - p[:, 0])
    return (o(a, b, c) * o(a, b, d) < 0) & (o(c, d, a) * o(c, d, b) < 0)


def emit_chain(pr, x, path, max_rings=316):
    W = pr.W
    cx = pr.ctx(x, list(range(NR)))
    rolls = cx[1]
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
    Lw = pr.surf(x, UL, np.full(len(uc), -W / 2), None, cx)
    Rw = pr.surf(x, UR, np.full(len(uc), W / 2), None, cx)
    # checks
    pl, pr_ = AP.project_css(Lw), AP.project_css(Rw)
    cross = int(_seg_cross(pl[:-1], pr_[:-1], pl[1:], pr_[1:]).sum())
    dev = 0.0; dev3 = 0.0
    ts = np.linspace(0, 1, 21)[1:-1]
    for t in ts:
        Ut = UL + t * (UR - UL); Vt = -W / 2 + t * W
        S3 = pr.surf(x, Ut, np.full(len(uc), Vt), None, cx)
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
    kw = dict(secs_final=arg('secs', 300.0), secs_group=arg('gsecs', 90.0), ncand_fit=arg('nc', 3))
    if cmd == 'stage':
        run_stage(pr, int(sys.argv[2]), **kw)
    elif cmd == 'all':
        n0 = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else 1
        for n in range(n0, len(ORDER) + 1):
            if os.path.exists(stage_path(n)) and not os.path.exists(os.path.join(OUT, f'partial_{n}.npz')):
                continue
            x, m = run_stage(pr, n, **kw)
            if m['data_new']['rms'] is None or m['data_new']['rms'] > m['gate_stop']:
                log(f'!! STOP: stage {n} (interval {m["new_interval"]}) new-interval rms {m["data_new"]["rms"]} px > {m["gate_stop"]}')
                return
        run_polish(pr, arg('psecs', 480.0))
        run_report(pr)
        x, nm = final_x()
        load_chain(pr)
        chk = emit_chain(pr, x, os.path.join(OUT, 'ak_candidate.json'))
        log('## EXPORT ' + json.dumps(chk))
    elif cmd == 'polish':
        run_polish(pr, arg('secs', 480.0))
    elif cmd == 'report':
        run_report(pr)
    elif cmd == 'export':
        x, nm = final_x()
        load_chain(pr)
        chk = emit_chain(pr, x, os.path.join(OUT, 'ak_candidate.json'))
        log('## EXPORT ' + json.dumps(chk))
    else:
        raise SystemExit('unknown ' + cmd)


if __name__ == '__main__':
    main()
