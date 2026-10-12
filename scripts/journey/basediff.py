"""Pixel diff of two frame sets: basediff.py <dirA> <dirB> <prefix> <n>  (frames <prefix>_00.png ..)"""
import sys
import numpy as np
from PIL import Image
a, b, pre, n = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
for i in range(n):
    A = np.asarray(Image.open(f"{a}/{pre}_{i:02d}.png").convert("RGB")).astype(int)
    B = np.asarray(Image.open(f"{b}/{pre}_{i:02d}.png").convert("RGB")).astype(int)
    d = np.abs(A - B).max(axis=2) > 24
    ys, xs = np.nonzero(d)
    print(pre, i, "changed px", int(d.sum()), (int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())) if d.sum() else "")
