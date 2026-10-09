#!/usr/bin/env python
"""Per-ring diagnostics of the ENGINE's ribbon geometry (dump.json) vs the authored pose.

  scripts/mockup/.venv/bin/python scripts/curve/diagnose.py <dump.json> <pose.json> <ribbon.png> <outdir>
  (optional 5th arg: roto.npz for the pose ring's iv; default <pose dir>/roto.npz)

Per engine body ring: c, T, B, N, hw, obl=|T.B|, dN/dB (deg vs previous ring), kappa (turn deg per px),
screen position (ribbon.png frame = 390x844 css @ DPR2) of c, c-B*hw, c+B*hw, nearest pose ring (3D centre), its iv.
Writes rings.csv, overlay.png (rulings coloured by dN: <3 green, 3-6 yellow, >6 red; pose index every 10th ring),
overlay_obl.png (coloured by obl: <0.5 green, 0.5-0.8 yellow, >0.8 red).
Projection = scripts/curve/views.py (VP from meta.proj/view), scaled to the PNG. Pose -> world = lib/ribbon/poses/resolve.ts pointToWorld.
"""
import csv, json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.spatial import cKDTree

dump_p, pose_p, png_p, out = sys.argv[1:5]
roto_p = sys.argv[5] if len(sys.argv) > 5 else os.path.join(os.path.dirname(os.path.abspath(pose_p)), "roto.npz")
os.makedirs(out, exist_ok=True)
D = json.load(open(dump_p))
meta = D["meta"]
VW, VH = meta["viewW"], meta["viewH"]
P = np.array(meta["proj"], float).reshape(4, 4).T
V = np.array(meta["view"], float).reshape(4, 4).T
VP = P @ V
cam = np.array(meta["camPos"], float)
ANCHOR = dict(left=20.0, top=118.15625, width=347.21875, height=154.1875)  # as rotosurf.py / the hero-name rect
img0 = Image.open(png_p).convert("RGB")
SC = img0.width / VW  # DPR of the PNG (2)

c = np.array(D["c"]); B = np.array(D["B"]); N = np.array(D["N"]); T = np.array(D["T"]); hw = np.array(D["hw"])
M = len(c)


def project(pts):
    h = np.hstack([pts, np.ones((len(pts), 1))]) @ VP.T
    nd = h[:, :3] / h[:, 3:4]
    return np.stack([(nd[:, 0] + 1) / 2 * VW * SC, (1 - nd[:, 1]) / 2 * VH * SC], 1)


def ang(a, b):
    # normalise first, then atan2(|a x b|, a.b): well conditioned for small angles and robust to rounded dump vectors
    a = a / np.maximum(np.linalg.norm(a, axis=1, keepdims=True), 1e-12)
    b = b / np.maximum(np.linalg.norm(b, axis=1, keepdims=True), 1e-12)
    return np.degrees(np.arctan2(np.linalg.norm(np.cross(a, b), axis=1), np.einsum("ij,ij->i", a, b)))


obl = np.abs(np.einsum("ij,ij->i", T, B))
dN = np.r_[0, ang(N[:-1], N[1:])]
dB = np.r_[0, ang(B[:-1], B[1:])]
seg = np.r_[1e-9, np.linalg.norm(np.diff(c, axis=0), axis=1)]
kappa = np.r_[0, ang(T[:-1], T[1:])] / np.maximum(seg, 1e-9)
kappa[0] = 0
pc, pl, pr = project(c), project(c - B * hw[:, None]), project(c + B * hw[:, None])

# pose rings -> world (pointToWorld), centre = midpoint of the unprojected ends
pose = json.load(open(pose_p))
rings = pose["variants"]["phone"]["ruled"]
Dcam = cam[2]


def to_world(p):
    p = np.array(p, float)
    sx = ANCHOR["left"] + p[0] * ANCHOR["width"]
    sy = ANCHOR["top"] + p[1] * ANCHOR["height"]
    z = p[2] * ANCHOR["height"]
    k = (Dcam - z) / Dcam
    return np.array([(sx - VW / 2) * k, (VH / 2 - sy) * k, z])


pc3 = np.array([(to_world(r["L"]) + to_world(r["R"])) / 2 for r in rings])
dist, pidx = cKDTree(pc3).query(c)
iv = np.load(roto_p)["iv"] if os.path.exists(roto_p) else np.zeros(len(rings), int)
piv = iv[pidx]

with open(os.path.join(out, "rings.csv"), "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["ring", "cx", "cy", "cz", "Tx", "Ty", "Tz", "Bx", "By", "Bz", "Nx", "Ny", "Nz", "hw", "obl", "dN", "dB", "kappa",
                "sx_c", "sy_c", "sx_L", "sy_L", "sx_R", "sy_R", "pose_ring", "pose_dist", "iv"])
    for i in range(M):
        w.writerow([i, *np.round(c[i], 3), *np.round(T[i], 4), *np.round(B[i], 4), *np.round(N[i], 4), round(hw[i], 3), round(obl[i], 4),
                    round(dN[i], 3), round(dB[i], 3), round(kappa[i], 5), *np.round(pc[i], 1), *np.round(pl[i], 1), *np.round(pr[i], 1),
                    int(pidx[i]), round(dist[i], 3), int(piv[i])])


def font(sz):
    try:
        return ImageFont.load_default(size=sz)
    except TypeError:
        return ImageFont.load_default()


def col(v, lo, hi):
    return (40, 230, 60) if v < lo else ((255, 220, 0) if v < hi else (255, 40, 40))


def overlay(vals, lo, hi, path, label_idx):
    im = img0.copy()
    dr = ImageDraw.Draw(im)
    f = font(11)
    for i in range(M):
        dr.line([tuple(pl[i]), tuple(pr[i])], fill=col(vals[i], lo, hi), width=1)
    if label_idx:
        for i in range(0, M, 10):
            x, y = pc[i]
            dr.text((x + 3, y - 5), str(pidx[i]), font=f, fill=(0, 255, 255))
    im.save(path)


overlay(dN, 3, 6, os.path.join(out, "overlay.png"), True)
overlay(obl, 0.5, 0.8, os.path.join(out, "overlay_obl.png"), False)
print(f"M={M} pose rings={len(rings)}  max dN={dN.max():.1f} max dB={dB.max():.1f} max obl={obl.max():.3f}  pose_dist median={np.median(dist):.3f} max={dist.max():.3f}")
