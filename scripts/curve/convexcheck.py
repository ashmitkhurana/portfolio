#!/usr/bin/env python
"""Convexity of the fold rolls: is the VISIBLE surface the outside of the roll?  (engine dump.json)

  scripts/mockup/.venv/bin/python scripts/curve/convexcheck.py <dump.json> <diag/rings.csv> (--log <fit_a.log> | --zones c:n,...)

For each fold (crease pose ring c, roll half-length n pose rings; read from the 'fold2 crease' lines of the fit log): over the engine rings
whose pose ring is in c+-n, s = kvec . n_vis with kvec the centreline curvature vector (dT/ds) and n_vis = sign(N.v) N the visible-face normal
(v to the camera). s < 0: the centre of curvature is behind the visible surface = the outside of the roll is shown. Reports the % of
roll samples (|kvec| > 1e-3) with s < 0 (PASS >= 80 %).
"""
import argparse, csv, json, re
import numpy as np
ap = argparse.ArgumentParser()
ap.add_argument("dump"); ap.add_argument("rings")
ap.add_argument("--log"); ap.add_argument("--zones", default="376:6,516:10,1188:9")
a = ap.parse_args()
zones = []
if a.log:
    for m in re.finditer(r"fold2 crease (\d+) R (\d+): ds [\d.]+ n (\d+)", open(a.log).read()):
        zones.append((int(m.group(1)), int(m.group(3))))
else:
    zones = [tuple(int(v) for v in z.split(":")) for z in a.zones.split(",")]
D = json.load(open(a.dump))
c = np.array(D["c"]); T = np.array(D["T"]); N = np.array(D["N"]); cam = np.array(D["meta"]["camPos"], float)
pr = np.array([int(r["pose_ring"]) for r in csv.DictReader(open(a.rings))])
ds = np.linalg.norm(c[2:] - c[:-2], axis=1)
kv = np.zeros_like(c)
kv[1:-1] = (T[2:] - T[:-2]) / np.maximum(ds, 1e-9)[:, None]
v = cam - c
v /= np.linalg.norm(v, axis=1, keepdims=True)
sg = np.sign(np.einsum("ij,ij->i", N, v))
s = np.einsum("ij,ij->i", kv, N) * sg
names = {376: "farleft", 516: "apex", 1188: "topK_tip"}
for c0, n in zones:
    m = (pr >= c0 - n) & (pr <= c0 + n) & (np.linalg.norm(kv, axis=1) > 1e-3)
    pct = 100.0 * (s[m] < 0).sum() / max(m.sum(), 1)
    print("%-8s crease %d roll +-%d: %d roll samples, outside shown %.0f%%  (mean s %.4f)  %s" % (names.get(c0, str(c0)), c0, n, m.sum(), pct, s[m].mean() if m.sum() else 0, "PASS" if pct >= 80 else "FAIL"))
