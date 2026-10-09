#!/usr/bin/env python
"""Fold-zone face check (owner's rule: a face may only change where the edge crosses over at a fold, never by sliding).

  scripts/mockup/.venv/bin/python scripts/curve/edgecheck.py <faceaudit/faces.csv> [--zones name:a:b,...] [--max-run 4]

Per zone (pose rings): the longest consecutive run of edge-on engine rings (|N.v| < 0.15, faces.csv face '~'), the number of edge-on
rings, the compressed face sequence with run lengths, and the number of A<->B changes. A true fold PASSes when the longest edge-on run is
<= --max-run (the crease line) and the visible face changes at most once (one connected surface over the roll, no A-B-A re-entrance).
"""
import argparse, csv
ap = argparse.ArgumentParser()
ap.add_argument("faces")
ap.add_argument("--zones", default="S:152:203,farleft:345:387,apex:503:537,topK_tip:1168:1202")
ap.add_argument("--max-run", type=int, default=4)
a = ap.parse_args()
rows = list(csv.DictReader(open(a.faces)))
for spec in a.zones.split(","):
    nm, z0, z1 = spec.split(":")
    z0, z1 = int(z0), int(z1)
    seq = [(r["face"], abs(float(r["Ndotv"]))) for r in rows if z0 <= int(r["pose_ring"]) <= z1]
    run = best = 0
    for f, _ in seq:
        run = run + 1 if f == "~" else 0
        best = max(best, run)
    comp = []
    for f, _ in seq:
        if comp and comp[-1][0] == f:
            comp[-1][1] += 1
        else:
            comp.append([f, 1])
    ab = [c[0] for c in comp if c[0] != "~"]
    changes = sum(1 for i in range(1, len(ab)) if ab[i] != ab[i - 1])
    ok = best <= a.max_run and changes <= 1
    print("%-9s pose %d..%d: %d engine rings, edge-on %d, longest edge-on run %d, A/B changes %d, sequence %s  %s" % (
        nm, z0, z1, len(seq), sum(1 for f, _ in seq if f == "~"), best, changes, " ".join("%s%d" % (c[0], c[1]) for c in comp), "PASS" if ok else "FAIL"))
