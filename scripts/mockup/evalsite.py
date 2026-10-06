#!/usr/bin/env python3
"""Gate metrics of a site capture (text hidden, 1672x941) against the mockup ribbon mask.
Usage: evalsite.py <bare.png>"""
import sys, json
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi
sys.path.insert(0, __import__("os").path.dirname(__file__))
import edges as ed
M, T, X, rgb, cl, g = ed.load()
im = np.array(Image.open(sys.argv[1]).convert("RGB"))
import analyze
h, s, v = analyze.hsv_of(im)
mask = (h >= 2) & (h <= 45) & (s > 0.4) & (v > 0.16)
mask = ndi.binary_opening(mask, np.ones((3, 3)))
mask[:, :480] = False
mask = ndi.binary_fill_holes(ndi.binary_closing(mask, np.ones((5, 5)))) | mask
mask &= ~X
cv2.imwrite(ed.OUTD + "/site_mask.png", (mask * 255).astype(np.uint8))
near_text = ndi.binary_dilation(T, iterations=6) | ndi.binary_dilation(X, iterations=3)
valid = ~near_text
valid[:, :480] = False
inter = (mask & M & valid).sum(); uni = ((mask | M) & valid).sum()
iou = inter / uni
def bd(m): return m & ~ndi.binary_erosion(m)
bo, bm = bd(mask), bd(M)
dm = ndi.distance_transform_edt(~bm); do = ndi.distance_transform_edt(~bo)
a = dm[bo & valid]; b = do[bm & valid]
allp = np.r_[a, b]
print("IoU (outside text) %.3f" % iou)
print("chamfer mean %.2f p95 %.2f (ours->mock %.2f, mock->ours %.2f)" % (allp.mean(), np.percentile(allp, 95), a.mean(), b.mean()))
reg = {'A apex': (880, 60, 1080, 230), 'K upper tip': (1440, 180, 1620, 340), 'K lower tip': (1400, 650, 1620, 800), 'crossbar': (720, 330, 1100, 470), 'S turn': (1000, 680, 1180, 840), 'tail': (430, 780, 1000, 941)}
for n, (x0, y0, x1, y1) in reg.items():
    box = np.zeros_like(valid); box[y0:y1, x0:x1] = True
    vv = np.r_[dm[bo & valid & box], do[bm & valid & box]]
    print("  %-12s mean %.2f p95 %.2f" % (n, vv.mean() if len(vv) else -1, np.percentile(vv, 95) if len(vv) else -1))
