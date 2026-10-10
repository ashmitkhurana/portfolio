import sys, os, json, math
import numpy as np
from scipy.interpolate import make_smoothing_spline
from scipy.ndimage import gaussian_filter1d
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
from fit3d import pose_to_world, world_to_pose, project, unit, D, VW, VH

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
cfg = json.load(open(sys.argv[1]))
OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)
LOG = []
def log(*a):
    s = " ".join(str(x) for x in a)
    LOG.append(s)

def stop(msg):
    LOG.append("STOP: " + msg)
    open(os.path.join(OUT, "build.log"), "w").write("\n".join(LOG) + "\n")
    print("STOP: " + msg)
    sys.exit(1)

def chk(name, arr):
    if not np.all(np.isfinite(arr)):
        stop("non-finite values in " + name)

X3 = json.load(open(os.path.join(ROOT, "docs/ribbon/turns/real/X3/pose.json")))
rings = X3["variants"]["phone"]["ruled"]
N = len(rings)
assert N == 1299, N
Lp = np.array([r["L"] for r in rings], float)
Rp = np.array([r["R"] for r in rings], float)
Lw = pose_to_world(Lp); Rw = pose_to_world(Rp)
c3 = (Lw + Rw) / 2
sc = project((Lw + Rw) / 2)
z3 = c3[:, 2]

# 1. screen path
u = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(sc, axis=0), axis=1))])
sx = make_smoothing_spline(u, sc[:, 0], lam=cfg["smooth_lambda"])
sy = make_smoothing_spline(u, sc[:, 1], lam=cfg["smooth_lambda"])
ss = np.stack([sx(u), sy(u)], 1)
chk("ss", ss)
rms_ss = math.sqrt(np.mean(np.sum((ss - sc) ** 2, axis=1)))

def sm(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)

for a, b in cfg["straight_legs"]:
    U = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(ss, axis=0), axis=1))])
    A0 = ss[a].copy(); B0 = ss[b].copy()
    new = ss.copy()
    for k in range(a, b + 1):
        f = (U[k] - U[a]) / (U[b] - U[a])
        new[k] = A0 + f * (B0 - A0)
    LB = int(cfg.get("leg_blend", 10))
    for k in range(a - LB, a):
        f = (U[k] - U[a]) / (U[b] - U[a])
        line = A0 + f * (B0 - A0)
        q = sm((k - (a - LB)) / LB)
        new[k] = (1 - q) * ss[k] + q * line
    for k in range(b + 1, b + LB + 1):
        f = (U[k] - U[a]) / (U[b] - U[a])
        line = A0 + f * (B0 - A0)
        q = sm(((b + LB) - k) / LB)
        new[k] = (1 - q) * ss[k] + q * line
    ss = new
chk("ss straight", ss)

# 2. world helper
def world(s_, z):
    s_ = np.asarray(s_, float); z = np.asarray(z, float)
    k = (D - z) / D
    return np.stack([(s_[..., 0] - VW / 2) * k, (VH / 2 - s_[..., 1]) * k, z + 0 * k], -1)

rt = np.abs(world(sc, z3) - c3).max()
if not rt < 1e-6:
    stop("step 2 round-trip error %g >= 1e-6" % rt)

# 3. turn depths
# local extra smoothing of the screen path (config "local_smooth": [[a, b, sigma], ...]), 8-ring smoothstep blend
for a_, b_, sg_ in cfg.get("local_smooth", []):
    sm_ = np.stack([gaussian_filter1d(ss[:, 0], sg_, mode="nearest"), gaussian_filter1d(ss[:, 1], sg_, mode="nearest")], 1)
    kk_ = np.arange(N).astype(float)
    w_ = np.clip(np.minimum(kk_ - a_, b_ - kk_) / float(cfg.get("local_smooth_blend", 8)), 0, 1); w_ = w_ * w_ * (3 - 2 * w_)
    ss = ss * (1 - w_[:, None]) + sm_ * w_[:, None]
Uf = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(ss, axis=0), axis=1))])
zt = np.full(N, np.nan)
turn_ring = np.zeros(N, bool)
at_list = []
for t in cfg["turns"]:
    d = math.radians(t["d_deg"]); al = math.radians(t["alpha_deg"])
    at = np.array([math.sin(al) * math.cos(d), -math.sin(al) * math.sin(d), math.cos(al)])
    at_list.append(at)
    Xc, Yc = world(ss[t["c"]], t["z0"])[0:2]
    for k in range(t["a"], t["b"] + 1):
        z = t["z0"]
        for _ in range(3):
            X, Y = world(ss[k], z)[0:2]
            z = t["z0"] - (at[0] * (X - Xc) + at[1] * (Y - Yc)) / at[2]
        z = z + t.get("pitch", 0.0) * (Uf[k] - Uf[t["c"]])
        zt[k] = z
        turn_ring[k] = True
chk("turn depths", zt[turn_ring])

# 4. links
anchors = [(int(r), float(z)) for r, z in cfg["anchors"]]
z = zt.copy()
links = []
k = 0
while k < N:
    if turn_ring[k]:
        k += 1; continue
    p = k
    while k < N and not turn_ring[k]:
        k += 1
    q = k - 1
    links.append((p, q))
    kn = []
    if p - 1 >= 0 and turn_ring[p - 1]:
        kn.append((p - 1, zt[p - 1]))
    kn += sorted([(r, zz) for r, zz in anchors if p <= r <= q])
    if q + 1 < N and turn_ring[q + 1]:
        kn.append((q + 1, zt[q + 1]))
    kr = np.array([x[0] for x in kn]); kz = np.array([x[1] for x in kn])
    ks = np.arange(p, q + 1)
    z[ks] = np.interp(Uf[ks], Uf[kr], kz)
chk("z links", z)

# 5.
zf = gaussian_filter1d(z, cfg["z_smooth_sigma"], mode="nearest")

# 6.
c = world(ss, zf)
T = unit(np.gradient(c, axis=0))
T = unit(gaussian_filter1d(T, cfg["T_smooth_sigma"], axis=0, mode="nearest"))
e1 = unit(np.cross(np.array([0, 0, 1.0]), T))
e2 = np.cross(T, e1)
chk("frames", e1); chk("frames2", e2)

# 7. theta
theta = np.zeros(N)
turns = cfg["turns"]
th_turn = []
for t, at in zip(turns, at_list):
    ks = np.arange(t["a"], t["b"] + 1)
    bt = unit(at[None, :] - (T[ks] @ at)[:, None] * T[ks])
    th = np.arctan2(np.sum(bt * e2[ks], 1), np.sum(bt * e1[ks], 1))
    th_turn.append(np.unwrap(th))
chk("th_turn", np.concatenate(th_turn))
twist = []
S = turns[0]
theta[0:S["a"]] = th_turn[0][0]
theta[S["a"]:S["b"] + 1] = th_turn[0]
for i in range(len(turns) - 1):
    P = turns[i]; Q = turns[i + 1]
    th0 = theta[P["b"]]
    raw = th_turn[i + 1][0]
    n = int(np.round((th0 - raw) / math.pi))
    # explicit minimiser over a small integer range
    cand = range(n - 3, n + 4)
    n = min(cand, key=lambda m: abs(raw + m * math.pi - th0))
    fl = int(cfg.get("flip", {}).get(str(i + 1), 0))
    th1 = raw + n * math.pi + fl * math.pi
    ks = np.arange(P["b"] + 1, Q["a"])
    hid = cfg.get("hidden", {}).get(str(i + 1))
    if hid:
        xx = np.clip((ks - hid[0]) / float(hid[1] - hid[0]), 0, 1); fr = xx * xx * (3 - 2 * xx)
    else:
        fr = (Uf[ks] - Uf[P["b"]]) / (Uf[Q["a"]] - Uf[P["b"]])
    theta[ks] = th0 + (th1 - th0) * fr
    theta[Q["a"]:Q["b"] + 1] = th_turn[i + 1] + n * math.pi + fl * math.pi
    twist.append((P["name"] + "->" + Q["name"], math.degrees(th1 - th0), n))
last = turns[-1]
theta[last["b"] + 1:] = theta[last["b"]]
chk("theta", theta)

# 8.
if cfg.get("theta_smooth_sigma", 0) > 0:
    # smooth the band angle only around turn<->link seams and on links, never deep inside a turn
    th_s = gaussian_filter1d(theta, cfg["theta_smooth_sigma"], mode="nearest")
    wts = np.ones(N)
    for t in turns:
        for k in range(t["a"], t["b"] + 1):
            d = min(k - t["a"], t["b"] - k)
            x = min(max((d - 6) / 8.0, 0.0), 1.0)
            wts[k] = 1.0 - x * x * (3 - 2 * x)
    theta = theta * (1 - wts) + th_s * wts
b = np.cos(theta)[:, None] * e1 + np.sin(theta)[:, None] * e2
b = gaussian_filter1d(b, cfg["b_smooth_sigma"], axis=0, mode="nearest")
b = unit(b - np.sum(b * T, 1)[:, None] * T)
hw = cfg["half_width"]
Lc = c - hw * b; Rc = c + hw * b
chk("L", Lc); chk("R", Rc)
Lo = world_to_pose(Lc); Ro = world_to_pose(Rc)
chk("pose", Lo); chk("pose", Ro)
out = json.loads(json.dumps(X3))
out["variants"]["phone"]["ruled"] = [{"L": [float(x) for x in Lo[k]], "R": [float(x) for x in Ro[k]]} for k in range(N)]
json.dump(out, open(os.path.join(OUT, "pose.json"), "w"))

# 9. log
log("X3 round-trip max error: %.3e" % rt)
log("RMS of ss vs sc before straightening (px): %.4f" % rms_ss)
for t in turns:
    log("turn %s: z_final a=%.3f c=%.3f b=%.3f" % (t["name"], zf[t["a"]], zf[t["c"]], zf[t["b"]]))
for (p, q) in links:
    log("link %d-%d: z_final first=%.3f last=%.3f" % (p, q, zf[p], zf[q]))
for nm, tw, n in twist:
    log("twist %s: %.2f deg, n=%d" % (nm, tw, n))

Nn = unit(np.cross(T, b))
v = unit(np.array([0, 0, D]) - c)
s = np.sum(Nn * v, 1)
if np.mean(s[0:100]) < 0:
    s = -s
    log("face sign flipped")
lab = np.where(s > 0.15, "A", np.where(s < -0.15, "B", "~"))
runs = []
k0 = 0
for k in range(1, N + 1):
    if k == N or lab[k] != lab[k0]:
        runs.append("%d-%d %s" % (k0, k - 1, lab[k0])); k0 = k
log("face runs: " + "; ".join(runs))
fj = json.load(open(os.path.join(ROOT, "docs/ribbon/turns/real/faces.json")))
fz = fj["flip_zones"]
for seg in fj["segments"]:
    r0, r1 = seg["rings"]
    ks = [k for k in range(r0, r1 + 1) if not any(a_ <= k <= b_ for a_, b_ in fz)]
    want = 1 if seg["face"] == "A" else -1
    m = sum(1 for k in ks if np.sign(s[k]) == want)
    log("segment %s %s [%d,%d]: match %.4f (%d/%d)" % (seg["name"], seg["face"], r0, r1, m / max(len(ks), 1), m, len(ks)))

pairs = []
for i in range(N):
    for j in range(i + 41, N):
        if np.linalg.norm(ss[i] - ss[j]) < 55:
            front, back = (i, j) if z3[i] > z3[j] else (j, i)
            gap = zf[front] - zf[back] - (14 + 0.6 * 25.5 * (abs(b[i, 2]) + abs(b[j, 2])))
            pairs.append((i, j, gap))
neg = sorted([p for p in pairs if p[2] < 0], key=lambda p: p[2])
log("over/under pairs with gap<0: %d of %d" % (len(neg), len(pairs)))
for i, j, g in neg[:15]:
    log("  pair %d %d gap %.3f" % (i, j, g))

dots = np.clip(np.sum(b[:-1] * b[1:], 1), -1, 1)
ang = np.degrees(np.arccos(dots))
order = np.argsort(-ang)
log("b angle change per ring: max %.3f deg at ring %d->%d" % (ang[order[0]], order[0], order[0] + 1))
log("10 largest: " + "; ".join("%d:%.3f" % (r, ang[r]) for r in order[:10]))
open(os.path.join(OUT, "build.log"), "w").write("\n".join(LOG) + "\n")
print("done")
