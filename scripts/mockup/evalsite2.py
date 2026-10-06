#!/usr/bin/env python3
"""Gate metrics of a bare site capture (text hidden, 1672x941) against the TRANSFORMED sculpture silhouette (ribbon mask mapped through the
placement similarity). Usage: ANALYZE_OUT=$SP/r2 evalsite2.py <bare.png> [--out overlay.png]"""
import json, os, sys
import cv2, numpy as np
from PIL import Image
from scipy import ndimage as ndi
sys.path.insert(0, os.path.dirname(__file__))
OUT = os.environ.get("ANALYZE_OUT", "/private/tmp/claude-501/-Users-ashmitkhurana-Development-studio-portfolio/428f1961-b6ad-4758-ba30-ff5eb1800006/scratchpad/r2")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def transformed_mask():
    P = json.load(open(OUT + "/placement.json"))
    M = (np.array(Image.open(OUT + "/sculpture/ribbon_mask.png").convert("L")) > 127).astype(np.uint8) * 255
    A = np.array([[P["scale"], 0, P["tx"]], [0, P["scale"], P["ty"]]], np.float32)
    T = cv2.warpAffine(M, A, (1672, 941), flags=cv2.INTER_LINEAR, borderValue=0) > 127
    return T


def site_mask(path):
    import analyze
    im = np.array(Image.open(path).convert("RGB"))
    h, s, v = analyze.hsv_of(im)
    m = (h >= 2) & (h <= 45) & (s > 0.4) & (v > 0.16)
    m = ndi.binary_opening(m, np.ones((3, 3)))
    m = ndi.binary_closing(m, np.ones((3, 3))) | m
    m[:130, 1180:] = False      # nav chrome (WORK / ABOUT / CONTACT / terminal button): not ribbon
    return m


def metrics(mask, M, valid):
    inter = (mask & M & valid).sum(); uni = ((mask | M) & valid).sum()
    bd = lambda m: m & ~ndi.binary_erosion(m)
    bo, bm = bd(mask), bd(M)
    dm = ndi.distance_transform_edt(~bm); do = ndi.distance_transform_edt(~bo)
    a = dm[bo & valid]; b = do[bm & valid]
    allp = np.r_[a, b]
    return inter / uni, allp.mean(), np.percentile(allp, 95), dm, do, bo, bm


def main():
    path = sys.argv[1]
    M = transformed_mask()
    m = site_mask(path)
    valid = np.ones_like(M)
    valid[:130, 1180:] = False
    iou, mean, p95, dm, do, bo, bm = metrics(m, M, valid)
    print("IoU %.3f   chamfer mean %.2f px  p95 %.2f px" % (iou, mean, p95))
    reg = {"A apex": (880, 30, 1100, 260), "K upper tip": (1440, 120, 1640, 340), "K lower tip": (1380, 650, 1660, 880), "wrap": (1100, 380, 1300, 520),
           "S curl": (640, 650, 900, 880), "crossbar end": (520, 420, 700, 700), "tail": (500, 800, 900, 941)}
    for n, (x0, y0, x1, y1) in reg.items():
        box = np.zeros_like(valid); box[y0:y1, x0:x1] = True
        vv = np.r_[dm[bo & valid & box], do[bm & valid & box]]
        print("  %-13s mean %.2f p95 %.2f" % (n, vv.mean() if len(vv) else -1, np.percentile(vv, 95) if len(vv) else -1))
    if "--out" in sys.argv:
        o = sys.argv[sys.argv.index("--out") + 1]
        img = np.zeros((941, 1672, 3), np.uint8)
        img[M & ~m] = (0, 0, 255); img[m & ~M] = (255, 128, 0); img[M & m] = (90, 90, 90)
        cv2.imwrite(o, img)


if __name__ == "__main__":
    main()
