#!/usr/bin/env python3
"""global_fit: ONE paper chain for the whole ribbon fitted to a fully specified 3D target (docs/ribbon/turns/GLOBAL_PLAN.md, stage 1).

  global_fit.py all            depth plan -> seeds -> 3 passes -> outputs  (resumable: each step writes docs/ribbon/turns/global/*.npz)
  global_fit.py plan           depth plan only
  global_fit.py outputs        re-render outputs from global/solution.npz
Outputs: docs/ribbon/turns/global/{NOTES.md, depth_plan.png, full_overlay.png, full_shaded.png, zoom_<window>.png, metrics.json, solution.npz}
"""
import copy, json, math, os, sys, time
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from scipy.spatial.transform import Rotation

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import msfit as M           # noqa: E402
import chain_fit as C       # noqa: E402
import ak_problem as AP     # noqa: E402
import ak_apex as AA        # noqa: E402
import paper as PM          # noqa: E402

ROOT = AP.ROOT
OUTG = os.path.join(ROOT, 'docs/ribbon/turns/global')
os.makedirs(OUTG, exist_ok=True)
C.OUT = OUTG                 # chain_fit.log()/run_fit() append to global/NOTES.md
NR, NI, SC = C.NR, C.NI, C.SC
SEC_DIR = M.DIRS['sections']
T_START = time.time()

SEEDS = {'T': 'sec_T.npz', 'S': 'sec_S_APPROVED.npz', 'F': 'sec_F_APPROVED.npz', 'A': 'sec_A_APPROVED.npz', 'K': 'sec_K.npz',
         'X': 'sec_X.npz', 'P': 'sec_P_APPROVED.npz'}
GROW_ORDER = ['K', 'B', 'X', 'M', 'P', 'F', 'S', 'T']            # outward from the locked A
PASS_SECS = 480.0                                                   # 8 min cap per least_squares call
GROW_SECS = 15.0
A_IVS = (4, 5, 6)


def note(msg):
    el = (time.time() - T_START) / 60.0
    C.log(f'[global +{el:.1f}min] {msg}')


# ================================================================== global problem
class GPrb(M.SecPrb):
    """msfit.SecPrb (data, realism blocks) with the CHAIN's global flat coordinate and apex-rooted kinematics."""

    def __init__(self):
        super().__init__()
        self.k_apex = C.ROLLS_IDX['apex fold']
        self.gnames = [n for a in M.SEC_DEF for n in a[2]]
        self.gsec = M.Sec(self, 'G', list(range(NI)), self.gnames, 1.0, None, False)
        self.gact = list(self.gsec.act)
        self.sec = self.gsec
        self.T1 = self.T2 = self.w1 = self.w2 = None
        self.zstar = None

    def lam(self, x):
        return C.Chain.lam(self, x)

    def F(self, x, tau):
        return C.Chain.F(self, x, tau)

    def ctx(self, x, act):
        return C.Chain.ctx(self, x, act)

    # ---- residuals
    def set_targets(self, zstar):
        self.zstar = zstar
        self.T1 = AP.backproject(self.e1, zstar)
        self.T2 = AP.backproject(self.e2, zstar)
        k1 = np.array([str(k) for k in self.P['kind1']]); k2 = np.array([str(k) for k in self.P['kind2']])
        vis1, vis2 = self.P['vis1'], self.P['vis2']
        self.w1 = np.where(vis1, np.where(k1 == 'soft', 0.3, 1.0), 0.3)
        self.w2 = np.where(vis2, np.where(k2 == 'soft', 0.3, 1.0), 0.3)

    def parts(self, x, st):
        g = st['g']
        act = st['act']
        W = self.W
        cx = self.ctx(x, act)
        (G, E), r = cx
        idx = g['idx']
        ur = self.u_ring(x)[idx]
        n = len(idx)
        FL = C.chain_surface(G, r, ur, np.full(n, -W / 2))
        FR = C.chain_surface(G, r, ur, np.full(n, W / 2))
        out = {}
        out['t3d'] = np.concatenate([((FL - self.T1[idx]) * self.w1[idx, None]).ravel(), ((FR - self.T2[idx]) * self.w2[idx, None]).ravel()])
        out['order'] = np.maximum(0.0, 2.0 - np.diff(r[:, 0])) * SC * 5 if len(r) > 1 else np.zeros(0)
        out['ovm'] = self.ovm_block(r) * max(1.0, g['wreal'])         # roll regions must not overlap: structural (the chain is only valid without), always on
        wr = g['wreal']
        if wr > 0:
            out['xing'] = self.xing_block(cx, st) * wr
            out['smooth'] = self.smooth_block(x, cx) * wr
        if g.get('prior') is not None:
            kk, x0 = g['prior']
            pr_ = []
            for k in kk:
                o = 6 + 4 * k
                pr_.append((x[o:o + 4] - x0[o:o + 4]) / np.array([W, 1.0, W, 1.0]) * g['prior_w'])
            out['prior'] = np.concatenate(pr_)
        return out

    def gstate(self, act, rings, wreal=0.0, prior=None, prior_w=100.0):
        st = dict(self.stage_info(act, 0, self.N - 1)) if len(act) == len(self.gact) else dict(act=list(act))
        st['act'] = list(act)
        st['g'] = dict(idx=np.asarray(rings), wreal=wreal, prior=prior, prior_w=prior_w)
        return st


# ================================================================== 1. depth plan
def a_depth(prA, xa, secA):
    rings = np.arange(388, 659)
    L, R = M.sec_edges(prA, xa, secA, rings)
    return rings, ((L + R) / 2)[:, 2]


def depth_plan(pr, zA, bump=None):
    """z*(ring) per GLOBAL_PLAN section 1. zA: A's centre z at rings 388..658. bump: {interval: css} additive offsets of the interval's anchors."""
    W, N = pr.W, pr.N
    b = {k: 0.0 for k in range(NI)}
    b.update(bump or {})
    zL = float(zA[0:96].mean())                      # rings 388..483
    zR = float(zA[555 - 388:].mean())                 # rings 555..658
    zLb, zRb = float(zA[0]), float(zA[-1])
    zsw = max(zLb, zRb) + 1.0 * W + b[2]
    r = np.arange(N, dtype=float)
    z = np.zeros(N)

    def lin(r0, r1, v0, v1):
        m = (r >= r0) & (r <= r1)
        z[m] = v0 + (v1 - v0) * (r[m] - r0) / max(r1 - r0, 1)

    zS = zsw + 0.5 * W + b[1]
    lin(289, 387, zsw, zLb); z[289:388] += b[3]
    lin(226, 288, zsw, zsw)
    lin(132, 225, zS, zS)
    # tail: z_tail from the face-on width formula, blended in over rings 131 -> 100
    wpx = np.hypot(*(pr.e2 - pr.e1).T)
    wpx = ndi.uniform_filter1d(wpx, 15, mode='nearest')
    ztail = np.minimum(AP.D - W * AP.SX * AP.D / np.maximum(wpx, 1e-6), AP.D - 300.0)
    bl = np.clip((131 - r) / 31.0, 0, 1)
    zt = (1 - bl) * zS + bl * ztail
    z[0:132] = zt[0:132] + b[0]
    z[388:659] = zA
    zk = zR - 1.5 * W
    lin(659, 712, zRb, zk + b[7]); z[713:765] = zk + b[7]
    z[765:814] = zk + b[8]
    z[814:859] = zR - 2.5 * W + b[9]
    lin(859, 875, zR - 2.5 * W, zL + 1.0 * W + b[10]); z[876:911] = zL + 1.0 * W + b[10]
    lin(911, 990, zL + 1.0 * W, zL - 1.5 * W); lin(990, 1066, zL - 1.5 * W, zR - 1.5 * W); z[911:1067] += b[11]
    z[1067:1102] = zR - 1.5 * W + b[12]
    z[1102:1141] = zR - 0.5 * W + b[13]
    lin(1141, 1230, zR - 0.5 * W, zR - 2.0 * W); z[1141:1231] += b[14]
    z[1231:] = zR - 2.5 * W + b[15]
    zs = ndi.gaussian_filter1d(z, 8.0, mode='nearest')
    w = np.clip((r - 377) / 10.0, 0, 1) * np.clip((668 - r) / 10.0, 0, 1)
    zext = np.interp(r, np.arange(388, 659), zA)               # holds the end values outside
    zf = w * zext + (1 - w) * zs
    anchors = dict(zL=zL, zR=zR, zLb=zLb, zRb=zRb, z_sweep=zsw)
    return zf, anchors


def strand_cells(pr, cell=6.0):
    """per interval: dict(cell key -> ring) rasterised from the approved trace quads (cell size 6 cutout px)"""
    sc = 1.0 / cell
    shp = (int(1846 * sc) + 2, int(852 * sc) + 2)
    out = []
    for k in range(NI):
        im = Image.new('I', (shp[1], shp[0]), 0)
        dr = ImageDraw.Draw(im)
        for i in range(pr.i0[k], pr.i1[k]):
            q = [tuple(pr.e1[i] * sc), tuple(pr.e1[i + 1] * sc), tuple(pr.e2[i + 1] * sc), tuple(pr.e2[i] * sc)]
            dr.polygon(q, fill=i + 1)
        out.append(np.array(im).astype(np.int64) - 1)
    return out


def ou_check(pr, zf, cells=None):
    """overunder_v1 rules at the 2D overlap cells: front z* - back z* >= 2 thk (cells whose rings are within 1.5 W of arc of each other are ignored)"""
    cells = cells or strand_cells(pr)
    sid = {n: k for k, n in enumerate(pr.strand_names)}
    ou = pr.ou_json
    res = []
    for ri, rule in enumerate(ou['rules']):
        f = sid[rule['front']]
        for bname in rule['back']:
            b = sid[bname]
            cf, cb = cells[f], cells[b]
            m = (cf >= 0) & (cb >= 0)
            m &= np.abs(pr.tau[np.clip(cf, 0, None)] - pr.tau[np.clip(cb, 0, None)]) >= 1.5 * pr.W
            if not m.any():
                res.append(dict(rule=ri, front=rule['front'], back=bname, f=f, b=b, cells=0, viol=0, worst_shortfall=0.0))
                continue
            gap = zf[cf[m]] - zf[cb[m]]
            sh = 2 * pr.thk - gap
            res.append(dict(rule=ri, front=rule['front'], back=bname, f=f, b=b, cells=int(m.sum()), viol=int((sh > 0).sum()), worst_shortfall=float(max(sh.max(), 0.0)),
                            min_gap=float(gap.min())))
    return res


def build_plan(pr, zA):
    cells = strand_cells(pr)
    bump = {}
    hist = []
    best = None
    for it in range(4):
        zf, anc = depth_plan(pr, zA, bump)
        chk = ou_check(pr, zf, cells)
        nv = sum(c['viol'] for c in chk)
        if best is None or nv < best[0]:
            best = (nv, zf, anc, chk, dict(bump))
        hist.append(dict(iteration=it, bump={int(k): float(v) for k, v in bump.items()}, violations=nv,
                         rules=[dict(front=c['front'], back=c['back'], cells=c['cells'], viol=c['viol'], worst=round(c['worst_shortfall'], 1)) for c in chk if c['viol']]))
        note(f'depth plan iteration {it}: bump {hist[-1]["bump"]} -> over/under violations {nv} in rules {[(c["front"], c["back"], c["viol"]) for c in chk if c["viol"]]}')
        if nv == 0 or it == 3:
            break
        done = set()
        for c in chk:
            if not c['viol']:
                continue
            if c['f'] not in A_IVS:
                if c['f'] not in done and bump.get(c['f'], 0.0) >= 0.0:
                    bump[c['f']] = bump.get(c['f'], 0.0) + 0.5 * pr.W
                    done.add(c['f'])
            elif c['b'] not in A_IVS and c['b'] not in done:
                # the front strand is part of the locked A (its z cannot be raised): closest reading = lower the BACK strand's anchors by 0.5 W (spec issue)
                bump[c['b']] = bump.get(c['b'], 0.0) - 0.5 * pr.W
                done.add(c['b'])
    nv, zf, anc, chk, bump = best
    note(f'depth plan: kept the iteration with the fewest violations ({nv}), bumps {bump}')
    return zf, anc, hist, chk, bump


def plot_plan(pr, zf, anc, hist, chk, path):
    Wd, Ht = 1500, 1000
    im = Image.new('RGB', (Wd, Ht), (14, 14, 14))
    d = ImageDraw.Draw(im)
    x0, x1, y0, y1 = 70, Wd - 20, 40, 560
    zmin, zmax = float(zf.min()) - 20, float(zf.max()) + 20
    X = lambda r: x0 + (x1 - x0) * r / (pr.N - 1)
    Y = lambda z: y1 - (y1 - y0) * (z - zmin) / (zmax - zmin)
    cols = [(255, 255, 255), (255, 180, 120)]
    for k in range(NI):
        a, b = pr.i0[k], pr.i1[k]
        shade = (28, 28, 28) if k % 2 == 0 else (20, 20, 20)
        d.rectangle([X(a), y0, X(b + 1), y1], fill=shade)
        d.text((X(a) + 2, y0 + 3 + 11 * (k % 3)), str(pr.int_names[k]).replace('__', '>'), fill=(150, 200, 255))
    for zt in np.arange(math.ceil(zmin / 100) * 100, zmax, 100):
        d.line([(x0, Y(zt)), (x1, Y(zt))], fill=(50, 50, 50)); d.text((8, Y(zt) - 5), f'{zt:.0f}', fill=(180, 180, 180))
    for rr in range(0, pr.N, 100):
        d.text((X(rr) - 8, y1 + 4), str(rr), fill=(180, 180, 180))
    d.line([(X(r), Y(zf[r])) for r in range(pr.N)], fill=(255, 255, 255), width=2)
    for nm, v in anc.items():
        d.text((x0 + 4, y1 + 22 + 12 * list(anc).index(nm)), f'{nm} = {v:.1f}', fill=(255, 220, 120))
    yy = y1 + 100
    d.text((x0, yy), f'W = {pr.W:.2f} css, 2*thk = {2 * pr.thk:.2f}   z* (css, +z toward camera) vs ring', fill=(255, 255, 255)); yy += 14
    for h in hist:
        d.text((x0, yy), f'iteration {h["iteration"]}: bump {h["bump"]} -> violations {h["violations"]}  ' + str([(r_['front'], r_['back'], r_['viol']) for r_ in h['rules']]), fill=(255, 200, 200)); yy += 12
    yy += 8
    d.text((x0, yy), 'over/under check (final plan): front -> back : overlap cells, violating cells, min gap', fill=(255, 255, 255)); yy += 14
    for c in chk:
        col = (255, 120, 120) if c['viol'] else (150, 255, 150)
        d.text((x0, yy), f'{c["front"]:13s} -> {c["back"]:13s} cells {c["cells"]:5d}  viol {c["viol"]:5d}  min gap {c.get("min_gap", float("nan")):8.1f}', fill=col); yy += 11
        if yy > Ht - 10:
            break
    im.save(path)


# ================================================================== 2. seeds
def sec_x(pr, nm):
    p = os.path.join(SEC_DIR, SEEDS[nm])
    return M.ldx(pr, p)


def build_seed(pr, prA, xa, secA):
    """composed seed: every roll / lambda from its approved or best isolated section solution (B, M: default bend), A exactly with its pose."""
    W = pr.W
    x = pr.x0.copy()
    # lambdas + rolls
    srcs = {}
    for nm, *_ in M.SEC_DEF:
        srcs[nm] = sec_x(pr, nm) if nm in SEEDS else None
    srcs['A'] = xa
    for nm, ivs, rolls, *_ in M.SEC_DEF:
        xs = srcs[nm]
        for j in ivs:
            if xs is not None:
                x[6 + 4 * NR + j] = xs[6 + 4 * NR + j]
        for rn in rolls:
            k = C.ROLLS_IDX[rn]
            o = 6 + 4 * k
            if xs is not None:
                x[o:o + 4] = xs[o:o + 4]
    # clip into bounds
    x = np.clip(x, pr.lo + 1e-9, pr.hi - 1e-9)
    # ordering of the rolls along the trace: replace violators by their ring-based default
    act = pr.gact
    for it in range(3):
        for a, b in zip(act[:-1], act[1:]):
            if x[6 + 4 * b] - x[6 + 4 * a] < 2.0:
                k = b if b not in [C.ROLLS_IDX[n] for n in prA.secs['A'].rolls] else a
                o = 6 + 4 * k
                x[o:o + 4] = [pr.roll_tau0[k], np.pi / 2, 3 * W if pr.kind[k] == 'bend' else 0.4 * W, 0.0]
                note(f'  seed order fix: roll {pr.rname[k]} reset to default')
    # pose: A's segment 2 frame (between left-leg bend 2 and the apex fold) in A's own flat coordinate -> global flat coordinate
    prA.bind('A')
    cxA = prA.ctx(xa, secA.act)
    (GA, EA), rA = cxA
    R2, t2 = GA[2]
    tr = float(pr.tau_root)
    cshift = float(prA.F(xa, np.array([tr]))[0] - tr)
    # global lambdas of A's intervals equal A's, so F_A = F_G + cshift over A's span
    x[:3] = Rotation.from_matrix(R2).as_rotvec()
    x[3:6] = t2 + R2 @ np.array([cshift, 0.0, 0.0])
    return x, cshift


def a_slots(pr):
    ks = [C.ROLLS_IDX[n] for n in M.SEC_DEF[3][2]]
    sl = [6 + 4 * k + j for k in ks for j in range(4)]
    return ks, sl


def stats3d(pr, x, act=None):
    act = pr.gact if act is None else act
    L, R = pr.ring_edges(x, act)
    d1 = np.linalg.norm(L - pr.T1, axis=1); d2 = np.linalg.norm(R - pr.T2, axis=1)
    return L, R, d1, d2


def interval_rms(pr, d1, d2, vis=False):
    out = {}
    for k in range(NI):
        a, b = pr.i0[k], pr.i1[k] + 1
        v = np.r_[d1[a:b], d2[a:b]]
        if vis:
            v = np.r_[d1[a:b][pr.P['vis1'][a:b]], d2[a:b][pr.P['vis2'][a:b]]]
        out[str(pr.int_names[k])] = float(np.sqrt(np.mean(v ** 2))) if len(v) else None
    return out


def grow(pr, x, prA):
    """seed construction (GLOBAL_PLAN section 3 'Seeds'): add the isolated-section rolls outward from the locked A, fitting only the new rolls + their lambdas to the 3D targets of
    their own rings with a few starts (as-is, phi sign flips), so the composed chain starts from a coherent placement."""
    W = pr.W
    ksA, slA = a_slots(pr)
    act = sorted(ksA)
    x = x.copy()
    for nm in GROW_ORDER:
        sec = pr.secs[nm]
        act = sorted(set(act) | set(sec.act))
        free = np.array([6 + 4 * k + j for k in sec.act for j in range(4)] + [6 + 4 * NR + j for j in sec.ivs])
        rings = np.arange(sec.r0, sec.r1 + 1)
        st = pr.gstate(act, rings, 0.0)
        starts = [('seed', x.copy())]
        x_fl = x.copy()
        for k in sec.act:
            if pr.kind[k] != 'bend' or pr.rname[k] in ('S bend',):
                x_fl[6 + 4 * k + 3] = -x_fl[6 + 4 * k + 3]
        starts.append(('flip', x_fl))
        x_d = x.copy()
        for k in sec.act:
            o = 6 + 4 * k
            x_d[o:o + 4] = [pr.roll_tau0[k], np.pi / 2, 3 * W if pr.kind[k] == 'bend' else 0.4 * W, 0.0]
        starts.append(('default', x_d))
        best = None
        for tag, xs in starts:
            t0 = time.time()
            xo, cost, status = C.run_fit(pr, xs, st, free, GROW_SECS, f'grow {nm}/{tag}', max_nfev=300, quiet=True)
            if best is None or cost < best[1]:
                best = (xo, cost, tag)
        x = best[0]
        Lr, Rr = pr.ring_edges(x, act, 0, pr.N - 1)
        d = np.r_[np.linalg.norm(Lr[rings] - pr.T1[rings], axis=1), np.linalg.norm(Rr[rings] - pr.T2[rings], axis=1)]
        note(f'  grow {nm}: act {len(act)} best start {best[2]} cost {best[1]:.0f} 3D rms of its rings {np.sqrt(np.mean(d ** 2)):.1f} css')
    return x


def total_cost(pr, x, st):
    r = pr.res(x, st)
    return 0.5 * float(r @ r)


def run_pass(pr, x, free, wreal, prior, label, secs=PASS_SECS):
    st = pr.gstate(pr.gact, np.arange(pr.N), wreal, prior=prior)
    c0 = total_cost(pr, x, st)
    t0 = time.time()
    xo, cost, status = C.run_fit(pr, x, st, free, secs, label, max_nfev=3000)
    L, R, d1, d2 = stats3d(pr, xo)
    rms = float(np.sqrt(np.mean(np.r_[d1, d2] ** 2)))
    note(f'{label}: status {status}, cost {c0:.0f} -> {cost:.0f}, 3D rms (all samples) {rms:.2f} css, {time.time() - t0:.0f}s')
    return xo, dict(label=label, status=status, cost0=c0, cost=cost, rms3d=rms, seconds=time.time() - t0, wreal=wreal)


# ================================================================== 4. metrics and outputs
def window_secs(pr):
    out = {}
    for iv, nm in M.WINNAME.items():
        s = copy.copy(pr.gsec)
        s.name = nm; s.ivs = [iv]
        s.r0, s.r1 = int(pr.i0[iv]), int(pr.i1[iv])
        s.tau_in, s.tau_out = float(pr.tau_b[iv]), float(pr.tau_b[iv + 1])
        out[nm] = s
    return out


def compute_metrics(pr, x, passes, anchors, plan_hist, chk, plan_note):
    W = pr.W
    act = pr.gact
    L, R, d1, d2 = stats3d(pr, x, act)
    m = dict(passes=passes, depth_anchors=anchors, depth_plan_iterations=plan_hist)
    m['rms3d_per_interval_all'] = interval_rms(pr, d1, d2)
    m['rms3d_per_interval_visible'] = interval_rms(pr, d1, d2, vis=True)
    m['rms3d_total'] = float(np.sqrt(np.mean(np.r_[d1, d2] ** 2)))
    p1, p2 = AP.project(L), AP.project(R)
    e1, e2 = pr.e1, pr.e2
    q1 = np.hypot(*(p1 - e1).T); q2 = np.hypot(*(p2 - e2).T)
    m['rms2d_px_per_interval_all'] = interval_rms(pr, q1, q2)
    m['rms2d_px_per_interval_visible'] = interval_rms(pr, q1, q2, vis=True)
    # realism per window (+ whole ribbon)
    pr.bind(pr.gsec)
    rows = {}
    full_rep, _ = M.realism(pr, pr.gsec, x, outline=False)
    rows['ALL'] = {k: v for k, v in full_rep.items() if k != 'outline'}
    for nm, s in window_secs(pr).items():
        pr.bind(pr.gsec)
        rep, _ = M.realism(pr, s, x)
        rep = dict(rep)
        rep['roll_overlap_min_gap'] = full_rep['roll_overlap_min_gap']          # rolls of the whole chain (act is global), see spec issues
        rep['min_fold_rho_over_W'] = full_rep['min_fold_rho_over_W']
        fails = [f for f in rep['fails'] if f not in ('roll-overlap', 'rho<0.3W')]
        if rep['roll_overlap_min_gap'] is not None and rep['roll_overlap_min_gap'] < 0:
            fails.append('roll-overlap(global)')
        rep['fails'] = fails
        rows[nm] = rep
    m['realism'] = rows
    r = pr.rolls(x)[act]
    folds = [(pr.rname[k], float(r[i, 2] / W)) for i, k in enumerate(act) if pr.kind[k] in ('fold', 'obl')]
    m['min_fold_rho_over_W'] = float(min(v for _, v in folds))
    m['fold_rho_over_W'] = dict(folds)
    # dense z-buffer over/under
    pr.bind(pr.gsec)
    st = pr.stage_info(act, 0, pr.N - 1)
    m['over_under_dense'] = C.ou_stat(pr, x, st)
    m['over_under_dense_note'] = 'viol_lt_2thk = cells with gap < 2 thk (the rule); viol_lt_thk = gap < thk. thk = W/11'
    PL, PR = pr.ring_edges(x, act)
    m['min_clearance_css'] = float(C.clearance_min(pr, PL, PR, W))
    m['two_thk_css'] = float(2 * pr.thk)
    m['face'] = C.face_stat(pr, x, st)
    m['rolls'] = [dict(name=pr.rname[k], kind=pr.kind[k], tau=float(r[i, 0]), beta_deg=float(np.degrees(r[i, 1])), rho_css=float(r[i, 2]),
                       rho_over_W=float(r[i, 2] / W), phi_deg=float(np.degrees(r[i, 3]))) for i, k in enumerate(act)]
    m['lambda'] = {str(pr.int_names[j]): float(pr.lam(x)[j]) for j in range(NI)}
    return m


def zoom_all(pr, x, pc, rows, m):
    import chain_sheets as CS
    for wn, box in M.WIN_BOXES.items():
        ow = {'scurve': 's'}.get(wn, wn)
        rep = rows.get(ow)
        ivs = [iv for iv, nm in M.WINNAME.items() if nm == ow]
        if ivs:
            nm_iv = str(pr.int_names[ivs[0]])
            h3 = m['rms3d_per_interval_all'][nm_iv]; h2 = m['rms2d_px_per_interval_all'][nm_iv]
        else:
            h3 = h2 = None
        if rep:
            ol = rep['outline'].get(ow)
            hdr = (f'{wn}  crossings {rep["crossings"]} sep {rep["sep_violations"]} min fold rho/W {m["min_fold_rho_over_W"]:.2f} kinks {rep["curv_oscillations"]}+{rep["corners"]} dips {rep["dips"]}  '
                   f'outline {("%.1f/%.1f px" % (ol["mean_px"], ol["max_px"])) if ol else "-"}  3D rms {h3:.1f} css  2D rms {h2:.1f} px  fails {rep["fails"]}')
        else:
            hdr = f'{wn} (no turn window interval)'
        S3 = 3
        mk = CS.mockup_crop(box).resize(((box[2] - box[0]) * S3, (box[3] - box[1]) * S3), Image.LANCZOS)
        ov = M.overlay_png(None, [pc], box=box, scale=S3, ret=True)
        mstep = max(1, len(pc['L']) // 1600)
        sh = M.offline_lit(pc['L'][::mstep], pc['R'][::mstep], box, S3)
        sheet = Image.new('RGB', (mk.width * 3 + 20, mk.height + 26), (10, 10, 10))
        for i, im_ in enumerate((mk, ov, sh)):
            sheet.paste(im_.convert('RGB'), (i * (mk.width + 10), 26))
        ImageDraw.Draw(sheet).text((6, 7), hdr, fill=(255, 255, 255))
        sheet.save(os.path.join(OUTG, f'zoom_{wn}.png'))


def outputs(pr, x, passes, anchors, plan_hist, chk, zf):
    pr.bind(pr.gsec)
    m = compute_metrics(pr, x, passes, anchors, plan_hist, chk, None)
    json.dump(m, open(os.path.join(OUTG, 'metrics.json'), 'w'), indent=1, default=float)
    note('metrics.json written')
    pc = M.sec_rulings(pr, x, pr.gsec)
    M.overlay_png(os.path.join(OUTG, 'full_overlay.png'), [pc])
    M.shaded_png(pr, pc, os.path.join(OUTG, 'full_shaded.png'))
    note('full_overlay.png, full_shaded.png written')
    zoom_all(pr, x, pc, m['realism'], m)
    note('zoom sheets written')
    np.savez(os.path.join(OUTG, 'solution.npz'), x=x, zstar=zf, gact=np.array(pr.gact), rnames=np.array(pr.rname), cshift=0.0)
    note('solution.npz written')
    return m


# ================================================================== driver
def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'all'
    note(f'## global_fit {cmd} start')
    pr = GPrb()
    prA = M.SecPrb()
    secA = prA.bind('A')
    xa = M.ldx(prA, os.path.join(SEC_DIR, SEEDS['A']))
    rings, zA = a_depth(prA, xa, secA)
    note(f'W_css {pr.W:.3f}, thk {pr.thk:.3f}; A centre z at rings 388..658: min {zA.min():.1f} max {zA.max():.1f} mean {zA.mean():.1f}')
    zf, anc, hist, chk, bump = build_plan(pr, zA)
    note('depth plan anchors ' + json.dumps({k: round(v, 2) for k, v in anc.items()}) + f' (W={pr.W:.2f}); final bumps {bump}')
    np.savez(os.path.join(OUTG, 'depth_plan.npz'), zstar=zf, zA=zA)
    plot_plan(pr, zf, anc, hist, chk, os.path.join(OUTG, 'depth_plan.png'))
    pr.set_targets(zf)
    note(f'targets: T1/T2 = backproject(e1_px/e2_px, z*), weights vis hard/fixed 1.0, soft 0.3, hidden 0.3; z* range {zf.min():.1f}..{zf.max():.1f}')
    if cmd == 'plan':
        return
    if cmd == 'outputs':
        d = np.load(os.path.join(OUTG, 'solution.npz'))
        mj = json.load(open(os.path.join(OUTG, 'metrics.json')))
        outputs(pr, d['x'], mj['passes'], anc, hist, chk, zf)
        return
    pr.bind(pr.gsec)
    x, cshift = build_seed(pr, prA, xa, secA)
    note(f'seed built (A exact; flat shift {cshift:.3f})')
    # verify A is reproduced
    ksA, slA = a_slots(pr)
    actA = pr.gact
    L, R, d1, d2 = stats3d(pr, x, actA)
    prA.bind('A')
    LA, RA = M.sec_edges(prA, xa, secA, np.arange(388, 659))
    # global chain edges at A's rings with ONLY the roll set up to A's (compare on the same act)
    act_test = sorted(set(pr.gact))
    Lg, Rg = pr.ring_edges(x, act_test)
    note(f'check: seed 3D rms (before growth) {np.sqrt(np.mean(np.r_[d1, d2] ** 2)):.1f} css')
    xs = x.copy()
    # A reproduction: grow-free chain restricted to A's rolls
    Lt, Rt = pr.ring_edges(x, sorted(ksA))
    err = np.linalg.norm(Lt[388:659] - LA, axis=1).max()
    note(f'check: global chain (A rolls only) vs sec_A_APPROVED edges at rings 388..658: max |dL| = {err:.4f} css')
    x = grow(pr, x, prA)
    L, R, d1, d2 = stats3d(pr, x)
    note(f'after seed growth: 3D rms {np.sqrt(np.mean(np.r_[d1, d2] ** 2)):.1f} css; per interval ' + json.dumps({k: round(v, 1) for k, v in interval_rms(pr, d1, d2).items()}))
    np.savez(os.path.join(OUTG, 'seed.npz'), x=x)
    # ---- passes
    all_free = np.arange(pr.nx)
    free1 = np.array([i for i in all_free if i >= 6 and i not in set(slA) and i not in [6 + 4 * NR + j for j in A_IVS]])
    x_A0 = x.copy()
    passes = []
    x, p1 = run_pass(pr, x, free1, 0.3, None, 'pass 1 (A rolls frozen)')
    passes.append(p1)
    np.savez(os.path.join(OUTG, 'pass1.npz'), x=x)
    # A-frozen check
    LA2 = pr.ring_edges(x, sorted(ksA))[0][388:659]
    note('pass 1 done; A region unchanged check (A rolls only chain) max |dL| vs approved ' + f'{np.linalg.norm(LA2 - LA, axis=1).max():.4f}')
    prior = (ksA, x_A0)
    x, p2 = run_pass(pr, x, all_free, 0.3, prior, 'pass 2 (all free, A prior 100)')
    passes.append(p2)
    np.savez(os.path.join(OUTG, 'pass2.npz'), x=x)
    elapsed = (time.time() - T_START) / 60.0
    if elapsed < 33.0:
        x, p3 = run_pass(pr, x, all_free, 1.0, prior, 'pass 3 (realism weight 1.0)')
        passes.append(p3)
        np.savez(os.path.join(OUTG, 'pass3.npz'), x=x)
    else:
        note(f'pass 3 SKIPPED: elapsed {elapsed:.1f} min > budget')
        passes.append(dict(label='pass 3 skipped (time)', status='skipped'))
    outputs(pr, x, passes, anc, hist, chk, zf)
    note(f'## done in {(time.time() - T_START) / 60:.1f} min')


if __name__ == '__main__':
    main()
