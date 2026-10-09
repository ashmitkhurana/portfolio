#!/usr/bin/env python
"""Re-layer a ruled pose in depth WITHOUT changing its screen image.

  scripts/mockup/.venv/bin/python scripts/curve/layer.py <in pose.json> <out pose.json> [--gap 12.4] [--kz 80] [--report <txt>]

Each ring's two edge points move along their camera rays by dz(t) (a cubic clamped B-spline over the ring index, kz control
points): z' = z + dz, x' = x (D - z')/(D - z), y' likewise, so the screen projection is unchanged. Constraints: for screen-overlap
sample pairs of rings |i-j| > 60 (3 css px), the ring that must be in front (rules R1-R4) is at least `gap` nearer the camera:
z_front' - z_back' >= gap (linear in the dz coefficients). Objective: sum dz''^2 + 1e-3 sum dz^2.
Rules: R1 rings 555..658 in front of anything; R2 859..945 in front of 388..483; R3 946..1066 behind 388..483;
R4 otherwise the input pose's own order at the sample pair.
"""
import argparse, json, math, os, sys, time
import numpy as np
from scipy.optimize import minimize, LinearConstraint
from scipy.spatial import cKDTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fit3d import pose_to_world, world_to_pose, project, Basis, D  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("inp")
ap.add_argument("out")
ap.add_argument("--gap", type=float, default=12.4)
ap.add_argument("--kz", type=int, default=160)
ap.add_argument("--report")
ap.add_argument("--maxiter", type=int, default=3000)
ap.add_argument("--method", default="SLSQP")
a = ap.parse_args()
t0 = time.time()
d = json.load(open(a.inp))
var = d["variants"]["phone"]
L = pose_to_world([r["L"] for r in var["ruled"]])
R = pose_to_world([r["R"] for r in var["ruled"]])
N = len(L)
bs = Basis(N, a.kz)
B = bs.B
sp = bs.B1  # unused
# second derivative basis
from scipy.interpolate import BSpline  # noqa: E402
B2 = BSpline(bs.kn, np.eye(a.kz), 3).derivative(2)(bs.t)

U = np.array([0.0, 0.25, 0.5, 0.75, 1.0])
S = L[:, None, :] + U[None, :, None] * (R - L)[:, None, :]  # (N,5,3)
flat = S.reshape(-1, 3)
ring = np.repeat(np.arange(N), 5)
sc = project(flat)
pr = cKDTree(sc).query_pairs(3.0, output_type="ndarray")
pr = pr[np.abs(ring[pr[:, 0]] - ring[pr[:, 1]]) > 60]
pa, pb = pr[:, 0], pr[:, 1]
swap = ring[pa] > ring[pb]
pa, pb = np.where(swap, pb, pa), np.where(swap, pa, pb)  # ring(pa) < ring(pb): "a side" = lower ring index
i, j = ring[pa], ring[pb]
inr = lambda r, lo, hi: (r >= lo) & (r <= hi)
rule = np.zeros(len(pa), int)  # +1: a side must be front, -1: b side
rid = np.zeros(len(pa), int)


def setf(mask, val, which):
    m = mask & (rule == 0)
    rule[m] = val
    rid[m] = which


ia, ja = inr(i, 555, 658), inr(j, 555, 658)
setf(ia & ~ja, 1, 1); setf(ja & ~ia, -1, 1)
setf(inr(i, 859, 945) & inr(j, 388, 483), 1, 2); setf(inr(j, 859, 945) & inr(i, 388, 483), -1, 2)
setf(inr(j, 946, 1066) & inr(i, 388, 483), 1, 3); setf(inr(i, 946, 1066) & inr(j, 388, 483), -1, 3)
dzi = flat[pa, 2] - flat[pb, 2]
inp = np.where(dzi >= 0, 1, -1)  # the input's own order at the sample pair
# --- crossing clusters over unique ring pairs (i,j): connected if |di|<=6 and |dj|<=6
from scipy.sparse import coo_matrix  # noqa: E402
from scipy.sparse.csgraph import connected_components  # noqa: E402
key = i.astype(np.int64) * N + j
ukey, inv = np.unique(key, return_inverse=True)
ui, uj = ukey // N, ukey % N
pts = np.stack([ui, uj], 1).astype(float)
cp = cKDTree(pts).query_pairs(6.0, p=np.inf, output_type="ndarray")
g_ = coo_matrix((np.ones(len(cp)), (cp[:, 0], cp[:, 1])), shape=(len(ukey), len(ukey)))
ncl, ucl = connected_components(g_, directed=False)
cl = ucl[inv]  # cluster of each raw sample pair
decided = np.zeros(ncl, int)
used = [""] * ncl
disagree = np.zeros(ncl, int)
tot = np.zeros(ncl, int)
tab = []
for c_ in range(ncl):
    m = cl == c_
    rv = rule[m]
    if (rv != 0).any():
        decided[c_] = 1 if rv.sum() >= 0 else -1
        used[c_] = "R" + "/R".join(str(x) for x in sorted(set(rid[m][rv != 0])))
    else:
        w = np.abs(dzi[m]) + 1.0
        decided[c_] = 1 if (inp[m] * w).sum() >= 0 else -1
        used[c_] = "vote"
    disagree[c_] = int((inp[m] != decided[c_]).sum())
    tot[c_] = int(m.sum())
dec_pair = decided[cl]  # per raw pair
# per unique ring pair constraint: worst sample under the decided order
zdiff = dec_pair * dzi  # z_front - z_back per raw pair
worst = np.full(len(ukey), np.inf)
np.minimum.at(worst, inv, zdiff)
dec_u = np.zeros(len(ukey), int)
dec_u[inv] = dec_pair
rf = np.where(dec_u > 0, ui, uj)
rb = np.where(dec_u > 0, uj, ui)
n = len(ukey)
A = B[rf] - B[rb]
lb = a.gap - worst
need = np.zeros(ncl)
np.maximum.at(need, ucl, lb)
cl_rings = [(ui[ucl == c_].min(), ui[ucl == c_].max(), uj[ucl == c_].min(), uj[ucl == c_].max()) for c_ in range(ncl)]
gap0 = worst
H = B2.T @ B2 + 1e-3 * B.T @ B
SC = 1e3  # objective scale


def f(x): return SC * x @ H @ x


def g(x): return 2 * SC * H @ x


def hess(x): return 2 * SC * H


x0 = np.zeros(a.kz)
# warm start: feasible-ish solution from NNLS-like least squares on violated constraints
viol = lb > 0
print("pairs (raw %d), clusters %d, constraints %d, initially violated %d (max %.1f px)" % (len(pa), ncl, n, int(viol.sum()), lb.max() if n else 0), flush=True)
if a.method == "SLSQP":
    res = minimize(f, x0, jac=g, method="SLSQP", constraints=[dict(type="ineq", fun=lambda x: A @ x - lb, jac=lambda x: A)], options=dict(maxiter=a.maxiter, ftol=1e-12))
    res.nit = getattr(res, "nit", 0)
else:
    res = minimize(f, x0, jac=g, hess=hess, method="trust-constr", constraints=[LinearConstraint(A, lb, np.inf)], options=dict(maxiter=a.maxiter, gtol=1e-9, xtol=1e-10, verbose=0))
x = res.x
dzr = B @ x
mv = np.maximum(0.0, lb - A @ x)
# apply
def shift(P, dz):
    z2 = P[:, 2] + dz
    k = (D - z2) / (D - P[:, 2])
    return np.stack([P[:, 0] * k, P[:, 1] * k, z2], 1)


L2, R2 = shift(L, dzr), shift(R, dzr)
err = max(np.abs(project(L2) - project(L)).max(), np.abs(project(R2) - project(R)).max())
S2 = L2[:, None, :] + U[None, :, None] * (R2 - L2)[:, None, :]
f2 = S2.reshape(-1, 3)
gap_all = dec_pair * (f2[pa, 2] - f2[pb, 2])
d2 = B2 @ x
ctab = ["clusters: %d (rule-decided %d, vote-decided %d); input-sample disagreements with the decided order: %d of %d raw sample pairs" % (ncl, sum(u.startswith("R") for u in used), sum(u == "vote" for u in used), int(disagree.sum()), int(tot.sum())),
        "top clusters by required separation (px short at input): rings_a-range x rings_b-range | front | rule | disagree/total | need"]
for c_ in np.argsort(-need)[:12]:
    r_ = cl_rings[c_]
    ctab.append("  %4d-%4d x %4d-%4d | front=%s | %s | %d/%d | %.1f" % (r_[0], r_[1], r_[2], r_[3], "a-range" if decided[c_] > 0 else "b-range", used[c_], disagree[c_], tot[c_], need[c_]))
lines = ctab + [
    "layer.py %s -> %s  gap %.1f kz %d" % (a.inp, a.out, a.gap, a.kz),
    "screen-overlap sample pairs (raw) %d, constraints (ring pairs) %d, violated at input %d (worst %.1f px short)" % (len(pa), n, int(viol.sum()), lb.max() if n else 0),
    "solver %s status %s iterations %d objective %.4g time %.1f s" % (a.method, res.status, res.nit, f(res.x), time.time() - t0),
    "max constraint violation after solve (deduped): %.3f px; violated constraints (> 0.01): %d" % (mv.max() if n else 0, int((mv > 0.01).sum())),
    "all raw sample pairs after: z_front - z_back min %.2f px, pairs with < 0: %d, < gap-0.5: %d" % (gap_all.min() if len(gap_all) else 0, int((gap_all < 0).sum()), int((gap_all < a.gap - 0.5).sum())),
    "dz: max |dz| %.1f px (min %.1f, max %.1f); max |dz''| %.4f px/ring^2" % (np.abs(dzr).max(), dzr.min(), dzr.max(), np.abs(d2).max()),
    "unit check: max change of projected edge screen position %.2e css px" % err,
]
print("\n".join(lines))
if a.report:
    open(a.report, "w").write("\n".join(lines) + "\n")
Lp, Rp = world_to_pose(L2), world_to_pose(R2)
out = dict(d)
out["name"] = "ak-fit-layered"
out["notes"] = d.get("notes", "") + " | layered by scripts/curve/layer.py gap %.1f kz %d" % (a.gap, a.kz)
out["variants"] = dict(phone=dict(points=[], faceSign=var["faceSign"], ruled=[
    dict(L=[round(float(v), 6) for v in Lp[k]], R=[round(float(v), 6) for v in Rp[k]]) for k in range(N)
]))
os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
json.dump(out, open(a.out, "w"))
