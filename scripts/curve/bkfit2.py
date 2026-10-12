#!/usr/bin/env python3
"""bkfit2: fit the bottom-K loop band (F1 ringmod cylinder, F2 + cone angle, F3 free ring) to the mockup silhouette.
Cost = 1 - IoU over ROI minus other strands. Outputs docs/ribbon/turns/curve/bkfit2/{F1,F2,F3,F1start,compare}.png + params.json"""
import json, math, os, sys, time
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.optimize import minimize
from scipy.ndimage import binary_dilation, binary_erosion
from scipy.spatial.transform import Rotation as Rot

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.join(HERE, "..", "..")
sys.path.insert(0, HERE); import ringmod
OUT = os.path.join(ROOT, "docs/ribbon/turns/curve/bkfit2"); os.makedirs(OUT, exist_ok=True)
SX = 852.0 / 390.0; SY = 1846.0 / 844.0; K = ringmod.K; W_CSS = 51.0
X0, X1, Y0, Y1 = 500, 852, 860, 1270  # ROI (x clipped to image width)
RW, RH = X1 - X0, Y1 - Y0
d = np.load(os.path.join(ROOT, "docs/ribbon/turns/curve/best/roto.npz"))
L2, R2, zL, zR, iv = d["L2"], d["R2"], d["zL"], d["zR"], d["iv"]
im = Image.open(os.path.join(ROOT, "docs/ribbon/ref/ak-signature-cutout.webp")).convert("RGBA")
A = np.array(im)[:, :, 3]
# exclusion
ex = Image.new("L", (RW, RH), 0); dr = ImageDraw.Draw(ex)
for i in range(len(L2) - 1):
    if iv[i] == 7 or iv[i + 1] == 7: continue
    q = [L2[i], R2[i], R2[i + 1], L2[i + 1]]
    if max(np.abs(L2[i] - L2[i + 1]).max(), np.abs(R2[i] - R2[i + 1]).max()) > 80: continue  # interval jump
    dr.polygon([(float(p[0] - X0), float(p[1] - Y0)) for p in q], fill=1)
EX = binary_dilation(np.array(ex) > 0, iterations=2)
COST = ~EX
T = (A[Y0:Y1, X0:X1] > 128)
Tc = T & COST; nT = Tc.sum()

def raster(P, U, hw, scale=1):
    """P (n,3) css, U (n,3) unit rulings -> bool mask over the ROI"""
    img = Image.new("L", (RW, RH), 0); dr = ImageDraw.Draw(img)
    E1 = np.stack([(P[:, 0] + hw * U[:, 0]) * SX - X0, (P[:, 1] + hw * U[:, 1]) * SX - Y0], 1)
    E2 = np.stack([(P[:, 0] - hw * U[:, 0]) * SX - X0, (P[:, 1] - hw * U[:, 1]) * SX - Y0], 1)
    for j in range(len(P) - 1):
        dr.polygon([tuple(E1[j]), tuple(E1[j + 1]), tuple(E2[j + 1]), tuple(E2[j])], fill=1)
    return np.array(img) > 0, E1, E2

def iou(M):
    m = M & COST
    inter = (m & T).sum(); uni = (m | Tc).sum()
    return inter / max(uni, 1)

# ---------- ring geometry -------------
def ring_f1(R, tau, al, n):
    pts, th0, th1, s, C = ringmod.build((R, tau, al), n)
    xy = np.array([q[0] for q in pts]) * K / np.array([SX, SY]); z = np.array([q[1] for q in pts])
    P = np.concatenate([xy, z[:, None]], 1)
    a = np.array([math.cos(al), math.sin(al), 0.0]); ap = np.array([-math.sin(al), math.cos(al), 0.0])
    e1 = a; e2 = math.cos(tau) * ap + np.array([0, 0, math.sin(tau)])
    Cc = np.array([C[0] * K / SX, C[1] * K / SY, 0.0])
    return P, e1, e2, Cc, th0, th1

def ruling(P, Cc, axis, beta):
    rad = P - Cc; rad = rad - np.outer(rad @ axis, axis)
    rad /= np.linalg.norm(rad, axis=1)[:, None] + 1e-12
    u = math.cos(beta) * axis[None, :] + math.sin(beta) * rad
    return u / np.linalg.norm(u, axis=1)[:, None]

def model_f1(v, n=120, beta=0.0):
    R, tau, al, s = v
    P, e1, e2, Cc, th0, th1 = ring_f1(R, tau, al, n)
    axis = np.cross(e1, e2); axis /= np.linalg.norm(axis)
    U = ruling(P, Cc, axis, beta)
    return P, U, W_CSS / 2 * s, (Cc, e1, e2, th0, th1, axis)

def cost_f1(v, n=60):
    R, tau, al, s = v
    if not (0.9 <= s <= 1.6) or R < 20 or R > 200: return 1.0
    try: P, U, hw, _ = model_f1(v, n)
    except Exception: return 1.0
    return 1 - iou(raster(P, U, hw)[0])

def cost_f2(v, n=60):
    R, tau, al, s, b = v
    if not (0.9 <= s <= 1.6) or R < 20 or R > 200 or abs(b) > math.radians(60): return 1.0
    try: P, U, hw, _ = model_f1((R, tau, al, s), n, b)
    except Exception: return 1.0
    return 1 - iou(raster(P, U, hw)[0])

# ---------- F3 free ring ---------------
mid = lambda i: (L2[i] + R2[i]) / 2 / np.array([SX, SY])
t_in = mid(659) - mid(650); t_in /= np.linalg.norm(t_in)
t_out = mid(772) - mid(764); t_out /= np.linalg.norm(t_out)
P_in, P_out = mid(659), mid(764)
z_in = (zL[659] + zR[659]) / 2

def ring_f3(v, n):
    cx, cy, R, r1, r2, r3, th0, span, s, b = v
    M = Rot.from_rotvec([r1, r2, r3]).as_matrix(); e1, e2 = M[:, 0], M[:, 1]
    th = np.linspace(th0, th0 + span, n)
    Cc = np.array([cx, cy, 0.0])
    P = Cc + R * (np.cos(th)[:, None] * e1 + np.sin(th)[:, None] * e2)
    axis = np.cross(e1, e2)
    return P, e1, e2, Cc, th, axis

def pen_f3(P, e1, e2, th, R, span):
    def tang(t, sg):
        tv = sg * R * (-np.sin(t) * e1 + np.cos(t) * e2); tv = tv[:2] * np.array([SX, SY]); return tv / (np.linalg.norm(tv) + 1e-12)
    pe = 0.0
    dp = np.linalg.norm(P[0, :2] - P_in); pe += 0.002 * max(0, dp - 6)
    dq = np.linalg.norm(P[-1, :2] - P_out); pe += 0.002 * max(0, dq - 6)
    sg = 1.0 if span >= 0 else -1.0
    ang = lambda a, b: math.degrees(math.acos(float(np.clip(a @ b, -1, 1))))
    # tangent in screen (cutout-scaled) frame; leg directions are in css/SX frame: compare in css
    def tcss(t):
        tv = sg * R * (-np.sin(t) * e1 + np.cos(t) * e2); tv = tv[:2]; return tv / (np.linalg.norm(tv) + 1e-12)
    pe += 0.002 * max(0, ang(tcss(th[0]), t_in) - 15)
    pe += 0.002 * max(0, ang(tcss(th[-1]), t_out) - 15)
    return pe

def cost_f3(v, n=60):
    cx, cy, R, r1, r2, r3, th0, span, s, b = v
    if not (0.9 <= s <= 1.6) or R < 20 or R > 200 or abs(b) > math.radians(60) or abs(span) > 7.5 or abs(span) < 1.0: return 1.0
    P, e1, e2, Cc, th, axis = ring_f3(v, n)
    U = ruling(P, Cc, axis / np.linalg.norm(axis), b)
    return 1 - iou(raster(P, U, W_CSS / 2 * s)[0]) + pen_f3(P, e1, e2, th, R, span)

def nm(f, x0, maxiter, seed_scale=None):
    r = minimize(f, x0, method="Nelder-Mead", options=dict(maxiter=maxiter, maxfev=maxiter, xatol=1e-3, fatol=1e-5, adaptive=True,
                 initial_simplex=None if seed_scale is None else np.vstack([x0] + [x0 + np.eye(len(x0))[k] * seed_scale[k] for k in range(len(x0))])))
    return r

# ---------- run --------------------
T0 = time.time()
rng = np.random.default_rng(7)
start = np.array([72.155, 2.1885, 0.7960, 1.297])
res = {}
print("ROI", RW, RH, "target px", int(nT))
# F1 start IoU (exact, 120 pts)
P, U, hw, g = model_f1(start, 120)
M_start, _, _ = raster(P, U, hw); iou_start = iou(M_start)
print("F1 start IoU %.4f" % iou_start, "t=%.1f" % (time.time() - T0))

def best_of(f, x0, nrest, sc, maxiter, jit):
    cands = []
    for k in range(nrest):
        xs = x0
        if k > 0:
            for _ in range(50):
                xs = x0 + rng.normal(size=len(x0)) * jit
                if f(xs) < 1.0: break
        r = nm(f, xs, maxiter, sc); cands.append((r.fun, r.x))
        print("   restart %d cost %.4f" % (k, r.fun), flush=True)
    cands.sort(key=lambda c: c[0]); x = cands[0][1]
    r = nm(f, x, maxiter, sc); return (r.x, r.fun) if r.fun < cands[0][0] else (cands[0][1], cands[0][0])

print("F1 ..."); sc1 = np.array([5, 0.1, 0.1, 0.05])
x1, c1 = best_of(cost_f1, start, 8, sc1, 600, np.array([6, 0.15, 0.15, 0.08]))
print("F2 ...")
x2s = np.append(x1, 0.0); sc2 = np.array([5, 0.1, 0.1, 0.05, 0.1])
x2, c2 = best_of(cost_f2, x2s, 10, sc2, 900, np.array([6, 0.15, 0.15, 0.08, 0.3]))

# F3 start from F1 best ring in free parametrisation
def f3_from_f1(x, b=0.0):
    R, tau, al, s = x[:4]
    P, e1, e2, Cc, th0, th1 = ring_f1(R, tau, al, 60)
    e3 = np.cross(e1, e2); M = np.stack([e1, e2, e3], 1)
    rv = Rot.from_matrix(M).as_rotvec()
    return np.array([Cc[0], Cc[1], R, *rv, th0, th1 - th0, s, b])
x3s = f3_from_f1(x2, x2[4]); sc3 = np.array([3, 3, 4, .1, .1, .1, .15, .3, .05, .1])
jit3 = np.array([5, 5, 8, .2, .2, .2, .3, .5, .1, .3])
print("F3 ..."); x3, c3 = best_of(cost_f3, x3s, 24, sc3, 4000, jit3)
print("fit time %.1fs" % (time.time() - T0))

# ------- finalize with 120 points --------
def leg_ruling():
    v = np.array([*(R2[655] - L2[655]) / SX, zR[655] - zL[655]]); return v / np.linalg.norm(v)
def twist(u): 
    c = float(np.clip(abs(u @ leg_ruling()), -1, 1)); return math.degrees(math.acos(c))
leg = leg_ruling()
out = {}; models = {}
P, U, hw, g = model_f1(start, 120); models["F1start"] = (P, U, hw)
out["F1start"] = dict(iou=iou_start, params=dict(R=start[0], tau=start[1], alpha=start[2], s=start[3]), twist_deg=twist(U[0]))
P, U, hw, g = model_f1(x1, 120); M, _, _ = raster(P, U, hw); models["F1"] = (P, U, hw)
out["F1"] = dict(iou=iou(M), params=dict(R=x1[0], tau=x1[1], alpha=x1[2], s=x1[3]), twist_deg=twist(U[0]))
P, U, hw, g = model_f1(x2[:4], 120, x2[4]); M, _, _ = raster(P, U, hw); models["F2"] = (P, U, hw)
out["F2"] = dict(iou=iou(M), params=dict(R=x2[0], tau=x2[1], alpha=x2[2], s=x2[3], beta_deg=math.degrees(x2[4])), twist_deg=twist(U[0]))
P, e1, e2, Cc, th, axis = ring_f3(x3, 120); axis = axis / np.linalg.norm(axis); U = ruling(P, Cc, axis, x3[9]); hw = W_CSS / 2 * x3[8]
M, _, _ = raster(P, U, hw); models["F3"] = (P, U, hw)
Cz = Cc.copy(); Cz[2] = z_in - (P[0, 2] - Cc[2])
out["F3"] = dict(iou=iou(M), cost_with_penalty=c3, pen=pen_f3(P, e1, e2, th, x3[2], x3[7]), twist_deg=twist(U[0]),
                 C=Cz.tolist(), e1=e1.tolist(), e2=e2.tolist(), R=x3[2], theta0=x3[6], theta1=x3[6] + x3[7], hw=hw, beta_deg=math.degrees(x3[9]), s=x3[8],
                 start_err_css=float(np.linalg.norm(P[0, :2] - P_in)), end_err_css=float(np.linalg.norm(P[-1, :2] - P_out)))
out["leg_ruling_655"] = leg.tolist(); out["fit_seconds"] = time.time() - T0
json.dump(out, open(os.path.join(OUT, "params.json"), "w"), indent=1)

# ------- overlays --------
bg = Image.new("RGB", (RW, RH), (90, 90, 90)); mk = np.array(im.crop((X0, Y0, X1, Y1)))
bg = Image.alpha_composite(bg.convert("RGBA"), Image.fromarray(mk)).convert("RGB")
def overlay(name):
    P, U, hw = models[name]; M, E1, E2 = raster(P, U, hw)
    big = bg.resize((RW * 2, RH * 2), Image.LANCZOS); a = np.array(big).astype(float)
    exb = np.array(Image.fromarray((EX * 255).astype(np.uint8)).resize((RW * 2, RH * 2), Image.NEAREST)) > 0
    a[exb] = a[exb] * 0.7 + np.array([40, 60, 255]) * 0.3
    Mb = np.array(Image.fromarray((M * 255).astype(np.uint8)).resize((RW * 2, RH * 2), Image.NEAREST)) > 0
    edge = Mb & ~binary_erosion(Mb, iterations=2)
    a[edge] = (0, 255, 255)
    img = Image.fromarray(a.astype(np.uint8)); dr = ImageDraw.Draw(img)
    dr.line([tuple(p * 2) for p in E1], fill=(255, 0, 255), width=1); dr.line([tuple(p * 2) for p in E2], fill=(255, 0, 255), width=1)
    dr.text((6, 6), "%s IoU %.3f" % (name, out[name]["iou"]), fill=(255, 255, 0))
    img.save(os.path.join(OUT, name + ".png")); return img
ims = [overlay(n) for n in ["F1start", "F1", "F2", "F3"]]
cmp = Image.new("RGB", (sum(i.width for i in ims), ims[0].height))
xo = 0
for i in ims: cmp.paste(i, (xo, 0)); xo += i.width
cmp.save(os.path.join(OUT, "compare.png"))
# mockup+exclusion reference
print(json.dumps({k: (v if not isinstance(v, dict) else {a: b for a, b in v.items() if a in ("iou", "params", "twist_deg", "pen", "start_err_css", "end_err_css", "R", "beta_deg", "s", "theta0", "theta1")}) for k, v in out.items()}, indent=1, default=float))
