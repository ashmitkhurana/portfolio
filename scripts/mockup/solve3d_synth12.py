"""Synthetic test 12: sliding (point-to-curve) data term. Runs S8 (synth8 init) and S11 (stitched primitive init).
Usage: python solve3d_synth12.py run S8 | run S11 | merge"""
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
import solve3d_synth8 as T8  # noqa: E402
import solve3d_synth11 as T11  # noqa: E402
import hinge as HG  # noqa: E402

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'docs', 'ribbon', 'turns'))
OUT = os.path.join(ROOT, 'synth12')
IN11 = os.path.join(ROOT, 'synth11')
os.makedirs(OUT, exist_ok=True)
W, N, H, THK, UOFF = T.W, T.N, T.H, T.THK, -T.LTOT / 2
MAX_ITER = 600


def sliding_problem(c, x, wts, cov):
    p = dict(W=W, h=H, thk=THK)
    obs = (c['obs1'], c['obs2'], c['vis1'], c['vis2'], c['ones'], c['ones'], c['win'])
    _, ip = T8.stage_problem(c['Hg'], x, wts, obs, cov, p)
    return HG.SlidingHingeProblem(c['Hg'], ip, c['obs1'], c['obs2'], c['vis1'], c['vis2']), ip


def validate_jac(c, x, label):
    wb = dict(S.ISO_WEIGHTS)
    prob, _ = sliding_problem(c, x, wb, None)
    Ja = prob.data_jac(x)
    f = lambda z: np.concatenate(prob.data_parts(z))
    Jfd = np.zeros_like(Ja)
    for j in range(len(x)):
        h = 1e-6 * max(1.0, abs(x[j]))
        xp, xm = x.copy(), x.copy()
        xp[j] += h; xm[j] -= h
        Jfd[:, j] = (f(xp) - f(xm)) / (2 * h)
    msk = np.abs(Jfd) >= 1e-8
    rel = np.abs(Ja - Jfd)[msk] / np.maximum(np.abs(Ja)[msk], np.abs(Jfd)[msk])
    n_s = len(prob.sd1.sidx) + len(prob.sd2.sidx)
    nsl = msk[:n_s]
    rel_s = (np.abs(Ja - Jfd)[:n_s][nsl] / np.maximum(np.abs(Ja)[:n_s][nsl], np.abs(Jfd)[:n_s][nsl]))
    res = dict(label=label, max_rel_all=float(rel.max()), p99_rel_all=float(np.percentile(rel, 99)),
               max_rel_sliding_rows=float(rel_s.max()) if rel_s.size else 0.0,
               p99_rel_sliding_rows=float(np.percentile(rel_s, 99)) if rel_s.size else 0.0,
               n_entries=int(msk.sum()), n_rows=int(Ja.shape[0]), n_sliding=int(n_s),
               n_runs_E1=len(prob.sd1.runs), n_runs_E2=len(prob.sd2.runs),
               max_abs_diff=float(np.abs(Ja - Jfd).max()), max_abs_J=float(np.abs(Jfd).max()))
    # also the full-problem consistency of the whole jac vs fd of f (only data block rows differ from synth8)
    print('jac validation', res, flush=True)
    return res


def run_stages(c, x, label):
    obs = None
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
        prob, ip = sliding_problem(c, x, wts, cov)
        t0 = time.time()
        c0 = 0.5 * float(np.sum(prob.f(x) ** 2))
        x, info = HG.lm_dense(prob.f, prob.jac, x, max_iter=MAX_ITER)
        s1, s2, a1, a2 = prob.data_parts(x)
        info.update(stage=k, cost_before=c0, n_pairs=int(len(ip.pairs)), n_resid=int(prob.nres), wall=time.time() - t0,
                    blocks={n: 0.5 * float(np.sum(v ** 2)) for n, v in prob.blocks(x).items()},
                    data_split=dict(sliding=0.5 * float(np.sum(np.concatenate([s1, s2]) ** 2)),
                                    anchor=0.5 * float(np.sum(np.concatenate([a1, a2]) ** 2))))
        hist.append(info)
        print(f'{label} stage {k}: ' + str({q: v for q, v in info.items() if q != 'blocks'}), flush=True)
        print('   blocks', {q: round(v, 4) for q, v in info['blocks'].items()}, flush=True)
    return x, hist


def run(name):
    t0 = time.time()
    c = T11.setup()
    pz = np.load(os.path.join(IN11, 'prep.npz'))
    x = (pz['x_stitch'] if name == 'S11' else pz['x8']).copy()
    jv = validate_jac(c, x, name)
    x, hist = run_stages(c, x, name)
    L, R, a, b = T11.sol_from_x(c['Hg'], x)
    np.savez(os.path.join(OUT, f'solution_{name}.npz'), x=x, L=L, R=R, a=a, b=b)
    json.dump(dict(history=hist, jac_validation=jv, seconds=time.time() - t0),
              open(os.path.join(OUT, f'run_{name}.json'), 'w'), indent=2, default=float)
    print(name, 'done', time.time() - t0, flush=True)


# ---------------------------------------------------------------- dense hinge-strip render for layer order
NVD = 9


def dense_ring_render(L, R, uL, uR):
    t = np.linspace(0, 1, NVD)
    G = L[:, None, :] + (R - L)[:, None, :] * t[None, :, None]
    U = uL[:, None] + (uR - uL)[:, None] * t[None, :]
    return T2.raster(*T2.grid_tris(G, U))


def metrics_dual(c, L, R, a, b):
    Mk, ren = T11.metrics_for(c, L, R, a, b)
    orig = T2.render_ring
    T2.render_ring = dense_ring_render
    try:
        Md, rend = T3.evaluate(L, R, a, b, c['gt'], c['Lg'], c['Rg'], c['vis1'], c['vis2'], c['pL'], c['pR'], c['box'])
    finally:
        T2.render_ring = orig
    Mk['layer_order_025W_dense'] = Md['layer_order_025W']
    Mk['layer_order_075W_dense'] = Md['layer_order_075W']
    Mk['sil_iou_dense'] = Md['sil_iou']
    Mk['fold_contour_err_dense'] = Md['fold_contour_err']
    return Mk, ren


def merge():
    c = T11.setup()
    Hg = c['Hg']
    pz = np.load(os.path.join(IN11, 'prep.npz'))
    m11 = json.load(open(os.path.join(IN11, 'metrics.json')))
    sols, runs = {'stitched': T11.sol_from_x(Hg, pz['x_stitch'])}, {}
    for k, f in (('S8', 'S8'), ('S11', 'S11')):
        z = np.load(os.path.join(OUT, f'solution_{f}.npz'))
        sols[k] = (z['L'], z['R'], z['a'], z['b'])
        runs[k] = json.load(open(os.path.join(OUT, f'run_{f}.json')))
    for k in ('H8', 'H11'):
        z = np.load(os.path.join(IN11, f'solution_{k}.npz'))
        sols[k] = (z['L'], z['R'], z['a'], z['b'])
    M, REN = {}, {}
    for k, (L, R, a, b) in sols.items():
        M[k], REN[k] = metrics_dual(c, L, R, a, b)
    gate = {}
    for k in ('S8', 'S11'):
        q = M[k]
        gate[k] = dict(rms_reproj_window_gt_edges=q['rms_reproj_window_gt_edges'] <= 2.0, fold_contour_err=q['fold_contour_err'] <= 1.5,
                       layer_order_025W_dense=q['layer_order_025W_dense'] >= 0.95, sil_iou=q['sil_iou'] >= 0.98)
        gate[k]['PASS'] = all(gate[k].values())
    cols = ['stitched', 'S8', 'S11', 'H8', 'H11']
    print(f'{"metric":30s}' + ''.join(f'{x_:>12s}' for x_ in cols))
    for k in M['S11']:
        print(f'{k:30s}' + ''.join(f'{M[x_].get(k, float("nan")):12.4f}' for x_ in cols))
    print('gate', gate)
    print('runtimes', {k: r['seconds'] for k, r in runs.items()})
    json.dump(dict(metrics=M, gate=gate, runs=runs, synth11_metrics_old=m11['metrics']), open(os.path.join(OUT, 'metrics.json'), 'w'),
              indent=2, default=float)
    ims = [T2.panel(c['gt'], c['Lg'], c['Rg']), T2.panel(REN['S8'], *sols['S8'][:2], True), T2.panel(REN['S11'], *sols['S11'][:2], True)]
    x0_, y0_, x1_, y1_ = T3.window_box(c['Lg'], c['Rg'], c['win'], 40)
    crops = [im.crop((x0_, y0_, x1_, y1_)).resize(((x1_ - x0_) * 3, (y1_ - y0_) * 3), Image.LANCZOS) for im in ims]
    dr = ImageDraw.Draw(crops[0])
    for pts, col in ((c['p_in'], (0, 200, 0)), (c['p_out'], (230, 0, 0))):
        for px, py in pts:
            cx, cy = (px - x0_ + 0.5) * 3, (py - y0_ + 0.5) * 3
            dr.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill=col)
    cw, ch = crops[0].size
    n = len(crops)
    z = Image.new('RGB', (cw * n + 10 * (n - 1), ch), (200, 200, 200))
    for k, im in enumerate(crops):
        z.paste(im, (k * (cw + 10), 0))
    z.save(os.path.join(OUT, 'fold_zoom.png'))


if __name__ == '__main__':
    run(sys.argv[2]) if sys.argv[1] == 'run' else merge()
