#!/usr/bin/env python3
"""R4 gates: Canny edge map of OUR render (bare capture, text hidden) vs the mockup's (the cutout) over the ribbon interior. Per region: mean / p95
chamfer in mockup px, ours->mockup (precision) and mockup->ours (recall). Writes crops <region>_vs.png (3x, ours | mockup) and overlays (mockup edge
lines in cyan on our render).
Usage: eval_edges.py <full capture of the page 852x1846-ish> <bare capture> [outdir]"""
import json, os, sys
import cv2, numpy as np
from PIL import Image
from scipy import ndimage as ndi
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SP = "/private/tmp/claude-501/-Users-ashmitkhurana-Development-studio-portfolio/428f1961-b6ad-4758-ba30-ff5eb1800006/scratchpad"
REG = {"apex": (200, 540, 520, 720), "K lower loop": (500, 940, 852, 1270), "K upper loop": (500, 660, 852, 940), "far-left wrap": (30, 760, 330, 1130),
       "S twist": (560, 1250, 852, 1560), "tail": (100, 1560, 600, 1846)}


def canny(rgb):
    L = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)[..., 0]
    out = np.zeros(L.shape, bool)
    for sg in (1.5, 2.5, 3.5):
        b = cv2.GaussianBlur(L, (0, 0), sg)
        lo = 6 if sg > 2 else 10
        out |= cv2.Canny(b, lo, lo * 2.5) > 0
    return out


def main():
    full = np.array(Image.open(sys.argv[2]).convert("RGB"))
    full = cv2.resize(full, (852, 1846), interpolation=cv2.INTER_AREA)
    ref = np.array(Image.open(os.path.join(ROOT, "public/lab/ref/ak-signature-cutout.webp")))
    alpha = ref[..., 3] > 128
    rgbm = ref[..., :3]
    # our render: composite on the same dark bg as the cutout view so the silhouette edge is the same kind of edge
    bg = np.full_like(rgbm, 20)
    ours = full.copy()
    cm, co = canny(rgbm), canny(ours)
    inter = ndi.binary_erosion(alpha, iterations=3)
    # interior = ribbon region of the mockup (eroded) union ours-lit region
    am = ndi.binary_dilation(alpha, iterations=4)
    valid = am; valid[:140] = False; valid[1700:, :180] = False
    dm = ndi.distance_transform_edt(~cm); do = ndi.distance_transform_edt(~co)
    out = {}
    print("%-14s %-24s %-24s" % ("region", "ours->mockup mean/p95", "mockup->ours mean/p95"))
    allp, allr = [], []
    for n, (x0, y0, x1, y1) in REG.items():
        box = np.zeros_like(valid); box[y0:y1, x0:x1] = True
        a = dm[co & valid & box]; b = do[cm & valid & box]
        allp.append(a); allr.append(b)
        print("%-14s %6.2f / %6.2f px       %6.2f / %6.2f px" % (n, a.mean() if len(a) else -1, np.percentile(a, 95) if len(a) else -1, b.mean() if len(b) else -1, np.percentile(b, 95) if len(b) else -1))
    a = np.concatenate(allp); b = np.concatenate(allr)
    print("%-14s %6.2f / %6.2f px       %6.2f / %6.2f px" % ("ALL", a.mean(), np.percentile(a, 95), b.mean(), np.percentile(b, 95)))
    if len(sys.argv) > 3:
        od = sys.argv[3]; os.makedirs(od, exist_ok=True)
        for n, (x0, y0, x1, y1) in REG.items():
            k = 3.0 if (x1 - x0) < 400 else 2.2
            a_ = cv2.resize(ours[y0:y1, x0:x1], None, fx=k, fy=k, interpolation=cv2.INTER_CUBIC)[..., ::-1]
            b_ = cv2.resize(rgbm[y0:y1, x0:x1], None, fx=k, fy=k, interpolation=cv2.INTER_CUBIC)[..., ::-1]
            cv2.imwrite(os.path.join(od, "crop_%s_vs.png" % n.replace(" ", "_")), np.hstack([a_, b_]))
            ov = a_.copy()
            ec = cv2.resize(cm[y0:y1, x0:x1].astype(np.uint8), None, fx=k, fy=k, interpolation=cv2.INTER_NEAREST) > 0
            ov[ec] = (255, 255, 0)
            eo = cv2.resize(co[y0:y1, x0:x1].astype(np.uint8), None, fx=k, fy=k, interpolation=cv2.INTER_NEAREST) > 0
            ov[eo & ~ec] = (60, 60, 255)
            cv2.imwrite(os.path.join(od, "overlay_%s.png" % n.replace(" ", "_")), ov)


if __name__ == "__main__":
    main()
