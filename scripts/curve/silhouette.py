"""Silhouette diff of a site render vs the mockup cutout.

usage: silhouette.py <ribbon.png> <outdir>
Writes sil_diff.png (both=grey, mockup-only=red, render-only=cyan) and sil_diff_overlay.png, prints per-region IoU.
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

W, H = 780, 1688
REGIONS = {
    "apex": (170, 420, 500, 720),
    "topK": (420, 560, 780, 900),
    "junction": (380, 700, 600, 950),
    "bottomK": (420, 880, 780, 1200),
    "wrap": (20, 650, 420, 1000),
    "farleft": (0, 880, 300, 1150),
    "sweep": (100, 1000, 700, 1250),
    "scurve": (450, 1150, 780, 1500),
    "tail": (300, 1450, 780, 1688),
}
CUTOUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "docs", "ribbon", "ref", "ak-signature-cutout.webp")


def masks(png):
    im = Image.open(png).convert("RGB")
    if im.size != (W, H):
        im = im.resize((W, H), Image.BILINEAR)
    rgb = np.asarray(im, np.float32) / 255.0
    mx = rgb.max(2)
    mn = rgb.min(2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    r = mx > 45 / 255.0
    r[:140] = False
    r &= (sat > 0.35) | (mx > 0.5)
    r = ndi.binary_opening(r, np.ones((3, 3), bool))
    a = Image.open(CUTOUT).convert("RGBA").split()[3].resize((W, H), Image.NEAREST)
    m = np.asarray(a) > 128
    return rgb, r, m


def main():
    png, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    rgb, r, m = masks(png)
    d = np.zeros((H, W, 3), np.uint8)
    d[r & m] = 60
    d[m & ~r] = (255, 0, 0)
    d[r & ~m] = (0, 255, 255)
    Image.fromarray(d).save(os.path.join(out, "sil_diff.png"))
    o = rgb * 0.5
    for mask, col in ((m & ~r, (1, 0, 0)), (r & ~m, (0, 1, 1))):
        o[mask] = 0.4 * o[mask] + 0.6 * np.array(col, np.float32)
    Image.fromarray((o * 255).astype(np.uint8)).save(os.path.join(out, "sil_diff_overlay.png"))
    rows = [("all", (0, 0, W, H))] + list(REGIONS.items())
    lines = ["%-9s %7s %9s %9s" % ("region", "IoU", "M-only", "R-only")]
    for name, (x0, y0, x1, y1) in rows:
        rr, mm = r[y0:y1, x0:x1], m[y0:y1, x0:x1]
        u = (rr | mm).sum()
        lines.append("%-9s %7.3f %9d %9d" % (name, (rr & mm).sum() / u if u else 1.0, (mm & ~rr).sum(), (rr & ~mm).sum()))
    txt = "\n".join(lines)
    print(txt)
    with open(os.path.join(out, "regions.txt"), "w") as f:
        f.write(txt + "\n")


if __name__ == "__main__":
    main()
