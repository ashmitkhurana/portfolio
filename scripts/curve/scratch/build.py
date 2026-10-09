import sys, os, json, math, time
import numpy as np
from scipy.interpolate import make_smoothing_spline, CubicSpline
from scipy.optimize import least_squares
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
from fit3d import pose_to_world, world_to_pose, project, unit, D, VW, VH, A

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)
LOG = []
def log(*a):
    s = " ".join(str(x) for x in a)
    print(s, flush=True); LOG.append(s)

H = 25.5
N = 1299
LEGS = [(380, 488), (555, 635)]
NB = 10
def sstep(x):
    x = np.clip(x, 0, 1); return x * x * (3 - 2 * x)

P = json.load(open(os.path.join(ROOT, "docs/ribbon/turns/real/X3/pose.json")))
rings = P["variants"]["phone"]["ruled"]
assert len(rings) == N
L3 = pose_to_world(np.array([r["L"] for r in rings]))
R3 = pose_to_world(np.array([r["R"] for r in rings]))
C3 = (L3 + R3) / 2
zX3 = C3[:, 2].copy()

def screen_z_to_world(s, z):
    k = (D - z) / D
    return np.stack([(s[:, 0] - VW / 2) * k, (VH / 2 - s[:, 1]) * k, z], 1)

# verify inverse
sc_chk = project(C3)
err = np.abs(screen_z_to_world(sc_chk, C3[:, 2]) - C3).max()
log("inverse-perspective check on X3 centre: max err", err)
assert err < 1e-6

# ---- 1. screen path
sc = (project(L3) + project(R3)) / 2
u = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(sc, axis=0), axis=1))])
for i in range(1, N):
    if u[i] <= u[i - 1]: u[i] = u[i - 1] + 1e-6
def smooth(lam):
    fx = make_smoothing_spline(u, sc[:, 0], lam=lam); fy = make_smoothing_spline(u, sc[:, 1], lam=lam)
    ss = np.stack([fx(u), fy(u)], 1)
    return ss, math.sqrt(np.mean(np.sum((ss - sc) ** 2, 1)))
lo, hi = -8.0, 8.0
for _ in range(60):
    mid = (lo + hi) / 2
    _, r = smooth(10 ** mid)
    if r < 1.5: lo = mid
    else: hi = mid
ss0, rms = smooth(10 ** ((lo + hi) / 2))
log("screen smoothing: lam=%.4g RMS=%.4f px" % (10 ** ((lo + hi) / 2), rms))

def leg_fraction(ss0, a, b):
    cum = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(ss0, axis=0), axis=1))])
    return (cum - cum[a]) / (cum[b] - cum[a])   # fraction; <0 or >1 outside

ss = ss0.copy()
FR = {}
for (a, b) in LEGS:
    fr = leg_fraction(ss0, a, b); FR[(a, b)] = fr
    line = lambda k: ss0[a] + fr[k, None] * (ss0[b] - ss0[a])
    for k in range(a, b + 1):
        ss[k] = line(k)
    for k in range(a - NB, a):
        q = sstep((k - (a - NB)) / NB); ss[k] = (1 - q) * ss0[k] + q * line(k)
    for k in range(b + 1, b + NB + 1):
        q = sstep(((b + NB) - k) / NB); ss[k] = (1 - q) * ss0[k] + q * line(k)

# ---- 2. depth
kc = np.array(list(range(0, 1281, 20)) + [1298])
assert len(kc) == 66
zc0 = zX3[kc].copy()
OV = {900: 80, 920: 85, 940: 72, 960: 50, 980: 28, 1000: 12, 1020: 10, 1040: 16, 1060: 24, 1080: 22, 1100: 12}
for k, v in OV.items():
    zc0[list(kc).index(k)] = v
ks = np.arange(N)
def zfun(zc):
    zs = CubicSpline(kc, zc)(ks)
    z = zs.copy()
    for (a, b) in LEGS:
        fr = FR[(a, b)]
        line = lambda k: zs[a] + fr[k] * (zs[b] - zs[a])
        for k in range(a, b + 1): z[k] = line(k)
        for k in range(a - NB, a):
            q = sstep((k - (a - NB)) / NB); z[k] = (1 - q) * zs[k] + q * line(k)
        for k in range(b + 1, b + NB + 1):
            q = sstep(((b + NB) - k) / NB); z[k] = (1 - q) * zs[k] + q * line(k)
    return z

def mavg(a, w=5):
    pad = w // 2
    ap = np.concatenate([np.repeat(a[:1], pad, 0), a, np.repeat(a[-1:], pad, 0)], 0)
    cs = np.cumsum(np.concatenate([np.zeros((1,) + a.shape[1:]), ap], 0), 0)
    return (cs[w:] - cs[:-w]) / w

EZ = np.array([0., 0., 1.])
KLO, KHI = 1 / 300, 1 / 120
def frames(z, full=False):
    c = screen_z_to_world(ss, z)
    T = unit(np.gradient(c, axis=0)); T = unit(mavg(T, 5))
    dc = np.linalg.norm(np.gradient(c, axis=0), axis=1)
    kv = mavg(np.gradient(T, axis=0) / np.maximum(dc, 1e-9)[:, None], 5)
    kap = np.linalg.norm(kv, axis=1)
    Bn = unit(np.cross(T, kv))
    e1 = unit(np.cross(EZ, T)); e2 = np.cross(T, e1)
    thp = np.arctan2((Bn * e2).sum(1), (Bn * e1).sum(1))
    thp = np.where(kap > 1e-6, thp, np.nan)
    w = sstep((kap - KLO) / (KHI - KLO))
    # theta
    curved = w >= 0.5
    runs = []; k = 0
    while k < N:
        if not curved[k]:
            s = k
            while k < N and not curved[k]: k += 1
            runs.append((s, k - 1))
        else: k += 1
    branch = np.full(N, np.nan); lin = np.full(N, np.nan); near = np.zeros(N, bool)
    def nearest(t, ref): return t + np.pi * np.round((ref - t) / np.pi)
    # walk
    prev = None
    k = 0
    runmap = {r[0]: r for r in runs}
    while k < N:
        if k in runmap:
            s, e = runmap[k]
            if s == 0:
                if e + 1 < N:
                    te = thp[e + 1]; ref = te
                else:
                    te = 0.0; ref = 0.0
                # hold constant
                lin[s:e + 1] = ref
                near[max(0, s):min(N, e + 1 + NB + 5)] |= True
                prev = None
                if e + 1 < N: branch[e + 1] = te
                for kk in range(s, e + 1):
                    if not np.isnan(thp[kk]): branch[kk] = nearest(thp[kk], ref)
                k = e + 1
                if k < N: prev = branch[k]; k += 1
                continue
            t0 = prev
            if e + 1 < N:
                te = nearest(thp[e + 1], t0)
                for kk in range(s, e + 1):
                    lin[kk] = t0 + (te - t0) * (kk - (s - 1)) / (e + 1 - (s - 1))
                    if not np.isnan(thp[kk]): branch[kk] = nearest(thp[kk], lin[kk])
                # extend line beyond for blending of adjacent curved rings
                for kk in list(range(max(0, s - 15), s)) + list(range(e + 1, min(N, e + 16))):
                    if np.isnan(lin[kk]) and not np.isnan(thp[kk]):
                        lin[kk] = t0 + (te - t0) * (kk - (s - 1)) / (e + 1 - (s - 1))
                branch[e + 1] = te; prev = te
                k = e + 2
            else:
                lin[s:e + 1] = t0
                for kk in range(s, e + 1):
                    if not np.isnan(thp[kk]): branch[kk] = nearest(thp[kk], t0)
                for kk in range(max(0, s - 15), s):
                    if np.isnan(lin[kk]): lin[kk] = t0
                k = N
            continue
        # curved ring
        if prev is None: branch[k] = thp[k]
        else: branch[k] = nearest(thp[k], prev)
        prev = branch[k]; k += 1
    # lin for rings just before a run border (curved side, before the run) — assigned in the loop with te/t0 extension above
    # (fill the pre-run extension using the run line for rings s-15..s-1 which were visited earlier)
    th = branch.copy()
    for (s, e) in runs:
        if s == 0 or e == N - 1:
            continue
    # recompute pre-run extension (rings before s) since they were walked before the run was handled
    for (s, e) in runs:
        if s == 0: continue
        if e + 1 < N:
            t0 = branch[s - 1]; te = branch[e + 1]
            for kk in range(max(0, s - 15), s):
                lin[kk] = t0 + (te - t0) * (kk - (s - 1)) / (e + 1 - (s - 1))
    use = ~np.isnan(lin)
    th = np.where(use, w * np.where(np.isnan(branch), lin, branch) + (1 - w) * lin, branch)
    # w==0 rings may lack branch -> ok since lin used; any remaining nan -> lin or 0
    th = np.where(np.isnan(th), np.where(np.isnan(lin), 0.0, lin), th)
    b = np.cos(th)[:, None] * e1 + np.sin(th)[:, None] * e2
    Lw = c - H * b; Rw = c + H * b
    Nn = unit(np.cross(T, b)); v = unit(np.array([0, 0, D]) - c)
    s_ = (Nn * v).sum(1)
    if full: return dict(c=c, T=T, kv=kv, kap=kap, w=w, th=th, b=b, L=Lw, R=Rw, s=s_, runs=runs)
    return b, s_

# face label: applied inside every evaluation (face A = the face seen on the tail)
def flipof(s): return -1.0 if s[:150].mean() < 0 else 1.0
_, s_init = frames(zfun(zc0))
log("initial raw mean s[0:150]", s_init[:150].mean(), "label factor", flipof(s_init))

# faces spec
F = json.load(open(os.path.join(ROOT, "docs/ribbon/turns/real/faces.json")))
fmask = np.zeros(N, bool); fe = np.zeros(N)
for sg in F["segments"]:
    a, b_ = sg["rings"]; fmask[a:b_ + 1] = True; fe[a:b_ + 1] = 1.0 if sg["face"] == "A" else -1.0
for a, b_ in F["flip_zones"]: fmask[a:b_ + 1] = False
fidx = np.where(fmask)[0]

# over/under pairs
sc_ss = ss
from scipy.spatial import cKDTree
tr = cKDTree(sc_ss)
pr = tr.query_pairs(2 * H + 4, output_type="ndarray")
pr = pr[(np.abs(pr[:, 0] - pr[:, 1]) > 40)]
i_, j_ = np.minimum(pr[:, 0], pr[:, 1]), np.maximum(pr[:, 0], pr[:, 1])
order = np.lexsort((j_, i_)); i_, j_ = i_[order], j_[order]
npairs_all = len(i_)
front_all = np.where(zX3[i_] >= zX3[j_], i_, j_); back_all = np.where(zX3[i_] >= zX3[j_], j_, i_)
if npairs_all > 6000:
    stride = int(math.ceil(npairs_all / 6000)); sel = np.arange(0, npairs_all, stride)[:6000]
else:
    sel = np.arange(npairs_all)
PI, PJ = i_[sel], j_[sel]
PF, PB = front_all[sel], back_all[sel]
log("over/under pairs: all", npairs_all, "used", len(sel))

def blocks(zc):
    z = zfun(zc)
    b, s = frames(z)
    s = s * flipof(s)
    rf = 20 * np.maximum(0, 0.3 - fe[fidx] * np.tanh(s[fidx] / 0.15))
    need = 14 + 0.6 * H * (np.abs(b[PI, 2]) + np.abs(b[PJ, 2]))
    ro = 30 * np.maximum(0, need - (z[PF] - z[PB]))
    rs = 3 * (zc[2:] - 2 * zc[1:-1] + zc[:-2])
    rsh = 0.05 * zc
    rk = 2 * (z[:331] - zX3[:331])
    return dict(faces=rf, overunder=ro, smooth=rs, shallow=rsh, keep=rk)

def resid(zc):
    bl = blocks(zc)
    return np.concatenate([bl[k] for k in ["faces", "overunder", "smooth", "shallow", "keep"]])

def softl1cost(r): return 0.5 * np.sum(2 * (np.sqrt(1 + r ** 2) - 1))

def write_pose(zc, path):
    d = frames(zfun(zc), full=True)
    Q = json.loads(json.dumps(P))
    Lp = world_to_pose(d["L"]); Rp = world_to_pose(d["R"])
    Q["variants"]["phone"]["ruled"] = [{"L": [float(x) for x in Lp[k]], "R": [float(x) for x in Rp[k]]} for k in range(N)]
    json.dump(Q, open(path, "w"))

t0 = time.time(); r0 = resid(zc0)
log("one residual eval: %.3fs, nres %d" % (time.time() - t0, len(r0)))
bl0 = blocks(zc0)
log("initial cost (soft_l1) %.4f" % softl1cost(r0), {k: round(float((v ** 2).sum()), 3) for k, v in bl0.items()})

best = dict(c=np.inf, zc=zc0.copy()); T0 = time.time(); LIMIT = 19 * 60
class Out(Exception): pass
cnt = [0]
def fun(zc):
    r = resid(zc); c = softl1cost(r)
    if c < best["c"]:
        best["c"] = c; best["zc"] = zc.copy()
    cnt[0] += 1
    if time.time() - T0 > LIMIT: raise Out()
    return r
timed_out = False
try:
    res = least_squares(fun, zc0, method="trf", loss="soft_l1", f_scale=1.0, max_nfev=3000, x_scale=10.0)
    zf = res.x; log("optimiser:", res.status, res.message, "nfev", res.nfev, "njev", res.njev, "cost", res.cost)
except Out:
    timed_out = True; zf = best["zc"]; log("TIME LIMIT hit, using best so far; evals", cnt[0])
rf_ = resid(zf)
blf = blocks(zf)
log("final cost (soft_l1) %.4f" % softl1cost(rf_), {k: round(float((v ** 2).sum()), 3) for k, v in blf.items()}, "time %.1fs" % (time.time() - T0))

# ---- outputs
write_pose(zf, os.path.join(OUT, "pose.json"))
z = zfun(zf); d = frames(z, full=True)
FLIP = flipof(d["s"]); s = d["s"] * FLIP
log("final raw mean s[0:150] %.4f label factor %g" % (d["s"][:150].mean(), FLIP))
c, b, kv, w = d["c"], d["b"], d["kv"], d["w"]
log("zc final:", np.round(zf, 1).tolist())
for (a, b_) in LEGS:
    p0, p1 = c[a], c[b_]; t = unit((p1 - p0)[None])[0]
    rel = c[a:b_ + 1] - p0; dev = np.linalg.norm(rel - (rel @ t)[:, None] * t, axis=1)
    log("leg %d..%d straightness: max deviation of centre from 3D line %.4f px (at ring %d)" % (a, b_, dev.max(), a + int(dev.argmax())))
for sg in F["segments"]:
    a, b_ = sg["rings"]; ids = np.array([k for k in range(a, b_ + 1) if fmask[k]]); e = 1 if sg["face"] == "A" else -1
    log("faces seg %s [%d,%d] %s: %.4f match (%d rings counted)" % (sg["name"], a, b_, sg["face"], np.mean(e * s[ids] > 0), len(ids)))
vio_all = ((z[front_all] - z[back_all]) < 14).sum()
vio_used = ((z[PF] - z[PB]) < 14).sum()
log("over/under violated (z_front-z_back<14): all pairs %d / %d ; subsample %d / %d" % (vio_all, npairs_all, vio_used, len(PF)))
dang = np.degrees(np.arccos(np.clip((b[1:] * b[:-1]).sum(1), -1, 1)))
log("big ruling steps (>20deg):", [(int(k), round(float(dang[k]), 1)) for k in np.where(dang > 20)[0]][:20])
log("max per-ring ruling change %.3f deg between rings %d and %d" % (dang.max(), dang.argmax(), dang.argmax() + 1))
gi = np.abs((kv * b).sum(1)); cm = w >= 0.5
gi_c = np.where(cm, gi, 0)
log("max |dot(kv,b)| in curved stretches (w>=0.5): %.3e (1/px) at ring %d ; kappa there %.3e" % (gi_c.max(), gi_c.argmax(), d["kap"][gi_c.argmax()]))
log("max |dot(kv,b)|/kappa in curved stretches: %.4f at ring %d" % ((gi / np.maximum(d["kap"], 1e-9) * cm).max(), (gi / np.maximum(d["kap"], 1e-9) * cm).argmax()))
log("straight runs (w<0.5):", d["runs"])
if timed_out: log("NOTE: timed out; best-so-far result saved")
open(os.path.join(OUT, "build.log"), "w").write("\n".join(LOG) + "\n")
np.save(os.path.join(OUT, "zc.npy"), zf)
