"""Synthetic test 3: layer-order-aware init + over/under constraints for solve_iso."""
import json
import os
import sys
import time

import cv2
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import solve3d as S  # noqa: E402
import solve3d_synth as T  # noqa: E402
import solve3d_synth2 as T2  # noqa: E402

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..',
                                    'docs', 'ribbon', 'turns', 'synth3'))
os.makedirs(OUT, exist_ok=True)
W, LTOT, N, H, THK = T.W, T.LTOT, T.N, T.H, T.THK
MAX_NFEV = 1500
TOL = dict(ftol=1e-10, xtol=1e-10, gtol=1e-10)
UOFF = -LTOT / 2


def two_layer(gt):
    return gt['sil'] & ((gt['fz'] - gt['nz']) > 1.0)


def front_side(gt):
    two = two_layer(gt)
    nu = gt['nu'][two]
    neg, pos = int((nu < 0).sum()), int((nu > 0).sum())
    return ('neg' if neg > pos else 'pos'), neg, pos


def make_init_layered(obs1, obs2, vis1, vis2, win, side):
    wi = np.where(win)[0]
    i0, i1 = wi[0], wi[-1]
    idx = np.arange(N)
    big = 2 * T.RHO + 10.0
    ramp = (idx - i0) / max(i1 - i0, 1)           # 0 at i0 -> 1 at i1
    if side == 'neg':   # u<0 side (small idx) is in front
        z = np.where(idx < i0, big, np.where(idx > i1, 0.0, big * (1 - ramp)))
    else:
        z = np.where(idx < i0, 0.0, np.where(idx > i1, big, big * ramp))
    L = S.backproject(T.interp_hidden(obs1, vis1), z)
    R = S.backproject(T.interp_hidden(obs2, vis2), z)
    return L, R


def make_overunder(gt, n=24):
    ys, xs = np.nonzero(two_layer(gt))          # raster order
    sel = np.linspace(0, len(ys) - 1, n).round().astype(int)
    ys, xs = ys[sel], xs[sel]
    uf, ub = gt['nu'][ys, xs], gt['fu'][ys, xs]
    ring = lambda u: np.clip(np.rint((u - UOFF) / H), 0, N - 1).astype(int)
    return np.stack([ring(uf), ring(ub)], 1)


def boundary(mask):
    m = mask.astype(np.uint8)
    er = cv2.erode(m, np.ones((3, 3), np.uint8))
    return (m > 0) & (er == 0)


def contour_err(a, b, box):
    x0, y0, x1, y1 = box
    a, b = a[y0:y1, x0:x1], b[y0:y1, x0:x1]
    ba, bb = boundary(a), boundary(b)
    if not ba.any() or not bb.any():
        return float('nan')
    dta = cv2.distanceTransform((~ba).astype(np.uint8), cv2.DIST_L2, 5)
    dtb = cv2.distanceTransform((~bb).astype(np.uint8), cv2.DIST_L2, 5)
    return float(0.5 * (dtb[ba].mean() + dta[bb].mean()))


def window_box(Lg, Rg, win, pad):
    p = np.concatenate([S.project(Lg[win]), S.project(Rg[win])])
    x0 = max(int(np.floor(p[:, 0].min() - pad)), 0)
    y0 = max(int(np.floor(p[:, 1].min() - pad)), 0)
    x1 = min(int(np.ceil(p[:, 0].max() + pad)), S.VIEW_W)
    y1 = min(int(np.ceil(p[:, 1].max() + pad)), S.VIEW_H)
    return x0, y0, x1, y1


def evaluate(L, R, a, b, gt, Lg, Rg, vis1, vis2, pL, pR, box):
    ren = T2.render_ring(L, R, a + UOFF, b + UOFF)
    m = T2.evaluate(L, R, a, b, gt, Lg, Rg, vis1, vis2, pL, pR)
    two = two_layer(gt)
    both = two & ren['sil']
    m['layer_order_075W'] = m.pop('layer_order')
    m['layer_order_025W'] = float((both & (np.abs(ren['nu'] - gt['nu']) < 0.25 * W)).sum() / max(two.sum(), 1))
    m['fold_contour_err'] = contour_err(ren['sil'], gt['sil'], box)
    return m, ren


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
    side, neg, pos = front_side(gt)
    print(f'front surface u<0: {neg}px, u>0: {pos}px -> front side = {side}')
    L0, R0 = make_init_layered(obs1, obs2, vis1, vis2, win, side)
    ou = make_overunder(gt)
    print('over/under pairs (front,back):', ou.tolist())
    box = window_box(Lg, Rg, win, 20)
    ones = np.ones(N)
    base = dict(W=W, h=H, thk=THK, max_nfev=MAX_NFEV)
    ab = np.arange(N) * H

    t0 = time.time()
    A = S.solve_iso(obs1, obs2, vis1, vis2, ones, ones, win, L0, R0, dict(base, tol=TOL))
    tA = time.time() - t0
    print(f'A done {tA:.0f}s', flush=True)
    t0 = time.time()
    B = S.solve_iso(obs1, obs2, vis1, vis2, ones, ones, win, L0, R0,
                    dict(base, tol=TOL, overunder=ou, overunder_weight=50.0))
    tB = time.time() - t0
    print(f'B done {tB:.0f}s', flush=True)
    t0 = time.time()
    C = S.solve(obs1, obs2, vis1, vis2, ones, ones, win, L0, R0, base)
    tC = time.time() - t0
    print(f'C done {tC:.0f}s', flush=True)

    sols = dict(init=(L0, R0, ab, ab), A=(A['L'], A['R'], A['a'], A['b']),
                B=(B['L'], B['R'], B['a'], B['b']), C=(C['L'], C['R'], ab, ab))
    M, REN = {}, {}
    for k, (L, R, a, b) in sols.items():
        M[k], REN[k] = evaluate(L, R, a, b, gt, Lg, Rg, vis1, vis2, pL, pR, box)
    cols = list(M)
    print(f'{"metric":18s}' + ''.join(f'{c:>12s}' for c in cols))
    for k in M['init']:
        print(f'{k:18s}' + ''.join(f'{M[c][k]:12.4f}' for c in cols))
    hist = dict(A=A['history'], B=B['history'], C=C['history'])
    for k, hh in hist.items():
        print(f'history {k}:')
        for h_ in hh:
            print('  ', h_)
    tot = time.time() - t_start
    print(f'runtime: A {tA:.1f}s, B {tB:.1f}s, C {tC:.1f}s, total {tot:.1f}s')
    json.dump(dict(metrics=M, history=hist, front_side=side, front_u_neg=neg, front_u_pos=pos,
                   overunder=ou.tolist(), box=list(box), seconds=dict(A=tA, B=tB, C=tC, total=tot)),
              open(os.path.join(OUT, 'metrics.json'), 'w'), indent=2)

    ims = [T2.panel(gt, Lg, Rg)]
    for k in cols:
        L, R, a, b = sols[k]
        ims.append(T2.panel(REN[k], L, R, k in ('A', 'B')))
    sheet = Image.new('RGB', (S.VIEW_W * 5 + 40, S.VIEW_H), (200, 200, 200))
    for k, p in enumerate(ims):
        sheet.paste(p, (k * (S.VIEW_W + 10), 0))
    sheet.save(os.path.join(OUT, 'proj.png'))
    x0, y0, x1, y1 = window_box(Lg, Rg, win, 40)
    crops = [p.crop((x0, y0, x1, y1)).resize(((x1 - x0) * 3, (y1 - y0) * 3), Image.LANCZOS) for p in ims]
    cw, ch = crops[0].size
    z = Image.new('RGB', (cw * 5 + 40, ch), (200, 200, 200))
    for k, p in enumerate(crops):
        z.paste(p, (k * (cw + 10), 0))
    z.save(os.path.join(OUT, 'fold_zoom.png'))
    T2.side_view(G, B['L'], B['R'], os.path.join(OUT, 'side.png'))


if __name__ == '__main__':
    main()
