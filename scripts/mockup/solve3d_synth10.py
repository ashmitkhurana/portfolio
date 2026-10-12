"""Synthetic test 10: contour-aware window init for the hinge chain (selection among 4 sign combinations)."""
import json
import os
import sys
import time

import numpy as np
from PIL import Image, ImageDraw
from scipy.spatial.transform import Rotation

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import solve3d as S  # noqa: E402
import solve3d_synth as T  # noqa: E402
import solve3d_synth2 as T2  # noqa: E402
import solve3d_synth3 as T3  # noqa: E402
import solve3d_synth4 as T4  # noqa: E402
import solve3d_synth8 as T8  # noqa: E402
import solve3d_synth9 as T9  # noqa: E402
import solve3d_fast as F  # noqa: E402
import hinge as HG  # noqa: E402

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..',
                                    'docs', 'ribbon', 'turns', 'synth10'))
SYN8 = os.path.normpath(os.path.join(OUT, '..', 'synth8'))
SYN9 = os.path.normpath(os.path.join(OUT, '..', 'synth9'))
os.makedirs(OUT, exist_ok=True)
W, N, H, THK = T.W, T.N, T.H, T.THK
UOFF = -T.LTOT / 2
MAX_ITER = 600
PRE_RINGS, BLEND = 10, 5


def kabsch(P, Q):
    """Rigid (R, t) minimising |R P + t - Q|."""
    pc, qc = P.mean(0), Q.mean(0)
    U, _, Vt = np.linalg.svd((P - pc).T @ (Q - qc))
    d = np.sign(np.linalg.det(Vt.T @ U.T))
    Rm = Vt.T @ np.diag([1, 1, d]) @ U.T
    return Rm, qc - Rm @ pc


def window_init(Hg, x8, win, g, L0, R0, s_o, s_th):
    """Contour-aware window parameters from synth8's init x8. Returns x, info."""
    m = Hg.m
    omega, t, th, a, b = (v[0] for v in Hg.unpack(x8[None]))
    wi = np.where(win)[0]
    i0, i1 = wi[0], wi[-1]
    assert (np.diff(wi) == 1).all()
    # 2D fold axis (PCA of roll-outline guide points)
    gc = g - g.mean(0)
    ev, evec = np.linalg.eigh(gc.T @ gc)
    d_sil = evec[:, -1]
    # strip direction before the window (synth8 init centreline, projected)
    L8, R8 = Hg.points(x8)
    C2 = S.project((L8 + R8) / 2)
    seg = C2[i0 - PRE_RINGS + 1:i0 + 1] - C2[i0 - PRE_RINGS:i0]
    seg /= np.linalg.norm(seg, axis=1, keepdims=True)
    d_strip = seg.mean(0)
    d_strip /= np.linalg.norm(d_strip)
    phi = float(np.arccos(np.clip(d_strip @ d_sil, -1, 1)))
    cot = 1.0 / np.tan(phi)
    # obliqueness: constant in window, linear blend over BLEND rings each side
    d8 = b - a
    wgt = np.zeros(Hg.N)
    wgt[wi] = 1.0
    for k in range(1, BLEND + 1):
        w = (BLEND + 1 - k) / (BLEND + 1)
        if i0 - k >= 0:
            wgt[i0 - k] = w
        if i1 + k < Hg.N:
            wgt[i1 + k] = w
    dnew = wgt * (s_o * W * cot) + (1 - wgt) * d8
    bn = a + dnew
    thn = th.copy()
    hw = [i for i in wi if 1 <= i <= Hg.N - 2]
    thn[hw] = s_th * np.pi / len(hw)
    # pose: Kabsch of all FK points outside the window (pose identity) to the init points
    x = Hg.pack(np.zeros(3), np.zeros(3), thn, a, bn)
    L, R = Hg.points(x)
    out = ~win
    P = np.concatenate([L[out], R[out]])
    Q = np.concatenate([L0[out], R0[out]])
    Rm, tt = kabsch(P, Q)
    x = Hg.pack(Rotation.from_matrix(Rm).as_rotvec(), tt, thn, a, bn)
    L, R = Hg.points(x)
    rms_out = float(np.sqrt(np.mean(np.concatenate([((L[out] - L0[out]) ** 2).sum(1),
                                                    ((R[out] - R0[out]) ** 2).sum(1)]))))
    info = dict(phi_deg=float(np.degrees(phi)), cot_phi=float(cot), d_sil=d_sil.tolist(), d_strip=d_strip.tolist(),
                n_window_hinges=len(hw), theta_window=float(s_th * np.pi / len(hw)), rms_outside=rms_out)
    return x, info


def layer_order_front(Hg, x, gt, two):
    L, R = Hg.points(x)
    _, _, _, a, b = Hg.unpack(x[None])
    ren = T2.render_ring(L, R, a[0] + Hg.m * H + UOFF, b[0] + Hg.m * H + UOFF)
    ok = two & ren['sil'] & (np.sign(ren['nu']) == np.sign(gt['nu']))
    return float(ok.sum() / max(two.sum(), 1))


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
    two = T3.two_layer(gt)

    x8, ginfo = HG.geometric_init(Hg, L0, R0)
    print('synth8 geometric init:', ginfo, flush=True)

    # ---- 4-combination selection
    combos = []
    for s_o in (1, -1):
        for s_th in (1, -1):
            xc, inf = window_init(Hg, x8, win, g, L0, R0, s_o, s_th)
            lo = layer_order_front(Hg, xc, gt, two)
            combos.append(dict(s_o=s_o, s_th=s_th, layer_order_front=lo, rms_outside=inf['rms_outside'], info=inf, x=xc))
    print(f'phi = {combos[0]["info"]["phi_deg"]:.2f} deg, n_window_hinges {combos[0]["info"]["n_window_hinges"]}', flush=True)
    print('s_o s_th  layer_order(ii)  rms_outside(i)')
    for c in combos:
        print(f'{c["s_o"]:+d}  {c["s_th"]:+d}   {c["layer_order_front"]:.4f}   {c["rms_outside"]:.3f}', flush=True)
    sel = sorted(combos, key=lambda c: (-c['layer_order_front'], c['rms_outside']))[0]
    print(f'selected s_o={sel["s_o"]:+d} s_th={sel["s_th"]:+d}', flush=True)
    x = sel['x'].copy()
    xi = x.copy()

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
        prob, ip = T8.stage_problem(Hg, x, wts, obs, cov, p)
        t0 = time.time()
        c0 = 0.5 * float(np.sum(prob.f(x) ** 2))
        x, info = HG.lm_dense(prob.f, prob.jac, x, max_iter=MAX_ITER)
        info.update(stage=k, cost_before=c0, n_pairs=int(len(ip.pairs)), n_resid=int(prob.nres), wall=time.time() - t0,
                    blocks={n: 0.5 * float(np.sum(v ** 2)) for n, v in prob.blocks(x).items()})
        hist.append(info)
        print(f'stage {k}: ' + str({q: v for q, v in info.items() if q != 'blocks'}), flush=True)
        print('   blocks', {q: round(v, 4) for q, v in info['blocks'].items()}, flush=True)

    sols = {}
    for nm, xx in (('init', xi), ('H10', x)):
        L, R = Hg.points(xx)
        _, _, _, a, b = Hg.unpack(xx[None])
        sols[nm] = (L, R, a[0] + m * H, b[0] + m * H)
    Lh, Rh, ah, bh = sols['H10']
    np.savez(os.path.join(OUT, 'solution.npz'), x=x, L=Lh, R=Rh, a=ah, b=bh, x_init=xi)

    u = np.linspace(-T.LTOT / 2, T.LTOT / 2, N)
    M, REN = {}, {}
    for k, (L, R, a, b) in sols.items():
        Mk, REN[k] = T3.evaluate(L, R, a, b, gt, Lg, Rg, vis1, vis2, pL, pR, box)
        pr = np.concatenate([np.linalg.norm(S.project(L) - pL, axis=1)[:, None],
                             np.linalg.norm(S.project(R) - pR, axis=1)[:, None]], 1)
        vv, ww = np.stack([vis1, vis2], 1), np.stack([win, win], 1)
        for nm, mk in (('window', vv & ww), ('outside', vv & ~ww)):
            Mk['rms_reproj_' + nm] = float(np.sqrt(np.mean(pr[mk] ** 2))) if mk.any() else float('nan')
        Mk['rms_reproj_window_gt_edges'], Mk['max_dist_window_gt_edges'] = T9.gt_edge_rms(L, R, win, Lg, Rg, win)
        Mk['min_clearance_idx'] = T9.min_clear_idx(L, R, u - UOFF, 34 * H)
        Mk['flat_span_a'] = float(a[-1] - a[0])
        Mk['mono_viol_frac'] = float(((np.diff(a) < 0.5).mean() + (np.diff(b) < 0.5).mean()) / 2)
        Mk['coverage_in_frac'], Mk['coverage_out_frac'] = T4.cov_frac(L, R, p_in, p_out)
        M[k] = Mk
    m9 = json.load(open(os.path.join(SYN9, 'metrics.json')))['metrics']
    M['H8'], M['R1'] = m9['H8'], m9['R1']
    cols = ['init', 'H10', 'H8', 'R1']
    print(f'{"metric":30s}' + ''.join(f'{c:>12s}' for c in cols))
    for k in M['H10']:
        print(f'{k:30s}' + ''.join(f'{M[c].get(k, float("nan")):12.4f}' for c in cols))
    tot = time.time() - t_start
    print(f'runtime total {tot:.1f}s; stage walls ' + ', '.join(f'{h_["stage"]}:{h_["wall"]:.1f}s' for h_ in hist))
    json.dump(dict(metrics=M, history=hist, seconds=tot, geometric_init=ginfo,
                   combos=[{k: v for k, v in c.items() if k != 'x'} for c in combos],
                   selected=dict(s_o=sel['s_o'], s_th=sel['s_th'])),
              open(os.path.join(OUT, 'metrics.json'), 'w'), indent=2, default=float)

    ims = [T2.panel(gt, Lg, Rg), T2.panel(REN['init'], *sols['init'][:2], False), T2.panel(REN['H10'], Lh, Rh, True)]
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
    main()
