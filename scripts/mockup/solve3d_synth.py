"""Synthetic de-risk for solve3d.py: a paper-folded strip, noisy 2D edges, solve in 3D."""
import json
import os
import sys
import time

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import solve3d as S  # noqa: E402

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'docs', 'ribbon', 'turns', 'synth')
OUT = os.path.normpath(OUT)
os.makedirs(OUT, exist_ok=True)

W, LTOT, N = 112.0, 1100.0, 221
H = LTOT / (N - 1)
THK = W / 11
RHO = 0.12 * W
ALPHA = np.radians(90.0)
BETA = np.radians(90.0 + 28.0)
MAX_NFEV = int(os.environ.get('MAX_NFEV', 200))


# ------------------------------------------------------------ ground truth
def rot_x(P, deg):
    c, s = np.cos(np.radians(deg)), np.sin(np.radians(deg))
    return np.stack([P[:, 0], c * P[:, 1] - s * P[:, 2], s * P[:, 1] + c * P[:, 2]], 1)


def rot_y(P, deg):
    c, s = np.cos(np.radians(deg)), np.sin(np.radians(deg))
    return np.stack([c * P[:, 0] + s * P[:, 2], P[:, 1], -s * P[:, 0] + c * P[:, 2]], 1)


def fold(q, q0, a, ap, rho):
    """q (M,2) flat -> (M,3) folded over a cylinder (developable)."""
    Xp = (q - q0) @ ap
    Yp = (q - q0) @ a
    out = np.zeros((len(q), 3))
    base = q0[None] + Yp[:, None] * a[None]
    flat = Xp <= 0
    mid = (Xp > 0) & (Xp < np.pi * rho)
    top = Xp >= np.pi * rho
    out[flat, :2] = q[flat]
    phi = Xp[mid] / rho
    out[mid, :2] = base[mid] + (rho * np.sin(phi))[:, None] * ap[None]
    out[mid, 2] = rho * (1 - np.cos(phi))
    out[top, :2] = base[top] - (Xp[top] - np.pi * rho)[:, None] * ap[None]
    out[top, 2] = 2 * rho
    return out


def make_gt():
    u = np.linspace(-LTOT / 2, LTOT / 2, N)
    d = np.array([np.cos(ALPHA), np.sin(ALPHA)])
    e = np.array([-np.sin(ALPHA), np.cos(ALPHA)])
    q0 = np.zeros(2)
    c = q0[None] + u[:, None] * d[None]
    q1 = c - (W / 2) * e[None]
    q2 = c + (W / 2) * e[None]
    a = np.array([np.cos(BETA), np.sin(BETA)])
    ap = np.array([np.sin(BETA), -np.cos(BETA)])
    P = [fold(q, q0, a, ap, RHO) for q in (q1, q2)]
    P = [S_ for S_ in P]

    def place(Q):
        Q = rot_x(Q, -20.0)
        Q = rot_y(Q, 15.0)
        return Q + np.array([0, -40.0, -60.0])
    L, R = place(P[0]), place(P[1])
    Xc = (c - q0) @ ap
    win = (Xc >= -0.25 * W) & (Xc <= np.pi * RHO + 0.25 * W)
    return L, R, win


# ------------------------------------------------------------ visibility
def zbuffer(L, R):
    Z = np.full((S.VIEW_H, S.VIEW_W), np.inf)
    pl, pr = S.project(L), S.project(R)
    dl, dr = S.D - L[:, 2], S.D - R[:, 2]
    for i in range(len(L) - 1):
        tris = [((pl[i], pr[i], pr[i + 1]), (dl[i], dr[i], dr[i + 1])),
                ((pl[i], pr[i + 1], pl[i + 1]), (dl[i], dr[i + 1], dl[i + 1]))]
        for (A, B, C), (da, db, dc) in tris:
            xs = [A[0], B[0], C[0]]
            ys = [A[1], B[1], C[1]]
            x0, x1 = max(int(np.floor(min(xs))), 0), min(int(np.ceil(max(xs))), S.VIEW_W - 1)
            y0, y1 = max(int(np.floor(min(ys))), 0), min(int(np.ceil(max(ys))), S.VIEW_H - 1)
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
            sub = Z[y0:y1 + 1, x0:x1 + 1]
            sub[ins] = np.minimum(sub[ins], depth[ins])
    return Z


def visible(P, depth, Z):
    xy = S.project(P)
    px = np.rint(xy[:, 0]).astype(int)
    py = np.rint(xy[:, 1]).astype(int)
    inb = (px >= 0) & (px < S.VIEW_W) & (py >= 0) & (py < S.VIEW_H)
    v = np.zeros(len(P), bool)
    v[inb] = depth[inb] <= Z[py[inb], px[inb]] + 1.5
    return v


# ------------------------------------------------------------ init
def interp_hidden(obs, vis):
    """Linear interpolation between visible neighbours; beyond the first/last visible
    sample, linear extrapolation using the slope of the 8 nearest visible samples."""
    out = obs.copy()
    idx = np.arange(len(obs))
    vi = idx[vis]
    for k in range(2):
        out[:, k] = np.interp(idx, vi, obs[vis, k])
        for sel, ends in ((vi[:8], idx < vi[0]), (vi[-8:], idx > vi[-1])):
            sl = np.polyfit(sel, obs[sel, k], 1)
            out[ends, k] = np.polyval(sl, idx[ends])
    return out


def make_init(obs1, obs2, vis1, vis2, win):
    wi = np.where(win)[0]
    i0, i1 = wi[0], wi[-1]
    idx = np.arange(N)
    z = np.where(idx < i0, 0.0, np.where(idx > i1, 2 * RHO + 10.0,
                                         (idx - i0) / max(i1 - i0, 1) * (2 * RHO + 10.0)))
    L = S.backproject(interp_hidden(obs1, vis1), z)
    R = S.backproject(interp_hidden(obs2, vis2), z)
    return L, R


# ------------------------------------------------------------ metrics
def metrics(L, R, Lg, Rg, vis1, vis2, pL, pR):
    C = (L + R) / 2
    wl = np.linalg.norm(R - L, axis=1)
    inx = np.abs(np.linalg.norm(C[1:] - C[:-1], axis=1) - H)
    _, r, t, n = S.frames(L, R)
    curv = np.abs(((C[2:] - 2 * C[1:-1] + C[:-2]) * r[1:-1]).sum(1)) / H ** 2
    cam = np.array([0, 0, S.D])
    _, _, _, ng = S.frames(Lg, Rg)
    side = np.sign((n * (cam - C)).sum(1))
    sideg = np.sign((ng * (cam - (Lg + Rg) / 2)).sum(1))
    vr = vis1 | vis2
    rl = np.linalg.norm(S.project(L)[vis1] - pL[vis1], axis=1)
    rr = np.linalg.norm(S.project(R)[vis2] - pR[vis2], axis=1)
    return dict(
        rms_3d=float(np.sqrt(np.mean(np.concatenate([((L - Lg) ** 2).sum(1), ((R - Rg) ** 2).sum(1)])))),
        rms_reproj=float(np.sqrt(np.mean(np.concatenate([rl ** 2, rr ** 2])))),
        width_err_mean=float(np.abs(wl - W).mean()), width_err_max=float(np.abs(wl - W).max()),
        inext_err_mean=float(inx.mean()), inext_err_max=float(inx.max()),
        max_inplane_curvature=float(curv.max()),
        min_clearance=float(S.min_clearance(L, R, W, H)),
        face_agreement=float((side[vr] == sideg[vr]).mean()))


# ------------------------------------------------------------ pictures
def render_panel(L, R):
    img = Image.new('RGB', (S.VIEW_W, S.VIEW_H), (255, 255, 255))
    dr = ImageDraw.Draw(img)
    C, r, t, n = S.frames(L, R)
    cam = np.array([0, 0, S.D])
    pl, pr = S.project(L), S.project(R)
    quads = []
    for i in range(len(L) - 1):
        nn = (n[i] + n[i + 1]) / 2
        cm = (C[i] + C[i + 1]) / 2
        face = (nn * (cam - cm)).sum() > 0
        depth = S.D - cm[2]
        quads.append((depth, i, face))
    for depth, i, face in sorted(quads, reverse=True):
        poly = [tuple(pl[i]), tuple(pr[i]), tuple(pr[i + 1]), tuple(pl[i + 1])]
        dr.polygon(poly, fill=(255, 122, 18) if face else (58, 123, 213))
    dr.line([tuple(p) for p in pl], fill=(255, 0, 255), width=1)
    dr.line([tuple(p) for p in pr], fill=(0, 170, 0), width=1)
    return img


def side_view(Lg, Rg, L, R, path):
    wd, ht = 900, 900
    img = Image.new('RGB', (wd, ht), (255, 255, 255))
    dr = ImageDraw.Draw(img)
    allp = np.concatenate([Lg, Rg, L, R])
    xmin, xmax = allp[:, 0].min(), allp[:, 0].max()
    zmin, zmax = allp[:, 2].min(), allp[:, 2].max()
    sc = 0.9 * min(wd / (xmax - xmin + 1e-9), ht / (zmax - zmin + 1e-9))
    cx_, cz_ = (xmax + xmin) / 2, (zmax + zmin) / 2

    def pt(P):
        return (wd / 2 + (P[0] - cx_) * sc, ht / 2 - (P[2] - cz_) * sc)
    for (A, B, col) in ((Lg, Rg, (130, 130, 130)), (L, R, (255, 122, 18))):
        C = (A + B) / 2
        dr.line([pt(p) for p in C], fill=col, width=2)
        for i in range(0, len(A), 10):
            dr.line([pt(A[i]), pt(B[i])], fill=col, width=1)
    img.save(path)


# ------------------------------------------------------------ main
def main():
    t_start = time.time()
    Lg, Rg, win = make_gt()
    Z = zbuffer(Lg, Rg)
    vis1 = visible(Lg, S.D - Lg[:, 2], Z)
    vis2 = visible(Rg, S.D - Rg[:, 2], Z)
    pL, pR = S.project(Lg), S.project(Rg)
    rng = np.random.default_rng(0)
    obs1 = pL + rng.normal(0, 0.5, pL.shape)
    obs2 = pR + rng.normal(0, 0.5, pR.shape)
    print(f'visible E1 {vis1.sum()}/{N}, E2 {vis2.sum()}/{N}, window rings {win.sum()}')

    L0, R0 = make_init(obs1, obs2, vis1, vis2, win)
    params = dict(W=W, h=H, thk=THK, max_nfev=MAX_NFEV)
    t0 = time.time()
    sol = S.solve(obs1, obs2, vis1, vis2, np.ones(N), np.ones(N), win, L0, R0, params)
    solve_time = time.time() - t0
    L1, R1 = sol['L'], sol['R']

    m_gt = metrics(Lg, Rg, Lg, Rg, vis1, vis2, pL, pR)
    m_init = metrics(L0, R0, Lg, Rg, vis1, vis2, pL, pR)
    m_sol = metrics(L1, R1, Lg, Rg, vis1, vis2, pL, pR)
    print('history (cost per stage):')
    for hrec in sol['history']:
        print('  ', hrec)
    for name, m in (('ground truth', m_gt), ('init', m_init), ('solved', m_sol)):
        print(f'--- {name}')
        for k, v in m.items():
            print(f'  {k:24s} {v:.4f}')
    print(f'solve runtime {solve_time:.1f}s, total {time.time() - t_start:.1f}s, max_nfev {MAX_NFEV}')

    json.dump(dict(ground_truth=m_gt, init=m_init, solved=m_sol, history=sol['history'],
                   solve_seconds=solve_time, max_nfev=MAX_NFEV,
                   visible_E1=int(vis1.sum()), visible_E2=int(vis2.sum())),
              open(os.path.join(OUT, 'metrics.json'), 'w'), indent=2)

    panels = [render_panel(Lg, Rg), render_panel(L0, R0), render_panel(L1, R1)]
    sheet = Image.new('RGB', (S.VIEW_W * 3 + 20, S.VIEW_H), (200, 200, 200))
    for k, p in enumerate(panels):
        sheet.paste(p, (k * (S.VIEW_W + 10), 0))
    sheet.save(os.path.join(OUT, 'proj.png'))
    side_view(Lg, Rg, L1, R1, os.path.join(OUT, 'side.png'))


if __name__ == '__main__':
    main()
