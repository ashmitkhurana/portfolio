"""Synthetic test 14: developable half-twist GT (hinge model) -> twist-primitive fit -> hinge conversion -> synth13 solver.
Usage: python solve3d_synth14.py gt | prep | run S14 | run C8 | merge"""
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
import solve3d_synth10 as T10  # noqa: E402
import solve3d_synth11 as T11  # noqa: E402
import solve3d_synth12 as T12  # noqa: E402
import solve3d_synth13 as T13  # noqa: E402   (patches T12.sliding_problem with the weak-anchor sliding data)
import hinge as HG  # noqa: E402
import twist_primitive as TP  # noqa: E402

ROOT = T12.ROOT
OUT = os.path.join(ROOT, 'synth14')
os.makedirs(OUT, exist_ok=True)
W, N, H, THK = T.W, T.N, T.H, T.THK
UOFF = -T.LTOT / 2
MARGIN = 15
NV_COV = 9
W_COV = 20.0
BIG_Z = 100.0                       # layer-aware init depth ramp (synth8 used 2*RHO+10 for its small roll)

# ---- GT parameters
WIN_HALF = (30, 30)                 # window = rings m-30 .. m+29 (60 rings)
TW_HINGES = 50                      # theta = pi/50 on rings m-25 .. m+24
RAMP = 20                           # oblique ramp length (spec: 10; infeasible, see report)
OBL = W / np.tan(np.radians(35.0))
ROTVEC = np.array([-0.35, 0.25, 0.4])
TRANS = np.array([0.0, 0.0, -60.0])


# ====================================================================== ground truth
def make_gt14():
    Hg = HG.Hinge(N, W, H)
    m = Hg.m
    i = np.arange(N)
    w0, w1 = m - WIN_HALF[0], m + WIN_HALF[1] - 1
    off = OBL * np.clip((i - w0) / RAMP, 0, 1) * np.clip((w1 - i) / RAMP, 0, 1)
    cu = (i - m) * H
    a, b = cu - off / 2, cu + off / 2              # labels (flat u); centred rulings keep both edges monotone
    th = np.full(N, 0.01)
    th[m - TW_HINGES // 2:m + TW_HINGES // 2] += np.pi / TW_HINGES
    sh = a[m]
    x = Hg.pack(np.zeros(3), np.zeros(3), th, a - sh, b - sh)
    L, R = Hg.points(x)
    C = (L[m] + R[m]) / 2
    rot = Rotation.from_rotvec(ROTVEC).as_matrix()
    f = lambda P: (P - C) @ rot.T + TRANS
    win = np.zeros(N, bool)
    win[w0 - 5:w1 + 6] = True                      # twist window +/- 5 rings
    twin = np.zeros(N, bool)
    twin[w0:w1 + 1] = True
    return f(L), f(R), win, dict(a=a, b=b, th=th, off=off, twin=twin, x=x)


def dense_gt(Lg, Rg, a, b):
    t = np.linspace(0, 1, T2.NV)
    G = Lg[:, None, :] + (Rg - Lg)[:, None, :] * t[None, :, None]
    U = a[:, None] + (b - a)[:, None] * t[None, :]
    return G, U


def face_fractions(gt, a_win0, a_win1):
    """Fraction of the visible (nearest-layer) GT pixels that show face A (nf), before / inside / after the twist window,
    classified by the flat label u of the nearest layer."""
    nu, nf, sil = gt['nu'], gt['nf'], gt['sil']
    out = {}
    for k, mk in (('before', sil & (nu < a_win0)), ('window', sil & (nu >= a_win0) & (nu <= a_win1)), ('after', sil & (nu > a_win1))):
        out[k] = dict(px=int(mk.sum()), frac_faceA=float(nf[mk].mean()) if mk.any() else float('nan'))
    return out


def setup():
    Lg, Rg, win, info = make_gt14()
    a_g, b_g = info['a'], info['b']
    G, UG = dense_gt(Lg, Rg, a_g, b_g)
    gt = T2.raster(*T2.grid_tris(G, UG))
    Z = T.zbuffer(Lg, Rg)
    vis1 = T.visible(Lg, S.D - Lg[:, 2], Z)
    vis2 = T.visible(Rg, S.D - Rg[:, 2], Z)
    pL, pR = S.project(Lg), S.project(Rg)
    rng = np.random.default_rng(0)
    obs1 = pL + rng.normal(0, 0.5, pL.shape)
    obs2 = pR + rng.normal(0, 0.5, pR.shape)
    two = T3.two_layer(gt)
    side, neg, pos = T3.front_side(gt)
    L0, R0 = make_init_layered(obs1, obs2, vis1, vis2, win, side)
    box = T3.window_box(Lg, Rg, win, 20)
    g, p_in, p_out = T4.make_guides(gt, pL, pR, box)
    Hg = HG.Hinge(N, W, H)
    x8, ginfo = HG.geometric_init(Hg, L0, R0)
    return dict(Lg=Lg, Rg=Rg, win=win, gt=gt, vis1=vis1, vis2=vis2, pL=pL, pR=pR, obs1=obs1, obs2=obs2, L0=L0, R0=R0,
                box=box, g=g, p_in=p_in, p_out=p_out, Hg=Hg, x8=x8, ginfo=ginfo, two=two, ones=np.ones(N),
                gtinfo=info, side=side, front_counts=(neg, pos))


def make_init_layered(obs1, obs2, vis1, vis2, win, side):
    """T3.make_init_layered with a depth ramp BIG_Z (instead of 2*RHO+10)."""
    wi = np.where(win)[0]
    i0, i1 = wi[0], wi[-1]
    idx = np.arange(N)
    ramp = (idx - i0) / max(i1 - i0, 1)
    if side == 'neg':
        z = np.where(idx < i0, BIG_Z, np.where(idx > i1, 0.0, BIG_Z * (1 - ramp)))
    else:
        z = np.where(idx < i0, 0.0, np.where(idx > i1, BIG_Z, BIG_Z * ramp))
    return S.backproject(T.interp_hidden(obs1, vis1), z), S.backproject(T.interp_hidden(obs2, vis2), z)


def cmd_gt():
    c = setup()
    info = c['gtinfo']
    m = c['Hg'].m
    a, b = info['a'], info['b']
    tw = np.where(info['twin'])[0]
    ff = face_fractions(c['gt'], a[tw[0]], a[tw[-1]])
    print('visible E1/E2', int(c['vis1'].sum()), int(c['vis2'].sum()), 'window rings', int(c['win'].sum()))
    print('min a step', float(np.diff(a).min()), 'min b step', float(np.diff(b).min()), 'max |b-a|', float(np.abs(b - a).max()))
    print('two-layer px', int(c['two'].sum()), 'front side', c['side'], c['front_counts'])
    print('face fractions', ff)
    print('guides', len(c['g']), len(c['p_in']), len(c['p_out']), 'box', c['box'])
    dih = S.dihedral(c['Lg'], c['Rg'])
    print('dihedral window max', float(np.abs(dih).max()))



# ====================================================================== twist fit
def fit_range(c):
    wi = np.where(c['win'])[0]
    return max(wi[0] - MARGIN, 1), min(wi[-1] + MARGIN, N - 2)


def make_fit_residual(c, idx):
    """Residual parts for the primitive over rings idx: sliding point-to-curve (visible), weak anchor, dense coverage."""
    import copy
    m = c['Hg'].m
    r0, r1 = idx[0], idx[-1]
    u = (idx - m) * H
    n = len(idx)
    sds = []
    for obs, vis in ((c['obs1'], c['vis1']), (c['obs2'], c['vis2'])):
        base = HG.SlidingData(obs, vis)
        sub = copy.copy(base)
        sidx = np.array([i for i in base.sidx if r0 <= i <= r1], int)
        sub.sidx = sidx
        aset = set()
        for a0, a1 in base.runs:
            for i in range(max(a0, r0), min(a1, r1) + 1):
                if i - max(a0, r0) < 3 or min(a1, r1) - i < 3:
                    aset.add(i)
        sds.append((sub, sidx - r0, np.array(sorted(aset), int), obs))
    p_in, p_out = c['p_in'], c['p_out']
    cin = np.tile(np.arange(n - 1), (len(p_in), 1))
    cout = np.tile(np.arange(n - 1), (len(p_out), 1))
    sq = np.sqrt(W_COV)
    vs = np.linspace(-W / 2, W / 2, NV_COV)

    def dense_cov(p, pts, cand, kind):
        if len(pts) == 0:
            return np.zeros(0)
        G = np.stack([TP.twist_surface(p, u, np.full(n, v)) for v in vs])
        r = np.stack([S.coverage_resid(G[k], G[k + 1], pts, cand, W, kind) for k in range(NV_COV - 1)])
        if kind == 'in':
            return r.min(0)
        rp = np.where(r > 0, r, np.inf).min(0)
        return np.where(np.isfinite(rp), rp, 0.0)

    def parts(p):
        L, R = TP.twist_points(p, u, W)
        out = []
        anc = []
        for (sd, kloc, aidx, obs), P in zip(sds, (L, R)):
            p2 = S.project(P)
            q, nq = sd.closest(p2[kloc])
            out.append((nq * (p2[kloc] - q)).sum(1))
            anc.append((0.05 * (p2[aidx - r0] - obs[aidx])).ravel())
        return out[0], out[1], np.concatenate(anc), dense_cov(p, p_in, cin, 'in') * sq, dense_cov(p, p_out, cout, 'out') * sq

    return (lambda p: np.concatenate(parts(p))), parts, u


def fit_all(c):
    t0 = time.time()
    r0, r1 = fit_range(c)
    idx = np.arange(r0, r1 + 1)
    m = c['Hg'].m
    wi = np.where(c['win'])[0]
    s0 = float((wi[0] + 5 - m) * H)                       # twist window = win shrunk by the 5-ring margin
    Ls = float((len(wi) - 10 - 1) * H)
    res, parts, u = make_fit_residual(c, idx)
    L0w, R0w = c['L0'][idx], c['R0'][idx]
    starts = []
    print(f'fit rings {r0}..{r1} ({len(idx)}), s0 {s0:.1f}, Ls {Ls:.1f}', flush=True)
    for phi in (np.pi, -np.pi):
        for kap in (0.0, 1 / (3 * W), -1 / (3 * W)):
            p_id = np.array([0, 0, 0, 0, 0, 0, kap, 0.0, phi, s0, Ls])
            Lp, Rp = TP.twist_points(p_id, u, W)
            Rm, tt = T10.kabsch(np.concatenate([Lp, Rp]), np.concatenate([L0w, R0w]))
            p0 = p_id.copy()
            p0[:3] = Rotation.from_matrix(Rm).as_rotvec()
            p0[3:6] = tt
            lo = np.full(11, -np.inf); hi = np.full(11, np.inf)
            lo[6], hi[6] = -1 / W, 1 / W
            lo[10], hi[10] = 2 * H, 600.0
            lo[8], hi[8] = -2 * np.pi, 2 * np.pi
            t1 = time.time()
            r = least_squares(res, p0, method='trf', x_scale='jac', max_nfev=1500, bounds=(lo, hi))
            sl1, sl2, an, ci, co = parts(r.x)
            sl_ = np.concatenate([sl1, sl2])
            st = dict(phi0_deg=float(np.degrees(phi)), kappa0=kap, cost=float(r.cost), nfev=int(r.nfev), status=int(r.status),
                      rms_sliding=float(np.sqrt(np.mean(sl_ ** 2))), anchor_cost=float(0.5 * np.sum(an ** 2)),
                      cov_in_cost=float(0.5 * np.sum(ci ** 2)), cov_out_cost=float(0.5 * np.sum(co ** 2)),
                      kappa=float(r.x[6]), psi0_deg=float(np.degrees(r.x[7])), phi_deg=float(np.degrees(r.x[8])),
                      s0=float(r.x[9]), Ls=float(r.x[10]), secs=time.time() - t1, p=r.x.tolist())
            starts.append(st)
            print(f'  phi0 {st["phi0_deg"]:+6.0f} kap0 {kap * W:+.3f}/W -> cost {st["cost"]:10.2f} rms_slide {st["rms_sliding"]:6.3f} '
                  f'kappa*W {st["kappa"] * W:+.3f} psi0 {st["psi0_deg"]:7.1f} phi {st["phi_deg"]:7.1f} s0 {st["s0"]:7.1f} Ls {st["Ls"]:6.1f} '
                  f'nfev {st["nfev"]} ({st["secs"]:.0f}s)', flush=True)
    sel = min(starts, key=lambda q: q['cost'])
    print('selected', {k: v for k, v in sel.items() if k != 'p'}, flush=True)
    return starts, sel, (r0, r1), time.time() - t0


# ====================================================================== primitive -> hinge
def developable_partner(p, u_ext, dgrid=None):
    """For each left-edge sample at arc length u_i, the right-edge parameter u_i + delta_i at which the ruling is coplanar with
    both edge tangents (exact developable-ruling condition), choosing the root nearest the straight cross-line (delta = 0)."""
    eps = 1e-3 * H
    if dgrid is None:
        dgrid = np.arange(-1.5 * W, 1.5 * W + 1e-9, 0.5)
    Lf = lambda s: TP.twist_surface(p, s, np.full(np.shape(s), -W / 2))
    Rf = lambda s: TP.twist_surface(p, s, np.full(np.shape(s), W / 2))
    tL = (Lf(u_ext + eps) - Lf(u_ext - eps)) / (2 * eps)
    PL = Lf(u_ext)
    delta = np.zeros(len(u_ext))
    resid = np.zeros(len(u_ext))
    for i, ui in enumerate(u_ext):
        s = ui + dgrid
        Rp = Rf(s)
        tR = (Rf(s + eps) - Rf(s - eps)) / (2 * eps)
        rr = Rp - PL[i]
        f = np.einsum('j,kj->k', tL[i], np.cross(rr, tR))
        f = f / (np.linalg.norm(tL[i]) * np.linalg.norm(rr, axis=1) * np.linalg.norm(tR, axis=1) + 1e-12)
        cand = []
        for j in range(len(dgrid) - 1):
            if abs(f[j]) < 1e-9:
                cand.append(dgrid[j])
            elif f[j] * f[j + 1] < 0:
                cand.append(dgrid[j] - f[j] * (dgrid[j + 1] - dgrid[j]) / (f[j + 1] - f[j]))
        if abs(f[-1]) < 1e-9:
            cand.append(dgrid[-1])
        if cand:
            delta[i] = min(cand, key=abs)
        else:
            delta[i] = 0.0                      # no developable ruling in range: keep the straight cross-line
        resid[i] = float(np.min(np.abs(f)))
    return delta, PL, Rf(u_ext + delta), resid


def prim_to_hinge(c, p, rng_, sgn, swap):
    Hg, x8 = c['Hg'], c['x8']
    m = Hg.m
    r0, r1 = rng_
    _, _, th8, a8, b8 = (v[0] for v in Hg.unpack(x8[None]))
    ext = np.arange(r0 - 1, r1 + 2)
    u_ext = (ext - m) * H
    delta, PL, PR, rootres = developable_partner(p, u_ext)
    TL, TR = (PR, PL) if swap else (PL, PR)
    sa = np.maximum(np.linalg.norm(np.diff(TL, axis=0), axis=1), 0.5)
    sb = np.maximum(np.linalg.norm(np.diff(TR, axis=0), axis=1), 0.5)
    a_cum = np.concatenate([[0.0], np.cumsum(sa)])
    b_cum = np.concatenate([[0.0], np.cumsum(sb)])
    tang = TL[2] - TL[0]
    rr1 = TR[1] - TL[1]
    o1 = np.sign(rr1 @ tang) * np.sqrt(max(rr1 @ rr1 - W * W, 0.0))
    a_ext = a_cum - a_cum[1] + a8[r0]
    b_ext = b_cum - a_cum[1] + a8[r0] + o1
    th_w = sgn * S.dihedral(TL, TR)
    sl = slice(1, len(ext) - 1)
    idx = np.arange(r0, r1 + 1)
    th = th8.copy()
    th[idx] = th_w
    a_rng, b_rng = a_ext[sl], b_ext[sl]
    a = a8.copy(); b = b8.copy()
    a[idx], b[idx] = a_rng, b_rng
    b[:r0] = a8[:r0] + (b8[:r0] - a8[:r0]) - (b8[r0] - a8[r0]) + (b_rng[0] - a_rng[0])
    a[r1 + 1:] = a8[r1 + 1:] + (a_rng[-1] - a8[r1])
    b[r1 + 1:] = b8[r1 + 1:] + (b_rng[-1] - b8[r1])
    sh = a[m]
    a, b = a - sh, b - sh
    x = Hg.pack(np.zeros(3), np.zeros(3), th, a, b)
    L, R = Hg.points(x)
    Lp = np.zeros((N, 3)); Rp = np.zeros((N, 3))
    Lp[idx], Rp[idx] = TL[sl], TR[sl]
    wi = np.where(c['win'])[0]
    Rm, tt = T10.kabsch(np.concatenate([L[wi], R[wi]]), np.concatenate([Lp[wi], Rp[wi]]))
    x = Hg.pack(Rotation.from_matrix(Rm).as_rotvec(), tt, th, a, b)
    L, R = Hg.points(x)
    r3 = float(np.sqrt(np.mean(np.concatenate([((L[wi] - Lp[wi]) ** 2).sum(1), ((R[wi] - Rp[wi]) ** 2).sum(1)]))))
    r2 = float(np.sqrt(np.mean(np.concatenate([((S.project(L[wi]) - S.project(Lp[wi])) ** 2).sum(1),
                                               ((S.project(R[wi]) - S.project(Rp[wi])) ** 2).sum(1)]))))
    dih = S.dihedral(L, R)
    info = dict(theta_sign=sgn, swapped=swap, rms3d_window=r3, rms2d_window=r2, delta_min=float(delta.min()), delta_max=float(delta.max()),
                delta_median=float(np.median(delta)), root_resid_max=float(rootres.max()),
                mono_viol_window_a=float((np.diff(a[r0:r1 + 1]) < 0.5).mean()), mono_viol_window_b=float((np.diff(b[r0:r1 + 1]) < 0.5).mean()),
                partner_nonmonotone_frac=float((np.diff(u_ext + delta) <= 0).mean()),
                max_dihedral_err_fk_vs_theta_window=float(np.abs(dih[idx - 1] - th[idx]).max()),
                offset_at_r0=float(b_rng[0] - a_rng[0]), offset_max_abs_window=float(np.abs(b_rng - a_rng).max()), range=[int(r0), int(r1)])
    return x, info


# ====================================================================== commands
def prep():
    t0 = time.time()
    c = setup()
    starts, sel, rng_, fsecs = fit_all(c)
    p = np.array(sel['p'])
    cands = []
    for sgn in (1, -1):
        for swap in (False, True):
            x, info = prim_to_hinge(c, p, rng_, sgn, swap)
            cands.append((info, x))
            print(f'cand sgn {sgn:+d} swap {swap!s:5}: ' + str(info), flush=True)
    best = min(range(4), key=lambda i: cands[i][0]['rms3d_window'])
    print('SELECTED', best, cands[best][0], flush=True)
    json.dump(dict(starts=starts, selected_start={k: v for k, v in sel.items() if k != 'p'}, p=p.tolist(), range=list(map(int, rng_)),
                   candidates=[q for q, _ in cands], selected_cand=best, fit_seconds=fsecs, seconds=time.time() - t0),
              open(os.path.join(OUT, 'prep.json'), 'w'), indent=2, default=float)
    np.savez(os.path.join(OUT, 'prep.npz'), x_init=cands[best][1], x8=c['x8'], p=p, **{f'x_cand{i}': cands[i][1] for i in range(4)})
    print('prep done', time.time() - t0, flush=True)


def run(name):
    t0 = time.time()
    c = setup()
    x = np.load(os.path.join(OUT, 'prep.npz'))['x_init' if name == 'S14' else 'x8'].copy()
    jv = T12.validate_jac(c, x, name)
    x, hist = T12.run_stages(c, x, name)
    L, R, a, b = T11.sol_from_x(c['Hg'], x)
    np.savez(os.path.join(OUT, f'solution_{name}.npz'), x=x, L=L, R=R, a=a, b=b)
    json.dump(dict(history=hist, jac_validation=jv, seconds=time.time() - t0),
              open(os.path.join(OUT, f'run_{name}.json'), 'w'), indent=2, default=float)
    print(name, 'done', time.time() - t0, flush=True)


def face_agree(ren, gt, box):
    x0, y0, x1, y1 = box
    both = (ren['sil'] & gt['sil'])[y0:y1, x0:x1]
    if not both.any():
        return float('nan')
    return float((ren['nf'][y0:y1, x0:x1][both] == gt['nf'][y0:y1, x0:x1][both]).mean())


def primitive_dense(c, p, idx):
    m = c['Hg'].m
    u = (idx - m) * H
    vs = np.linspace(-W / 2, W / 2, T2.NV)
    G = np.stack([TP.twist_surface(p, u, np.full(len(u), v)) for v in vs], 1)
    return T2.raster(*T2.grid_tris(G, np.repeat(u[:, None], len(vs), 1)))


def merge():
    from solve3d_synth9 import gt_edge_rms
    c = setup()
    Hg = c['Hg']
    pz = np.load(os.path.join(OUT, 'prep.npz'))
    pj = json.load(open(os.path.join(OUT, 'prep.json')))
    p = pz['p']
    sols, runs = {'init': T11.sol_from_x(Hg, pz['x_init'])}, {}
    for k in ('S14', 'C8'):
        z = np.load(os.path.join(OUT, f'solution_{k}.npz'))
        sols[k] = (z['L'], z['R'], z['a'], z['b'])
        runs[k] = json.load(open(os.path.join(OUT, f'run_{k}.json')))
    M, REN = {}, {}
    for k, (L, R, a, b) in sols.items():
        M[k], REN[k] = T13.metrics_gauge(c, L, R, a, b)
        M[k]['face_agreement_window'] = face_agree(REN[k], c['gt'], c['box'])
    gate = {k: T13.gate_of(M[k]) for k in ('init', 'S14', 'C8')}
    cols = ['init', 'S14', 'C8']
    print(f'{"metric":30s}' + ''.join(f'{x_:>12s}' for x_ in cols))
    for k in M['S14']:
        print(f'{k:30s}' + ''.join(f'{M[x_].get(k, float("nan")):12.4f}' for x_ in cols))
    print('gate', gate)
    print('runtimes', {k: r['seconds'] for k, r in runs.items()})
    # primitive panel (fit range)
    r0, r1 = pj['range']
    idx = np.arange(r0, r1 + 1)
    pren = primitive_dense(c, p, idx)
    u_all = (np.arange(N) - Hg.m) * H
    Lp, Rp = TP.twist_points(p, u_all, W)
    prim_edge = gt_edge_rms(Lp[idx], Rp[idx], np.ones(len(idx), bool), c['Lg'], c['Rg'], c['win'])
    M['primitive'] = dict(rms_reproj_window_gt_edges_idx_range=prim_edge[0], face_agreement_window=face_agree(pren, c['gt'], c['box']),
                          sil_iou_fitrange=T2.iou(pren['sil'], c['gt']['sil']))
    print('primitive', M['primitive'])
    gtinfo = c['gtinfo']
    tw = np.where(gtinfo['twin'])[0]
    ff = face_fractions(c['gt'], gtinfo['a'][tw[0]], gtinfo['a'][tw[-1]])
    json.dump(dict(metrics=M, gate=gate, runs=runs, prep=pj, gt_face_fractions=ff), open(os.path.join(OUT, 'metrics.json'), 'w'), indent=2, default=float)
    np.savez(os.path.join(OUT, 'solution.npz'), **dict(np.load(os.path.join(OUT, 'solution_S14.npz'))))
    ims = [T2.panel(c['gt'], c['Lg'], c['Rg']), T2.panel(pren, Lp[idx], Rp[idx], False), T2.panel(REN['init'], *sols['init'][:2], True),
           T2.panel(REN['S14'], *sols['S14'][:2], True), T2.panel(REN['C8'], *sols['C8'][:2], True)]
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

    if sys.argv[1] == 'gt':
        cmd_gt()
    elif sys.argv[1] == 'prep':
        prep()
    elif sys.argv[1] == 'run':
        run(sys.argv[2])
    else:
        merge()
