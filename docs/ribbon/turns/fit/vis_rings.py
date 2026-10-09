"""Visible-pixel fraction of a pose-ring range in the engine's geometry: z-buffer raster of the engine dump's strip quads.
usage: vis_rings.py <ver dir> <lo>:<hi> [<lo>:<hi> ...]   (pose-ring ranges; uses dump/dump.json and diag/rings.csv)"""
import csv, json, sys
import numpy as np
d = sys.argv[1]
D = json.load(open(d + "/dump/dump.json")); m = D["meta"]
VW, VH, SC = m["viewW"], m["viewH"], 2
VP = np.array(m["proj"], float).reshape(4, 4).T @ np.array(m["view"], float).reshape(4, 4).T
c = np.array(D["c"]); B = np.array(D["B"]); hw = np.array(D["hw"])
pr = np.array([int(r["pose_ring"]) for r in csv.DictReader(open(d + "/diag/rings.csv"))])
def proj(P):
    h = np.hstack([P, np.ones((len(P), 1))]) @ VP.T
    n = h[:, :3] / h[:, 3:4]
    return np.stack([(n[:, 0] + 1) / 2 * VW * SC, (1 - n[:, 1]) / 2 * VH * SC, n[:, 2]], 1)
Lp, Rp = proj(c - B * hw[:, None]), proj(c + B * hw[:, None])
W, H = int(VW * SC), int(VH * SC)
def raster(rings):
    zb = np.full((H, W), np.inf); idb = np.full((H, W), -1, np.int32)
    for k in rings:
        for tri in ((Lp[k], Rp[k], Rp[k + 1]), (Lp[k], Rp[k + 1], Lp[k + 1])):
            t = np.array(tri); x0, y0 = np.floor(t[:, :2].min(0)).astype(int); x1, y1 = np.ceil(t[:, :2].max(0)).astype(int)
            x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, W - 1), min(y1, H - 1)
            if x1 < x0 or y1 < y0: continue
            xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
            a, b, c_ = t
            den = (b[1] - c_[1]) * (a[0] - c_[0]) + (c_[0] - b[0]) * (a[1] - c_[1])
            if abs(den) < 1e-9: continue
            w0 = ((b[1] - c_[1]) * (xs - c_[0]) + (c_[0] - b[0]) * (ys - c_[1])) / den
            w1 = ((c_[1] - a[1]) * (xs - c_[0]) + (a[0] - c_[0]) * (ys - c_[1])) / den
            w2 = 1 - w0 - w1
            ins = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
            z = w0 * a[2] + w1 * b[2] + w2 * c_[2]
            sub_z = zb[y0:y1 + 1, x0:x1 + 1]; sub_i = idb[y0:y1 + 1, x0:x1 + 1]
            upd = ins & (z < sub_z)
            sub_z[upd] = z[upd]; sub_i[upd] = k
    return idb
allr = np.arange(len(c) - 1)
full = raster(allr)
for rg in sys.argv[2:]:
    lo, hi = [int(v) for v in rg.split(":")]
    sel = allr[(pr[:-1] >= lo) & (pr[:-1] <= hi)]
    if len(sel) == 0: print(rg, "no engine rings"); continue
    alone = (raster(sel) >= 0).sum()
    vis = np.isin(full, sel).sum()
    print("%s: engine rings %d, visible px %d of %d alone -> visible fraction %.1f%%" % (rg, len(sel), vis, alone, 100.0 * vis / max(alone, 1)))
