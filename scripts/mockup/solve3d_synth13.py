"""Synthetic test 13: handedness-checked primitive->hinge conversion (4 candidates) + weak-anchor sliding data.
Runs S13 (selected stitched init) and S8b (synth8 init), both with the weak anchor.
Usage: python solve3d_synth13.py prep | run S13 | run S8b | merge"""
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
import solve3d_synth8 as T8  # noqa: E402
import solve3d_synth10 as T10  # noqa: E402
import solve3d_synth11 as T11  # noqa: E402
import solve3d_synth12 as T12  # noqa: E402
import hinge as HG  # noqa: E402
import fold_primitive as FP  # noqa: E402

ROOT = T12.ROOT
OUT = os.path.join(ROOT, 'synth13')
IN11, IN12 = T12.IN11, T12.OUT
os.makedirs(OUT, exist_ok=True)
W, N, H, THK = T.W, T.N, T.H, T.THK
MAX_ITER = T12.MAX_ITER
ANCHOR_RINGS = 3


# ====================================================================== weak-anchor sliding data
class SlidingData13(HG.SlidingData):
    """Sliding residual for every ring (runs >= 2); anchor (0.05, 2-vector) only on the first/last 3 rings of each run."""

    def __init__(self, obs, vis, anchor=0.05, nanc=ANCHOR_RINGS):
        super().__init__(obs, vis, anchor)
        aset = set()
        for a0, a1 in self.runs:
            for i in range(a0, a1 + 1):
                if i - a0 < nanc or a1 - i < nanc:
                    aset.add(i)
        self.aidx = np.array(sorted(aset), int)

    def size(self):
        return len(self.sidx) + 2 * len(self.aidx)

    def resid(self, P):
        p2 = S.project(P)
        q, nq = self.closest(p2[self.sidx])
        slide = (nq * (p2[self.sidx] - q)).sum(1)
        anc = self.anchor * (p2[self.aidx] - self.obs[self.aidx])
        return slide, anc.ravel()

    def jac(self, P):
        N = len(P)
        pj = S.project_jac(P)
        p2 = S.project(P)
        q, nq = self.closest(p2[self.sidx])
        J = np.zeros((self.size(), 3 * N))
        for k, i in enumerate(self.sidx):
            J[k, 3 * i:3 * i + 3] = nq[k] @ pj[i]
        o = len(self.sidx)
        for k, i in enumerate(self.aidx):
            J[o + 2 * k:o + 2 * k + 2, 3 * i:3 * i + 3] = self.anchor * pj[i]
        return J


class SlidingHingeProblem13(HG.SlidingHingeProblem):
    def __init__(self, H_, iso_prob, obs1, obs2, vis1, vis2):
        self.sd1, self.sd2 = SlidingData13(obs1, vis1), SlidingData13(obs2, vis2)
        HG.HingeProblem.__init__(self, H_, iso_prob)


def sliding_problem(c, x, wts, cov):
    p = dict(W=W, h=H, thk=THK)
    obs = (c['obs1'], c['obs2'], c['vis1'], c['vis2'], c['ones'], c['ones'], c['win'])
    _, ip = T8.stage_problem(c['Hg'], x, wts, obs, cov, p)
    return SlidingHingeProblem13(c['Hg'], ip, c['obs1'], c['obs2'], c['vis1'], c['vis2']), ip


T12.sliding_problem = sliding_problem          # T12.validate_jac / run_stages resolve this name at call time


# ====================================================================== handedness-checked conversion
def prim_to_hinge_c(c, p, s, rng_, blend, sgn, swap):
    """synth11.prim_to_hinge with (a) theta sign sgn and (b) flat-strip roles swapped (hinge L <- primitive E2 side,
    R <- E1 side, i.e. a<->b and v mirrored); pose by Kabsch over the window rings vs the primitive's 3D L/R."""
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
    if swap:
        uA, uB, TL, TR = uE2, uE1, PR, PL          # hinge L = primitive E2 edge, hinge R = E1 edge
    else:
        uA, uB, TL, TR = uE1, uE2, PL, PR
    th_w = sgn * S.dihedral(TL, TR)
    sl = slice(1, len(ext) - 1)
    idx = np.arange(r0, r1 + 1)
    th = th8.copy()
    th[idx] = th_w
    # labels: window gets the primitive's absolute flat u (so layer labels match GT); outside keeps x8 increments
    a_rng, b_rng = uA[sl] + m * 0.0, uB[sl]
    c0 = b8[r0] - a8[r0]
    a = a8.copy()
    b = a8 + (b8 - a8) - c0
    a[:r0] = a8[:r0] + (a_rng[0] - a8[r0])
    b[:r0] = a[:r0] + (b8[:r0] - a8[:r0]) - c0
    a[idx], b[idx] = a_rng, b_rng
    a[r1 + 1:] = a8[r1 + 1:] + (a_rng[-1] - a8[r1])
    b[r1 + 1:] = b8[r1 + 1:] + (b_rng[-1] - b8[r1])
    sh = a[m]
    a, b = a - sh, b - sh
    x = Hg.pack(np.zeros(3), np.zeros(3), th, a, b)
    L, R = Hg.points(x)
    # the primitive's true 3D L/R at the hinge's flat samples (E1 at uE1, E2 at uE2; fixed pairing, never swapped)
    Lp = np.zeros((N, 3)); Rp = np.zeros((N, 3))
    Lp[idx], Rp[idx] = PL[sl], PR[sl]
    wi = np.where(c['win'])[0]
    Rm, tt = T10.kabsch(np.concatenate([L[wi], R[wi]]), np.concatenate([Lp[wi], Rp[wi]]))
    x = Hg.pack(Rotation.from_matrix(Rm).as_rotvec(), tt, th, a, b)
    return x, Lp, Rp


def cand_stats(c, x, Lp, Rp):
    Hg = c['Hg']
    L, R = Hg.points(x)
    wi = np.where(c['win'])[0]
    r3 = float(np.sqrt(np.mean(np.concatenate([((L[wi] - Lp[wi]) ** 2).sum(1), ((R[wi] - Rp[wi]) ** 2).sum(1)]))))
    r2 = float(np.sqrt(np.mean(np.concatenate([((S.project(L[wi]) - S.project(Lp[wi])) ** 2).sum(1),
                                               ((S.project(R[wi]) - S.project(Rp[wi])) ** 2).sum(1)]))))
    Ls, Rs, aa, bb = T11.sol_from_x(Hg, x)
    Mk, _ = T12.metrics_dual(c, Ls, Rs, aa, bb)
    uu = (np.arange(N) - Hg.m) * H
    Lq, Rq = FP.fold_points(c['_p'], uu, W, c['_s'])
    r3ring = float(np.sqrt(np.mean(np.concatenate([((L[wi] - Lq[wi]) ** 2).sum(1), ((R[wi] - Rq[wi]) ** 2).sum(1)]))))
    return dict(rms3d_window=r3, rms3d_window_vs_primitive_ring_pairing=r3ring, rms2d_window=r2, layer_order_dense=Mk['layer_order_025W_dense'],
                layer_order_075W_dense=Mk['layer_order_075W_dense'], rms_3d_all=Mk['rms_3d'],
                rms_reproj_window_gt_edges=Mk['rms_reproj_window_gt_edges'], sil_iou=Mk['sil_iou'])


def metrics_gauge(c, L, R, a, b):
    """Dense metrics with layer order scored after shifting the labels (a, b) by the median (a_i - i*H) over non-window rings."""
    u = np.arange(N) * H
    off = float(np.median((a - u)[~c['win']]))
    Mr, _ = T12.metrics_dual(c, L, R, a, b)
    M, ren = T12.metrics_dual(c, L, R, a - off, b - off)
    for k in ('layer_order_025W', 'layer_order_075W', 'layer_order_025W_dense', 'layer_order_075W_dense'):
        M[k + '_raw'] = Mr[k]
    M['label_offset'] = off
    return M, ren


def gate_of(q):
    g = dict(rms_reproj_window_gt_edges=q['rms_reproj_window_gt_edges'] <= 2.0, fold_contour_err=q['fold_contour_err'] <= 1.5,
             layer_order_025W_dense=q['layer_order_025W_dense'] >= 0.95, sil_iou=q['sil_iou'] >= 0.98)
    g['PASS'] = all(g.values())
    return g


def rescore():
    c = T11.setup()
    Hg = c['Hg']
    p11 = np.load(os.path.join(IN11, 'prep.npz'))
    src = {'stitched': T11.sol_from_x(Hg, p11['x_stitch']),
           'cand0': T11.sol_from_x(Hg, np.load(os.path.join(OUT, 'prep.npz'))['x_init'])}
    for k, d in (('H8', IN11), ('H11', IN11), ('S8', IN12), ('S11', IN12)):
        z = np.load(os.path.join(d, f'solution_{k}.npz'))
        src[k] = (z['L'], z['R'], z['a'], z['b'])
    M, G = {}, {}
    for k, (L, R, a, b) in src.items():
        M[k], _ = metrics_gauge(c, L, R, a, b)
        G[k] = gate_of(M[k])
        q = M[k]
        print(k, {n: round(q[n], 3) for n in ('rms_reproj_window_gt_edges', 'fold_contour_err', 'layer_order_025W_dense', 'layer_order_025W_dense_raw',
                                              'layer_order_075W_dense', 'layer_order_075W_dense_raw', 'sil_iou', 'label_offset')}, G[k], flush=True)
    json.dump(dict(metrics=M, gate=G), open(os.path.join(OUT, 'rescore.json'), 'w'), indent=2, default=float)


def prep():
    t0 = time.time()
    c = T11.setup()
    pz = np.load(os.path.join(IN11, 'prep.npz'))
    p, s = pz['p'], int(pz['s'])
    c['_p'], c['_s'] = p, s
    rng_ = T11.fit_range(c)
    bl = T11.adaptive_blend(p)
    rr = T11.hinge_range(c, p, rng_, bl)
    cands = []
    for sgn in (1, -1):
        for swap in (False, True):
            x, Lp, Rp = prim_to_hinge_c(c, p, s, rr, bl, sgn, swap)
            st = cand_stats(c, x, Lp, Rp)
            st.update(theta_sign=sgn, swapped=swap)
            cands.append((st, x))
            print(f'cand sgn {sgn:+d} swap {swap!s:5}: ' + str(st), flush=True)
    best = min(range(4), key=lambda i: cands[i][0]['rms3d_window'])
    st, x = cands[best]
    print('SELECTED', best, st, flush=True)
    json.dump(dict(candidates=[q for q, _ in cands], selected=best, range=list(map(int, rr)), blend=int(bl), seconds=time.time() - t0),
              open(os.path.join(OUT, 'prep.json'), 'w'), indent=2, default=float)
    np.savez(os.path.join(OUT, 'prep.npz'), x_init=x, x8=c['x8'], p=p, s=s, **{f'x_cand{i}': cands[i][1] for i in range(4)})
    print('NOTE raw layer order fails by label gauge; see rescore/gauge-corrected metric', flush=True)
    print('prep done', time.time() - t0, flush=True)


def run(name):
    t0 = time.time()
    c = T11.setup()
    x = np.load(os.path.join(OUT, 'prep.npz'))['x_init' if name == 'S13' else 'x8'].copy()
    jv = T12.validate_jac(c, x, name)
    x, hist = T12.run_stages(c, x, name)
    L, R, a, b = T11.sol_from_x(c['Hg'], x)
    np.savez(os.path.join(OUT, f'solution_{name}.npz'), x=x, L=L, R=R, a=a, b=b)
    json.dump(dict(history=hist, jac_validation=jv, seconds=time.time() - t0),
              open(os.path.join(OUT, f'run_{name}.json'), 'w'), indent=2, default=float)
    print(name, 'done', time.time() - t0, flush=True)


def merge():
    c = T11.setup()
    Hg = c['Hg']
    pz = np.load(os.path.join(OUT, 'prep.npz'))
    pj = json.load(open(os.path.join(OUT, 'prep.json')))
    sols, runs = {'init': T11.sol_from_x(Hg, pz['x_init'])}, {}
    for k in ('S13', 'S8b'):
        z = np.load(os.path.join(OUT, f'solution_{k}.npz'))
        sols[k] = (z['L'], z['R'], z['a'], z['b'])
        runs[k] = json.load(open(os.path.join(OUT, f'run_{k}.json')))
    m12 = json.load(open(os.path.join(IN12, 'metrics.json')))['metrics']
    M, REN = {}, {}
    for k, (L, R, a, b) in sols.items():
        M[k], REN[k] = metrics_gauge(c, L, R, a, b)
    rs = json.load(open(os.path.join(OUT, 'rescore.json')))['metrics']
    M['S11'], M['H8'] = rs['S11'], rs['H8']
    gate = {k: gate_of(M[k]) for k in ('init', 'S13', 'S8b')}
    cols = ['init', 'S13', 'S8b', 'S11', 'H8']
    print(f'{"metric":30s}' + ''.join(f'{x_:>12s}' for x_ in cols))
    for k in M['S13']:
        print(f'{k:30s}' + ''.join(f'{M[x_].get(k, float("nan")):12.4f}' for x_ in cols))
    print('gate', gate)
    print('runtimes', {k: r['seconds'] for k, r in runs.items()})
    json.dump(dict(metrics=M, gate=gate, runs=runs, prep=pj), open(os.path.join(OUT, 'metrics.json'), 'w'), indent=2, default=float)
    np.savez(os.path.join(OUT, 'solution.npz'), **{k: v for k, v in np.load(os.path.join(OUT, 'solution_S13.npz')).items()})
    ims = [T2.panel(c['gt'], c['Lg'], c['Rg']), T2.panel(REN['init'], *sols['init'][:2], True),
           T2.panel(REN['S13'], *sols['S13'][:2], True), T2.panel(REN['S8b'], *sols['S8b'][:2], True)]
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
    if sys.argv[1] == 'prep':
        prep()
    elif sys.argv[1] == 'rescore':
        rescore()
    elif sys.argv[1] == 'run':
        run(sys.argv[2])
    else:
        merge()
