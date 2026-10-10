"""Desktop variant that keeps the PHONE view direction: W' = Cd + rd*dd + R*k*(W - Pc), R rotates dp -> dd.
Size k and target centre Td come from the current (plain-scaled) desktop variant, so placement/size match it.
usage: desktopify_view.py HERO_JSON CTX_PHONE CTX_DESKTOP OUT_HERO_JSON"""
import sys, json, math
import numpy as np
hero, cpf, cdf, outf = sys.argv[1:5]
H = json.load(open(hero)); cp = json.load(open(cpf)); cd = json.load(open(cdf))
def camD(c): return c["viewH"] / 2 / math.tan(math.radians(c["fov"]) / 2)
def toW(p, c):
    p = np.asarray(p, float); a = c["anchor"]; D = camD(c)
    sx = a["left"] + p[:, 0] * a["width"]; sy = a["top"] + p[:, 1] * a["height"]; z = p[:, 2] * a["height"]; k = (D - z) / D
    return np.stack([(sx - c["viewW"] / 2) * k, (c["viewH"] / 2 - sy) * k, z], 1)
def toP(W, c):
    a = c["anchor"]; D = camD(c); k = D / np.maximum(D - W[:, 2], 1)
    sx = c["viewW"] / 2 + W[:, 0] * k; sy = c["viewH"] / 2 - W[:, 1] * k
    return np.stack([(sx - a["left"]) / a["width"], (sy - a["top"]) / a["height"], W[:, 2] / a["height"]], 1)
ph = H["variants"]["phone"]["ruled"]; dk = H["variants"]["desktop"]["ruled"]
Wp = np.r_[toW([r["L"] for r in ph], cp), toW([r["R"] for r in ph], cp)]
Wd = np.r_[toW([r["L"] for r in dk], cd), toW([r["R"] for r in dk], cd)]
Pc = (Wp.min(0) + Wp.max(0)) / 2; Td = (Wd.min(0) + Wd.max(0)) / 2
k = (Wd.max(0)[1] - Wd.min(0)[1]) / (Wp.max(0)[1] - Wp.min(0)[1])
Cp = np.array([0, 0, camD(cp)]); Cd = np.array([0, 0, camD(cd)])
dp = (Pc - Cp) / np.linalg.norm(Pc - Cp); dd = (Td - Cd) / np.linalg.norm(Td - Cd); rd = np.linalg.norm(Td - Cd)
v = np.cross(dp, dd); s_ = np.linalg.norm(v); c_ = dp @ dd
Vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
R = np.eye(3) + Vx + Vx @ Vx * ((1 - c_) / (s_ ** 2)) if s_ > 1e-9 else np.eye(3)
n = len(ph)
def tf(W): return Cd + rd * dd + (R @ (k * (W - Pc)).T).T
Ln = toP(tf(Wp[:n]), cd); Rn = toP(tf(Wp[n:]), cd)
H["variants"]["desktop"]["ruled"] = [{"L": [round(float(x), 6) for x in Ln[i]], "R": [round(float(x), 6) for x in Rn[i]]} for i in range(n)]
json.dump(H, open(outf, "w"))
print("k %.4f  view-direction rotation %.2f deg  Td %s  Pc %s" % (k, math.degrees(math.atan2(s_, c_)), np.round(Td, 1), np.round(Pc, 1)))
