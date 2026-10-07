#!/usr/bin/env python3
"""Real AK solve (v1): hinge-chain solver (hinge.py / synth8 stages) on the approved 2D trace, plus an over/under block.

Usage: scripts/mockup/.venv/bin/python scripts/mockup/ak_solve.py [--stride 2] [--probe] [--max-iter 400] [--out DIR]

Projection: solve3d.project / project_jac (and the copies imported into solve3d_fast) are replaced by the AK camera
(ak_problem.project: world -> cutout px). Data and coverage residuals are therefore in cutout px; mono/obl/ruling/bend/
clearance/over-under are in world (css) units.
"""
import json, math, os, sys, time
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from scipy.sparse import coo_matrix

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ak_problem as AP
import solve3d as S
import solve3d_fast as F
import hinge as HG
import emit_pose as EP

ROOT = AP.ROOT
NPZ = os.path.join(ROOT, "docs/ribbon/turns/ak_problem_phone.npz")
OU_JSON = os.path.join(ROOT, "docs/ribbon/turns/overunder_v1.json")
CUTOUT = AP.CUTOUT

# ---------------------------------------------------------------- AK camera into the solver
_SXY = np.array([AP.SX, AP.SY])


def _project(P):
    return AP.project(np.asarray(P, float))


def _project_jac(P):
    P = np.asarray(P, float)
    den = AP.D - P[:, 2]
    s = AP.D / den
    ds = AP.D / den ** 2
    J = np.zeros((len(P), 2, 3))
    J[:, 0, 0] = s
    J[:, 0, 2] = P[:, 0] * ds
    J[:, 1, 1] = -s
    J[:, 1, 2] = -P[:, 1] * ds
    return J * _SXY[None, :, None]


for _m in (S, F):
    _m.project = _project
    _m.project_jac = _project_jac

_cov_cand_orig = F.coverage_candidates_fast


def _cov_cand(L, R, pts, W, reach=2.5):
    # candidate reach is measured in cutout px: scale the css width by px/css
    return _cov_cand_orig(L, R, pts, W * AP.SX, reach)


F.coverage_candidates_fast = _cov_cand

ANCHORS = dict(start=160, s_in=110, s_out=80, fl_in=50, fl_out=10, apex_in=-20, apex_out=0, bk_in=40, bk_out=10,
               j1_in=-20, j1_out=-40, wrap_in=15, j2_in=-20, j2_out=-10, tk_in=0, tk_out=-40, end=-70)


# ---------------------------------------------------------------- problem setup
def load(stride):
    d = np.load(NPZ, allow_pickle=True)
    N0 = len(d["e1_px"])
    idx = list(range(0, N0, stride))
    if idx[-1] != N0 - 1:
        idx.append(N0 - 1)
    idx = np.array(idx)
    P = dict(idx=idx, N=len(idx), W=float(d["W_css"]), W_px=float(d["W_px"]),
             e1=d["e1_px"][idx], e2=d["e2_px"][idx], vis1=d["vis1"][idx], vis2=d["vis2"][idx],
             kind1=d["kind1"][idx], kind2=d["kind2"][idx], interval=d["interval"][idx])
    names = [str(n) for n in d["int_names"]]
    face = [str(f) for f in d["int_face"]]
    P["int_names"], P["int_face"] = names, face
    P["ring_face"] = np.array([face[k] for k in P["interval"]])
    P["win"] = P["ring_face"] == "window"
    lm = {str(n): int(r) for n, r in zip(d["lm_names"], d["lm_rings"])}
    P["lm"] = {n: int(np.argmin(np.abs(idx - r))) for n, r in lm.items()}
    cov_in, cov_out = d["cov_in"], d["cov_out"]
    alpha = np.array(Image.open(CUTOUT).convert("RGBA"))[..., 3].astype(float) / 255.0
    a_in = ndi.map_coordinates(alpha, [cov_in[:, 1], cov_in[:, 0]], order=1, mode="nearest")
    a_out = ndi.map_coordinates(alpha, [cov_out[:, 1], cov_out[:, 0]], order=1, mode="nearest")
    P["cov_in"], P["cov_out"] = cov_in[a_in > 0.5], cov_out[a_out < 0.5]
    P["cov_counts"] = dict(in_total=len(cov_in), in_kept=int((a_in > 0.5).sum()), out_total=len(cov_out), out_kept=int((a_out < 0.5).sum()))
    return P


def depth_profile(P):
    N, lm = P["N"], P["lm"]
    names = list(ANCHORS)
    xi = np.array([lm[n] for n in names], float)
    assert np.all(np.diff(xi) > 0), "landmark rings not increasing after subsample"
    z = np.interp(np.arange(N), xi, [ANCHORS[n] for n in names])
    w0, w1 = lm["wrap_in"], lm["j2_in"]
    mid = (w0 + w1) // 2
    ii = np.arange(w0, w1 + 1)
    z[ii] = np.interp(ii, [w0, mid, w1], [15, -45, -20])
    return z


# ---------------------------------------------------------------- over/under constraint pairs
def _hull(pts):
    pts = sorted(map(tuple, pts))

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, up = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(up) >= 2 and cross(up[-2], up[-1], p) <= 0:
            up.pop()
        up.append(p)
    return np.array(lo[:-1] + up[:-1])


def _clip(subj, clip):
    """Sutherland-Hodgman, both CCW convex (this is also the separating-axis overlap test: empty result = separated)."""
    out = [tuple(p) for p in subj]
    n = len(clip)
    for i in range(n):
        a, b = clip[i], clip[(i + 1) % n]
        inp, out = out, []
        if not inp:
            break

        def side(p):
            return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
        for j in range(len(inp)):
            p, q = inp[j], inp[(j + 1) % len(inp)]
            sp, sq = side(p), side(q)
            if sp >= 0:
                out.append(p)
            if (sp >= 0) != (sq >= 0):
                t = sp / (sp - sq)
                out.append((p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])))
    return np.array(out) if len(out) >= 3 else None


def _area_centroid(poly):
    x, y = poly[:, 0], poly[:, 1]
    x1, y1 = np.roll(x, -1), np.roll(y, -1)
    cr = x * y1 - x1 * y
    A = cr.sum() / 2
    if abs(A) < 1e-9:
        return 0.0, poly.mean(0)
    return abs(A), np.array([((x + x1) * cr).sum(), ((y + y1) * cr).sum()]) / (6 * A)


def build_ou_pairs(P, rules):
    N, W = P["N"], P["W"]
    e1, e2, lm = P["e1"], P["e2"], P["lm"]
    strands = {k: (lm[a], lm[b]) for k, (a, b) in rules["strands"].items()}
    quads, bbox = [], []
    for j in range(N - 1):
        q = _hull(np.array([e1[j], e1[j + 1], e2[j + 1], e2[j]]))
        quads.append(q if len(q) >= 3 else None)
        bbox.append(None if quads[-1] is None else (*quads[-1].min(0), *quads[-1].max(0)))
    C = (e1 + e2) / 2
    arc = np.r_[0, np.cumsum(np.hypot(*np.diff(C, axis=0).T))] / (P["W_px"] / P["W"])
    qarc = (arc[:-1] + arc[1:]) / 2
    out, counts = [], {}
    for ri, rule in enumerate(rules["rules"]):
        f0, f1 = strands[rule["front"]]
        npairs = 0
        for bn in rule["back"]:
            b0, b1 = strands[bn]
            cnt = 0
            for j in range(f0, f1):
                qa, ba = quads[j], bbox[j]
                if qa is None:
                    continue
                for k in range(b0, b1):
                    qb, bb = quads[k], bbox[k]
                    if qb is None or ba[0] > bb[2] or bb[0] > ba[2] or ba[1] > bb[3] or bb[1] > ba[3]:
                        continue
                    if abs(qarc[j] - qarc[k]) < 1.5 * W:
                        continue
                    poly = _clip(qa, qb)
                    if poly is None:
                        continue
                    A, c = _area_centroid(poly)
                    if A < 0.5:   # px^2: touching edges only
                        continue
                    out.append((j, k, ri, c[0], c[1], A))
                    cnt += 1
            counts["%s>%s" % (rule["front"], bn)] = cnt
            npairs += cnt
        counts["rule%d:%s" % (ri, rule["front"])] = npairs
    arr = np.array(out) if out else np.zeros((0, 6))
    return arr, counts


# ---------------------------------------------------------------- problem class with the over/under block
class AKProblem(HG.HingeProblem):
    def __init__(self, H, iso_prob, ou=None, ou_w=50.0):
        # memoise point_jac (the expensive FD part) so the extra block reuses it
        self._pj_cache = [None, None]
        orig = H.point_jac

        def cached(x, _orig=orig, _c=self._pj_cache):
            if _c[0] is not None and np.array_equal(_c[0], x):
                return _c[1]
            P = _orig(x)
            _c[0], _c[1] = x.copy(), P
            return P
        H.point_jac = cached
        super().__init__(H, iso_prob)
        self.ou = None if ou is None or len(ou) == 0 else np.asarray(ou[:, :2], int)
        self.sq_ou = math.sqrt(ou_w)
        if self.ou is not None:
            self.sizes['ou'] = len(self.ou)
            self.nres += len(self.ou)

    @staticmethod
    def _zq(L, R, j):
        return (L[j, 2] + R[j, 2] + L[j + 1, 2] + R[j + 1, 2]) / 4

    def ou_gap(self, L, R):
        return self._zq(L, R, self.ou[:, 0]) - self._zq(L, R, self.ou[:, 1])

    def blocks(self, x):
        out = super().blocks(x)
        if getattr(self, 'ou', None) is not None:
            L, R = self.H.points(x)
            out['ou'] = np.maximum(0.0, 2 * self.ip.thk - self.ou_gap(L, R)) * self.sq_ou
        return out

    def jac_blocks(self, x):
        out = super().jac_blocks(x)
        if self.ou is not None:
            H, N = self.H, self.H.N
            P = H.point_jac(x)
            L, R = H.points(x)
            s = self.sq_ou * ((2 * self.ip.thk - self.ou_gap(L, R)) > 0)
            o = self.ou
            n = len(o)
            rows = np.tile(np.arange(n), 8)
            cols, vals = [], []
            for col_of, sign in ((0, -1.0), (1, 1.0)):   # resid = 2thk - (zf - zb)
                for off in (0, 1):
                    for side_off in (0, 3 * N):
                        cols.append(side_off + 3 * (o[:, col_of] + off) + 2)
                        vals.append(sign * 0.25 * s)
            Jf = coo_matrix((np.concatenate(vals), (rows, np.concatenate(cols))), shape=(n, 6 * N)).tocsr()
            out['ou'] = np.asarray(Jf @ P)
        return out

    def jac(self, x):
        jb = self.jac_blocks(x)
        names = list(self.names) + (['ou'] if self.ou is not None else [])
        return np.concatenate([jb[n] for n in names], 0)


def stage_problem(Hg, x, wts, obs, cov, p, ou):
    obs1, obs2, vis1, vis2, w1, w2, win = obs
    xf = Hg.full(x)
    ip = F.make_stage_problem(Hg.N, obs1, obs2, vis1, vis2, w1, w2, win, p, wts, xf, None, 50.0, cov, 0)
    return AKProblem(Hg, ip, ou=ou, ou_w=50.0), ip


# ---------------------------------------------------------------- metrics
def nonadjacent_min_clear(L, R, ca, W):
    N = len(L)
    I, J = np.triu_indices(N, 1)
    m = np.abs(ca[I] - ca[J]) > 1.5 * W
    I, J = I[m], J[m]
    best = np.inf
    for s in range(0, len(I), 100000):
        sl = slice(s, s + 100000)
        d = S.segment_dist(L[I[sl]], R[I[sl]], L[J[sl]], R[J[sl]])
        best = min(best, float(d.min()))
    return best


def face_agreement(L, R, P):
    """Convention (retrace.py 2D rule, y up): T = midline tangent, D = e2 - e1, c = T x D (z comp); c < 0 -> face 'A', else 'B'.
    3D analogue: n = T x D (T = C[j+1]-C[j], D = mean ruling of rings j, j+1); face 'A' iff n . (cam - centre) < 0."""
    C = (L + R) / 2
    cam = np.array([0, 0, AP.D])
    Tq = C[1:] - C[:-1]
    Dq = ((R - L)[1:] + (R - L)[:-1]) / 2
    n = np.cross(Tq, Dq)
    cc = (C[1:] + C[:-1]) / 2
    s = (n * (cam - cc)).sum(1)
    face = np.where(s < 0, 'A', 'B')
    vis = P["vis1"][1:] & P["vis1"][:-1] & P["vis2"][1:] & P["vis2"][:-1]
    exp = P["ring_face"][:-1]
    ok = vis & np.isin(exp, ['A', 'B'])
    tot = int(ok.sum())
    ag = int((face[ok] == exp[ok]).sum())
    return dict(checked=tot, agree=ag, frac=ag / tot if tot else None)


def reproj(L, R, P):
    pl, pr = AP.project(L), AP.project(R)
    d1, d2 = np.hypot(*(pl - P["e1"]).T), np.hypot(*(pr - P["e2"]).T)
    out = {}
    face = P["ring_face"]
    for nm, mk in (("AB", np.isin(face, ["A", "B"])), ("window", face == "window"), ("hidden_interval", face == "hidden"), ("all", np.ones(len(face), bool))):
        v = np.concatenate([d1[mk & P["vis1"]], d2[mk & P["vis2"]]])
        out[nm] = dict(n=int(len(v)), rms=float(np.sqrt(np.mean(v ** 2))) if len(v) else None,
                       p95=float(np.percentile(v, 95)) if len(v) else None, max=float(v.max()) if len(v) else None)
    return out


def ou_stats(L, R, ou, rules, thk):
    def zq(j):
        return (L[j, 2] + R[j, 2] + L[j + 1, 2] + R[j + 1, 2]) / 4
    res = {}
    for ri, rule in enumerate(rules["rules"]):
        mk = ou[:, 2] == ri
        key = "%d:%s" % (ri, rule["front"])
        if not mk.any():
            res[key] = dict(pairs=0, violations=0, min_gap=None)
            continue
        gap = zq(ou[mk, 0].astype(int)) - zq(ou[mk, 1].astype(int))
        res[key] = dict(pairs=int(mk.sum()), violations=int((gap < thk).sum()), min_gap=float(gap.min()))
    return res


def side_png(L, R, P, path):
    Wd, Ht, pad = 1400, 900, 40
    C = (L + R) / 2
    xs = np.r_[L[:, 0], R[:, 0]]
    zs = np.r_[L[:, 2], R[:, 2]]
    s = min((Wd - 2 * pad) / (xs.max() - xs.min()), (Ht - 2 * pad) / (zs.max() - zs.min()))
    X = lambda x: pad + (x - xs.min()) * s
    Z = lambda z: Ht - pad - (z - zs.min()) * s
    im = Image.new("RGB", (Wd, Ht), (255, 255, 255))
    dr = ImageDraw.Draw(im)
    pal = [(230, 25, 75), (60, 180, 75), (0, 130, 200), (245, 130, 48), (145, 30, 180), (0, 170, 170), (240, 50, 230), (128, 128, 0),
           (0, 128, 128), (170, 110, 40), (128, 0, 0), (0, 0, 128), (200, 160, 0), (100, 100, 100), (0, 200, 120), (200, 0, 200)]
    for i in range(0, P["N"], 10):
        dr.line([X(L[i, 0]), Z(L[i, 2]), X(R[i, 0]), Z(R[i, 2])], fill=(190, 190, 190), width=1)
    for i in range(P["N"] - 1):
        k = int(P["interval"][i])
        dr.line([X(C[i, 0]), Z(C[i, 2]), X(C[i + 1, 0]), Z(C[i + 1, 2])], fill=pal[k % len(pal)], width=3)
    for n, i in P["lm"].items():
        dr.ellipse([X(C[i, 0]) - 4, Z(C[i, 2]) - 4, X(C[i, 0]) + 4, Z(C[i, 2]) + 4], outline=(0, 0, 0))
        dr.text((X(C[i, 0]) + 6, Z(C[i, 2]) - 6), n, fill=(0, 0, 0))
    dr.text((10, 10), "x (right), z (up = toward camera); colour = interval; grey = every 10th ruling", fill=(0, 0, 0))
    im.save(path)


# ---------------------------------------------------------------- main
def main():
    def arg(n, f):
        return sys.argv[sys.argv.index("--" + n) + 1] if "--" + n in sys.argv else f
    stride = int(arg("stride", 2))
    max_iter = int(arg("max-iter", 400))
    out_dir = os.path.join(ROOT, arg("out", "docs/ribbon/turns/ak_v1"))
    os.makedirs(out_dir, exist_ok=True)
    t_start = time.time()
    P = load(stride)
    N, W = P["N"], P["W"]
    thk = W / 11
    print("stride", stride, "N", N, "W_css %.3f W_px %.3f thk %.3f" % (W, P["W_px"], thk), flush=True)
    print("coverage kept:", P["cov_counts"], flush=True)
    z = depth_profile(P)
    L0, R0 = AP.backproject(P["e1"], z), AP.backproject(P["e2"], z)
    Hg = HG.Hinge(N, W, W)
    x, ginfo = HG.geometric_init(Hg, L0, R0)
    Li, Ri = Hg.points(x)
    ginfo["fk_rms_vs_init_points"] = float(np.sqrt(np.mean(np.concatenate([(Li - L0).ravel(), (Ri - R0).ravel()]) ** 2)))
    ginfo["fk_max_vs_init_points"] = float(max(np.abs(Li - L0).max(), np.abs(Ri - R0).max()))
    print("geometric init:", ginfo, flush=True)
    fa0 = face_agreement(L0, R0, P)
    fai = face_agreement(Li, Ri, P)
    print("face agreement (convention check) on backprojected init points:", fa0, " on FK init:", fai, flush=True)

    rules = json.load(open(OU_JSON))
    ou, ou_counts = build_ou_pairs(P, rules)
    print("over/under pairs:", len(ou), flush=True)
    for k, v in ou_counts.items():
        if k.startswith("rule"):
            print("   ", k, v)

    kw = {"hard": 1.0, "fixed": 1.0, "soft": 0.2}
    w1 = np.array([kw.get(str(k), 0.0) for k in P["kind1"]])
    w2 = np.array([kw.get(str(k), 0.0) for k in P["kind2"]])
    vis1 = P["vis1"] & (w1 > 0)
    vis2 = P["vis2"] & (w2 > 0)
    obs = (P["e1"], P["e2"], vis1, vis2, w1, w2, P["win"])
    p = dict(W=W, h=W, thk=thk)
    wbase = dict(S.ISO_WEIGHTS)
    cov_base = dict(p_in=P["cov_in"], p_out=P["cov_out"], weight=20.0)
    cfgs = {1: dict(clear=0.0, cov=None, ou=False, bend=1.0), 2: dict(clear=0.0, cov=20.0, ou=True, bend=1.0),
            3: dict(clear=1.0, cov=20.0, ou=True, bend=1.0), 4: dict(clear=1.0, cov=40.0, ou=True, bend=0.5)}
    x_init = x.copy()
    hist = []
    for k in (1, 2, 3, 4):
        c = cfgs[k]
        wts = dict(wbase)
        wts['clear'] = wbase['clear'] * c['clear']
        wts['bend'] = wbase['bend'] * c['bend']
        cov = None if c['cov'] is None else dict(cov_base, weight=c['cov'])
        prob, ip = stage_problem(Hg, x, wts, obs, cov, p, ou if c['ou'] else None)
        c0 = 0.5 * float(np.sum(prob.f(x) ** 2))
        if "--probe" in sys.argv:
            t0 = time.time(); J = prob.jac(x); tj = time.time() - t0
            t0 = time.time(); J.T @ J; tm = time.time() - t0
            print("probe stage %d: nres %d nx %d jac %.1fs JtJ %.1fs; sizes %s" % (k, prob.nres, len(x), tj, tm, prob.sizes), flush=True)
            if k == 3:
                return
            continue
        print("stage %d start: nres %d pairs(clear) %d cost %.4g" % (k, prob.nres, len(ip.pairs), c0), flush=True)
        x, info = HG.lm_dense(prob.f, prob.jac, x, max_iter=max_iter)
        info.update(stage=k, cost_before=c0, n_resid=int(prob.nres), n_clear_pairs=int(len(ip.pairs)),
                    blocks={n: 0.5 * float(np.sum(v ** 2)) for n, v in prob.blocks(x).items()},
                    sec_per_iter=info['seconds'] / max(info['iterations'], 1))
        hist.append(info)
        print("stage %d: %s" % (k, {q: (round(v, 4) if isinstance(v, float) else v) for q, v in info.items() if q != 'blocks'}), flush=True)
        print("   blocks", {q: round(v, 4) for q, v in info['blocks'].items()}, flush=True)

    Lh, Rh = Hg.points(x)
    _, _, _, ah, bh = Hg.unpack(x[None])
    ah, bh = ah[0], bh[0]
    _, _, _, a0, b0 = Hg.unpack(x_init[None])
    np.savez(os.path.join(out_dir, "solution.npz"), x=x, x_init=x_init, L=Lh, R=Rh, a=ah, b=bh, idx=P["idx"], L0=L0, R0=R0)
    cand = EP.emit(Lh, Rh, "phone", os.path.join(out_dir, "ak_candidate.json"))

    iso = S.iso_residuals(Lh, Rh, ah, bh, W)
    pl = S.planarity(Lh, Rh)
    M = dict(stride=stride, N=N, W_css=W, thk=thk,
             reproj_init=reproj(Li, Ri, P), reproj=reproj(Lh, Rh, P),
             over_under=ou_stats(Lh, Rh, ou, rules, thk), over_under_init=ou_stats(Li, Ri, ou, rules, thk),
             min_clearance_nonadjacent=nonadjacent_min_clear(Lh, Rh, (ah + bh) / 2, W),
             min_clearance_nonadjacent_init=nonadjacent_min_clear(Li, Ri, (a0[0] + b0[0]) / 2, W), thk_x2=2 * thk,
             max_isometry_resid=float(max(np.abs(q).max() for q in iso)), max_planarity_resid=float(np.abs(pl).max()),
             face_agreement=face_agreement(Lh, Rh, P), face_agreement_init_points=fa0, face_agreement_init_fk=fai,
             z_min=float(min(Lh[:, 2].min(), Rh[:, 2].min())), z_max=float(max(Lh[:, 2].max(), Rh[:, 2].max())),
             ou_pair_counts=ou_counts, cov_counts=P["cov_counts"], geometric_init=ginfo, history=hist,
             runtime_s=time.time() - t_start)
    json.dump(M, open(os.path.join(out_dir, "metrics.json"), "w"), indent=2, default=float)
    side_png(Lh, Rh, P, os.path.join(out_dir, "side.png"))
    print(json.dumps({k: v for k, v in M.items() if k not in ("history", "ou_pair_counts")}, indent=1, default=float))
    print("runtime %.1fs; candidate %s" % (time.time() - t_start, cand))


if __name__ == "__main__":
    main()
