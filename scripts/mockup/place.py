#!/usr/bin/env python3
"""Similarity (scale + translation, no rotation) from sculpture image px to the OLD hero mockup px (1672x941), solved by
least squares on four landmarks. Sculpture landmarks are measured from the sculpture mask; mockup values are given.
Usage: ANALYZE_OUT=$SP/r2 .venv/bin/python place.py   -> $OUT/placement.json"""
import json, os
import numpy as np
from PIL import Image

OUT = os.environ.get("ANALYZE_OUT", "/private/tmp/claude-501/-Users-ashmitkhurana-Development-studio-portfolio/428f1961-b6ad-4758-ba30-ff5eb1800006/scratchpad/r2")
MOCK = {"A_apex_top": (970.0, 78.0), "K_upper_right": (1592.0, 225.0), "K_lower_bottom": (1530.0, 775.0), "tail_bottom": (560.0, 941.0)}


def landmarks(M):
    H, W = M.shape
    out = {}
    sub = M[:, 560:721]
    y = int(np.nonzero(sub.any(1))[0][0])                       # topmost row of the A apex
    xs = np.nonzero(M[y:y + 3, 560:721].any(0))[0] + 560
    out["A_apex_top"] = (float(xs.mean()), float(y))
    sub = M[70:200, :]                                          # upper-K loop: rightmost extreme
    xr = int(np.nonzero(sub.any(0))[0][-1])
    ys = np.nonzero(M[70:200, xr - 2:xr + 1].any(1))[0] + 70
    out["K_upper_right"] = (float(xr), float(ys.mean()))
    sub = M[:, 1000:1300]                                       # lower-K loop: bottom extreme
    yb = int(np.nonzero(sub.any(1))[0][-1])
    xs = np.nonzero(M[yb - 2:yb + 1, 1000:1300].any(0))[0] + 1000
    out["K_lower_bottom"] = (float(xs.mean()), float(yb))
    xs = np.nonzero(M[H - 1])[0]
    out["tail_bottom"] = (float(xs.mean()), float(H - 1) + 1.0)   # bottom edge of the frame
    return out


def main():
    M = np.array(Image.open(OUT + "/sculpture/ribbon_mask.png").convert("L")) > 127
    L = landmarks(M)
    names = list(MOCK)
    S = np.array([L[n] for n in names]); T = np.array([MOCK[n] for n in names])
    # x' = s x + tx, y' = s y + ty
    A = np.zeros((8, 3)); b = np.zeros(8)
    for i in range(4):
        A[2 * i] = [S[i, 0], 1, 0]; b[2 * i] = T[i, 0]
        A[2 * i + 1] = [S[i, 1], 0, 1]; b[2 * i + 1] = T[i, 1]
    sol = np.linalg.lstsq(A, b, rcond=None)[0]
    s, tx, ty = [float(v) for v in sol]
    pred = S * s + np.array([tx, ty])
    res = pred - T
    print("scale %.4f  tx %.2f ty %.2f" % (s, tx, ty))
    for n, l, m, r in zip(names, S, T, res):
        print("  %-15s sculpture (%.1f, %.1f) -> mockup target (%.0f, %.0f)  residual (%.1f, %.1f) = %.1f px" % (n, l[0], l[1], m[0], m[1], r[0], r[1], np.hypot(*r)))
    json.dump(dict(scale=s, tx=tx, ty=ty, landmarks_sculpture={n: list(L[n]) for n in names}, landmarks_mockup={n: list(MOCK[n]) for n in names},
                   residuals={n: [float(a), float(b_)] for n, (a, b_) in zip(names, res)}, rms=float(np.sqrt((res ** 2).sum(1).mean()))),
              open(OUT + "/placement.json", "w"), indent=1)


if __name__ == "__main__":
    main()
