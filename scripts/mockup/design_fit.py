#!/usr/bin/env python3
"""design_fit: design the AK from the owner's flow, no pixel matching (docs/ribbon/turns/DESIGN_PLAN.md).

  design_fit.py seeds            build base seed + presearch of sign combos -> design/starts.json
  design_fit.py run <i>          multi-start i (0..3): 3 LM passes -> design/start_<i>.npz + design/start_<i>.json
  design_fit.py finish           pick the best start, write outputs (shaded x3, overlay, zoom sheets, metrics.json, solution.npz)
Outputs: docs/ribbon/turns/design/
A (rolls, pose, lambdas) is frozen to sec_A_APPROVED. Never touches lib/ app/ components/.
"""
import copy, json, math, os, sys, time
import numpy as np
from PIL import Image, ImageDraw
from scipy.spatial.transform import Rotation

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import global_fit as G      # noqa: E402
import msfit as M           # noqa: E402
import chain_fit as C       # noqa: E402
import ak_problem as AP     # noqa: E402
import solve3d as S         # noqa: E402

ROOT = AP.ROOT
OUTD = os.path.join(ROOT, 'docs/ribbon/turns/design')
os.makedirs(OUTD, exist_ok=True)
C.OUT = OUTD
NR, NI, SC = C.NR, C.NI, C.SC
SEC_DIR = M.DIRS['sections']
T_START = time.time()
PASS_SECS = 480.0
A_IVS = (4, 5, 6)

LANDMARKS = [30, 90, 160, 200, 250, 330, 680, 712, 740, 790, 870, 900, 940, 980, 1020, 1110, 1135, 1170, 1200, 1250]
SIGN_GROUPS = {'S': ['S bend', 'S obl 4'], 'farleft': ['far-left fold'], 'bottomK': ['bottom-K fold 1', 'bottom-K fold 2'],
               'wrap': ['wrap curl', 'wrap twist 1', 'wrap twist 2'], 'topK': ['top-K tip fold']}
F_LM, F_W = 20.0, 25.0                    # soft-L1 scales (px)
WT = dict(lm=1.0, width=0.3, face=20.0, real=10.0, ou=50.0, end=50.0, clr=50.0, depth=10.0)
PASSES = [('pass 1 (landmarks, width, faces, depth, realism)', dict(lm=1, width=1, face=1, depth=1, real=1, ou=0, end=0, clr=0), 1.0),
          ('pass 2 (+ over/under, end hidden, clearance)', dict(lm=1, width=1, face=1, depth=1, real=1, ou=1, end=1, clr=1), 1.0),
          ('pass 3 (all, realism x3)', dict(lm=1, width=1, face=1, depth=1, real=1, ou=1, end=1, clr=1), 3.0)]


def note(msg, tag=''):
    el = (time.time() - T_START) / 60.0
    C.log(f'[design{tag} +{el:.1f}min] {msg}')


def sl1(v, f):
    """soft-L1 on 2D residual vectors (n,2): scaled so that 0.5*sum(r^2) = sum rho(d), rho = 2 f^2 (sqrt(1+(d/f)^2)-1) / 2"""
    d = np.linalg.norm(v, axis=1)
    s = np.sqrt(2.0 * f * f * (np.sqrt(1.0 + (d / f) ** 2) - 1.0))
    return v * (s / np.maximum(d, 1e-9))[:, None]


def sl1s(d, f):
    return np.sign(d) * np.sqrt(2.0 * f * f * (np.sqrt(1.0 + (d / f) ** 2) - 1.0))


# ================================================================== problem
class DPrb(G.GPrb):
    def __init__(self):
        super().__init__()
        W = self.W
        # the bottom-K needs two flips (B -> A -> B): add 'bottom-K fold 2' to the active list (spec issue)
        self.k_f2 = C.ROLLS_IDX['bottom-K fold 2']
        self.gnames = list(self.gnames) + ['bottom-K fold 2']
        self.gsec = M.Sec(self, 'G', list(range(NI)), self.gnames, 1.0, None, False)
        self.gact = list(self.gsec.act)
        self.sec = self.gsec
        self.roll_tau0[self.k_f2] = float(self.tau[750])
        self.lo, self.hi = self.bounds()
        self.x0 = self.x_init()
        self.ksA = [C.ROLLS_IDX[n] for n in M.SEC_DEF[3][2]]
        self.free_rolls = [k for k in self.gact if k not in self.ksA]
        # bend rho >= 1 W for the non-A bends (fold rho >= 0.3 W already in the bounds)
        for k in self.free_rolls:
            if self.kind[k] == 'bend':
                self.lo[6 + 4 * k + 2] = max(self.lo[6 + 4 * k + 2], 1.0 * W)
        self.hi = np.maximum(self.hi, self.lo + 1e-6)
        # A depth range
        prA = M.SecPrb()
        secA = prA.bind('A')
        self.xa = M.ldx(prA, os.path.join(SEC_DIR, G.SEEDS['A']))
        self.prA, self.secA = prA, secA
        rings, zA = G.a_depth(prA, self.xa, secA)
        self.zA = zA
        self.zlo, self.zhi, self.zhi_tail = float(zA.min() - 250.0), float(zA.max() + 250.0), float(zA.max() + 500.0)
        # landmarks
        self.lm = np.array(LANDMARKS)
        self.lm_t = ((self.e1 + self.e2) / 2)[self.lm]
        self.lm_w = np.hypot(*(self.e2 - self.e1).T)[self.lm]
        self.lm_wvis = (self.P['vis1'] & self.P['vis2'])[self.lm]
        # face rules per ring-quad: +1 A, -1 B, 0 none
        fq = np.zeros(self.N - 1)

        def setf(a, b, v):
            fq[a:b] = v
        setf(0, 131, +1)                         # tail A
        setf(226, 288, -1)                       # sweep B
        setf(388, 483, +1)                       # left leg A
        setf(555, 658, -1)                       # right leg B
        setf(659, 704, -1)                       # bottom-K outer B
        setf(716, 732, +1)                       # bottom-K inner A
        setf(765, 813, -1)                       # k_return B
        setf(859, 910, -1)                       # crossbar B
        setf(1067, 1101, -1)                     # return / middle B
        setf(1102, 1140, -1)                     # top-K front B
        setf(1141, 1176, -1)                     # top-K front (tip window, before the tip roll) B
        setf(1196, 1230, +1)                     # top-K back A
        setf(1231, 1298, +1)                     # end A
        self.fq = fq
        self.fq_j = np.nonzero(fq != 0)[0]
        self.fq_s = fq[self.fq_j]
        # end-hidden data
        self.end_idx = np.arange(self.N - 20, self.N)
        self.leg_idx = np.arange(self.i0[6], self.i1[6] + 1)
        self.leg_cand = np.tile(np.arange(len(self.leg_idx) - 1), (3 * len(self.end_idx), 1))
        self.tail_n = 132
        self.free_idx = np.array([6 + 4 * k + j for k in self.free_rolls for j in range(4)] +
                                 [6 + 4 * NR + j for j in range(NI) if j not in A_IVS])
        self.cl_sub = np.arange(0, self.N, 6)

    # ---- helpers
    def stinfo(self):
        if getattr(self, '_dst', None) is None:
            st = dict(self.stage_info(self.gact, 0, self.N - 1))
            st = copy.copy(st)
            ns = [max(6, int(np.ceil((self.tau_b[j + 1] - self.tau_b[j]) / 3.0))) for j in st['strands']]
            st['ns'] = ns
            st['sid'] = np.concatenate([np.full(n, j) for j, n in zip(st['strands'], ns)])
            st['vz'] = np.linspace(-self.W / 2, self.W / 2, 9)
            st['act'] = list(self.gact)
            self._dst = st
        return self._dst

    def roll_regions(self, r):
        W = self.W
        out = []
        for (u0, b, rho, phi) in r:
            half = W / (2 * abs(math.tan(b)))
            out.append((u0 - half, u0 + half + rho * abs(phi) / math.sin(b)))
        return out

    def dip_block(self, r, wreal):
        """a roll whose lobe (rho|phi|/sin beta) is shorter than 1 W and whose neighbours turn the opposite way (sign of phi) is a dip (differentiable hinge)"""
        W = self.W
        K = len(r)
        out = []
        sg = np.sign(r[:, 3]) * (np.abs(r[:, 3]) > 0.052)
        for a in range(1, K - 1):
            kk = self.gact[a]
            if kk in self.ksA:
                continue
            e = r[a, 2] * abs(r[a, 3]) / math.sin(r[a, 1])
            on = 1.0 if (sg[a] != 0 and sg[a - 1] == -sg[a] and sg[a + 1] == -sg[a] and sg[a - 1] != 0) else 0.0
            out.append(on * max(0.0, 1.05 * W - e) / W)
        return np.array(out) * wreal

    def corner_block(self, cx, r, wreal):
        """edge turning > 12 deg over 0.15 W outside the roll regions (projected edges)"""
        (G_, E_), _ = cx
        W = self.W
        step = 0.05 * W
        u_lo, u_hi = float(self.u_ring(self.x_cur)[0]), float(self.u_ring(self.x_cur)[-1])
        n = 2400
        u = np.linspace(u_lo, u_hi, n)
        reg = self.roll_regions(r)
        flat = np.ones(n, bool)
        for a, b in reg:
            flat &= ~((u >= a - 0.1 * W) & (u <= b + 0.1 * W))
        out = []
        w = 3
        for v in (-W / 2, W / 2):
            P = AP.project_css(C.chain_surface(G_, r, u, np.full(n, v)))
            t = np.diff(P, axis=0)
            th = np.arctan2(t[:, 1], t[:, 0])
            dth = np.abs(np.angle(np.exp(1j * (th[w:] - th[:-w]))))
            m = flat[w:-1] & flat[:-1 - w]
            out.append(np.where(m, np.maximum(0.0, np.degrees(dth) - 12.0) / 12.0, 0.0))
        return np.concatenate(out) * wreal

    # ---- the objective
    def dparts(self, x, cfg, rmul):
        W = self.W
        self.x_cur = x
        act = self.gact
        cx = self.ctx(x, act)
        (G_, E_), r = cx
        ur = self.u_ring(x)
        n = self.N
        FL = C.chain_surface(G_, r, ur, np.full(n, -W / 2))
        FR = C.chain_surface(G_, r, ur, np.full(n, W / 2))
        Cc = (FL + FR) / 2
        out = {}
        if cfg.get('lm'):
            cen = AP.project(C.chain_surface(G_, r, ur[self.lm], np.zeros(len(self.lm))))
            out['lm'] = sl1(cen - self.lm_t, F_LM).ravel() * WT['lm']
        if cfg.get('width'):
            pw = np.hypot(*(AP.project(FR[self.lm]) - AP.project(FL[self.lm])).T)
            out['width'] = np.where(self.lm_wvis, sl1s(pw - self.lm_w, F_W), 0.0) * WT['width']
        if cfg.get('face'):
            Tq = Cc[1:] - Cc[:-1]
            Dq = ((FR - FL)[1:] + (FR - FL)[:-1]) / 2
            nn = np.cross(Tq, Dq)
            cc = (Cc[1:] + Cc[:-1]) / 2
            vh = self.cam - cc
            sh = (nn * vh).sum(1) / np.maximum(np.linalg.norm(nn, axis=1) * np.linalg.norm(vh, axis=1), 1e-12)
            out['face'] = np.maximum(0.0, self.fq_s * sh[self.fq_j] + 0.05) * WT['face']
        if cfg.get('depth'):
            z = Cc[:, 2]
            hi = np.full(n, self.zhi); hi[:self.tail_n] = self.zhi_tail
            out['depth'] = (np.maximum(0.0, z - hi) + np.maximum(0.0, self.zlo - z)) / W * WT['depth']
        if cfg.get('real'):
            rw = WT['real'] * rmul
            st = {}
            out['xing'] = self.xing_block(cx, st) * (rw / (SC * M.W_X))
            out['smooth'] = self.smooth_block(x, cx) * (rw / 20.0)
            out['ovm'] = self.ovm_block(r) * (rw / (SC * 20.0))
            out['order'] = np.maximum(0.0, 2.0 - np.diff(r[:, 0])) * SC * 5
            out['dip'] = self.dip_block(r, rw)
            out['corner'] = self.corner_block(cx, r, rw)
        if cfg.get('ou'):
            st = self.stinfo()
            ou, wv, _, _ = self.ou_blocks(x, st, cx)
            out['ou'] = ou * (WT['ou'] / (SC * C.W_OU)) / self.thk
        if cfg.get('end'):
            # tip inside the right leg footprint (px -> css), the 'behind' part is the right_leg > end_strand over/under rule
            ei = self.end_idx
            pe = np.concatenate([AP.project(FL[ei]), AP.project(FR[ei]), AP.project(Cc[ei])])
            li = self.leg_idx
            d = S.coverage_resid(FL[li], FR[li], pe, self.leg_cand, W, 'in')
            out['end'] = d / SC / self.thk * WT['end']
        if cfg.get('clr'):
            sub = self.cl_sub
            Ls, Rs = FL[sub], FR[sub]
            u = ur[sub]
            I, J = np.triu_indices(len(sub), 1)
            m = np.abs(u[I] - u[J]) > 1.5 * W
            I, J = I[m], J[m]
            d = S.segment_dist(Ls[I], Rs[I], Ls[J], Rs[J])
            dm = np.full(len(sub), 1e9)
            np.minimum.at(dm, I, d)
            np.minimum.at(dm, J, d)
            out['clr'] = np.maximum(0.0, 2 * self.thk - dm) / self.thk * WT['clr']
        return out

    def dres(self, x, cfg, rmul):
        return np.concatenate(list(self.dparts(x, cfg, rmul).values()))


def block_costs(parts):
    return {k: round(0.5 * float(v @ v), 2) for k, v in parts.items() if len(v)}


def run_lm(pr, x0, cfg, rmul, secs, label, tag=''):
    from scipy.optimize import least_squares
    free = pr.free_idx
    lo, hi = pr.lo, pr.hi
    xf = x0.copy()
    best = [np.inf, x0[free].copy()]
    t0 = time.time()
    cnt = [0]

    def f(z):
        xx = xf.copy(); xx[free] = z
        r = pr.dres(xx, cfg, rmul)
        c = 0.5 * float(r @ r)
        cnt[0] += 1
        if c < best[0]:
            best[0], best[1] = c, z.copy()
        if time.time() - t0 > secs:
            raise C.Timeout()
        return r
    z0 = np.clip(x0[free], lo[free] + 1e-9, hi[free] - 1e-9)
    status = 'ok'
    z, cost = z0, np.inf
    try:
        for rep_ in range(40):                      # restart LM until it stops improving (resets the trust region)
            r = least_squares(f, z0, method='trf', x_scale='jac', max_nfev=300, bounds=(lo[free], hi[free]), diff_step=1e-6, ftol=1e-12, xtol=1e-12, gtol=1e-12)
            prev = cost
            z, cost = r.x, float(r.cost)
            z0 = np.clip(z, lo[free] + 1e-9, hi[free] - 1e-9)
            if cost > prev * 0.995 and rep_ > 0:
                break
    except C.Timeout:
        z, cost, status = best[1], best[0], 'timeout'
    xo = x0.copy(); xo[free] = z
    note(f'[{label}] {status} cost {cost:.1f} evals {cnt[0]} ({time.time() - t0:.0f}s)', tag)
    return xo, cost, status


# ================================================================== seeds
def base_seed(pr):
    prA, secA, xa = pr.prA, pr.secA, pr.xa
    pr.bind(pr.gsec)
    x, cshift = G.build_seed(pr, prA, xa, secA)
    # fold 2 default (placed at ring 750)
    k = pr.k_f2
    x[6 + 4 * k:10 + 4 * k] = [pr.roll_tau0[k], np.pi / 2, 0.4 * pr.W, 0.0]
    x = np.clip(x, pr.lo + 1e-9, pr.hi - 1e-9)
    return x


def grown_seed(pr, x):
    """the stage-1 grown seed (global/seed.npz): non-A rolls/lambdas only"""
    p = os.path.join(ROOT, 'docs/ribbon/turns/global/seed.npz')
    if not os.path.exists(p):
        return None
    xg = np.load(p)['x'].copy()
    y = x.copy()
    free = pr.free_idx
    y[free] = xg[free]
    k = pr.k_f2
    y[6 + 4 * k:10 + 4 * k] = [pr.roll_tau0[k], np.pi / 2, 0.4 * pr.W, 0.0]
    return np.clip(y, pr.lo + 1e-9, pr.hi - 1e-9)


def flip_combo(pr, x, groups):
    y = x.copy()
    for g in groups:
        for nm in SIGN_GROUPS[g]:
            k = C.ROLLS_IDX[nm]
            o = 6 + 4 * k + 3
            if pr.kind[k] != 'bend' or nm == 'S bend':
                y[o] = -y[o]
    return y


def a_check(pr, x):
    pr.bind(pr.gsec)
    ksA = pr.ksA
    Lt, Rt = pr.ring_edges(x, sorted(ksA))
    LA, RA = M.sec_edges(pr.prA, pr.xa, pr.secA, np.arange(388, 659))
    return float(np.linalg.norm(Lt[388:659] - LA, axis=1).max())


# ================================================================== metrics + outputs
def ring_of_u(pr, x, u):
    return np.interp(u, pr.u_ring(x), np.arange(pr.N))


def compute_metrics(pr, x, extra):
    W = pr.W
    act = pr.gact
    pr.bind(pr.gsec)
    m = dict(extra)
    L, R = pr.ring_edges(x, act)
    Cc = (L + R) / 2
    cfgall = dict(lm=1, width=1, face=1, depth=1, real=1, ou=1, end=1, clr=1)
    parts = pr.dparts(x, cfgall, 1.0)
    m['block_costs'] = block_costs(parts)
    m['total_cost'] = float(0.5 * sum(float(v @ v) for v in parts.values()))
    # landmarks
    cen = AP.project(Cc[pr.lm])
    res = np.hypot(*(cen - pr.lm_t).T)
    m['landmarks'] = [dict(ring=int(r_), resid_px=float(d)) for r_, d in zip(pr.lm, res)]
    m['landmark_rms_px'] = float(np.sqrt(np.mean(res ** 2)))
    m['landmark_max_px'] = float(res.max())
    pw = np.hypot(*(AP.project(R[pr.lm]) - AP.project(L[pr.lm])).T)
    m['width_resid_px'] = [dict(ring=int(r_), model=float(a), trace=float(b), vis=bool(v)) for r_, a, b, v in zip(pr.lm, pw, pr.lm_w, pr.lm_wvis)]
    # faces: owner's rules, + the trace's own face check
    Tq = Cc[1:] - Cc[:-1]
    Dq = ((R - L)[1:] + (R - L)[:-1]) / 2
    nn = np.cross(Tq, Dq)
    s_ = (nn * (pr.cam - (Cc[1:] + Cc[:-1]) / 2)).sum(1)
    face = np.where(s_ < 0, 1.0, -1.0)
    j = pr.fq_j
    ag = face[j] == pr.fq_s
    m['face_rules'] = dict(checked=int(len(j)), agree=int(ag.sum()), frac=float(ag.mean()))
    segs = {'tail': (0, 131), 'sweep': (226, 288), 'left_leg': (388, 483), 'right_leg': (555, 658), 'bottomK_outer': (659, 704), 'bottomK_inner': (716, 732),
            'k_return': (765, 813), 'crossbar': (859, 910), 'return_middle': (1067, 1101), 'topK_front': (1102, 1176), 'topK_back': (1196, 1230), 'end': (1231, 1298)}
    fr = {}
    for nm, (a, b) in segs.items():
        sel = (j >= a) & (j <= b)
        fr[nm] = dict(n=int(sel.sum()), agree=int(ag[sel].sum()))
    m['face_rules_by_part'] = fr
    st = pr.stage_info(act, 0, pr.N - 1)
    m['face_trace_check'] = C.face_stat(pr, x, st)
    # over/under (dense z-buffer, full-resolution state) and clearance
    m['over_under_dense'] = C.ou_stat(pr, x, st)
    PL, PR = pr.ring_edges(x, act)
    m['min_clearance_css'] = float(C.clearance_min(pr, PL, PR, W))
    m['two_thk_css'] = float(2 * pr.thk)
    # end hidden
    ei = pr.end_idx
    pe = np.concatenate([AP.project(L[ei]), AP.project(R[ei]), AP.project(Cc[ei])])
    d = S.coverage_resid(L[pr.leg_idx], R[pr.leg_idx], pe, pr.leg_cand, W, 'in')
    m['end_tip_outside_right_leg_px'] = dict(max=float(d.max()), n_outside=int((d > 0).sum()), of=int(len(d)))
    # depth range
    z = Cc[:, 2]
    m['depth_range'] = dict(z_min=float(z.min()), z_max=float(z.max()), A_z_min=float(pr.zA.min()), A_z_max=float(pr.zA.max()), allowed_lo=pr.zlo, allowed_hi=pr.zhi,
                            allowed_hi_tail=pr.zhi_tail, tail_z_max=float(z[:pr.tail_n].max()), non_tail_z_max=float(z[pr.tail_n:].max()),
                            violations=int(((z < pr.zlo) | (z > np.where(np.arange(pr.N) < pr.tail_n, pr.zhi_tail, pr.zhi))).sum()))
    # realism per window + ALL
    full_rep, _ = M.realism(pr, pr.gsec, x, outline=False)
    rows = {'ALL': {k: v for k, v in full_rep.items() if k != 'outline'}}
    for nm, s in G.window_secs(pr).items():
        pr.bind(pr.gsec)
        rep, _ = M.realism(pr, s, x)
        rep = dict(rep)
        rep['roll_overlap_min_gap'] = full_rep['roll_overlap_min_gap']
        rep['min_fold_rho_over_W'] = full_rep['min_fold_rho_over_W']
        fails = [f for f in rep['fails'] if f not in ('roll-overlap', 'rho<0.3W')]
        if rep['roll_overlap_min_gap'] is not None and rep['roll_overlap_min_gap'] < 0:
            fails.append('roll-overlap(global)')
        rep['fails'] = fails
        rows[nm] = rep
    m['realism'] = rows
    rna, nfails = realism_nonA(pr, x)
    m['realism_nonA'] = rna
    m['realism_nonA_fails'] = nfails
    r = pr.rolls(x)[act]
    folds = [(pr.rname[k], float(r[i, 2] / W)) for i, k in enumerate(act) if pr.kind[k] in ('fold', 'obl')]
    bends = [(pr.rname[k], float(r[i, 2] / W)) for i, k in enumerate(act) if pr.kind[k] == 'bend' and k not in pr.ksA]
    m['min_fold_rho_over_W'] = float(min(v for _, v in folds))
    m['min_nonA_bend_rho_over_W'] = float(min(v for _, v in bends))
    m['rolls'] = [dict(name=pr.rname[k], kind=pr.kind[k], ring=float(ring_of_u(pr, x, r[i, 0])), beta_deg=float(np.degrees(r[i, 1])), rho_css=float(r[i, 2]),
                       rho_over_W=float(r[i, 2] / W), phi_deg=float(np.degrees(r[i, 3]))) for i, k in enumerate(act)]
    m['lambda'] = {str(pr.int_names[jj]): float(pr.lam(x)[jj]) for jj in range(NI)}
    m['A_frozen_max_dL_css'] = a_check(pr, x)
    m['realism_fail_count_ALL'] = int(sum(len(v['fails']) for v in rows.values()))
    return m


def realism_nonA(pr, x):
    """realism of the free part only: rings 0..388 and 658..end (A's own frozen crossings/dips are not ours to fix)"""
    out = {}
    fails = set()
    for nm, (r0, r1) in {'nonA_head': (0, 388), 'nonA_tail': (658, pr.N - 1)}.items():
        s = copy.copy(pr.gsec)
        s.name = nm; s.ivs = []
        s.r0, s.r1 = r0, r1
        s.tau_in, s.tau_out = float(pr.tau[r0]), float(pr.tau[r1])
        pr.bind(pr.gsec)
        rep, _ = M.realism(pr, s, x, outline=False)
        rep = {k: v for k, v in rep.items() if k != 'outline'}
        rep['fails'] = [f for f in rep['fails'] if f not in ('rho<0.3W', 'roll-overlap')]
        out[nm] = rep
        fails |= set(rep['fails'])
    pr.bind(pr.gsec)
    r = pr.rolls(x)[pr.gact]
    W = pr.W
    gaps = []
    for a in range(len(r) - 1):
        if pr.gact[a] in pr.ksA and pr.gact[a + 1] in pr.ksA:
            continue
        u0, b0, r0, p0 = r[a]; u1, b1, r1, p1 = r[a + 1]
        for v in (-W / 2, W / 2):
            gaps.append((u1 + v / np.tan(b1)) - (u0 + v / np.tan(b0) + r0 * abs(p0) / np.sin(b0)))
    out['roll_gap_nonA_min'] = float(min(gaps))
    if min(gaps) < 0:
        fails.add('roll-overlap')
    return out, sorted(fails)


# ---------------------------------------------------------------- ortho shaded render
def ortho_lit(L, R, view, size=900):
    import chain_sheets as CS
    nv = 9
    ts = np.linspace(0, 1, nv)
    Gp = L[:, None, :] + ts[None, :, None] * (R - L)[:, None, :]
    P = Gp.reshape(-1, 3)
    if view == 'side':           # from +x, up = +y; screen x = -z, y = -y ; toward-viewer = +x
        sx_, sy_, dz, vd0 = -P[:, 2], -P[:, 1], P[:, 0], np.array([1.0, 0, 0])
    else:                         # from +y looking down: screen x = x, screen y = z, toward-viewer = +y
        sx_, sy_, dz, vd0 = P[:, 0], P[:, 2], P[:, 1], np.array([0, 1.0, 0])
    x0, x1, y0, y1 = sx_.min() - 20, sx_.max() + 20, sy_.min() - 20, sy_.max() + 20
    sc = min(size / (x1 - x0), size / (y1 - y0))
    w, h = int((x1 - x0) * sc) + 1, int((y1 - y0) * sc) + 1
    sx = ((sx_ - x0) * sc).reshape(len(L), nv); sy = ((sy_ - y0) * sc).reshape(len(L), nv); dzr = dz.reshape(len(L), nv)
    img = np.zeros((h, w, 3)); img[:] = CS.BG
    zb = np.full((h, w), -np.inf)
    key = M.KEY
    for i in range(len(L) - 1):
        for j in range(nv - 1):
            q = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]
            p3 = np.array([Gp[a, b] for a, b in q])
            Pu = (p3[1] + p3[2]) / 2 - (p3[0] + p3[3]) / 2
            Pv = (p3[3] + p3[2]) / 2 - (p3[0] + p3[1]) / 2
            n = np.cross(Pu, Pv); nn = np.linalg.norm(n)
            if nn < 1e-12:
                continue
            n /= nn
            d = float(n @ vd0)
            # face A / B as seen from the SITE camera (so the colour identifies the paper face, not the view)
            vc = np.array([0, 0, AP.D]) - p3.mean(0); vc /= np.linalg.norm(vc)
            isA = float(n @ vc) < 0
            nf = n if d > 0 else -n
            hv = key + vd0; hv /= np.linalg.norm(hv)
            shade = 0.12 + 0.75 * max(0.0, float(nf @ key)) + 0.25 * max(0.0, float(nf @ vd0))
            spec = 0.25 * max(0.0, float(nf @ hv)) ** 40
            col = (CS.COL_A if isA else CS.COL_B) * shade + 255.0 * spec
            for tri in ((0, 1, 2), (0, 2, 3)):
                X = np.array([sx[q[t]] for t in tri]); Y = np.array([sy[q[t]] for t in tri]); Z = np.array([dzr[q[t]] for t in tri])
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
                mk = (l0 >= -1e-9) & (l1 >= -1e-9) & (l2 >= -1e-9)
                if not mk.any():
                    continue
                z = l0 * Z[0] + l1 * Z[1] + l2 * Z[2]
                sub = zb[ymin:ymax + 1, xmin:xmax + 1]
                upd = mk & (z > sub)
                sub[upd] = z[upd]
                img[ymin:ymax + 1, xmin:xmax + 1][upd] = col
    return Image.fromarray(img.clip(0, 255).astype(np.uint8))


def render_outputs(pr, x, m):
    import chain_sheets as CS
    pr.bind(pr.gsec)
    pc = M.sec_rulings(pr, x, pr.gsec)
    M.overlay_png(os.path.join(OUTD, 'overlay.png'), [pc])
    M.shaded_png(pr, pc, os.path.join(OUTD, 'shaded_camera.png'))
    L, R = pc['L'], pc['R']
    mstep = max(1, len(L) // 500)
    for v in ('side', 'top'):
        im = ortho_lit(L[::mstep], R[::mstep], v)
        d = ImageDraw.Draw(im)
        d.text((6, 6), f'orthographic from the {"right (+x)" if v == "side" else "above (+y)"}; face A dark / B orange (by the site camera); key light from above', fill=(255, 255, 255))
        im.save(os.path.join(OUTD, f'shaded_{v}.png'))
    note('overlay.png, shaded_camera.png, shaded_side.png, shaded_top.png written')
    rows = m['realism']
    for wn, box in M.WIN_BOXES.items():
        ow = {'scurve': 's'}.get(wn, wn)
        rep = rows.get(ow)
        if rep:
            ol = rep['outline'].get(ow)
            hdr = (f'{wn}  crossings {rep["crossings"]} sep {rep["sep_violations"]} min fold rho/W {m["min_fold_rho_over_W"]:.2f} kinks {rep["curv_oscillations"]}+{rep["corners"]} '
                   f'dips {rep["dips"]}  fails {rep["fails"]}')
        else:
            hdr = f'{wn} (no turn window interval)'
        S3 = 3
        mk = CS.mockup_crop(box).resize(((box[2] - box[0]) * S3, (box[3] - box[1]) * S3), Image.LANCZOS)
        ov = M.overlay_png(None, [pc], box=box, scale=S3, ret=True)
        ms = max(1, len(L) // 1600)
        sh = M.offline_lit(L[::ms], R[::ms], box, S3)
        sheet = Image.new('RGB', (mk.width * 3 + 20, mk.height + 26), (10, 10, 10))
        for i, im_ in enumerate((mk, ov, sh)):
            sheet.paste(im_.convert('RGB'), (i * (mk.width + 10), 26))
        ImageDraw.Draw(sheet).text((6, 7), hdr, fill=(255, 255, 255))
        sheet.save(os.path.join(OUTD, f'zoom_{wn}.png'))
    note('zoom sheets written')


# ================================================================== driver
def cmd_seeds(pr):
    x = base_seed(pr)
    note(f'A check on the base seed: max |dL| = {a_check(pr, x):.5f} css')
    cfg = PASSES[0][1]
    xg = grown_seed(pr, x)
    cands = {'raw': x}
    if xg is not None:
        cands['grown'] = xg
    costs = {}
    for k, v in cands.items():
        costs[k] = 0.5 * float(np.sum(pr.dres(v, cfg, 1.0) ** 2))
    note('base seed pass-1 costs: ' + json.dumps({k: round(v, 0) for k, v in costs.items()}))
    base = min(costs, key=costs.get)
    xb = cands[base]
    note(f'base seed = {base}')
    # presearch: 32 sign combos
    names = list(SIGN_GROUPS)
    rows = []
    for mask in range(32):
        gs = [n for i, n in enumerate(names) if mask >> i & 1]
        y = flip_combo(pr, xb, gs)
        c = 0.5 * float(np.sum(pr.dres(y, cfg, 1.0) ** 2))
        rows.append((c, gs))
    rows.sort(key=lambda t: t[0])
    note('sign-combo presearch (pass-1 cost, no fit), best 8: ' + json.dumps([(round(c), g) for c, g in rows[:8]]))
    starts = [g for c, g in rows[:4]]
    np.savez(os.path.join(OUTD, 'base_seed.npz'), x=xb)
    json.dump(dict(base=base, costs=costs, starts=starts, presearch=[(c, g) for c, g in rows]), open(os.path.join(OUTD, 'starts.json'), 'w'), indent=1)


def cmd_run(pr, i):
    tag = f' s{i}'
    sj = json.load(open(os.path.join(OUTD, 'starts.json')))
    groups = sj['starts'][i]
    xb = np.load(os.path.join(OUTD, 'base_seed.npz'))['x']
    x = flip_combo(pr, xb, groups)
    note(f'start {i}: flip groups {groups}; A check {a_check(pr, x):.5f}', tag)
    passes = []
    for (label, cfg, rmul) in PASSES:
        c0 = 0.5 * float(np.sum(pr.dres(x, cfg, rmul) ** 2))
        t0 = time.time()
        x, cost, status = run_lm(pr, x, cfg, rmul, PASS_SECS, f's{i} {label}', tag)
        passes.append(dict(label=label, status=status, cost0=c0, cost=cost, seconds=time.time() - t0))
        note(f'{label}: {status} cost {c0:.0f} -> {cost:.0f}', tag)
        np.savez(os.path.join(OUTD, f'start_{i}_p{len(passes)}.npz'), x=x)
    # final score
    ac = a_check(pr, x)
    pr.bind(pr.gsec)
    rep, _ = M.realism(pr, pr.gsec, x, outline=False)
    rna, nfails = realism_nonA(pr, x)
    rep['fails_nonA'] = nfails
    parts = pr.dparts(x, dict(lm=1, width=1, face=1, depth=1, real=1, ou=1, end=1, clr=1), 1.0)
    tot = 0.5 * sum(float(v @ v) for v in parts.values())
    res = dict(start=i, groups=groups, passes=passes, total_cost=tot, realism_fails=nfails, realism_fails_ALL=rep['fails'], A_max_dL=ac, blocks=block_costs(parts))
    np.savez(os.path.join(OUTD, f'start_{i}.npz'), x=x)
    json.dump(res, open(os.path.join(OUTD, f'start_{i}.json'), 'w'), indent=1, default=float)
    note(f'start {i} done: total cost {tot:.0f}, non-A realism fails {nfails}, A dL {ac:.5f}', tag)


def score_start(pr, i):
    p = os.path.join(OUTD, f'start_{i}.json')
    r = json.load(open(p))
    x = np.load(os.path.join(OUTD, f'start_{i}.npz'))['x']
    pr.bind(pr.gsec)
    rna, nfails = realism_nonA(pr, x)
    parts = pr.dparts(x, dict(lm=1, width=1, face=1, depth=1, real=1, ou=1, end=1, clr=1), 1.0)
    r['realism_fails'] = nfails
    r['total_cost'] = 0.5 * sum(float(v @ v) for v in parts.values())
    r['blocks'] = block_costs(parts)
    return r


def cmd_finish(pr):
    res = []
    for i in range(4):
        p = os.path.join(OUTD, f'start_{i}.json')
        if os.path.exists(p):
            res.append(score_start(pr, i))
    assert res, 'no start results'
    ok = [r for r in res if not r['realism_fails']]
    pool = ok if ok else sorted(res, key=lambda r: (len(r['realism_fails']), r['total_cost']))[:1]
    best = min(pool, key=lambda r: r['total_cost']) if ok else pool[0]
    note(f'multi-start table: ' + json.dumps([(r['start'], r['groups'], round(r['total_cost']), r['realism_fails']) for r in res]))
    note(f'best start {best["start"]} (realism-clean starts: {len(ok)})')
    x = np.load(os.path.join(OUTD, f'start_{best["start"]}.npz'))['x']
    m = compute_metrics(pr, x, dict(multistart=res, best_start=best['start'], realism_clean_starts=len(ok)))
    assert m['A_frozen_max_dL_css'] < 0.01, m['A_frozen_max_dL_css']
    json.dump(m, open(os.path.join(OUTD, 'metrics.json'), 'w'), indent=1, default=float)
    note('metrics.json written')
    render_outputs(pr, x, m)
    np.savez(os.path.join(OUTD, 'solution.npz'), x=x, gact=np.array(pr.gact), rnames=np.array(pr.rname), landmarks=pr.lm)
    note('solution.npz written')


def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'seeds'
    pr = DPrb()
    pr.bind(pr.gsec)
    if cmd == 'seeds':
        cmd_seeds(pr)
    elif cmd == 'run':
        cmd_run(pr, int(sys.argv[2]))
    elif cmd == 'finish':
        cmd_finish(pr)


if __name__ == '__main__':
    main()
