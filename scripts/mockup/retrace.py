#!/usr/bin/env python3
"""Retrace ribbon edges from a route file. Usage: retrace.py route.json out_dir"""
import json, os, sys, time
import numpy as np
import cv2
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from scipy.interpolate import BSpline
import scipy.sparse as sp
from scipy.sparse.linalg import spsolve
from scipy.spatial import cKDTree
from skimage import color, feature, filters
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import guides_overlay as GO

ROOT = GO.ROOT
SRC = GO.SRC
W = 112.0
REPORT = {}
LOG = []

def log(s=""):
    LOG.append(s)

# ---------------------------------------------------------------- 1a
def edge_map(poly):
    im = Image.open(SRC).convert('RGBA')
    bg = Image.new('RGBA', im.size, (0, 0, 0, 255)); bg.alpha_composite(im)
    rgb = np.asarray(bg.convert('RGB')).astype(np.float64) / 255.0
    alpha = np.asarray(im)[..., 3].astype(np.float64) / 255.0
    L = color.rgb2lab(rgb)[..., 0]
    cu = np.zeros(L.shape, bool)
    for s in (1.5, 2.5, 3.5):
        cu |= feature.canny(L / 100.0, sigma=s)
    cu = cu.astype(np.float64)
    g = filters.sobel(filters.gaussian(L, sigma=1.0))
    g = np.clip(g / np.percentile(g, 99.5), 0, 1)
    ab = filters.sobel(filters.gaussian(alpha, sigma=1.0))
    ab = np.clip(ab / ab.max(), 0, 1)
    r = filters.sato(L / 100.0, sigmas=[1, 2], black_ridges=False)
    r = np.clip(r / np.percentile(r, 99.5), 0, 1)
    E = 0.4 * cu + 0.3 * g + 1.2 * ab + 0.6 * r
    E = ndi.gaussian_filter(E, 1.0); E = E / E.max()
    mask = np.zeros(E.shape, np.uint8)
    cv2.fillPoly(mask, [np.array(poly, np.int32)], 1)
    E[mask > 0] = 0
    return E.astype(np.float32), mask.astype(bool), bg

# ---------------------------------------------------------------- 1b
def arclen(P):
    return np.r_[0, np.cumsum(np.hypot(*np.diff(P, axis=0).T))]

def resample_lin(P, step=2.0):
    P = np.asarray(P, float)
    s = arclen(P)
    if s[-1] == 0: return P[:1]
    n = max(2, int(round(s[-1] / step)) + 1)
    u = np.linspace(0, s[-1], n)
    return np.stack([np.interp(u, s, P[:, 0]), np.interp(u, s, P[:, 1])], 1)

def catmull(P, step=2.0):
    P = np.asarray(P, float)
    if len(P) == 2: return resample_lin(P, step)
    # drop duplicate points
    keep = [0] + [i for i in range(1, len(P)) if np.hypot(*(P[i] - P[i - 1])) > 1e-9]
    P = P[keep]
    if len(P) == 2: return resample_lin(P, step)
    ext0 = 2 * P[0] - P[1]; ext1 = 2 * P[-1] - P[-2]
    Q = np.vstack([ext0, P, ext1])
    out = []
    for i in range(1, len(Q) - 2):
        p0, p1, p2, p3 = Q[i - 1], Q[i], Q[i + 1], Q[i + 2]
        t0 = 0.0
        t1 = t0 + max(np.hypot(*(p1 - p0)), 1e-9) ** 0.5
        t2 = t1 + max(np.hypot(*(p2 - p1)), 1e-9) ** 0.5
        t3 = t2 + max(np.hypot(*(p3 - p2)), 1e-9) ** 0.5
        t = np.linspace(t1, t2, 60)[:, None]
        A1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1
        A2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2
        A3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3
        B1 = (t2 - t) / (t2 - t0) * A1 + (t - t0) / (t2 - t0) * A2
        B2 = (t3 - t) / (t3 - t1) * A2 + (t - t1) / (t3 - t1) * A3
        C = (t2 - t) / (t2 - t1) * B1 + (t - t1) / (t2 - t1) * B2
        out.append(C if i == 1 else C[1:])
    D = np.vstack(out)
    return resample_lin(D, step)

def legacy_curves(leg):
    return [(np.array(leg['edge1'], float), np.array(leg['vis1'], bool), 'edge1'),
            (np.array(leg['edge2'], float), np.array(leg['vis2'], bool), 'edge2')]

def gap_legacy(leg, P, Q, tail, idx):
    P = None if P is None else np.array(P, float); Q = np.array(Q, float)
    best = None
    for C, V, nm in legacy_curves(leg):
        if tail:
            cand = np.where(C[:, 1] <= 1900)[0]
            i = int(cand[0]) if len(cand) else 0
            di = 0.0
        else:
            i = int(np.argmin(np.hypot(*(C - P).T))); di = float(np.hypot(*(C[i] - P)))
        j = int(np.argmin(np.hypot(*(C - Q).T))); dj = float(np.hypot(*(C[j] - Q)))
        ok = dj <= 15 and (tail or di <= 15) and abs(j - i) >= 2
        if ok and (best is None or di + dj < best[0]):
            best = (di + dj, nm, i, j, C, V)
    if best is None:
        if tail:
            raise RuntimeError("legacy_tail unresolved")
        pts = resample_lin(np.array([P, Q]), 2.0)
        return pts, {"piece": idx, "status": "unresolved"}
    _, nm, i, j, C, V = best
    sl = list(range(i, j + 1)) if j >= i else list(range(i, j - 1, -1))
    sl = [k for k in sl if V[k]]
    pts = resample_lin(C[sl], 2.0)
    return pts, {"piece": idx, "status": "ok", "curve": nm, "i": i, "j": j, "dist_sum": round(best[0], 2)}

def build_raw(route, guides, leg, name):
    segs = guides['segments']
    X, K, Pc = [], [], []
    notes = []
    for idx, it in enumerate(route['edges'][name]):
        if 'seg' in it:
            s = segs[it['seg']]
            if s['kind'] == 'sil': raise RuntimeError("sil segment in route: %r" % (it,))
            pts = np.array(s['pts'], float)
            if it.get('reverse'): pts = pts[::-1]
            pts = catmull(pts); kind = s['kind']
        elif 'pts' in it:
            pts = catmull(np.array(it['pts'], float)); kind = it['kind']
        elif it.get('gap') == 'legacy':
            pts, nt = gap_legacy(leg, it['from'], it['to'], False, idx); kind = 'gap'; notes.append(nt)
        elif it.get('gap') == 'legacy_tail':
            pts, nt = gap_legacy(leg, None, it['to'], True, idx); kind = 'gap'; notes.append(nt)
        else:
            raise RuntimeError("bad route item %r" % (it,))
        if X and np.hypot(*(pts[0] - X[-1])) < 1.0:
            pts = pts[1:]
        for p in pts:
            X.append(p); K.append(kind); Pc.append(idx)
    return np.array(X), K, Pc, notes

# ---------------------------------------------------------------- 1c
def _normals(P):
    Ps = np.stack([ndi.gaussian_filter1d(P[:, c], 2.0, mode='nearest') for c in (0, 1)], 1)
    T = np.gradient(Ps, axis=0)
    T /= np.maximum(np.hypot(*T.T), 1e-9)[:, None]
    return np.stack([-T[:, 1], T[:, 0]], 1)

def _viterbi(E, P, N, in_anom, lim):
    n = len(P)
    offs = np.arange(-lim, lim + 1e-9, 0.5); m = len(offs)
    U = np.zeros((n, m))
    for k, o in enumerate(offs):
        q = P + o * N
        U[:, k] = -ndi.map_coordinates(E, [q[:, 1], q[:, 0]], order=1, mode='nearest')
    for i in range(n):
        if in_anom[i]:
            U[i, :] = 1e3; U[i, m // 2] = 0.0
    cost = U[0].copy(); back = np.zeros((n, m), int)
    for i in range(1, n):
        new = np.empty(m)
        for k in range(m):
            lo, hi = max(0, k - 1), min(m, k + 2)
            c = cost[lo:hi] + 0.15 * np.abs(offs[lo:hi] - offs[k]) / 0.5
            a = int(np.argmin(c)); back[i, k] = lo + a; new[k] = c[a] + U[i, k]
        cost = new
    k = int(np.argmin(cost)); path = [k]
    for i in range(n - 1, 0, -1):
        k = back[i, k]; path.append(k)
    path = path[::-1]
    return offs[path]

def snap_run(E, P, in_anom):
    """Two-pass snap. Returns (snapped points, o1, o2)."""
    n = len(P)
    if n < 2:
        return P.copy(), np.zeros(n), np.zeros(n)
    N1 = _normals(P)
    o1 = _viterbi(E, P, N1, in_anom, 12.0)
    os_ = ndi.gaussian_filter1d(o1, 8.0, mode='nearest')
    P2 = P + os_[:, None] * N1
    N2 = _normals(P2)
    o2 = _viterbi(E, P2, N2, in_anom, 5.0)
    return P2 + o2[:, None] * N2, o1, o2

# ---------------------------------------------------------------- landmarks helper
def lm_indices(C, lms, key, radius=15.0):
    """Cursor walk in route order. Returns (idx dict, missing list)."""
    out = {}; missing = []; c = 0
    for lm in lms:
        p = np.array(lm[key], float)
        d = np.hypot(*(C - p).T)
        i = c
        while i < len(C) and d[i] > radius: i += 1
        if i >= len(C):
            missing.append(lm['name']); continue
        j = i
        while j + 1 < len(C) and d[j + 1] <= radius: j += 1
        k = i + int(np.argmin(d[i:j + 1]))
        out[lm['name']] = k; c = k
    return out, missing

def eff_faces(faces, lms, missing):
    """Merge face intervals across missing landmarks (merged interval -> 'window')."""
    miss = set(missing)
    names = ['start'] + [l['name'] for l in lms] + ['end']
    out = []
    for f in faces:
        if out and out[-1]['to'] in miss:
            out[-1] = {'from': out[-1]['from'], 'to': f['to'], 'face': 'window'}
        else:
            out.append(dict(f))
    return out

# ---------------------------------------------------------------- 1d
LAMBDAS = [10, 30, 100, 300, 1000, 3000, 10000]

def smooth_edge(XY, kind, piece, lm_idx_raw, faces, lam_out):
    t = arclen(XY)
    keep = np.r_[True, np.diff(t) > 1e-6]
    XY, t = XY[keep], t[keep]
    kind = [k for k, f in zip(kind, keep) if f]; piece = [k for k, f in zip(piece, keep) if f]
    n = len(XY)
    cum = np.cumsum(keep) - 1
    li = {k: int(cum[min(v, len(cum) - 1)]) for k, v in lm_idx_raw.items()}
    li['start'] = 0; li['end'] = n - 1
    wins = [(t[li[f['from']]], t[li[f['to']]]) for f in faces if f['face'] == 'window']
    wt = np.array([{'hard': 1.0, 'gap': 0.8, 'hidden': 0.02, 'soft': 0.2, 'fixed': 1.0}[k] for k in kind])
    nint = max(1, int(round((t[-1] - t[0]) / 8.0)))
    br = np.linspace(t[0], t[-1], nint + 1)
    kn = np.r_[[br[0]] * 3, br, [br[-1]] * 3]
    A = BSpline.design_matrix(t, kn, 3).tocsr()
    nb = A.shape[1]
    g = np.array([kn[k + 1:k + 4].mean() for k in range(nb)])
    lam = np.array([lam_out / 8.0 if any(a <= g[j + 1] <= b for a, b in wins) else lam_out
                    for j in range(nb - 2)])
    D = sp.diags([np.ones(nb - 2), -2 * np.ones(nb - 2), np.ones(nb - 2)], [0, 1, 2], shape=(nb - 2, nb)).tocsr()
    Wm = sp.diags(wt)
    M = (A.T @ Wm @ A + D.T @ sp.diags(lam) @ D).tocsc()
    cx = spsolve(M, A.T @ (wt * XY[:, 0])); cy = spsolve(M, A.T @ (wt * XY[:, 1]))
    sx = BSpline(kn, cx, 3); sy = BSpline(kn, cy, 3)
    td = np.arange(t[0], t[-1], 0.25); td = np.r_[td, t[-1]]
    Dn = np.stack([sx(td), sy(td)], 1)
    sd = arclen(Dn)
    m = int(round(sd[-1] / 2.0)) + 1
    su = np.linspace(0, sd[-1], m)
    R = np.stack([np.interp(su, sd, Dn[:, 0]), np.interp(su, sd, Dn[:, 1])], 1)
    tu = np.interp(su, sd, td)
    nearest = np.clip(np.searchsorted(t, tu), 1, n - 1)
    nearest = np.where(np.abs(t[nearest - 1] - tu) <= np.abs(t[nearest] - tu), nearest - 1, nearest)
    kind_o = [kind[i] for i in nearest]; piece_o = [int(piece[i]) for i in nearest]
    vis = [k in ('hard', 'gap', 'soft', 'fixed') for k in kind_o]  # 'fixed' = hand-placed visible edge, not snapped
    return dict(R=R, kind=kind_o, piece=piece_o, vis=vis, n_knots=nint + 1,
                D=Dn, XYraw=XY, kind_raw=kind, piece_raw=piece, keep=keep, tu=tu, wins=wins)

def fid_dists(sm, core=None):
    """core: bool array over the pre-dedup snapped samples; applied to hard samples.
    Returns (hard_dist, hard_pcs, soft_dist, soft_pcs)."""
    tree = cKDTree(sm['D'])
    hard_idx = [i for i, k in enumerate(sm['kind_raw']) if k == 'hard']
    soft_idx = [i for i, k in enumerate(sm['kind_raw']) if k == 'soft']
    dist_hard = tree.query(sm['XYraw'][hard_idx])[0] if hard_idx else np.array([])
    dist_soft = tree.query(sm['XYraw'][soft_idx])[0] if soft_idx else np.array([])
    pcs_hard = np.array([sm['piece_raw'][i] for i in hard_idx])
    pcs_soft = np.array([sm['piece_raw'][i] for i in soft_idx])
    if core is not None:
        c_hard = core[sm['keep']][hard_idx] if hard_idx else np.array([], bool)
        c_soft = core[sm['keep']][soft_idx] if soft_idx else np.array([], bool)
        dist_hard, pcs_hard = dist_hard[c_hard], pcs_hard[c_hard]
        dist_soft, pcs_soft = dist_soft[c_soft], pcs_soft[c_soft]
    return dist_hard, pcs_hard, dist_soft, pcs_soft

# ---------------------------------------------------------------- 1f helpers
def osc_check(P):
    P = np.asarray(P, float); s = arclen(P)
    n = int(s[-1] / 2.0); u = np.linspace(0, s[-1], n)
    Q = np.stack([np.interp(u, s, P[:, 0]), np.interp(u, s, P[:, 1])], 1)
    Q = np.stack([ndi.gaussian_filter1d(Q[:, c], 1.5) for c in (0, 1)], 1)
    d1 = np.gradient(Q, axis=0); d2 = np.gradient(d1, axis=0)
    k = (d1[:, 0] * d2[:, 1] - d1[:, 1] * d2[:, 0]) / np.maximum(np.hypot(*d1.T), 1e-6) ** 3 * 2.0 * W
    k = k / 2.0
    sg = np.sign(np.where(np.abs(k) < 0.02, 0, k))
    lobes = []; a = 0
    for i in range(1, n + 1):
        if i == n or sg[i] != sg[a]:
            if sg[a] != 0: lobes.append((a, i - 1, sg[a], np.abs(k[a:i]).max()))
            a = i
    osc = []
    for j in range(1, len(lobes) - 1):
        a_, b_, sgn, amp = lobes[j]
        length = (b_ - a_ + 1) * 2.0
        if length < 0.5 * W and amp > 0.25 and lobes[j - 1][3] > 0.25 and lobes[j + 1][3] > 0.25 and amp < 3.0:
            osc.append((int(a_), np.round(Q[(a_ + b_) // 2]).astype(int).tolist(), round(length), round(float(amp), 2), float(u[(a_ + b_) // 2])))
    return osc

def osc_split(sm):
    """Split oscillation lobes into (outside windows, inside windows) by lobe-centre sample."""
    lobes = osc_check(sm['R'])
    sR = arclen(sm['R']); out, inn = [], []
    for lb in lobes:
        tc = float(np.interp(lb[4], sR, sm['tu']))
        (inn if any(a <= tc <= b for a, b in sm['wins']) else out).append(lb[:4])
    return out, inn

def seg_intersections(P, kind):
    n = len(P); A = P[:-1]; B = P[1:]
    hid = np.array([k == 'hidden' for k in kind])
    segh = hid[:-1] | hid[1:]
    pts = []
    for i in range(n - 1):
        if segh[i]: continue
        j = np.arange(i + 3, n - 1)
        j = j[~segh[j]]
        if len(j) == 0: continue
        p, r = A[i], B[i] - A[i]
        q, s = A[j], B[j] - A[j]
        rxs = r[0] * s[:, 1] - r[1] * s[:, 0]
        qp = q - p
        with np.errstate(divide='ignore', invalid='ignore'):
            tt = (qp[:, 0] * s[:, 1] - qp[:, 1] * s[:, 0]) / rxs
            uu = (qp[:, 0] * r[1] - qp[:, 1] * r[0]) / rxs
        ok = (np.abs(rxs) > 1e-12) & (tt >= 0) & (tt <= 1) & (uu >= 0) & (uu <= 1)
        for k in np.where(ok)[0]:
            pts.append((p + tt[k] * r).tolist() + [i, int(j[k])])
    clusters = []
    for x, y, i, j in pts:
        for c in clusters:
            if np.hypot(c[0] - x, c[1] - y) < 6: break
        else:
            clusters.append([x, y, i, j])
    return [[round(c[0], 1), round(c[1], 1), c[2], c[3]] for c in clusters]

# ---------------------------------------------------------------- drawing
def draw_overview(bg, out_png, box, S, grid, data, red_pts, names):
    x0, y0, x1, y1 = box
    c = bg.crop(box).resize(((x1 - x0) * S, (y1 - y0) * S), Image.LANCZOS)
    d = ImageDraw.Draw(c, 'RGBA')
    f = GO.font(18 if S >= 3 else 14)
    if grid:
        for gx in range((x0 // grid + 1) * grid, x1, grid):
            X = (gx - x0) * S; major = gx % 100 == 0
            d.line([(X, 0), (X, c.height)], fill=(0, 200, 255, 90 if major else 35), width=1)
            if major: d.text((X + 3, 3), str(gx), fill=(0, 220, 255, 255), font=f)
        for gy in range((y0 // grid + 1) * grid, y1, grid):
            Y = (gy - y0) * S; major = gy % 100 == 0
            d.line([(0, Y), (c.width, Y)], fill=(0, 200, 255, 90 if major else 35), width=1)
            if major: d.text((3, Y + 3), str(gy), fill=(0, 220, 255, 255), font=f)
    for sil in data['silhouettes']:
        pts = [((x - x0) * S, (y - y0) * S) for x, y in sil['pts']]
        GO.dashed(d, pts, (255, 220, 0, 255), 2 if S == 1 else 3, dash=2 * S, gap=4 * S)
    lw = 2 if S == 1 else 3
    for key, col in (('edge1', (255, 0, 255, 255)), ('edge2', (0, 255, 0, 255))):
        P = np.array(data[key]); V = data['vis' + key[-1]]
        Pp = [((x - x0) * S, (y - y0) * S) for x, y in P]
        a = 0
        for i in range(1, len(P) + 1):
            if i == len(P) or V[i] != V[a]:
                seg = Pp[a:min(i + 1, len(P))]
                if len(seg) >= 2:
                    if V[a]: d.line(seg, fill=col, width=lw)
                    else: GO.dashed(d, seg, col, lw, dash=8 * S, gap=6 * S)
                a = i
    for k in range(0, len(data['pairs']), 15):
        (ax, ay), (bx, by) = data['pairs'][k]
        d.line([((ax - x0) * S, (ay - y0) * S), ((bx - x0) * S, (by - y0) * S)], fill=(255, 255, 255, 90), width=1)
    if names:
        for nm, v in data['landmarks'].items():
            x, y = data['edge1'][v['i1']]
            if x0 <= x < x1 and y0 <= y < y1:
                d.text(((x - x0) * S + 4, (y - y0) * S + 4), nm, fill=(255, 255, 255, 255), font=f)
    for (x, y) in red_pts:
        if x0 <= x < x1 and y0 <= y < y1:
            X, Y = (x - x0) * S, (y - y0) * S
            d.ellipse([X - 4, Y - 4, X + 4, Y + 4], fill=(255, 40, 40, 255))
    c.convert('RGB').save(out_png)

# ---------------------------------------------------------------- main
def main():
    t_start = time.time()
    route_path = os.path.abspath(sys.argv[1]); out_dir = sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    base = os.path.dirname(route_path)
    route = json.load(open(route_path))
    guides = json.load(open(os.path.join(base, route['guides'])))
    leg = json.load(open(os.path.join(base, route['legacy']))) if 'legacy' in route else None
    poly = route['anomaly_polygon']
    E, anom, bg = edge_map(poly)
    Image.fromarray((E * 255).round().astype(np.uint8)).save(os.path.join(out_dir, 'edgemap.png'))

    lms = route['landmarks']; faces = route['faces']
    R = {'gap_pieces': {}, 'snap': {}, 'fidelity': {}, 'pre_missing': {}}
    PRE = {}
    for nm in ('E1', 'E2'):
        XY, K, Pc, notes = build_raw(route, guides, leg, nm)
        R['gap_pieces'][nm] = notes
        XYs = XY.copy(); offs = np.zeros(len(XY)); offs1 = np.zeros(len(XY))
        core = np.ones(len(XY), bool)
        n = len(XY); a = 0
        while a < n:
            if K[a] not in ('hard', 'soft'): a += 1; continue
            kind_run = K[a]
            b = a
            while b + 1 < n and K[b + 1] == kind_run and Pc[b + 1] == Pc[a]: b += 1
            run = XY[a:b + 1]
            ia = anom[np.clip(np.round(run[:, 1]).astype(int), 0, anom.shape[0] - 1), np.clip(np.round(run[:, 0]).astype(int), 0, anom.shape[1] - 1)]
            sx, so1, so2 = snap_run(E, run, ia)
            XYs[a:b + 1] = sx; offs[a:b + 1] = so2; offs1[a:b + 1] = so1
            sa = arclen(sx)
            core[a:b + 1] = (sa >= 12.0) & ((sa[-1] - sa) >= 12.0) & (np.abs(so2) < 5.0 - 1e-9)
            a = b + 1
        per = {}
        per_soft = {}
        for p in sorted(set(Pc)):
            sel = np.array([(K[i] == 'hard' and Pc[i] == p) for i in range(n)])
            if sel.any():
                per[p] = {'n': int(sel.sum()), 'mean_abs_o1': round(float(np.abs(offs1[sel]).mean()), 3),
                          'n1_at_limit': int((np.abs(offs1[sel]) >= 12.0 - 1e-9).sum()),
                          'mean_abs_o2': round(float(np.abs(offs[sel]).mean()), 3),
                          'n2_at_limit': int((np.abs(offs[sel]) >= 5.0 - 1e-9).sum())}
            sel_soft = np.array([(K[i] == 'soft' and Pc[i] == p) for i in range(n)])
            if sel_soft.any():
                per_soft[p] = {'n': int(sel_soft.sum()), 'mean_abs_o1': round(float(np.abs(offs1[sel_soft]).mean()), 3),
                          'n1_at_limit': int((np.abs(offs1[sel_soft]) >= 12.0 - 1e-9).sum()),
                          'mean_abs_o2': round(float(np.abs(offs[sel_soft]).mean()), 3),
                          'n2_at_limit': int((np.abs(offs[sel_soft]) >= 5.0 - 1e-9).sum())}
        hm = np.array([k == 'hard' for k in K])
        sm = np.array([k == 'soft' for k in K])
        R['snap'][nm] = {'per_piece': per, 'per_piece_soft': per_soft, 'n_hard': int(hm.sum()), 'n_soft': int(sm.sum()), 'mean_abs_o1': round(float(np.abs(offs1[hm]).mean()), 3),
                         'n1_at_limit': int((np.abs(offs1[hm]) >= 12.0 - 1e-9).sum()),
                         'mean_abs_o2': round(float(np.abs(offs[hm]).mean()), 3),
                         'n2_at_limit': int((np.abs(offs[hm]) >= 5.0 - 1e-9).sum())}
        lraw, miss = lm_indices(XYs, lms, nm)
        R['pre_missing'][nm] = miss
        PRE[nm] = (XYs, K, Pc, lraw, eff_faces(faces, lms, miss), core)

    # lambda selection
    table = []
    for lo in LAMBDAS:
        row = {'lam': lo, 'osc_out': {}, 'osc_in': {}, 'p95': {}, 'max': {}}
        for nm in ('E1', 'E2'):
            XYs, K, Pc, lraw, ef, core = PRE[nm]
            sm = smooth_edge(XYs, K, Pc, lraw, ef, lo)
            o_out, o_in = osc_split(sm)
            row['osc_out'][nm] = len(o_out); row['osc_in'][nm] = len(o_in)
            dist_hard, pcs_hard, _, _ = fid_dists(sm, core)
            row['p95'][nm] = float(np.percentile(dist_hard, 95)) if len(dist_hard) > 0 else 0.0
            row['max'][nm] = float(dist_hard.max()) if len(dist_hard) > 0 else 0.0
        row['oscsum'] = row['osc_out']['E1'] + row['osc_out']['E2']
        row['viol'] = int(row['oscsum'] > 0) + sum(int(row['p95'][k] > 2.0) for k in row['p95']) + sum(int(row['max'][k] > 5.0) for k in row['max'])
        row['maxp95'] = max(row['p95'].values()); row['maxmax'] = max(row['max'].values())
        table.append(row)
    good = [r for r in table if r['viol'] == 0]
    if good:
        chosen = good[0]; lam_gate = True
    else:
        chosen = sorted(table, key=lambda r: (r['viol'], r['oscsum'], r['maxp95'], r['maxmax']))[0]; lam_gate = False
    LAM = chosen['lam']
    SM = {}
    for nm in ('E1', 'E2'):
        XYs, K, Pc, lraw, ef, core = PRE[nm]
        sm = smooth_edge(XYs, K, Pc, lraw, ef, LAM)
        dist_hard, pcs_hard, dist_soft, pcs_soft = fid_dists(sm, core)
        fid = {}
        for p in sorted(set(pcs_hard.tolist())):
            dd = dist_hard[pcs_hard == p]
            fid[p] = {'n_core': int(len(dd)), 'mean': round(float(dd.mean()), 2), 'p95': round(float(np.percentile(dd, 95)), 2),
                      'max': round(float(dd.max()), 2)}
        if len(dist_hard) > 0:
            fid['_all'] = {'n_core': int(len(dist_hard)), 'p95': round(float(np.percentile(dist_hard, 95)), 2), 'max': round(float(dist_hard.max()), 2)}
        fid_soft = {}
        for p in sorted(set(pcs_soft.tolist())):
            dd = dist_soft[pcs_soft == p]
            fid_soft[p] = {'n': int(len(dd)), 'mean': round(float(dd.mean()), 2), 'p95': round(float(np.percentile(dd, 95)), 2),
                           'max': round(float(dd.max()), 2)}
        if len(dist_soft) > 0:
            fid_soft['_all'] = {'n': int(len(dist_soft)), 'mean': round(float(dist_soft.mean()), 2), 'p95': round(float(np.percentile(dist_soft, 95)), 2), 'max': round(float(dist_soft.max()), 2)}
        R['fidelity'][nm] = fid
        R['fidelity'][nm + '_soft'] = fid_soft
        SM[nm] = sm

    # 1e landmarks (post-smoothing pass)
    L1, m1 = lm_indices(SM['E1']['R'], lms, 'E1'); L2, m2 = lm_indices(SM['E2']['R'], lms, 'E2')
    missing = [l['name'] for l in lms if l['name'] in set(m1) | set(m2)]
    for nm_ in missing:
        L1.pop(nm_, None); L2.pop(nm_, None)
    pfaces = eff_faces(faces, lms, missing)
    faces = pfaces
    names = ['start'] + [l['name'] for l in lms if l['name'] not in missing] + ['end']
    L1['start'] = 0; L2['start'] = 0; L1['end'] = len(SM['E1']['R']) - 1; L2['end'] = len(SM['E2']['R']) - 1
    P1, P2 = SM['E1']['R'], SM['E2']['R']
    s1, s2 = arclen(P1), arclen(P2)
    pairs, pint, pidx = [], [], []
    for fi, f in enumerate(faces):
        a1, b1, a2, b2 = L1[f['from']], L1[f['to']], L2[f['from']], L2[f['to']]
        len1 = s1[b1] - s1[a1]; len2 = s2[b2] - s2[a2]
        N = max(2, int(round((len1 + len2) / 2 / 4)))
        fr = np.linspace(0, 1, N)
        if fi > 0: fr = fr[1:]
        for u in fr:
            i1 = np.interp(s1[a1] + u * len1, s1, np.arange(len(s1)))
            i2 = np.interp(s2[a2] + u * len2, s2, np.arange(len(s2)))
            q1 = [float(np.interp(i1, np.arange(len(s1)), P1[:, 0])), float(np.interp(i1, np.arange(len(s1)), P1[:, 1]))]
            q2 = [float(np.interp(i2, np.arange(len(s2)), P2[:, 0])), float(np.interp(i2, np.arange(len(s2)), P2[:, 1]))]
            pairs.append([q1, q2]); pint.append(fi); pidx.append((int(round(i1)), int(round(i2))))
    PR = np.array(pairs)
    M = (PR[:, 0] + PR[:, 1]) / 2.0
    Mu = M * np.array([1, -1])
    face_res = {}; tot = 0; agree = 0; disag_pts = []
    n = len(PR)
    for fi, f in enumerate(faces):
        ks = [k for k in range(n) if pint[k] == fi]
        if f['face'] not in ('A', 'B'):
            face_res[fi] = {'from': f['from'], 'to': f['to'], 'expected': f['face'], 'n_checked': 0, 'agree': None, 'disagree': []}
            continue
        chk, bad = 0, []
        for k in ks:
            i1, i2 = pidx[k]
            if not (SM['E1']['vis'][i1] and SM['E2']['vis'][i2]): continue
            lo, hi = max(k - 1, 0), min(k + 1, n - 1)
            T = Mu[hi] - Mu[lo]
            D = (PR[k, 1] - PR[k, 0]) * np.array([1, -1])
            c = T[0] * D[1] - T[1] * D[0]
            face = 'A' if c < 0 else 'B'
            chk += 1
            if face != f['face']:
                bad.append(k); disag_pts.append(M[k].tolist())
        tot += chk; agree += chk - len(bad)
        face_res[fi] = {'from': f['from'], 'to': f['to'], 'expected': f['face'], 'n_checked': chk,
                        'agree': (round((chk - len(bad)) / chk, 3) if chk else None), 'disagree': bad}
    overall = agree / tot if tot else None
    # oscillation, widths, self-intersections
    oscs = {nm: osc_split(SM[nm]) for nm in ('E1', 'E2')}
    osc = {nm: oscs[nm][0] for nm in oscs}; osc_in = {nm: oscs[nm][1] for nm in oscs}
    widths = {}
    for fi, f in enumerate(faces):
        ks = [k for k in range(n) if pint[k] == fi]
        w = np.hypot(*(PR[ks, 1] - PR[ks, 0]).T)
        widths[fi] = {'from': f['from'], 'to': f['to'], 'min': round(float(w.min()), 1), 'median': round(float(np.median(w)), 1), 'max': round(float(w.max()), 1)}
    selfx = {nm: seg_intersections(SM[nm]['R'], SM[nm]['kind']) for nm in ('E1', 'E2')}

    sils = [{'turn': s['turn'], 'edge': s['edge'], 'pts': s['pts']} for s in guides['segments'] if s['kind'] == 'sil']
    report = {'gap_pieces': R['gap_pieces'], 'snap': R['snap'], 'lambda_table': table, 'lambda_chosen': LAM, 'lambda_gate': lam_gate, 'missing_landmarks': {'pre': R['pre_missing'], 'post': missing}, 'fidelity': R['fidelity'],
              'face_check': {'intervals': face_res, 'n_checked': tot, 'overall_agreement': overall, 'gate_0.95': (overall is not None and overall >= 0.95)},
              'oscillation': osc, 'oscillation_in_windows': osc_in, 'widths': widths, 'self_intersections': selfx}
    data = {'image': {'w': 852, 'h': 1846}, 'W_est': 112, 'step': 2,
            'edge1': np.round(P1, 2).tolist(), 'edge2': np.round(P2, 2).tolist(),
            'vis1': SM['E1']['vis'], 'vis2': SM['E2']['vis'], 'kind1': SM['E1']['kind'], 'kind2': SM['E2']['kind'],
            'piece1': SM['E1']['piece'], 'piece2': SM['E2']['piece'],
            'landmarks': {nm: {'i1': L1[nm], 'i2': L2[nm]} for nm in names},
            'pairs': np.round(PR, 2).tolist(), 'pair_interval': pint, 'silhouettes': sils, 'report': report}
    json.dump(data, open(os.path.join(out_dir, 'edges_v3.json'), 'w'))

    # report text
    T = []
    T.append("RETRACE REPORT  route=%s" % os.path.basename(route_path))
    T.append("edges: E1 %d samples, E2 %d samples, pairs %d" % (len(P1), len(P2), len(PR)))
    T.append("\n[gap pieces]")
    for nm in ('E1', 'E2'):
        for g in R['gap_pieces'][nm]: T.append("  %s %s" % (nm, json.dumps(g)))
    T.append("\n[snap: two-pass; pass1 +-12.0, re-centre gaussian sigma 8, pass2 +-5.0, step 0.5, transition 0.15]")
    for nm in ('E1', 'E2'):
        r_ = R['snap'][nm]
        T.append("  %s total n_hard %d mean|o1| %.3f n1_at_limit %d mean|o2| %.3f n2_at_limit %d" % (nm, r_['n_hard'], r_['mean_abs_o1'], r_['n1_at_limit'], r_['mean_abs_o2'], r_['n2_at_limit']))
        for p, v in r_['per_piece'].items():
            T.append("  %s piece %2d n=%3d mean|o1| %.3f n1_at_limit %d mean|o2| %.3f n2_at_limit %d" % (nm, p, v['n'], v['mean_abs_o1'], v['n1_at_limit'], v['mean_abs_o2'], v['n2_at_limit']))
        for p, v in r_.get('per_piece_soft', {}).items():
            T.append("  %s soft piece %2d n=%3d mean|o1| %.3f n1_at_limit %d mean|o2| %.3f n2_at_limit %d" % (nm, p, v['n'], v['mean_abs_o1'], v['n1_at_limit'], v['mean_abs_o2'], v['n2_at_limit']))
    T.append("\n[missing landmarks]")
    T.append("  pre-smoothing  %s" % json.dumps(R['pre_missing']))
    T.append("  pairing (union) %s" % missing)
    T.append("\n[lambda selection: smallest lam_out with osc_out==0 (both edges) and core p95<=2.0 and core max<=5.0 (both edges)]")
    T.append("  lam_out  osc_out E1/E2  osc_in E1/E2  core_p95 E1/E2  core_max E1/E2")
    for r_ in table:
        T.append("  %7d  %5d %5d   %5d %5d   %7.2f %7.2f  %7.2f %7.2f%s" % (r_['lam'], r_['osc_out']['E1'], r_['osc_out']['E2'], r_['osc_in']['E1'], r_['osc_in']['E2'],
                 r_['p95']['E1'], r_['p95']['E2'], r_['max']['E1'], r_['max']['E2'], "  <- chosen" if r_['lam'] == LAM else ""))
    T.append("  chosen lam_out %d (window lam %.4g)  gate %s" % (LAM, LAM / 8.0, "PASS" if lam_gate else "FAIL"))
    T.append("\n[fidelity: core hard snapped -> smoothed curve, px; core excludes 12 px of arc at piece ends and n2_at_limit samples]")
    for nm in ('E1', 'E2'):
        for p, v in R['fidelity'][nm].items():
            if p == '_all': continue
            T.append("  %s piece %2d n_core=%3d mean %.2f p95 %.2f max %.2f" % (nm, p, v['n_core'], v['mean'], v['p95'], v['max']))
        v = R['fidelity'][nm].get('_all')
        if v:
            T.append("  %s ALL core n_core=%d p95 %.2f max %.2f" % (nm, v['n_core'], v['p95'], v['max']))
        for p, v in R['fidelity'][nm + '_soft'].items():
            if p == '_all': continue
            T.append("  %s soft piece %2d n=%3d mean %.2f p95 %.2f max %.2f (info)" % (nm, p, v['n'], v['mean'], v['p95'], v['max']))
        v_soft = R['fidelity'][nm + '_soft'].get('_all')
        if v_soft:
            T.append("  %s soft (info) n=%d mean %.2f p95 %.2f max %.2f" % (nm, v_soft['n'], v_soft['mean'], v_soft['p95'], v_soft['max']))
    T.append("\n[landmarks i1/i2]")
    for nm in names: T.append("  %-9s %5d %5d" % (nm, L1[nm], L2[nm]))
    T.append("\n[face check]")
    for fi, v in face_res.items():
        T.append("  %2d %-9s->%-9s exp %-6s n=%3d agree %s disagree %s" % (fi, v['from'], v['to'], v['expected'], v['n_checked'], v['agree'], v['disagree']))
    T.append("  overall: %d checked, agreement %s, gate>=0.95 %s" % (tot, None if overall is None else round(overall, 4), "PASS" if report['face_check']['gate_0.95'] else "FAIL"))
    T.append("\n[oscillation]")
    for nm, key in (('E1', 'edge1'), ('E2', 'edge2')):
        T.append("  %s outside windows: %d curvature lobes shorter than 0.5 W with |kappa|W < 3 : %s" % (key, len(osc[nm]), osc[nm][:10]))
        T.append("  %s inside windows (info only): %d : %s" % (key, len(osc_in[nm]), osc_in[nm][:10]))
    T.append("  oscillation gate (outside windows): %s" % ("PASS" if sum(len(v) for v in osc.values()) == 0 else "FAIL (%d)" % sum(len(v) for v in osc.values())))
    T.append("\n[widths |E2-E1| px]")
    for fi, v in widths.items(): T.append("  %2d %-9s->%-9s min %6.1f med %6.1f max %6.1f" % (fi, v['from'], v['to'], v['min'], v['median'], v['max']))
    T.append("\n[self-intersections outside hidden spans: x, y, seg i, seg j]")
    for nm in ('E1', 'E2'): T.append("  %s count %d %s" % (nm, len(selfx[nm]), selfx[nm]))
    open(os.path.join(out_dir, 'report.txt'), 'w').write("\n".join(T) + "\n")

    # images
    draw_overview(bg, os.path.join(out_dir, 'review_overview.png'), (0, 500, 852, 1846), 1, 50, data, disag_pts, True)
    for nm, box in GO.WINDOWS.items():
        draw_overview(bg, os.path.join(out_dir, 'review_%s.png' % nm), box, 3, 20, data, disag_pts, True)
    print("\n".join(T))
    print("runtime %.1f s" % (time.time() - t_start))

if __name__ == '__main__':
    main()
