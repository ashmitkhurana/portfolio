#!/usr/bin/env python3
"""Per-ring visible face / depth / screen position along a ring range of a dump (quick review aid).
  faces.py <dir> <from> <to> [step]"""
import json, sys, numpy as np
d = json.load(open(sys.argv[1] + "/dump.json"))
a, b = int(sys.argv[2]), int(sys.argv[3]); st = int(sys.argv[4]) if len(sys.argv) > 4 else 10
c, N = np.array(d["c"]), np.array(d["N"]); cam = np.array(d["meta"]["camPos"]); D = cam[2]
SX, SY = 852 / 390, 1846 / 844
for i in range(a, b, st):
    v = cam - c[i]; f = np.dot(N[i], v) / np.linalg.norm(v); k = D / (D - c[i][2])
    print(i, "(%4d,%4d) z=%6.1f %s %.2f" % ((c[i][0] * k + 195) * SX, (422 - c[i][1] * k) * SY, c[i][2], "A" if f > 0 else "B", f))
