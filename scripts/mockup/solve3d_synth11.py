"""Synthetic test 11: fold-primitive fit per window -> hinge parameters -> synth8 stages 1-4 (H11); H8 re-run at 600 iters.
Usage: python solve3d_synth11.py prep | run H11 | run H8 | merge"""
import json
import os
import sys
import time

import numpy as np
from PIL import Image, ImageDraw
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import solve3d as S  # noqa: E402
import solve3d_synth as T  # noqa: E402
import solve3d_synth2 as T2  # noqa: E402
import solve3d_synth3 as T3  # noqa: E402
import solve3d_synth4 as T4  # noqa: E402
import solve3d_synth8 as T8  # noqa: E402
import solve3d_synth9 as T9  # noqa: E402
import solve3d_synth10 as T10  # noqa: E402
import solve3d_fast as F  # noqa: E402
import hinge as HG  # noqa: E402
import fold_primitive as FP  # noqa: E402

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..',
                                    'docs', 'ribbon', 'turns', 'synth11'))
os.makedirs(OUT, exist_ok=True)
W, N, H, THK = T.W, T.N, T.H, T.THK
UOFF = -T.LTOT / 2
MAX_ITER = 600
MARGIN, BLEND = 15, 5
W_COV = 20.0
NV_COV = 9


# ====================================================================== setup
def setup():
    Lg, Rg, win = T.make_gt()
    G, UG = T2.make_gt_dense()
    gt = T2.raster(*T2.grid_tris(G, UG))
    Z = T.zbuffer(Lg, Rg)
    vis1 = T.visible(Lg, S.D - Lg[:, 2], Z)
    vis2 = T.visible(Rg, S.D - Rg[:, 2], Z)
    pL, pR = S.project(Lg), S.project(Rg)
    rng = np.random.default_rng(0)
    obs1 = pL + rng.normal(0, 0.5, pL.shape)
    obs2 = pR + rng.normal(0, 0.5, pR.shape)
    side, neg, pos = T3.front_side(gt)
    L0, R0 = T3.make_init_layered(obs1, obs2, vis1, vis2, win, side)
    box = T3.window_box(Lg, Rg, win, 20)
    g, p_in, p_out = T4.make_guides(gt, pL, pR, box)
    Hg = HG.Hinge(N, W, H)
    x8, ginfo = HG.geometric_init(Hg, L0, R0)
    return dict(Lg=Lg, Rg=Rg, win=win, gt=gt, vis1=vis1, vis2=vis2, pL=pL, pR=pR, obs1=obs1, obs2=obs2, L0=L0, R0=R0,
                box=box, g=g, p_in=p_in, p_out=p_out, Hg=Hg, x8=x8, ginfo=ginfo, two=T3.two_layer(gt),
                ones=np.ones(N))


# ====================================================================== primitive fit
def beta_axis(c):
    """Signed angle (world frame, ccw) from the strip direction before the window to the roll-outline PCA axis."""
    Hg, win, g = c['Hg'], c['win'], c['g']
    wi = np.where(win)[0]
    i0 = wi[0]
    gc = g - g.mean(0)
    _, evec = np.linalg.eigh(gc.T @ gc)
    d_sil = evec[:, -1]
    L8, R8 = Hg.points(c['x8'])
    C2 = S.project((L8 + R8) / 2)
    seg = C2[i0 - T10.PRE_RINGS + 1:i0 + 1] - C2[i0 - T10.PRE_RINGS:i0]
    seg /= np.linalg.norm(seg, axis=1, keepdims=True)
    d_strip = seg.mean(0)
    ang = lambda d: np.arctan2(-d[1], d[0])          # image y is down -> world angle
    b = (ang(d_sil) - ang(d_strip) + np.pi / 2) % np.pi - np.pi / 2
    return float(b), d_sil, d_strip


def dense_render(p, s, u):
    """Raster of the primitive's actual surface (NV_COV v-samples per ring), u labels = flat u."""
    vs = np.linspace(-W / 2, W / 2, NV_COV)
    G = np.stack([FP.fold_surface(p, u, np.full(len(u), v), s) for v in vs], 1)        # (n, NV, 3)
    return T2.raster(*T2.grid_tris(G, np.repeat(u[:, None], NV_COV, 1)))


def layer_front_pts(p, s, u, gt, two):
    ren = dense_render(p, s, u)
    ok = two & ren['sil'] & (np.sign(ren['nu']) == np.sign(gt['nu']))
    return float(ok.sum() / max(two.sum(), 1))


def fit_range(c):
    wi = np.where(c['win'])[0]
    return max(wi[0] - MARGIN, 1), min(wi[-1] + MARGIN, N - 2)


def make_residual(c, idx, s):
    m = c['Hg'].m
    u = (idx - m) * H
    n = len(idx)
    v1, v2 = c['vis1'][idx], c['vis2'][idx]
    o1, o2 = c['obs1'][idx][v1], c['obs2'][idx][v2]
    p_in, p_out = c['p_in'], c['p_out']
    cin = np.tile(np.arange(n - 1), (len(p_in), 1))
    cout = np.tile(np.arange(n - 1), (len(p_out), 1))
    sq = np.sqrt(W_COV)

    vs = np.linspace(-W / 2, W / 2, NV_COV)

    def dense_cov(p, pts, cand, kind):
        # coverage on the primitive's actual projected surface: NV_COV-1 slabs, each a (L, R) strip of quads
        G = np.stack([FP.fold_surface(p, u, np.full(n, v), s) for v in vs])      # (NV, n, 3)
        r = np.stack([S.coverage_resid(G[k], G[k + 1], pts, cand, W, kind) for k in range(NV_COV - 1)])
        if kind == 'in':
            return r.min(0)
        rp = np.where(r > 0, r, np.inf).min(0)
        return np.where(np.isfinite(rp), rp, 0.0)

    def parts(p):
        L, R = FP.fold_points(p, u, W, s)
        d1 = (S.project(L)[v1] - o1).ravel()
        d2 = (S.project(R)[v2] - o2).ravel()
        ci = dense_cov(p, p_in, cin, 'in') * sq
        co = dense_cov(p, p_out, cout, 'out') * sq
        return d1, d2, ci, co

    def res(p):
        return np.concatenate(parts(p))
    return res, parts, u


def prim_ren(p, s, u_all):
    L, R = FP.fold_points(p, u_all, W, s)
    return L, R


def fit_all(c):
    t0 = time.time()
    idx_r0, idx_r1 = fit_range(c)
    idx = np.arange(idx_r0, idx_r1 + 1)
    m = c['Hg'].m
    wi = np.where(c['win'])[0]
    u0 = float((wi.mean() - m) * H)
    b_ax, d_sil, d_strip = beta_axis(c)
    print(f'fit rings {idx_r0}..{idx_r1} ({len(idx)}), beta_axis {np.degrees(b_ax):.2f} deg, u0 start {u0:.1f}', flush=True)
    u_all = (np.arange(N) - m) * H
    L0w, R0w = c['L0'][idx], c['R0'][idx]
    starts = []
    for beta in (b_ax, b_ax + np.pi):
        for s in (1, -1):
            res, parts, u = make_residual(c, idx, s)
            for rf in (0.08, 0.15, 0.25):
                rho = rf * W
                p_id = np.array([0, 0, 0, 0, 0, 0, beta, rho, u0])
                Lp, Rp = FP.fold_points(p_id, u, W, s)
                Rm, tt = T10.kabsch(np.concatenate([Lp, Rp]), np.concatenate([L0w, R0w]))
                p0 = p_id.copy()
                p0[:3] = Rotation.from_matrix(Rm).as_rotvec()
                p0[3:6] = tt
                lo = np.full(9, -np.inf); hi = np.full(9, np.inf)
                lo[7], hi[7] = 0.02 * W, 0.7 * W
                t1 = time.time()
                r = least_squares(res, p0, method='trf', x_scale='jac', max_nfev=2000, bounds=(lo, hi))
                d1, d2, ci, co = parts(r.x)
                dd = np.concatenate([d1, d2])
                lo_front = layer_front_pts(r.x, s, u_all, c['gt'], c['two'])
                st = dict(beta_deg=float(np.degrees(beta)), s=s, rho0=rho, cost=float(r.cost), nfev=int(r.nfev),
                          rms_reproj=float(np.sqrt(np.mean(dd ** 2))), cov_in_cost=float(0.5 * np.sum(ci ** 2)),
                          cov_out_cost=float(0.5 * np.sum(co ** 2)), layer_order_front=lo_front,
                          rho=float(r.x[7]), beta_fit_deg=float(np.degrees(r.x[6])), u0_fit=float(r.x[8]),
                          secs=time.time() - t1, p=r.x.tolist(), status=int(r.status))
                starts.append(st)
                print(f'  beta {st["beta_deg"]:7.2f} s {s:+d} rho0 {rho:5.2f} -> cost {st["cost"]:10.2f} rms {st["rms_reproj"]:6.3f} '
                      f'rho {st["rho"]:6.2f} beta {st["beta_fit_deg"]:7.2f} u0 {st["u0_fit"]:7.2f} layer {lo_front:.3f} nfev {st["nfev"]} ({st["secs"]:.0f}s)', flush=True)
    ok = [q for q in starts if q['layer_order_front'] >= 0.5]
    pool = ok if ok else sorted(starts, key=lambda q: -q['layer_order_front'])[:1]
    sel = min(pool, key=lambda q: q['cost'])
    print('selected', {k: v for k, v in sel.items() if k != 'p'}, 'n_pass_layer', len(ok), flush=True)
    return starts, sel, (idx_r0, idx_r1), b_ax, time.time() - t0


# ====================================================================== primitive -> hinge
def adaptive_blend(p):
    """Smallest ring blend keeping both edges' flat spacing positive: centred rulings need |d obl| < 2h per ring."""
    return max(BLEND, int(np.ceil(abs(W / np.tan(p[6])) / (1.6 * H))))


def hinge_range(c, p, rng_, blend):
    """Window +/- MARGIN rings, widened so the whole blend (plus 2 rings) lies inside the converted range."""
    m = c['Hg'].m
    cu = (np.arange(N) - m) * H
    Xc = (cu - p[8]) * np.sin(p[6])
    ir = np.where((Xc >= 0) & (Xc <= np.pi * p[7]))[0]
    return max(min(rng_[0], ir[0] - blend - 2), 1), min(max(rng_[1], ir[-1] + blend + 2), N - 2)


def prim_to_hinge(c, p, s, rng_, blend=BLEND):
    Hg, x8 = c['Hg'], c['x8']
    m = Hg.m
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
    th_w = S.dihedral(PL, PR)                                  # rings r0..r1
    sl = slice(1, len(ext) - 1)                                # ext rows of rings r0..r1
    idx = np.arange(r0, r1 + 1)
    th = th8.copy()
    th[idx] = th_w
    a = a8.copy(); b = b8.copy()
    a_rng = a8[r0] + (uE1[sl] - uE1[1])
    c0 = b8[r0] - a8[r0]
    b_rng = a_rng + (uE2[sl] - uE1[sl])                         # exact primitive obliqueness inside the range
    b[:r0] = b8[:r0] - c0                                       # keep the outside init, drop its constant offset
    a[idx], b[idx] = a_rng, b_rng
    a[r1 + 1:] = a8[r1 + 1:] + (a_rng[-1] - a8[r1])
    b[r1 + 1:] = b8[r1 + 1:] + (b_rng[-1] - b8[r1])
    sh = a[m]
    a, b = a - sh, b - sh
    x = Hg.pack(np.zeros(3), np.zeros(3), th, a, b)
    L, R = Hg.points(x)
    Rm, tt = T10.kabsch(np.concatenate([L[idx], R[idx]]), np.concatenate([PL[sl], PR[sl]]))
    x = Hg.pack(Rotation.from_matrix(Rm).as_rotvec(), tt, th, a, b)
    L, R = Hg.points(x)
    rms = lambda A, B: float(np.sqrt(np.mean(np.concatenate([((A[0] - B[0]) ** 2).sum(1), ((A[1] - B[1]) ** 2).sum(1)]))))
    out = np.ones(N, bool); out[idx] = False
    dih = S.dihedral(L, R)
    info = dict(fk_rms_vs_primitive_window=rms((L[idx], R[idx]), (PL[sl], PR[sl])),
                fk_rms_vs_init_outside=rms((L[out], R[out]), (c['L0'][out], c['R0'][out])),
                fk_rms_vs_init_outside_after=rms((L[idx[-1] + 1:], R[idx[-1] + 1:]), (c['L0'][idx[-1] + 1:], c['R0'][idx[-1] + 1:])),
                fk_rms_vs_init_outside_before=rms((L[:idx[0]], R[:idx[0]]), (c['L0'][:idx[0]], c['R0'][:idx[0]])),
                max_dihedral_err_fk_vs_theta_window=float(np.abs(dih[idx - 1] - th[idx]).max()),
                obl_flat=float(W / np.tan(beta)), c0_init_obliqueness_at_r0=float(c0), n_roll_rings=int(inroll.sum()), range=[int(r0), int(r1)], blend=int(blend),
                mono_viol_window_a=float((np.diff(a[r0:r1 + 1]) < 0.5).mean()),
                mono_viol_window_b=float((np.diff(b[r0:r1 + 1]) < 0.5).mean()))
    return x, info


# ====================================================================== stages
def run_stages(c, x, label):
    Hg = c['Hg']
    obs = (c['obs1'], c['obs2'], c['vis1'], c['vis2'], c['ones'], c['ones'], c['win'])
    p = dict(W=W, h=H, thk=THK)
    wbase = dict(S.ISO_WEIGHTS)
    cov_base = dict(p_in=c['p_in'], p_out=c['p_out'], weight=20.0)
    cfgs = {1: dict(clear=0.0, cov=None, bend=1.0), 2: dict(clear=0.0, cov=20.0, bend=1.0),
            3: dict(clear=1.0, cov=20.0, bend=1.0), 4: dict(clear=1.0, cov=40.0, bend=0.5)}
    hist = []
    for k in (1, 2, 3, 4):
        cf = cfgs[k]
        wts = dict(wbase)
        wts['clear'] = wbase['clear'] * cf['clear']
        wts['bend'] = wbase['bend'] * cf['bend']
        cov = None if cf['cov'] is None else dict(cov_base, weight=cf['cov'])
        prob, ip = T8.stage_problem(Hg, x, wts, obs, cov, p)
        t0 = time.time()
        c0 = 0.5 * float(np.sum(prob.f(x) ** 2))
        x, info = HG.lm_dense(prob.f, prob.jac, x, max_iter=MAX_ITER)
        info.update(stage=k, cost_before=c0, n_pairs=int(len(ip.pairs)), n_resid=int(prob.nres), wall=time.time() - t0,
                    blocks={n: 0.5 * float(np.sum(v ** 2)) for n, v in prob.blocks(x).items()})
        hist.append(info)
        print(f'{label} stage {k}: ' + str({q: v for q, v in info.items() if q != 'blocks'}), flush=True)
        print('   blocks', {q: round(v, 4) for q, v in info['blocks'].items()}, flush=True)
    return x, hist


def sol_from_x(Hg, x):
    L, R = Hg.points(x)
    _, _, _, a, b = Hg.unpack(x[None])
    return L, R, a[0] + Hg.m * H, b[0] + Hg.m * H


# ====================================================================== commands
def prep():
    t0 = time.time()
    c = setup()
    starts, sel, rng_, b_ax, secs = fit_all(c)
    p, s = np.array(sel['p']), sel['s']
    _, info5 = prim_to_hinge(c, p, s, rng_, BLEND)                # spec-literal: window +/- 15 rings, 5-ring blend
    print('stitch info (literal 5-ring blend, diagnostic only)', info5, flush=True)
    bl = adaptive_blend(p)
    x, info = prim_to_hinge(c, p, s, hinge_range(c, p, rng_, bl), bl)
    print('stitch info (adaptive blend, used)', info, flush=True)
    np.savez(os.path.join(OUT, 'prep.npz'), x_stitch=x, p=p, s=s, x8=c['x8'])
    json.dump(dict(starts=starts, selected={k: v for k, v in sel.items() if k != 'p'}, p=p.tolist(), s=s,
                   beta_axis_deg=np.degrees(b_ax), stitch=info, stitch_literal5=info5, fit_seconds=secs, seconds=time.time() - t0),
              open(os.path.join(OUT, 'prep.json'), 'w'), indent=2, default=float)
    print(f'prep done {time.time() - t0:.1f}s', flush=True)


def run(name):
    t0 = time.time()
    c = setup()
    pz = np.load(os.path.join(OUT, 'prep.npz'))
    x = (pz['x_stitch'] if name == 'H11' else pz['x8']).copy()
    x, hist = run_stages(c, x, name)
    L, R, a, b = sol_from_x(c['Hg'], x)
    np.savez(os.path.join(OUT, f'solution_{name}.npz'), x=x, L=L, R=R, a=a, b=b)
    json.dump(dict(history=hist, seconds=time.time() - t0), open(os.path.join(OUT, f'run_{name}.json'), 'w'), indent=2, default=float)
    print(name, 'done', time.time() - t0, flush=True)


def metrics_for(c, L, R, a, b, dense=None):
    Lg, Rg, win = c['Lg'], c['Rg'], c['win']
    orig = T2.render_ring
    if dense is not None:             # primitive-only: render the primitive's actual surface, not its ring quads
        T2.render_ring = lambda L_, R_, uL, uR: dense_render(dense[0], dense[1], (np.arange(N) - N // 2) * H)
    try:
        Mk, ren = T3.evaluate(L, R, a, b, c['gt'], Lg, Rg, c['vis1'], c['vis2'], c['pL'], c['pR'], c['box'])
    finally:
        T2.render_ring = orig
    pr = np.concatenate([np.linalg.norm(S.project(L) - c['pL'], axis=1)[:, None],
                         np.linalg.norm(S.project(R) - c['pR'], axis=1)[:, None]], 1)
    vv, ww = np.stack([c['vis1'], c['vis2']], 1), np.stack([win, win], 1)
    for nm, mk in (('window', vv & ww), ('outside', vv & ~ww)):
        Mk['rms_reproj_' + nm] = float(np.sqrt(np.mean(pr[mk] ** 2))) if mk.any() else float('nan')
    Mk['rms_reproj_window_gt_edges'], Mk['max_dist_window_gt_edges'] = T9.gt_edge_rms(L, R, win, Lg, Rg, win)
    u = (np.arange(N) - N // 2) * H
    Mk['min_clearance_idx'] = T9.min_clear_idx(L, R, u - UOFF + UOFF, 34 * H)
    Mk['flat_span_a'] = float(a[-1] - a[0])
    Mk['mono_viol_frac'] = float(((np.diff(a) < 0.5).mean() + (np.diff(b) < 0.5).mean()) / 2)
    Mk['coverage_in_frac'], Mk['coverage_out_frac'] = T4.cov_frac(L, R, c['p_in'], c['p_out'])
    return Mk, ren


def merge():
    c = setup()
    Hg = c['Hg']
    pj = json.load(open(os.path.join(OUT, 'prep.json')))
    pz = np.load(os.path.join(OUT, 'prep.npz'))
    p, s = pz['p'], int(pz['s'])
    m = Hg.m
    u_all = (np.arange(N) - m) * H
    Lp, Rp = FP.fold_points(p, u_all, W, s)
    ab = np.arange(N) * H
    sols = {'primitive': (Lp, Rp, ab, ab), 'stitched': sol_from_x(Hg, pz['x_stitch'])}
    runs = {}
    for k in ('H11', 'H8'):
        z = np.load(os.path.join(OUT, f'solution_{k}.npz'))
        sols[k] = (z['L'], z['R'], z['a'], z['b'])
        runs[k] = json.load(open(os.path.join(OUT, f'run_{k}.json')))
    M, REN = {}, {}
    for k, (L, R, a, b) in sols.items():
        M[k], REN[k] = metrics_for(c, L, R, a, b, (p, s) if k == 'primitive' else None)
    gate = {}
    for k in ('primitive', 'stitched', 'H11', 'H8'):
        q = M[k]
        gate[k] = dict(rms_reproj_window_gt_edges=q['rms_reproj_window_gt_edges'] <= 2.0, fold_contour_err=q['fold_contour_err'] <= 1.5,
                       layer_order_025W=q['layer_order_025W'] >= 0.95, sil_iou=q['sil_iou'] >= 0.98)
        gate[k]['PASS'] = all(gate[k].values())
    cols = ['primitive', 'stitched', 'H11', 'H8']
    print(f'{"metric":30s}' + ''.join(f'{x_:>12s}' for x_ in cols))
    for k in M['H11']:
        print(f'{k:30s}' + ''.join(f'{M[x_].get(k, float("nan")):12.4f}' for x_ in cols))
    print('gate', gate)
    tot = {k: r['seconds'] for k, r in runs.items()}
    print('runtimes', tot, 'prep', pj['seconds'])
    json.dump(dict(metrics=M, gate=gate, runs=runs, prep=pj), open(os.path.join(OUT, 'metrics.json'), 'w'), indent=2, default=float)
    L, R, a, b = sols['H11']
    np.savez(os.path.join(OUT, 'solution.npz'), x=np.load(os.path.join(OUT, 'solution_H11.npz'))['x'], L=L, R=R, a=a, b=b,
             x_init=pz['x_stitch'], prim_p=p, prim_s=s)
    ims = [T2.panel(c['gt'], c['Lg'], c['Rg']), T2.panel(REN['primitive'], Lp, Rp, False),
           T2.panel(REN['H11'], sols['H11'][0], sols['H11'][1], True), T2.panel(REN['H8'], sols['H8'][0], sols['H8'][1], True)]
    n = len(ims)
    x0_, y0_, x1_, y1_ = T3.window_box(c['Lg'], c['Rg'], c['win'], 40)
    crops = [im.crop((x0_, y0_, x1_, y1_)).resize(((x1_ - x0_) * 3, (y1_ - y0_) * 3), Image.LANCZOS) for im in ims]
    dr = ImageDraw.Draw(crops[0])
    for pts, col in ((c['p_in'], (0, 200, 0)), (c['p_out'], (230, 0, 0))):
        for px, py in pts:
            cx, cy = (px - x0_ + 0.5) * 3, (py - y0_ + 0.5) * 3
            dr.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill=col)
    cw, ch = crops[0].size
    z = Image.new('RGB', (cw * n + 10 * (n - 1), ch), (200, 200, 200))
    for k, im in enumerate(crops):
        z.paste(im, (k * (cw + 10), 0))
    z.save(os.path.join(OUT, 'fold_zoom.png'))


if __name__ == '__main__':
    if sys.argv[1] == 'prep':
        prep()
    elif sys.argv[1] == 'run':
        run(sys.argv[2])
    else:
        merge()
