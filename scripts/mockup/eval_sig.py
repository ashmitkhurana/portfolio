#!/usr/bin/env python3
"""R3 gates: bare site capture (390x844 at DPR 852/390) vs the cutout alpha mask. Usage: eval_sig.py <bare.png> [--out diff.png]"""
import json, os, sys
import cv2, numpy as np
from PIL import Image
from scipy import ndimage as ndi
sys.path.insert(0, os.path.dirname(__file__))
import analyze
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
a = np.array(Image.open(os.path.join(ROOT, "public/lab/ref/ak-signature-cutout.webp")))[..., 3] > 128
im = np.array(Image.open(sys.argv[1]).convert("RGB"))
im = cv2.resize(im, (852, 1846), interpolation=cv2.INTER_AREA)
h, s, v = analyze.hsv_of(im)
m = (h >= 2) & (h <= 45) & (s > 0.4) & (v > 0.16)
m = ndi.binary_opening(m, np.ones((3, 3)))
valid = np.ones_like(a); valid[:140] = False; valid[1700:, :180] = False
a = a & valid; m = m & valid
inter = (m & a).sum(); uni = (m | a).sum()
bd = lambda x: x & ~ndi.binary_erosion(x)
bo, bm = bd(m), bd(a)
dm = ndi.distance_transform_edt(~bm); do = ndi.distance_transform_edt(~bo)
allp = np.r_[dm[bo & valid], do[bm & valid]]
# distances are in capture px (852-wide = mockup px); report in mockup px
print("IoU %.3f   chamfer mean %.2f px  p95 %.2f px (mockup px)" % (inter / uni, allp.mean(), np.percentile(allp, 95)))
reg = {"S twist": (560, 1250, 852, 1560), "far-left wrap": (30, 760, 300, 1100), "apex": (230, 540, 500, 700), "bottom K": (540, 1000, 852, 1260), "top K": (520, 660, 852, 920), "tail": (100, 1560, 600, 1846)}
for n, (x0, y0, x1, y1) in reg.items():
    box = np.zeros_like(valid); box[y0:y1, x0:x1] = True
    vv = np.r_[dm[bo & valid & box], do[bm & valid & box]]
    print("  %-13s mean %.2f p95 %.2f" % (n, vv.mean() if len(vv) else -1, np.percentile(vv, 95) if len(vv) else -1))
if "--out" in sys.argv:
    o = np.zeros((1846, 852, 3), np.uint8); o[a & ~m] = (0, 0, 255); o[m & ~a] = (255, 128, 0); o[m & a] = (90, 90, 90)
    cv2.imwrite(sys.argv[sys.argv.index("--out") + 1], o)
