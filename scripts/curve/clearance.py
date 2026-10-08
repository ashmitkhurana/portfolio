#!/usr/bin/env python
"""Self-clearance of the engine ribbon (dump.json): which non-adjacent strands come closer than --gap px in 3D.

  scripts/mockup/.venv/bin/python scripts/curve/clearance.py <dump.json> [--gap 14.36] [--skip 60] [--out clusters.csv] [--rings diag/rings.csv]

Each engine ring is sampled at 9 points across the width (c + B*hw*u, u in [-1,1]). Ring pairs (i,j), |i-j|>skip, whose
sample sets come within gap are clustered (pairs within 5 rings of each other in both i and j merge). Clusters with
min distance < 2 px are flagged INTERSECT. FRONT = the strand (i-range or j-range) nearer the camera (meta.camPos) at the closest pairs.
"""
import argparse, csv, json
import numpy as np
from scipy.spatial import cKDTree

ap = argparse.ArgumentParser()
ap.add_argument("dump")
ap.add_argument("--gap", type=float, default=14.36)
ap.add_argument("--skip", type=int, default=60)
ap.add_argument("--out")
ap.add_argument("--rings")
a = ap.parse_args()

D = json.load(open(a.dump))
c = np.array(D["c"]); B = np.array(D["B"]); hw = np.array(D["hw"])
cam = np.array(D["meta"]["camPos"], float)
M = len(c)
u = np.linspace(-1, 1, 9)
S = c[:, None, :] + B[:, None, :] * hw[:, None, None] * u[None, :, None]  # M,9,3
flat = S.reshape(-1, 3)
tree = cKDTree(flat)
pairs = tree.query_pairs(a.gap, output_type="ndarray")
ri, rj = pairs[:, 0] // 9, pairs[:, 1] // 9
keep = np.abs(ri - rj) > a.skip
pairs, ri, rj = pairs[keep], ri[keep], rj[keep]
d = np.linalg.norm(flat[pairs[:, 0]] - flat[pairs[:, 1]], axis=1)
lo, hi = np.minimum(ri, rj), np.maximum(ri, rj)
best = {}
for l, h, dd in zip(lo, hi, d):
    k = (int(l), int(h))
    if dd < best.get(k, 1e9):
        best[k] = dd
keys = np.array(sorted(best)) if best else np.zeros((0, 2), int)
dmin = np.array([best[tuple(k)] for k in keys])
print(f"{a.dump}: {M} rings, gap {a.gap}, skip {a.skip}: {len(keys)} ring pairs closer than gap")

pose = None
if a.rings:
    pose = np.array([int(r["pose_ring"]) for r in csv.DictReader(open(a.rings))])

clusters = []
if len(keys):
    t2 = cKDTree(keys.astype(float))
    par = list(range(len(keys)))
    def find(x):
        while par[x] != x:
            par[x] = par[par[x]]; x = par[x]
        return x
    for p, q in t2.query_pairs(5.0, p=np.inf):
        par[find(p)] = find(q)
    groups = {}
    for n in range(len(keys)):
        groups.setdefault(find(n), []).append(n)
    for g in groups.values():
        ks = keys[g]; dm = dmin[g]
        e = int(np.argmin(dm))
        i0, j0 = ks[e]
        # front: compare camera distance of the two strands' nearest ring centres over the cluster's closest pairs
        close = np.argsort(dm)[:max(1, len(dm) // 5)]
        di = np.mean([np.linalg.norm(c[ks[q, 0]] - cam) for q in close])
        dj = np.mean([np.linalg.norm(c[ks[q, 1]] - cam) for q in close])
        front = "i" if di < dj else "j"
        cl = dict(i0=int(ks[:, 0].min()), i1=int(ks[:, 0].max()), j0=int(ks[:, 1].min()), j1=int(ks[:, 1].max()),
                  dmin=float(dm.min()), at=(int(i0), int(j0)), npairs=len(g), front=front)
        if pose is not None:
            cl["pi"] = (int(pose[cl["i0"]:cl["i1"] + 1].min()), int(pose[cl["i0"]:cl["i1"] + 1].max()))
            cl["pj"] = (int(pose[cl["j0"]:cl["j1"] + 1].min()), int(pose[cl["j0"]:cl["j1"] + 1].max()))
        clusters.append(cl)
    clusters.sort(key=lambda x: x["i0"])

nint = sum(1 for x in clusters if x["dmin"] < 2)
print(f"{len(clusters)} clusters, {nint} INTERSECT (<2px)")
for k, x in enumerate(clusters):
    s = f"  #{k} eng i {x['i0']}-{x['i1']} x j {x['j0']}-{x['j1']}  min {x['dmin']:.2f}px at ({x['at'][0]},{x['at'][1]})  pairs {x['npairs']}  front={x['front']}({'i' if x['front']=='i' else 'j'} strand)"
    if "pi" in x:
        s += f"  pose i {x['pi'][0]}-{x['pi'][1]} x j {x['pj'][0]}-{x['pj'][1]}"
    if x["dmin"] < 2:
        s += "  INTERSECT"
    print(s)
if a.out:
    with open(a.out, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["i0", "i1", "j0", "j1", "dmin", "npairs", "front", "pose_i0", "pose_i1", "pose_j0", "pose_j1", "intersect"])
        for x in clusters:
            w.writerow([x["i0"], x["i1"], x["j0"], x["j1"], round(x["dmin"], 3), x["npairs"], x["front"],
                        *(x.get("pi", ("", ""))), *(x.get("pj", ("", ""))), int(x["dmin"] < 2)])
