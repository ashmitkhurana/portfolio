"""Synthetic test 8: hinge-chain solver with geometric initialisation (no pre-fit)."""
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
                                    'docs', 'ribbon', 'turns', 'synth8'))
SYN5 = os.path.normpath(os.path.join(OUT, '..', 'synth5', 'metrics.json'))
SYN7 = os.path.normpath(os.path.join(OUT, '..', 'synth7', 'metrics.json'))
os.makedirs(OUT, exist_ok=True)
W, N, H, THK = T.W, T.N, T.H, T.THK
MAX_ITER = 300

_orig_min_clear = T2.min_clear


def _safe_min_clear(L, R, ca):
    try:
        return _orig_min_clear(L, R, ca)
    except ValueError:        # flat span collapsed: no pair is > 1.5 W apart in (a+b)/2
        return float('nan')


T2.min_clear = _safe_min_clear


def min_clear_idx(L, R, sep=34):
    I, J = np.meshgrid(np.arange(N), np.arange(N), indexing='ij')
    mk = (J - I) >= sep
    return float(S.segment_dist(L[I[mk]], R[I[mk]], L[J[mk]], R[J[mk]]).min())


def stage_problem(Hg, x, wts, obs, cov, p):
    obs1, obs2, vis1, vis2, w1, w2, win = obs
    xf = Hg.full(x)
    ip = F.make_stage_problem(N, obs1, obs2, vis1, vis2, w1, w2, win, p, wts, xf, None, 50.0, cov, 0)
    return HG.HingeProblem(Hg, ip), ip


def validate(prob, x, label):
    J = prob.jac_blocks(x)
    nx = len(x)
    f0 = prob.f(x)
    Jfd = np.zeros((len(f0), nx))
    steps = np.full(nx, 1e-6)
    t0 = time.time()
    for j in range(nx):
        h = 1e-6 * max(1.0, abs(x[j]))
        xp, xm = x.copy(), x.copy()
        xp[j] += h
        xm[j] -= h
        Jfd[:, j] = (prob.f(xp) - prob.f(xm)) / (2 * h)
    res, off = {}, 0
    for n in prob.names:
        ns = prob.sizes[n]
        A, B = J[n], Jfd[off:off + ns]
        off += ns
        msk = (np.abs(B) > 1e-8) | (np.abs(A) > 1e-8)
        if msk.any():
            rel = np.abs(A - B)[msk] / np.maximum(np.maximum(np.abs(A), np.abs(B))[msk], 1e-8)
            res[n] = dict(max_rel=float(rel.max()), p99_rel=float(np.percentile(rel, 99)),
                          median_rel=float(np.median(rel)), n=int(msk.sum()),
                          max_abs_J=float(np.abs(B).max()))
        else:
            res[n] = dict(max_rel=0.0, p99_rel=0.0, median_rel=0.0, n=0, max_abs_J=0.0)
    print(f'jac validation [{label}] ({time.time() - t0:.0f}s):', flush=True)
    for n, v in res.items():
        print(f'  {n:8s} max_rel {v["max_rel"]:.3e}  p99 {v["p99_rel"]:.3e}  median {v["median_rel"]:.3e}  '
              f'n={v["n"]}  max|J|={v["max_abs_J"]:.3g}', flush=True)
    return res


def main():
    t_start = time.time()
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
    ones = np.ones(N)
    obs = (obs1, obs2, vis1, vis2, ones, ones, win)
    p = dict(W=W, h=H, thk=THK)
    wbase = dict(S.ISO_WEIGHTS)
    Hg = HG.Hinge(N, W, H)
    m = Hg.m
    ab = np.arange(N) * H

    # ---- forward kinematics sanity
    xr = Hg.pack(np.zeros(3), np.zeros(3), np.zeros(N), (np.arange(N) - m) * H, (np.arange(N) - m) * H)
    rr = np.random.default_rng(1)
    xr[:3] = rr.normal(0, 0.3, 3)
    xr[3:6] = rr.normal(0, 50, 3)
    xr[Hg.i_th:Hg.i_th + N - 2] = rr.normal(0, 0.05, N - 2)
    xr[Hg.i_a:] += rr.normal(0, 0.3, len(xr) - Hg.i_a)
    La, Ra = Hg.fk(xr[None])
    Lb, Rb = Hg.fk(xr[None], alt=True)
    hr = np.arange(1, N - 1)
    cons = float(max(np.abs(La[0, hr] - Lb[0, hr]).max(), np.abs(Ra[0, hr] - Rb[0, hr]).max()))
    print(f'FK hinge-ring consistency (random x): {cons:.3e}', flush=True)
    assert cons < 1e-8

    # ---- geometric initialisation
    x, ginfo = HG.geometric_init(Hg, L0, R0)
    Li, Ri = Hg.points(x)
    _, _, _, ai_, bi_ = Hg.unpack(x[None])
    ginfo['init_rms'] = float(np.sqrt(np.mean(np.concatenate([(Li - L0).ravel(), (Ri - R0).ravel()]) ** 2)))
    print('geometric init:', ginfo, flush=True)
    x_init = x.copy()
    hist = []

    cov_base = dict(p_in=p_in, p_out=p_out, weight=20.0)
    cfgs = {1: dict(clear=0.0, cov=None, bend=1.0),
            2: dict(clear=0.0, cov=20.0, bend=1.0),
            3: dict(clear=1.0, cov=20.0, bend=1.0),
            4: dict(clear=1.0, cov=40.0, bend=0.5)}
    jac_val = None
    for k in (1, 2, 3, 4):
        c = cfgs[k]
        wts = dict(wbase)
        wts['clear'] = wbase['clear'] * c['clear']
        wts['bend'] = wbase['bend'] * c['bend']
        cov = None if c['cov'] is None else dict(cov_base, weight=c['cov'])
        prob, ip = stage_problem(Hg, x, wts, obs, cov, p)
        if k == 3:
            wv = dict(wbase)
            pv, _ = stage_problem(Hg, x, wv, obs, cov_base, p)
            jac_val = dict(stage2_solution=validate(pv, x, 'stage-2 solution'))
        t0 = time.time()
        c0 = 0.5 * float(np.sum(prob.f(x) ** 2))
        x, info = HG.lm_dense(prob.f, prob.jac, x, max_iter=MAX_ITER)
        info.update(stage=k, cost_before=c0, n_pairs=int(len(ip.pairs)), n_resid=int(prob.nres), wall=time.time() - t0,
                    blocks={n: 0.5 * float(np.sum(v ** 2)) for n, v in prob.blocks(x).items()})
        hist.append(info)
        print(f'stage {k}: ' + str({q: v for q, v in info.items() if q != 'blocks'}), flush=True)
        print('   blocks', {q: round(v, 4) for q, v in info['blocks'].items()}, flush=True)

    Lh, Rh = Hg.points(x)
    _, _, _, ah, bh = Hg.unpack(x[None])
    ah, bh = ah[0] + m * H, bh[0] + m * H
    np.savez(os.path.join(OUT, 'solution.npz'), x=x, L=Lh, R=Rh, a=ah, b=bh)

    sols = dict(init=(Li, Ri, ai_[0] + m * H, bi_[0] + m * H), H8=(Lh, Rh, ah, bh))
    M, REN = {}, {}
    for k, (L, R, a, b) in sols.items():
        M[k], REN[k] = T3.evaluate(L, R, a, b, gt, Lg, Rg, vis1, vis2, pL, pR, box)
        pr = np.concatenate([np.linalg.norm(S.project(L) - pL, axis=1)[:, None],
                             np.linalg.norm(S.project(R) - pR, axis=1)[:, None]], 1)
        vv = np.stack([vis1, vis2], 1)
        ww = np.stack([win, win], 1)
        for nm, mk in (('window', vv & ww), ('outside', vv & ~ww)):
            M[k]['rms_reproj_' + nm] = float(np.sqrt(np.mean(pr[mk] ** 2))) if mk.any() else float('nan')
        M[k]['min_clearance_idx'] = min_clear_idx(L, R)
        M[k]['flat_span_a'] = float(a[-1] - a[0])
        M[k]['mono_viol_frac'] = float(((np.diff(a) < 0.5).mean() + (np.diff(b) < 0.5).mean()) / 2)
        M[k]['coverage_in_frac'], M[k]['coverage_out_frac'] = T4.cov_frac(L, R, p_in, p_out)
    d5 = json.load(open(SYN5))['metrics']['D']
    cols = ['init', 'synth5_D', 'synth7_H', 'H8']
    M['synth5_D'] = d5
    M['synth7_H'] = json.load(open(SYN7))['metrics']['H']
    print(f'{"metric":20s}' + ''.join(f'{c:>12s}' for c in cols))
    for k in M['init']:
        print(f'{k:20s}' + ''.join(f'{M[c].get(k, float("nan")):12.4f}' for c in cols))
    tot = time.time() - t_start
    print(f'runtime total {tot:.1f}s; stage walls ' + ', '.join(f'{h_["stage"]}:{h_["wall"]:.1f}s' for h_ in hist))
    json.dump(dict(metrics=M, history=hist, jac_validation=jac_val, fk_consistency=cons, geometric_init=ginfo, seconds=tot),
              open(os.path.join(OUT, 'metrics.json'), 'w'), indent=2, default=float)

    # ---- pictures (GT | init | H); synth5 D solution was not saved -> panel omitted
    ims = [T2.panel(gt, Lg, Rg), T2.panel(REN['init'], Li, Ri, False), T2.panel(REN['H8'], Lh, Rh, True)]
    n = len(ims)
    sheet = Image.new('RGB', (S.VIEW_W * n + 10 * (n - 1), S.VIEW_H), (200, 200, 200))
    for k, im in enumerate(ims):
        sheet.paste(im, (k * (S.VIEW_W + 10), 0))
    sheet.save(os.path.join(OUT, 'proj.png'))
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
    main()
