"""Synthetic test 5: synth4 configs A and D with the fast solver (solve3d_fast), 4 stages, 3000 nfev."""
import json
import os
import sys
import time

import cv2
import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import solve3d as S  # noqa: E402
import solve3d_synth as T  # noqa: E402
import solve3d_synth2 as T2  # noqa: E402
import solve3d_synth3 as T3  # noqa: E402
import solve3d_synth4 as T4  # noqa: E402
import solve3d_fast as F  # noqa: E402

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..',
                                    'docs', 'ribbon', 'turns', 'synth5'))
os.makedirs(OUT, exist_ok=True)
W, N, H, THK = T.W, T.N, T.H, T.THK
MAX_NFEV = 3000
TOL = dict(ftol=1e-12, xtol=1e-12, gtol=1e-12)


make_guides, cov_frac = T4.make_guides, T4.cov_frac


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
    box20 = T3.window_box(Lg, Rg, win, 20)
    box = box20
    g, p_in, p_out = make_guides(gt, pL, pR, box20)
    print(f'guide points {len(g)}: inner {len(p_in)}, outer {len(p_out)}', flush=True)
    ones = np.ones(N)
    base = dict(W=W, h=H, thk=THK, max_nfev=MAX_NFEV, tol=TOL, stages=(1, 2, 3, 4), tr_solver='lsmr')
    ab = np.arange(N) * H

    t0 = time.time()
    A = F.solve_iso_fast(obs1, obs2, vis1, vis2, ones, ones, win, L0, R0, base)
    tA = time.time() - t0
    print(f'A done {tA:.0f}s', A['history'], flush=True)
    t0 = time.time()
    Dd = F.solve_iso_fast(obs1, obs2, vis1, vis2, ones, ones, win, L0, R0,
                     dict(base, coverage=dict(p_in=p_in, p_out=p_out, weight=20.0)))
    tD = time.time() - t0
    print(f'D done {tD:.0f}s', Dd['history'], flush=True)

    sols = dict(init=(L0, R0, ab, ab), A=(A['L'], A['R'], A['a'], A['b']),
                D=(Dd['L'], Dd['R'], Dd['a'], Dd['b']))
    M, REN = {}, {}
    for k, (L, R, a, b) in sols.items():
        M[k], REN[k] = T3.evaluate(L, R, a, b, gt, Lg, Rg, vis1, vis2, pL, pR, box)
        M[k]['coverage_in_frac'], M[k]['coverage_out_frac'] = cov_frac(L, R, p_in, p_out)
    cols = list(M)
    print(f'{"metric":18s}' + ''.join(f'{c:>12s}' for c in cols))
    for k in M['init']:
        print(f'{k:18s}' + ''.join(f'{M[c][k]:12.4f}' for c in cols))
    hist = dict(A=A['history'], D=Dd['history'])
    for k, hh in hist.items():
        print(f'history {k}:')
        for h_ in hh:
            print('  ', h_)
    tot = time.time() - t_start
    print(f'runtime: A {tA:.1f}s, D {tD:.1f}s, total {tot:.1f}s')
    json.dump(dict(metrics=M, history=hist, n_inner=len(p_in), n_outer=len(p_out), box=list(box),
                   seconds=dict(A=tA, D=tD, total=tot)),
              open(os.path.join(OUT, 'metrics.json'), 'w'), indent=2)

    ims = [T2.panel(gt, Lg, Rg)]
    for k in cols:
        L, R, a, b = sols[k]
        ims.append(T2.panel(REN[k], L, R, k in ('A', 'D')))
    n = len(ims)
    sheet = Image.new('RGB', (S.VIEW_W * n + 10 * (n - 1), S.VIEW_H), (200, 200, 200))
    for k, p in enumerate(ims):
        sheet.paste(p, (k * (S.VIEW_W + 10), 0))
    sheet.save(os.path.join(OUT, 'proj.png'))
    x0, y0, x1, y1 = T3.window_box(Lg, Rg, win, 40)
    crops = [p.crop((x0, y0, x1, y1)).resize(((x1 - x0) * 3, (y1 - y0) * 3), Image.LANCZOS) for p in ims]
    dr = ImageDraw.Draw(crops[0])
    for pts, col in ((p_in, (0, 200, 0)), (p_out, (230, 0, 0))):
        for x, y in pts:
            cx, cy = (x - x0 + 0.5) * 3, (y - y0 + 0.5) * 3
            dr.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill=col)
    cw, ch = crops[0].size
    z = Image.new('RGB', (cw * n + 10 * (n - 1), ch), (200, 200, 200))
    for k, p in enumerate(crops):
        z.paste(p, (k * (cw + 10), 0))
    z.save(os.path.join(OUT, 'fold_zoom.png'))


if __name__ == '__main__':
    main()
