#!/usr/bin/env python3
"""Fit the paper model (paper.py, K = 3 rolls + pose) to the real-AK apex section (same section / data as ak_apex.py).

Usage: paper_fit.py fit | report
"""
import json, math, os, sys, time
import numpy as np
from PIL import Image
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ak_apex as AA        # noqa: E402  (installs the AK camera into solve3d/solve3d_fast)
import ak_problem as AP     # noqa: E402
import solve3d as S         # noqa: E402
import emit_pose as EP      # noqa: E402
import paper as PM          # noqa: E402

K = 3
OUT = os.path.join(AP.ROOT, 'docs/ribbon/turns/paper')
os.makedirs(OUT, exist_ok=True)
SC = AA.SC
NV_COV = AA.NV_COV
W_COV = AA.W_COV
W_OVL = 1.0          # overlap hinge: px per css of overlap (x SC)
W_LAYER = 0.1        # layer-order hinge: px-scaled css shortfall per cell
LAYER_CELL = 2.0
NVL = 21
LAYER_PAD = 1500


def bounds():
    lo = np.full(6 + 4 * K, -np.inf); hi = np.full(6 + 4 * K, np.inf)
    for k in range(K):
        o = 6 + 4 * k
        lo[o + 1], hi[o + 1] = PM.BETA_LO, PM.BETA_HI
        lo[o + 3], hi[o + 3] = -np.pi - 0.3, np.pi + 0.3
        # rho bounds set with W below
    return lo, hi


class Problem:
    def __init__(self, c):
        self.c = c
        self.W, self.H, self.m, self.N = c['W'], c['H'], c['m'], c['N']
        self.u_all = (np.arange(self.N) - self.m) * self.H
        wi = c['wi']
        self.out_mask1 = c['v1'].copy(); self.out_mask1[wi] = False
        self.out_mask2 = c['v2'].copy(); self.out_mask2[wi] = False
        r0, r1 = AA.fit_range(c)
        self.idx = np.arange(r0, r1 + 1)
        n = len(self.idx)
        self.u_fit = self.u_all[self.idx]
        self.sd1 = c['sd1'].restricted(wi[0], wi[-1], 1.0)
        self.sd2 = c['sd2'].restricted(wi[0], wi[-1], 1.0)
        self.cin = np.tile(np.arange(n - 1), (len(c['cov_in']), 1))
        self.cout = np.tile(np.arange(n - 1), (len(c['cov_out']), 1))
        self.vs = np.linspace(-self.W / 2, self.W / 2, NV_COV)
        self.vl = np.linspace(-self.W / 2, self.W / 2, NVL)
        self.sq = math.sqrt(W_COV)
        self.obs1, self.obs2 = c['e1'], c['e2']
        self.thk = c['thk']

    def rho_bounds(self):
        lo, hi = bounds()
        for k in range(K):
            lo[6 + 4 * k + 2], hi[6 + 4 * k + 2] = 0.10 * self.W, 3.0 * self.W
        return lo, hi

    def dense_cov(self, x, pts, cand, kind):
        n = len(self.u_fit)
        G = np.stack([PM.surface(x, self.u_fit, np.full(n, v), K) for v in self.vs])
        r = np.stack([S.coverage_resid(G[k], G[k + 1], pts, cand, self.W, kind) for k in range(NV_COV - 1)])
        if kind == 'in':
            return r.min(0)
        rp = np.where(r > 0, r, np.inf).min(0)
        return np.where(np.isfinite(rp), rp, 0.0)

    def layer(self, x):
        n = len(self.u_fit)
        U, V = np.meshgrid(self.u_fit, self.vl, indexing='ij')
        pts = PM.surface(x, U.ravel(), V.ravel(), K)
        _, _, rolls = PM.unpack(x, K)
        q0, a, ap, sg, L = PM.roll_frame(*rolls[1])
        Xp = (np.stack([U.ravel(), V.ravel()], 1) - q0) @ ap
        grp = np.full(len(pts), -1)
        grp[Xp <= 0] = 0
        grp[Xp >= L] = 1
        ok = grp >= 0
        p2 = AP.project(pts[ok]); z = pts[ok, 2]; g = grp[ok]
        key = np.floor(p2 / LAYER_CELL).astype(np.int64)
        ids = key[:, 0] * 100000 + key[:, 1]
        uniq, inv = np.unique(ids, return_inverse=True)
        zm = np.full((len(uniq), 2), -np.inf)
        np.maximum.at(zm, (inv, g), z)
        both = np.isfinite(zm).all(1)
        gap = zm[both, 1] - zm[both, 0]
        r = np.maximum(0.0, 2 * self.thk - gap) * SC * W_LAYER
        out = np.zeros(LAYER_PAD)
        out[:min(len(r), LAYER_PAD)] = r[:LAYER_PAD]          # fixed length (cell count varies); padded with zeros
        return out, pts, grp

    def parts(self, x):
        PL, PR = PM.edges(x, self.u_all, self.W, K)
        p1, p2 = AP.project(PL), AP.project(PR)
        d1 = (p1 - self.obs1)[self.out_mask1].ravel()
        d2 = (p2 - self.obs2)[self.out_mask2].ravel()
        s1, a1 = self.sd1.resid(PL)
        s2, a2 = self.sd2.resid(PR)
        ci = self.dense_cov(x, self.c['cov_in'], self.cin, 'in') * self.sq
        co = self.dense_cov(x, self.c['cov_out'], self.cout, 'out') * self.sq
        lay, _, _ = self.layer(x)
        ov = np.maximum(0.0, -PM.overlap_gaps(x, self.W, K)) * SC * W_OVL
        return dict(pt_out=np.concatenate([d1, d2]), slide=np.concatenate([s1, s2]), anchor=np.concatenate([a1, a2]), cov_in=ci,
                    cov_out=co, layer=lay, overlap=ov)

    def res(self, x):
        return np.concatenate(list(self.parts(x).values()))

    def front(self, x):
        n = len(self.u_fit)
        U, V = np.meshgrid(np.arange(self.u_fit[0] - 20, self.u_fit[-1] + 20, 0.6), self.vl, indexing='ij')
        pts = PM.surface(x, U.ravel(), V.ravel(), K)
        _, _, rolls = PM.unpack(x, K)
        q0, a, ap, sg, L = PM.roll_frame(*rolls[1])
        Xp = (np.stack([U.ravel(), V.ravel()], 1) - q0) @ ap
        grp = np.full(len(pts), -1)
        grp[Xp <= 0] = 0
        grp[Xp >= L] = 1
        return AA.front_fraction(pts, grp)


def init_params(c, P, phi_apex, rho_f, zf):
    W, H, m, N = c['W'], c['H'], c['m'], c['N']
    wi = c['wi']
    b_ax, _, _ = AA.beta_axis(c)
    beta = b_ax % np.pi
    u_ap = float((wi.mean() - m) * H)
    uq = [(0.25 * (N - 1) - m) * H, (0.75 * (N - 1) - m) * H]
    rolls = np.array([[uq[0], np.pi / 2, 2 * W, 0.0], [u_ap, beta, rho_f * W, phi_apex], [uq[1], np.pi / 2, 2 * W, 0.0]])
    x = np.concatenate([np.zeros(6), rolls.ravel()])
    u_all = (np.arange(N) - m) * H
    L, R = PM.edges(x, u_all, W, K)
    L0, R0 = AP.backproject(c['e1'], zf), AP.backproject(c['e2'], zf)
    Rm, tt = AA.kabsch(np.concatenate([L, R]), np.concatenate([L0, R0]))
    x[:3] = Rotation.from_matrix(Rm).as_rotvec()
    x[3:6] = tt
    return x


def fit():
    t0 = time.time()
    c = AA.setup()
    AA.W_GLOBAL[0] = c['W']
    pr = Problem(c)
    N, wi = c['N'], c['wi']
    zf = np.interp(np.arange(N), [wi[0], wi[-1]], [-20.0, 20.0])
    lo, hi = pr.rho_bounds()
    print(f'section {c["i0"]}..{c["i1"]} N {N} window local {wi[0]}..{wi[-1]} W {c["W"]:.3f} H {c["H"]:.3f} SC {SC:.4f}; fit rings {pr.idx[0]}..{pr.idx[-1]}', flush=True)
    starts = []
    for phi in (np.pi, -np.pi):
        for rf in (0.12, 0.2, 0.3):
            x0 = init_params(c, None, phi, rf, zf)
            x0 = np.clip(x0, lo + 1e-9, hi - 1e-9)
            t1 = time.time()
            r = least_squares(pr.res, x0, method='trf', x_scale='jac', max_nfev=3000, bounds=(lo, hi), diff_step=1e-6)
            pt = pr.parts(r.x)
            ff = pr.front(r.x)
            st = dict(phi0=float(phi), rho0_over_W=rf, cost=float(r.cost), nfev=int(r.nfev), status=int(r.status),
                      blocks={k: float(0.5 * np.sum(v ** 2)) for k, v in pt.items()},
                      front=ff, right_front=bool(ff['frac_post_in_front'] > 0.5), x=r.x.tolist(), x0=x0.tolist(), secs=time.time() - t1,
                      overlap_min_gap=float(PM.overlap_gaps(r.x, c['W'], K).min()))
            starts.append(st)
            print(f'  phi0 {np.degrees(phi):+6.1f} rho0 {rf:.2f}W -> cost {st["cost"]:10.2f} nfev {st["nfev"]} status {st["status"]} front {ff["frac_post_in_front"]:.3f} '
                  f'({ff["n_cells"]} cells) rho_apex {r.x[6 + 4 + 2]:.2f} phi_apex {np.degrees(r.x[6 + 4 + 3]):.1f} ovl_gap_min {st["overlap_min_gap"]:.2f} ({st["secs"]:.0f}s)', flush=True)
            print('      blocks', {k: round(v, 2) for k, v in st['blocks'].items()}, flush=True)
    ok = [q for q in starts if q['right_front']]
    pool = ok if ok else sorted(starts, key=lambda q: -q['front']['frac_post_in_front'])[:1]
    sel = min(pool, key=lambda q: q['cost'])
    json.dump(dict(starts=starts, selected_index=starts.index(sel), n_right_front=len(ok), seconds=time.time() - t0), open(os.path.join(OUT, 'fit.json'), 'w'), indent=1, default=float)
    print('selected', starts.index(sel), 'cost', sel['cost'], 'n_right_front', len(ok), 'total secs', time.time() - t0, flush=True)


def refined_u(c, x):
    W, H, m, N = c['W'], c['H'], c['m'], c['N']
    u_ring = (np.arange(N) - m) * H
    spans = [(lo, hi, arc) for lo, hi, arc in PM.roll_span_u(x, W, K) if arc > 1e-3]
    keep = np.ones(N, bool)
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
    W = c['W']
    names = ['left bend', 'apex fold', 'right bend']
    table = []
    _, _, rolls = PM.unpack(x, K)
    for nme, (u, b, r, p) in zip(names, rolls):
        table.append(dict(roll=nme, u_css=float(u), u_ring=float(u / c['H'] + c['m']), beta_deg=float(np.degrees(b)), rho_css=float(r), rho_over_W=float(r / W),
                          phi_deg=float(np.degrees(p)), arc_css=float(r * abs(p))))
    pose = dict(rotvec=x[:3].tolist(), t=x[3:6].tolist())
    N = c['N']
    u_all = pr.u_all
    L, R = PM.edges(x, u_all, W, K)
    M = dict(reproj=AA.reproj_metrics(c, L, R), face=AA.face_metrics(c, L, R))
    M['silhouette_rings'], _ = AA.sil_metrics(c, L, R)
    M['right_leg_in_front_rings'] = AA.ring_front(c, L, R)
    M['right_leg_in_front_dense'] = pr.front(x)
    M['z_range_rings'] = [float(min(L[:, 2].min(), R[:, 2].min())), float(max(L[:, 2].max(), R[:, 2].max()))]
    M['roll_radius_css_fitted'] = {r['roll']: r['rho_css'] for r in table}
    M['overlap_gaps_css'] = PM.overlap_gaps(x, W, K).tolist()
    M['cost_blocks'] = {k: float(0.5 * np.sum(v ** 2)) for k, v in pr.parts(x).items()}
    # refined emission
    ur, spans = refined_u(c, x)
    Lr, Rr = PM.edges(x, ur, W, K)
    M['silhouette_refined'], ren = AA.sil_metrics(c, Lr, Rr)
    M['z_range_refined'] = [float(min(Lr[:, 2].min(), Rr[:, 2].min())), float(max(Lr[:, 2].max(), Rr[:, 2].max()))]
    M['n_rings_emitted'] = int(len(ur))
    M['roll_spans_u'] = [dict(roll=nm, lo=float(a), hi=float(b), arc=float(cc), n_rings_in_span=int(((ur >= a - 1e-9) & (ur <= b + 1e-9)).sum())) for nm, (a, b, cc) in zip(names, spans)]
    M['rings_per_arc'] = [int(((ur >= a - 1e-9) & (ur <= b + 1e-9)).sum()) for a, b, cc in spans]
    # isometry + C1 of the fitted model
    M['isometry_fitted'] = PM.isometry_test(x, W, (u_all[0], u_all[-1]))
    n_c1 = []
    for u_, b_, r_, p_ in rolls:
        q0, a, ap, sg, Ll = PM.roll_frame(u_, b_, r_, p_)
        for lvl in (0.0, Ll):
            for v in np.linspace(-W / 2, W / 2, 5):
                # point on the boundary line: Xp = lvl, Yp = v-component; in (u,v): u = u_ + v cot b + lvl/sin b
                uu = u_ + v / np.tan(b_) + lvl / np.sin(b_)
                e = 1e-6
                f = lambda uq: PM.surface(x, np.array([uq]), np.array([v]), K)[0]
                du = np.array([uu - e, uu + e])
                # normal from (dP/du x dP/dv) at both sides of the boundary
                def nrm(uq):
                    h = 1e-5
                    Pu = (PM.surface(x, [uq + h], [v], K)[0] - PM.surface(x, [uq - h], [v], K)[0]) / (2 * h) if False else None
                    return None
                # one-sided normals
                def normal(uq, side):
                    h = 1e-5
                    Pu = (PM.surface(x, [uq + h], [v], K)[0] - PM.surface(x, [uq - h], [v], K)[0]) / (2 * h)
                    Pv = (PM.surface(x, [uq], [v + h], K)[0] - PM.surface(x, [uq], [v - h], K)[0]) / (2 * h)
                    nn = np.cross(Pu, Pv)
                    return nn / np.linalg.norm(nn)
                n_c1.append(float(np.linalg.norm(normal(uu - 2e-4, -1) - normal(uu + 2e-4, 1))))
    M['normal_jump_across_roll_boundaries_max'] = float(max(n_c1))
    M['params'] = dict(table=table, pose=pose, W_css=W, H_css=c['H'], N=N, section=dict(i0=c['i0'], i1=c['i1']))
    M['starts'] = [dict(phi0_deg=float(np.degrees(s['phi0'])), rho0_over_W=s['rho0_over_W'], cost=s['cost'], nfev=s['nfev'], status=s['status'],
                        right_front_frac=s['front']['frac_post_in_front'], right_front=s['right_front'], rho_apex=s['x'][6 + 4 + 2],
                        phi_apex_deg=float(np.degrees(s['x'][6 + 4 + 3])), min_overlap_gap=s['overlap_min_gap'], blocks=s['blocks'])
                   for s in fj['starts']]
    M['selected_index'] = fj['selected_index']
    json.dump(M, open(os.path.join(OUT, 'metrics.json'), 'w'), indent=2, default=float)
    cand = EP.emit(Lr, Rr, 'phone', os.path.join(OUT, 'apex_candidate.json'))
    Image.fromarray((ren * 255).astype(np.uint8)).save(os.path.join(OUT, 'sil_render.png'))
    np.savez(os.path.join(OUT, 'solution.npz'), x=x, u_rings=u_all, L=L, R=R, u_refined=ur, Lr=Lr, Rr=Rr)
    print(json.dumps({k: v for k, v in M.items() if k not in ('starts',)}, indent=1, default=float))
    print('emitted', cand)


if __name__ == '__main__':
    {'fit': fit, 'report': report}[sys.argv[1]]()
