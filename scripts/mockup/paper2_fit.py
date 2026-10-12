#!/usr/bin/env python3
"""Paper model refit (paper2): K = 5 rolls (2 left-leg bends, apex fold, 2 right-leg bends), per-run arc-length scale lambda, depth pin.

x = [rotvec(3), t(3)] + 5 * [u, beta, rho, phi] + [lam_run0, lam_run1]
Ring flat positions: u_i = lam_run(i) * (i - m) * H  (s0 omitted: redundant with the roll positions u_k).
Runs = rings visible on at least one edge, split at the rings invisible on both edges: run 0 = rings 0..91, run 1 = rings 92..N-1.
Usage: paper2_fit.py fit | report
"""
import json, math, os, sys, time
import numpy as np
from PIL import Image
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import paper_fit as PF   # noqa: E402
import paper as PM       # noqa: E402
import ak_apex as AA     # noqa: E402
import ak_problem as AP  # noqa: E402
import solve3d as S      # noqa: E402
import emit_pose as EP   # noqa: E402

K = 5
APEX = 2
NRUN = 2
OUT = os.path.join(AP.ROOT, 'docs/ribbon/turns/paper2')
os.makedirs(OUT, exist_ok=True)
SC = AA.SC
W_Z = 0.05
LAM_LO, LAM_HI = 0.85, 1.15
NX = 6 + 4 * K + NRUN


def lam_of(x):
    return x[6 + 4 * K:]


def bounds(W):
    lo = np.full(NX, -np.inf); hi = np.full(NX, np.inf)
    for k in range(K):
        o = 6 + 4 * k
        lo[o + 1], hi[o + 1] = PM.BETA_LO, PM.BETA_HI
        if k == APEX:
            lo[o + 2], hi[o + 2] = 0.1 * W, 3.0 * W
            lo[o + 3], hi[o + 3] = -np.pi - 0.3, np.pi + 0.3
        else:
            lo[o + 2], hi[o + 2] = 0.5 * W, 6.0 * W
            lo[o + 3], hi[o + 3] = -0.6, 0.6
    lo[6 + 4 * K:], hi[6 + 4 * K:] = LAM_LO, LAM_HI
    return lo, hi


class Problem:
    def __init__(self, c):
        self.c = c
        self.W, self.H, self.m, self.N = c['W'], c['H'], c['m'], c['N']
        self.ring = (np.arange(self.N) - self.m) * self.H
        vis = c['vis1'] | c['vis2']
        # runs: first ring of run 1 = first ring after the longest both-invisible gap
        bad = ~(c['v1'] | c['v2'])
        gaps = np.where(bad)[0]
        # split at the single both-invisible block
        assert (np.diff(gaps) == 1).all(), 'more than one invisible block'
        self.run = (np.arange(self.N) > gaps[-1]).astype(int)
        wi = c['wi']
        self.out_mask1 = c['v1'].copy(); self.out_mask1[wi] = False
        self.out_mask2 = c['v2'].copy(); self.out_mask2[wi] = False
        r0, r1 = AA.fit_range(c)
        self.idx = np.arange(r0, r1 + 1)
        n = len(self.idx)
        self.sd1 = c['sd1'].restricted(wi[0], wi[-1], 1.0)
        self.sd2 = c['sd2'].restricted(wi[0], wi[-1], 1.0)
        self.cin = np.tile(np.arange(n - 1), (len(c['cov_in']), 1))
        self.cout = np.tile(np.arange(n - 1), (len(c['cov_out']), 1))
        self.vs = np.linspace(-self.W / 2, self.W / 2, PF.NV_COV)
        self.vl = np.linspace(-self.W / 2, self.W / 2, PF.NVL)
        self.sq = math.sqrt(PF.W_COV)
        self.obs1, self.obs2 = c['e1'], c['e2']
        self.thk = c['thk']

    def u_all(self, x):
        return lam_of(x)[self.run] * self.ring

    def dense_cov(self, x, pts, cand, kind):
        uf = self.u_all(x)[self.idx]
        n = len(uf)
        G = np.stack([PM.surface(x, uf, np.full(n, v), K) for v in self.vs])
        r = np.stack([S.coverage_resid(G[k], G[k + 1], pts, cand, self.W, kind) for k in range(PF.NV_COV - 1)])
        if kind == 'in':
            return r.min(0)
        rp = np.where(r > 0, r, np.inf).min(0)
        return np.where(np.isfinite(rp), rp, 0.0)

    def groups(self, x, U, V):
        _, _, rolls = PM.unpack(x, K)
        q0, a, ap, sg, L = PM.roll_frame(*rolls[APEX])
        Xp = (np.stack([U, V], 1) - q0) @ ap
        grp = np.full(len(U), -1)
        grp[Xp <= 0] = 0
        grp[Xp >= L] = 1
        return grp

    def layer(self, x):
        uf = self.u_all(x)[self.idx]
        U, V = np.meshgrid(uf, self.vl, indexing='ij')
        pts = PM.surface(x, U.ravel(), V.ravel(), K)
        grp = self.groups(x, U.ravel(), V.ravel())
        ok = grp >= 0
        p2 = AP.project(pts[ok]); z = pts[ok, 2]; g = grp[ok]
        key = np.floor(p2 / PF.LAYER_CELL).astype(np.int64)
        ids = key[:, 0] * 100000 + key[:, 1]
        uniq, inv = np.unique(ids, return_inverse=True)
        zm = np.full((len(uniq), 2), -np.inf)
        np.maximum.at(zm, (inv, g), z)
        both = np.isfinite(zm).all(1)
        gap = zm[both, 1] - zm[both, 0]
        r = np.maximum(0.0, 2 * self.thk - gap) * SC * PF.W_LAYER
        out = np.zeros(PF.LAYER_PAD)
        out[:min(len(r), PF.LAYER_PAD)] = r[:PF.LAYER_PAD]
        return out

    def parts(self, x):
        ua = self.u_all(x)
        PL, PR = PM.edges(x, ua, self.W, K)
        p1, p2 = AP.project(PL), AP.project(PR)
        d1 = (p1 - self.obs1)[self.out_mask1].ravel()
        d2 = (p2 - self.obs2)[self.out_mask2].ravel()
        s1, a1 = self.sd1.resid(PL)
        s2, a2 = self.sd2.resid(PR)
        ci = self.dense_cov(x, self.c['cov_in'], self.cin, 'in') * self.sq
        co = self.dense_cov(x, self.c['cov_out'], self.cout, 'out') * self.sq
        ov = np.maximum(0.0, -PM.overlap_gaps(x, self.W, K)) * SC * PF.W_OVL
        zsec = float(np.mean(np.concatenate([PL[:, 2], PR[:, 2]])))
        return dict(pt_out=np.concatenate([d1, d2]), slide=np.concatenate([s1, s2]), anchor=np.concatenate([a1, a2]), cov_in=ci,
                    cov_out=co, layer=self.layer(x), overlap=ov, zpin=np.array([W_Z * zsec]))

    def res(self, x):
        return np.concatenate(list(self.parts(x).values()))

    def front(self, x):
        uf = self.u_all(x)[self.idx]
        U, V = np.meshgrid(np.arange(uf[0] - 20, uf[-1] + 20, 0.6), self.vl, indexing='ij')
        pts = PM.surface(x, U.ravel(), V.ravel(), K)
        return AA.front_fraction(pts, self.groups(x, U.ravel(), V.ravel()))


def build_x(c, prev, apex_rho_over_W=None, apex_phi=None, grid=None, zf=None):
    """5-roll x. Pose + apex from `prev` (a 3-roll paper solution x) unless `grid=(phi, rf)` (then the old init_params apex + Kabsch pose)."""
    W, H, m, N = c['W'], c['H'], c['m'], c['N']
    u_all = (np.arange(N) - m) * H
    if grid is None:
        apex = prev[6 + 4:6 + 8].copy()
    else:
        b_ax, _, _ = AA.beta_axis(c)
        wi = c['wi']
        apex = np.array([float((wi.mean() - m) * H), b_ax % np.pi, grid[1] * W, grid[0]])
    if apex_rho_over_W is not None:
        apex[2] = apex_rho_over_W * W
    ua = float(apex[0])
    a_lo = ua - 0.0
    left = [u_all[0] + f * (ua - 40.0 - u_all[0]) for f in (0.35, 0.7)]
    right = [ua + 60.0 + f * (u_all[-1] - ua - 60.0) for f in (0.3, 0.65)]
    bend = lambda u: [u, np.pi / 2, 3 * W, 0.0]
    rolls = np.array([bend(left[0]), bend(left[1]), apex, bend(right[0]), bend(right[1])])
    x = np.concatenate([np.zeros(6), rolls.ravel(), np.ones(NRUN)])
    if grid is None:
        x[:6] = prev[:6]
    else:
        L, R = PM.edges(x, u_all, W, K)
        L0, R0 = AP.backproject(c['e1'], zf), AP.backproject(c['e2'], zf)
        Rm, tt = AA.kabsch(np.concatenate([L, R]), np.concatenate([L0, R0]))
        x[:3] = Rotation.from_matrix(Rm).as_rotvec(); x[3:6] = tt
    return x


def fit():
    t0 = time.time()
    c = AA.setup()
    AA.W_GLOBAL[0] = c['W']
    pr = Problem(c)
    W, N, wi = c['W'], c['N'], c['wi']
    prev = np.array(json.load(open(os.path.join(AP.ROOT, 'docs/ribbon/turns/paper/fit.json')))['starts'][
        json.load(open(os.path.join(AP.ROOT, 'docs/ribbon/turns/paper/fit.json')))['selected_index']]['x'])
    zf = np.interp(np.arange(N), [wi[0], wi[-1]], [-20.0, 20.0])
    lo, hi = bounds(W)
    print(f'section N {N} runs {np.bincount(pr.run)} W {W:.3f} H {c["H"]:.3f} nx {NX}', flush=True)
    specs = [('prev', dict())]
    for phi in (np.pi, -np.pi):
        for rf in (0.12, 0.2, 0.3):
            specs.append((f'grid phi {np.degrees(phi):+.0f} rho {rf}W', dict(grid=(phi, rf), zf=zf)))
    for rf in (0.3, 0.5, 0.8):
        specs.append((f'prev-apex rho0 {rf}W', dict(apex_rho_over_W=rf)))
    starts = []
    for name, kw in specs:
        x0 = np.clip(build_x(c, prev, **kw), lo + 1e-9, hi - 1e-9)
        t1 = time.time()
        r = least_squares(pr.res, x0, method='trf', x_scale='jac', max_nfev=3000, bounds=(lo, hi), diff_step=1e-6)
        pt = pr.parts(r.x)
        ff = pr.front(r.x)
        st = dict(name=name, cost=float(r.cost), nfev=int(r.nfev), status=int(r.status), blocks={k: float(0.5 * np.sum(v ** 2)) for k, v in pt.items()},
                  front=ff, right_front=bool(ff['frac_post_in_front'] > 0.5), x=r.x.tolist(), x0=x0.tolist(), secs=time.time() - t1,
                  overlap_min_gap=float(PM.overlap_gaps(r.x, W, K).min()))
        starts.append(st)
        print(f'  {name:28s} cost {st["cost"]:10.2f} nfev {st["nfev"]} status {st["status"]} front {ff["frac_post_in_front"]:.3f} ({ff["n_cells"]}) '
              f'rho_apex {r.x[6 + 4 * APEX + 2]:.2f} phi_apex {np.degrees(r.x[6 + 4 * APEX + 3]):.1f} lam {np.round(lam_of(r.x), 3)} ({st["secs"]:.0f}s)', flush=True)
        print('      blocks', {k: round(v, 2) for k, v in st['blocks'].items()}, flush=True)
        json.dump(dict(starts=starts, partial=True), open(os.path.join(OUT, 'fit.json'), 'w'), indent=1, default=float)
    ok = [q for q in starts if q['right_front']]
    pool = ok if ok else sorted(starts, key=lambda q: -q['front']['frac_post_in_front'])[:1]
    sel = min(pool, key=lambda q: q['cost'])
    json.dump(dict(starts=starts, selected_index=starts.index(sel), n_right_front=len(ok), seconds=time.time() - t0), open(os.path.join(OUT, 'fit.json'), 'w'), indent=1, default=float)
    print('selected', starts.index(sel), sel['name'], 'cost', sel['cost'], 'n_right_front', len(ok), 'secs', time.time() - t0, flush=True)


def refined_u(c, x, pr):
    """emission rings: the fitted ring positions outside the roll spans, uniform refinement inside (as paper_fit.refined_u)."""
    W, H = c['W'], c['H']
    u_ring = pr.u_all(x)
    spans = [(lo, hi, arc) for lo, hi, arc in PM.roll_span_u(x, W, K) if arc > 1e-3]
    keep = np.ones(len(u_ring), bool)
    pieces = []
    for lo, hi, arc in spans:
        keep &= ~((u_ring > lo) & (u_ring < hi))
        n = max(24, int(np.ceil((hi - lo) / H)))
        pieces.append(np.linspace(lo, hi, n + 1))
    u = np.unique(np.round(np.concatenate([u_ring[keep]] + pieces), 9))
    u = u[(u >= u_ring[0] - 1e-9) & (u <= u_ring[-1] + 1e-9)]
    return u, spans


def report():
    c = AA.setup()
    AA.W_GLOBAL[0] = c['W']
    pr = Problem(c)
    fj = json.load(open(os.path.join(OUT, 'fit.json')))
    sel = fj['starts'][fj['selected_index']]
    x = np.array(sel['x'])
    W, N = c['W'], c['N']
    names = ['left bend 1', 'left bend 2', 'apex fold', 'right bend 1', 'right bend 2']
    _, _, rolls = PM.unpack(x, K)
    table = [dict(roll=n, u_css=float(u), beta_deg=float(np.degrees(b)), rho_css=float(r), rho_over_W=float(r / W), phi_deg=float(np.degrees(p)), arc_css=float(r * abs(p)))
             for n, (u, b, r, p) in zip(names, rolls)]
    u_all = pr.u_all(x)
    L, R = PM.edges(x, u_all, W, K)
    M = dict(reproj=AA.reproj_metrics(c, L, R), face=AA.face_metrics(c, L, R))
    M['silhouette_rings'], _ = AA.sil_metrics(c, L, R)
    M['right_leg_in_front_dense'] = pr.front(x)
    M['z_range_rings'] = [float(min(L[:, 2].min(), R[:, 2].min())), float(max(L[:, 2].max(), R[:, 2].max()))]
    M['z_mean_rings'] = float(np.mean(np.concatenate([L[:, 2], R[:, 2]])))
    M['lambda_runs'] = lam_of(x).tolist()
    M['run_sizes'] = np.bincount(pr.run).tolist()
    M['overlap_gaps_css'] = PM.overlap_gaps(x, W, K).tolist()
    M['cost_blocks'] = {k: float(0.5 * np.sum(v ** 2)) for k, v in pr.parts(x).items()}
    ur, spans = refined_u(c, x, pr)
    Lr, Rr = PM.edges(x, ur, W, K)
    M['silhouette_refined'], ren = AA.sil_metrics(c, Lr, Rr)
    M['z_range_refined'] = [float(min(Lr[:, 2].min(), Rr[:, 2].min())), float(max(Lr[:, 2].max(), Rr[:, 2].max()))]
    M['n_rings_emitted'] = int(len(ur))
    M['apex_rho_css'] = float(rolls[APEX, 2]); M['apex_rho_over_W'] = float(rolls[APEX, 2] / W); M['apex_phi_deg'] = float(np.degrees(rolls[APEX, 3]))
    M['isometry_fitted'] = PM.isometry_test(x, W, (u_all.min(), u_all.max()), K=K)
    M['params'] = dict(table=table, pose=dict(rotvec=x[:3].tolist(), t=x[3:6].tolist()), W_css=W, H_css=c['H'], N=N)
    M['starts'] = [dict(name=s['name'], cost=s['cost'], nfev=s['nfev'], status=s['status'], right_front_frac=s['front']['frac_post_in_front'], right_front=s['right_front'],
                        rho_apex=s['x'][6 + 4 * APEX + 2], phi_apex_deg=float(np.degrees(s['x'][6 + 4 * APEX + 3])), lam=s['x'][6 + 4 * K:], blocks=s['blocks']) for s in fj['starts']]
    M['selected_index'] = fj['selected_index']
    json.dump(M, open(os.path.join(OUT, 'metrics.json'), 'w'), indent=2, default=float)
    cand = EP.emit(Lr, Rr, 'phone', os.path.join(OUT, 'apex_candidate.json'))
    Image.fromarray((ren * 255).astype(np.uint8)).save(os.path.join(OUT, 'sil_render.png'))
    np.savez(os.path.join(OUT, 'solution.npz'), x=x, u_rings=u_all, L=L, R=R, u_refined=ur, Lr=Lr, Rr=Rr)
    print(json.dumps({k: v for k, v in M.items() if k != 'starts'}, indent=1, default=float))
    print('emitted', cand)


if __name__ == '__main__':
    {'fit': fit, 'report': report}[sys.argv[1]]()
