"""Synthetic test 9: diagnose the residual misfit inside the fold window of synth8.
R1 longer (max_iter 1500), R2 refined (3x denser rings in window), R3 data-in-window x0.25.
Usage: python solve3d_synth9.py run R1|R2|R3   (each writes solution_Rk.npz + run_Rk.json)
       python solve3d_synth9.py merge          (metrics.json + fold_zoom.png)"""
import json
import os
import sys
import time

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import solve3d as S  # noqa: E402
import solve3d_synth as T  # noqa: E402
import solve3d_synth2 as T2  # noqa: E402
import solve3d_synth3 as T3  # noqa: E402
import solve3d_synth4 as T4  # noqa: E402
import solve3d_fast as F  # noqa: E402
import hinge as HG  # noqa: E402

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..',
                                    'docs', 'ribbon', 'turns', 'synth9'))
SYN8 = os.path.normpath(os.path.join(OUT, '..', 'synth8'))
os.makedirs(OUT, exist_ok=True)
W, N0, H, THK = T.W, T.N, T.H, T.THK
UOFF = -T.LTOT / 2
MAX_ITER = 1500

_orig_min_clear = T2.min_clear


def _safe_min_clear(L, R, ca):
    try:
        return _orig_min_clear(L, R, ca)
    except ValueError:
        return float('nan')


T2.min_clear = _safe_min_clear


def set_N(n):
    for mod in (T, T2, T3, T4):
        mod.N = n


def gt_from_u(u):
    """Same construction as T.make_gt, evaluated at arbitrary flat-u values."""
    d = np.array([np.cos(T.ALPHA), np.sin(T.ALPHA)])
    e = np.array([-np.sin(T.ALPHA), np.cos(T.ALPHA)])
    q0 = np.zeros(2)
    c = q0[None] + u[:, None] * d[None]
    q1 = c - (W / 2) * e[None]
    q2 = c + (W / 2) * e[None]
    a = np.array([np.cos(T.BETA), np.sin(T.BETA)])
    ap = np.array([np.sin(T.BETA), -np.cos(T.BETA)])
    P = [T.fold(q, q0, a, ap, T.RHO) for q in (q1, q2)]

    def place(Q):
        Q = T.rot_x(Q, -20.0)
        Q = T.rot_y(Q, 15.0)
        return Q + np.array([0, -40.0, -60.0])
    L, R = place(P[0]), place(P[1])
    Xc = (c - q0) @ ap
    win = (Xc >= -0.25 * W) & (Xc <= np.pi * T.RHO + 0.25 * W)
    return L, R, win


def ring_u(refined):
    u = np.linspace(-T.LTOT / 2, T.LTOT / 2, N0)
    if not refined:
        return u
    _, _, win = gt_from_u(u)
    wi = np.where(win)[0]
    out = []
    for i in range(N0):
        out.append(u[i])
        if i in wi and i + 1 in wi:
            out += [u[i] + (u[i + 1] - u[i]) / 3, u[i] + 2 * (u[i + 1] - u[i]) / 3]
    return np.array(out)


def min_clear_idx(L, R, uflat, sep_u):
    n = len(L)
    I, J = np.meshgrid(np.arange(n), np.arange(n), indexing='ij')
    mk = (uflat[J] - uflat[I]) >= sep_u - 1e-9
    return float(S.segment_dist(L[I[mk]], R[I[mk]], L[J[mk]], R[J[mk]]).min())


def _poly_dist(P, poly):
    a, b = poly[:-1], poly[1:]
    out = np.empty(len(P))
    for s in range(0, len(P), 500):
        Q = P[s:s + 500, None]
        out[s:s + 500] = S._pt_seg(Q, a[None], b[None]).min(1)
    return out


def _sample(poly, segmask):
    pts = []
    for k in np.where(segmask)[0]:
        n = max(int(np.ceil(np.linalg.norm(poly[k + 1] - poly[k]))), 1)
        t = np.arange(n) / n
        pts.append(poly[k] + t[:, None] * (poly[k + 1] - poly[k]))
    return np.concatenate(pts)


def gt_edge_rms(L, R, win, Lg, Rg, winG):
    """RMS symmetric polyline distance (window segments, 1 px sampling) to GT noise-free projected E1/E2."""
    d = []
    for P, Q, in ((L, Lg), (R, Rg)):
        ps, pg = S.project(P), S.project(Q)
        d.append(_poly_dist(_sample(ps, win[:-1] & win[1:]), pg))
        d.append(_poly_dist(_sample(pg, winG[:-1] & winG[1:]), ps))
    d = np.concatenate(d)
    return float(np.sqrt(np.mean(d ** 2))), float(d.max())


def stage_problem(Hg, x, wts, obs, cov, p):
    obs1, obs2, vis1, vis2, w1, w2, win = obs
    xf = Hg.full(x)
    n = Hg.N
    ip = F.make_stage_problem(n, obs1, obs2, vis1, vis2, w1, w2, win, p, wts, xf, None, 50.0, cov, 0)
    return HG.HingeProblem(Hg, ip), ip


def run(name):
    t_start = time.time()
    refined = name == 'R2'
    # base problem (coverage points and GT raster always from the original ring set)
    Lg0, Rg0, win0 = T.make_gt()
    G, UG = T2.make_gt_dense()
    gt = T2.raster(*T2.grid_tris(G, UG))
    pL0, pR0 = S.project(Lg0), S.project(Rg0)
    box = T3.window_box(Lg0, Rg0, win0, 20)
    g, p_in, p_out = T4.make_guides(gt, pL0, pR0, box)
    side, neg, pos = T3.front_side(gt)

    u = ring_u(refined)
    N = len(u)
    set_N(N)
    Lg, Rg, win = gt_from_u(u)
    if not refined:
        assert np.allclose(Lg, Lg0) and np.allclose(Rg, Rg0) and (win == win0).all()
    Z = T.zbuffer(Lg, Rg)
    vis1 = T.visible(Lg, S.D - Lg[:, 2], Z)
    vis2 = T.visible(Rg, S.D - Rg[:, 2], Z)
    pL, pR = S.project(Lg), S.project(Rg)
    rng = np.random.default_rng(0)
    obs1 = pL + rng.normal(0, 0.5, pL.shape)
    obs2 = pR + rng.normal(0, 0.5, pR.shape)
    L0, R0 = T3.make_init_layered(obs1, obs2, vis1, vis2, win, side)
    w = np.where(win, 0.25, 1.0) if name == 'R3' else np.ones(N)
    obs = (obs1, obs2, vis1, vis2, w, w.copy(), win)
    p = dict(W=W, h=H, thk=THK)
    wbase = dict(S.ISO_WEIGHTS)
    Hg = HG.Hinge(N, W, H)
    m = Hg.m
    x, ginfo = HG.geometric_init(Hg, L0, R0)
    print(name, 'N', N, 'window rings', int(win.sum()), 'geometric init:', ginfo, flush=True)
    cov_base = dict(p_in=p_in, p_out=p_out, weight=20.0)
    cfgs = {1: dict(clear=0.0, cov=None, bend=1.0), 2: dict(clear=0.0, cov=20.0, bend=1.0),
            3: dict(clear=1.0, cov=20.0, bend=1.0), 4: dict(clear=1.0, cov=40.0, bend=0.5)}
    hist = []
    for k in (1, 2, 3, 4):
        c = cfgs[k]
        wts = dict(wbase)
        wts['clear'] = wbase['clear'] * c['clear']
        wts['bend'] = wbase['bend'] * c['bend']
        cov = None if c['cov'] is None else dict(cov_base, weight=c['cov'])
        prob, ip = stage_problem(Hg, x, wts, obs, cov, p)
        t0 = time.time()
        c0 = 0.5 * float(np.sum(prob.f(x) ** 2))
        x, info = HG.lm_dense(prob.f, prob.jac, x, max_iter=MAX_ITER)
        info.update(stage=k, cost_before=c0, n_pairs=int(len(ip.pairs)), n_resid=int(prob.nres), wall=time.time() - t0,
                    blocks={n: 0.5 * float(np.sum(v ** 2)) for n, v in prob.blocks(x).items()})
        hist.append(info)
        print(f'{name} stage {k}: ' + str({q: v for q, v in info.items() if q != 'blocks'}), flush=True)
        print('   blocks', {q: round(v, 4) for q, v in info['blocks'].items()}, flush=True)
    Lh, Rh = Hg.points(x)
    _, _, _, ah, bh = Hg.unpack(x[None])
    shift = u[m] - UOFF                          # gauge a_m = 0 -> GT flat position of ring m
    ah, bh = ah[0] + shift, bh[0] + shift
    np.savez(os.path.join(OUT, f'solution_{name}.npz'), x=x, L=Lh, R=Rh, a=ah, b=bh, u=u, win=win)
    M, ren = T3.evaluate(Lh, Rh, ah, bh, gt, Lg, Rg, vis1, vis2, pL, pR, box)
    pr = np.concatenate([np.linalg.norm(S.project(Lh) - pL, axis=1)[:, None],
                         np.linalg.norm(S.project(Rh) - pR, axis=1)[:, None]], 1)
    vv, ww = np.stack([vis1, vis2], 1), np.stack([win, win], 1)
    for nm, mk in (('window', vv & ww), ('outside', vv & ~ww)):
        M['rms_reproj_' + nm] = float(np.sqrt(np.mean(pr[mk] ** 2)))
    M['rms_reproj_window_gt_edges'], M['max_dist_window_gt_edges'] = gt_edge_rms(Lh, Rh, win, Lg, Rg, win)
    M['min_clearance_idx'] = min_clear_idx(Lh, Rh, u - UOFF, 34 * H)
    M['flat_span_a'] = float(ah[-1] - ah[0])
    M['mono_viol_frac'] = float(((np.diff(ah) < 0.5).mean() + (np.diff(bh) < 0.5).mean()) / 2)
    M['coverage_in_frac'], M['coverage_out_frac'] = T4.cov_frac(Lh, Rh, p_in, p_out)
    tot = time.time() - t_start
    print(name, 'metrics', M, 'runtime', tot, flush=True)
    json.dump(dict(metrics=M, history=hist, geometric_init=ginfo, seconds=tot, N=N, n_window_rings=int(win.sum())),
              open(os.path.join(OUT, f'run_{name}.json'), 'w'), indent=2, default=float)


def merge():
    runs = {k: json.load(open(os.path.join(OUT, f'run_{k}.json'))) for k in ('R1', 'R2', 'R3')}
    m8 = json.load(open(os.path.join(SYN8, 'metrics.json')))
    M = {'H8': dict(m8['metrics']['H8'])}
    # H8 reference: add the GT-edge metric from its saved solution
    Lg, Rg, win = T.make_gt()
    s8 = np.load(os.path.join(SYN8, 'solution.npz'))
    M['H8']['rms_reproj_window_gt_edges'], M['H8']['max_dist_window_gt_edges'] = gt_edge_rms(s8['L'], s8['R'], win, Lg, Rg, win)
    for k, r in runs.items():
        M[k] = r['metrics']
    cols = ['H8', 'R1', 'R2', 'R3']
    print(f'{"metric":30s}' + ''.join(f'{c:>12s}' for c in cols))
    for k in M['R1']:
        print(f'{k:30s}' + ''.join(f'{M[c].get(k, float("nan")):12.4f}' for c in cols))
    print('runtime s', {k: round(r['seconds'], 1) for k, r in runs.items()})
    json.dump(dict(metrics=M, runs=runs, h8_history=m8['history']), open(os.path.join(OUT, 'metrics.json'), 'w'),
              indent=2, default=float)
    # pictures
    G, UG = T2.make_gt_dense()
    gt = T2.raster(*T2.grid_tris(G, UG))
    pL0, pR0 = S.project(Lg), S.project(Rg)
    box = T3.window_box(Lg, Rg, win, 20)
    _, p_in, p_out = T4.make_guides(gt, pL0, pR0, box)
    ims = [T2.panel(gt, Lg, Rg)]
    for k in ('R1', 'R2', 'R3'):
        s = np.load(os.path.join(OUT, f'solution_{k}.npz'))
        ren = T2.render_ring(s['L'], s['R'], s['a'] + UOFF, s['b'] + UOFF)
        ims.append(T2.panel(ren, s['L'], s['R'], True))
    n = len(ims)
    x0_, y0_, x1_, y1_ = T3.window_box(Lg, Rg, win, 40)
    crops = [im.crop((x0_, y0_, x1_, y1_)).resize(((x1_ - x0_) * 3, (y1_ - y0_) * 3), Image.LANCZOS) for im in ims]
    dr = ImageDraw.Draw(crops[0])
    for pts, col in ((p_in, (0, 200, 0)), (p_out, (230, 0, 0))):
        for px, py in pts:
            cx, cy = (px - x0_ + 0.5) * 3, (py - y0_ + 0.5) * 3
            dr.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill=col)
    cw, ch = crops[0].size
    z = Image.new('RGB', (cw * n + 10 * (n - 1), ch), (200, 200, 200))
    for k, im in enumerate(crops):
        z.paste(im, (k * (cw + 10), 0))
    z.save(os.path.join(OUT, 'fold_zoom.png'))


if __name__ == '__main__':
    if sys.argv[1] == 'run':
        run(sys.argv[2])
    else:
        merge()
