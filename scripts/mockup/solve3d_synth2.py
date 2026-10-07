"""Synthetic test 2: isometric-quad solver (solve_iso) vs original solve, dense ground-truth evaluation."""
import json
import os
import sys
import time

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import solve3d as S  # noqa: E402
import solve3d_synth as T  # noqa: E402

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..',
                                    'docs', 'ribbon', 'turns', 'synth2'))
os.makedirs(OUT, exist_ok=True)
W, LTOT, N, H, THK = T.W, T.LTOT, T.N, T.H, T.THK
MAX_NFEV = int(os.environ.get('MAX_NFEV', 300))
NV = 9
CAM = np.array([0, 0, S.D])


# ------------------------------------------------------------ dense ground truth
def make_gt_dense():
    u = np.linspace(-LTOT / 2, LTOT / 2, N)
    v = np.linspace(-W / 2, W / 2, NV)
    d = np.array([np.cos(T.ALPHA), np.sin(T.ALPHA)])
    e = np.array([-np.sin(T.ALPHA), np.cos(T.ALPHA)])
    q = u[:, None, None] * d[None, None] + v[None, :, None] * e[None, None]
    a = np.array([np.cos(T.BETA), np.sin(T.BETA)])
    ap = np.array([np.sin(T.BETA), -np.cos(T.BETA)])
    P = T.fold(q.reshape(-1, 2), np.zeros(2), a, ap, T.RHO)
    P = T.rot_x(P, -20.0)
    P = T.rot_y(P, 15.0)
    P = P + np.array([0, -40.0, -60.0])
    return P.reshape(N, NV, 3), np.repeat(u[:, None], NV, 1)


# ------------------------------------------------------------ rasteriser
def grid_tris(G, U):
    """G (N,K,3), U (N,K) -> triangles (M,3,3), u (M,3), face-A flag (M,)."""
    A = (G[:-1, :-1], G[1:, :-1], G[:-1, 1:])
    B = (G[1:, :-1], G[1:, 1:], G[:-1, 1:])
    UA = (U[:-1, :-1], U[1:, :-1], U[:-1, 1:])
    UB = (U[1:, :-1], U[1:, 1:], U[:-1, 1:])
    P = np.stack([np.concatenate([x.reshape(-1, 3), y.reshape(-1, 3)]) for x, y in zip(A, B)], 1)
    Uu = np.stack([np.concatenate([x.ravel(), y.ravel()]) for x, y in zip(UA, UB)], 1)
    nrm = np.cross(P[:, 1] - P[:, 0], P[:, 2] - P[:, 0])
    face = (nrm * (CAM - P[:, 0])).sum(1) > 0
    return P, Uu, face


def raster(P, U, face):
    shp = (S.VIEW_H, S.VIEW_W)
    nz = np.full(shp, np.inf); fz = np.full(shp, -np.inf)
    nu = np.full(shp, np.nan); fu = np.full(shp, np.nan)
    nf = np.zeros(shp, bool)
    pr = S.project(P.reshape(-1, 3)).reshape(-1, 3, 2)
    dp = S.D - P[:, :, 2]
    for m in range(len(P)):
        A, B, C = pr[m]
        da, db, dc = dp[m]
        x0, x1 = max(int(np.floor(min(A[0], B[0], C[0]))), 0), min(int(np.ceil(max(A[0], B[0], C[0]))), S.VIEW_W - 1)
        y0, y1 = max(int(np.floor(min(A[1], B[1], C[1]))), 0), min(int(np.ceil(max(A[1], B[1], C[1]))), S.VIEW_H - 1)
        if x1 < x0 or y1 < y0:
            continue
        den = (B[1] - C[1]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[1] - C[1])
        if abs(den) < 1e-12:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        l1 = ((B[1] - C[1]) * (gx - C[0]) + (C[0] - B[0]) * (gy - C[1])) / den
        l2 = ((C[1] - A[1]) * (gx - C[0]) + (A[0] - C[0]) * (gy - C[1])) / den
        l3 = 1 - l1 - l2
        ins = (l1 >= -1e-9) & (l2 >= -1e-9) & (l3 >= -1e-9)
        if not ins.any():
            continue
        depth = 1.0 / (l1 / da + l2 / db + l3 / dc)
        u = depth * (l1 * U[m, 0] / da + l2 * U[m, 1] / db + l3 * U[m, 2] / dc)
        sl = (slice(y0, y1 + 1), slice(x0, x1 + 1))
        c_n = ins & (depth < nz[sl])
        c_f = ins & (depth > fz[sl])
        nz[sl] = np.where(c_n, depth, nz[sl]); nu[sl] = np.where(c_n, u, nu[sl])
        nf[sl] = np.where(c_n, face[m], nf[sl])
        fz[sl] = np.where(c_f, depth, fz[sl]); fu[sl] = np.where(c_f, u, fu[sl])
    return dict(nz=nz, nu=nu, nf=nf, fz=fz, fu=fu, sil=np.isfinite(nz))


def render_ring(L, R, uL, uR):
    G = np.stack([L, R], 1)
    return raster(*grid_tris(G, np.stack([uL, uR], 1)))


def iou(a, b):
    return float((a & b).sum() / max((a | b).sum(), 1))


# ------------------------------------------------------------ metrics
def min_clear(L, R, ca):
    I, J = np.meshgrid(np.arange(N), np.arange(N), indexing='ij')
    m = (J > I) & (np.abs(ca[I] - ca[J]) > 1.5 * W)
    return float(S.segment_dist(L[I[m]], R[I[m]], L[J[m]], R[J[m]]).min())


def evaluate(L, R, a, b, gt, Lg, Rg, vis1, vis2, pL, pR):
    uoff = -LTOT / 2
    ren = render_ring(L, R, a + uoff, b + uoff)
    sil = iou(ren['sil'], gt['sil'])
    fa = iou(ren['sil'] & ren['nf'], gt['sil'] & gt['nf'])
    fb = iou(ren['sil'] & ~ren['nf'], gt['sil'] & ~gt['nf'])
    rl = np.linalg.norm(S.project(L)[vis1] - pL[vis1], axis=1)
    rr = np.linalg.norm(S.project(R)[vis2] - pR[vis2], axis=1)
    e = S.iso_residuals(L, R, a, b, W)
    two = gt['sil'] & ((gt['fz'] - gt['nz']) > 1.0)   # GT has two layers (depth gap > 1 unit)
    ok = two & ren['sil'] & (np.abs(ren['nu'] - gt['nu']) < 0.75 * W)
    return dict(
        sil_iou=sil, faceA_iou=fa, faceB_iou=fb,
        rms_reproj=float(np.sqrt(np.mean(np.concatenate([rl ** 2, rr ** 2])))),
        max_iso_resid=float(max(np.abs(x).max() for x in e)),
        max_planarity=float(np.abs(S.planarity(L, R)).max()),
        min_clearance=min_clear(L, R, (a + b) / 2),
        layer_order=float(ok.sum() / max(two.sum(), 1)), n_overlap_px=int(two.sum()),
        rms_3d=float(np.sqrt(np.mean(np.concatenate([((L - Lg) ** 2).sum(1), ((R - Rg) ** 2).sum(1)])))))


# ------------------------------------------------------------ pictures
def panel(ren, L, R, rulings=False):
    img = np.full((S.VIEW_H, S.VIEW_W, 3), 255, np.uint8)
    img[ren['sil'] & ren['nf']] = (255, 122, 18)
    img[ren['sil'] & ~ren['nf']] = (58, 123, 213)
    im = Image.fromarray(img)
    dr = ImageDraw.Draw(im)
    pl, pr = S.project(L), S.project(R)
    dr.line([tuple(p) for p in pl], fill=(255, 0, 255), width=1)
    dr.line([tuple(p) for p in pr], fill=(0, 170, 0), width=1)
    if rulings:
        for i in range(0, len(L), 4):
            dr.line([tuple(pl[i]), tuple(pr[i])], fill=(0, 0, 0), width=1)
    return im


def side_view(G, L, R, path):
    wd, ht = 900, 900
    img = Image.new('RGB', (wd, ht), (255, 255, 255))
    dr = ImageDraw.Draw(img)
    allp = np.concatenate([G.reshape(-1, 3), L, R])
    xmin, xmax = allp[:, 0].min(), allp[:, 0].max()
    zmin, zmax = allp[:, 2].min(), allp[:, 2].max()
    sc = 0.9 * min(wd / (xmax - xmin + 1e-9), ht / (zmax - zmin + 1e-9))
    cx_, cz_ = (xmax + xmin) / 2, (zmax + zmin) / 2

    def pt(P):
        return (wd / 2 + (P[0] - cx_) * sc, ht / 2 - (P[2] - cz_) * sc)
    grey = (150, 150, 150)
    for i in range(N):
        dr.line([pt(G[i, 0]), pt(G[i, -1])], fill=grey, width=1)
    for k in range(NV):
        dr.line([pt(p) for p in G[:, k]], fill=grey, width=1)
    orange = (255, 122, 18)
    C = (L + R) / 2
    dr.line([pt(p) for p in C], fill=orange, width=2)
    for i in range(0, N, 4):
        dr.line([pt(L[i]), pt(R[i])], fill=orange, width=1)
    img.save(path)


# ------------------------------------------------------------ main
COLS = ['init', 'solve', 'solve_iso']


def main():
    t_start = time.time()
    Lg, Rg, win = T.make_gt()
    G, UG = make_gt_dense()
    assert np.abs(G[:, 0] - Lg).max() < 1e-6 and np.abs(G[:, -1] - Rg).max() < 1e-6
    gt = raster(*grid_tris(G, UG))
    Z = T.zbuffer(Lg, Rg)
    vis1 = T.visible(Lg, S.D - Lg[:, 2], Z)
    vis2 = T.visible(Rg, S.D - Rg[:, 2], Z)
    pL, pR = S.project(Lg), S.project(Rg)
    rng = np.random.default_rng(0)
    obs1 = pL + rng.normal(0, 0.5, pL.shape)
    obs2 = pR + rng.normal(0, 0.5, pR.shape)
    print(f'visible E1 {vis1.sum()}/{N}, E2 {vis2.sum()}/{N}, GT two-layer px '
          f'{int((gt["sil"] & ((gt["fz"] - gt["nz"]) > 1.0)).sum())}')

    L0, R0 = T.make_init(obs1, obs2, vis1, vis2, win)
    params = dict(W=W, h=H, thk=THK, max_nfev=MAX_NFEV)
    ones = np.ones(N)
    t0 = time.time()
    sol = S.solve(obs1, obs2, vis1, vis2, ones, ones, win, L0, R0, dict(params, max_nfev=200))
    t_solve = time.time() - t0
    t0 = time.time()
    iso = S.solve_iso(obs1, obs2, vis1, vis2, ones, ones, win, L0, R0, params)
    t_iso = time.time() - t0

    ab = np.arange(N) * H
    ev = lambda L, R, a, b: evaluate(L, R, a, b, gt, Lg, Rg, vis1, vis2, pL, pR)
    M = dict(init=ev(L0, R0, ab, ab), solve=ev(sol['L'], sol['R'], ab, ab),
             solve_iso=ev(iso['L'], iso['R'], iso['a'], iso['b']))
    keys = list(M['init'].keys())
    print(f'{"metric":16s}' + ''.join(f'{c:>14s}' for c in COLS))
    for k in keys:
        print(f'{k:16s}' + ''.join(f'{M[c][k]:14.4f}' for c in COLS))
    print('solve history:')
    for h_ in sol['history']:
        print('  ', h_)
    print('solve_iso history:')
    for h_ in iso['history']:
        print('  ', h_)
    print(f'runtime: solve {t_solve:.1f}s, solve_iso {t_iso:.1f}s, total {time.time() - t_start:.1f}s')
    json.dump(dict(metrics=M, history_solve=sol['history'], history_iso=iso['history'],
                   solve_seconds=t_solve, solve_iso_seconds=t_iso, max_nfev_iso=MAX_NFEV),
              open(os.path.join(OUT, 'metrics.json'), 'w'), indent=2)

    uoff = -LTOT / 2
    ims = [panel(gt, Lg, Rg),
           panel(render_ring(L0, R0, ab + uoff, ab + uoff), L0, R0),
           panel(render_ring(sol['L'], sol['R'], ab + uoff, ab + uoff), sol['L'], sol['R']),
           panel(render_ring(iso['L'], iso['R'], iso['a'] + uoff, iso['b'] + uoff), iso['L'], iso['R'], True)]
    sheet = Image.new('RGB', (S.VIEW_W * 4 + 30, S.VIEW_H), (200, 200, 200))
    for k, p in enumerate(ims):
        sheet.paste(p, (k * (S.VIEW_W + 10), 0))
    sheet.save(os.path.join(OUT, 'proj.png'))
    side_view(G, iso['L'], iso['R'], os.path.join(OUT, 'side.png'))


if __name__ == '__main__':
    main()
