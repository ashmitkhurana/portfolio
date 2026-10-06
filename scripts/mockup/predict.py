#!/usr/bin/env python3
"""Offline silhouette of the lifted strip (union of the ruling quads, 1672x941) vs the transformed sculpture mask; also the parity IoU against an
engine bare capture. Usage: ANALYZE_OUT=$SP/r2 predict.py [--engine bare.png] [--out diff.png]"""
import json, os, sys
import cv2, numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import evalsite2 as ev
from scipy import ndimage as ndi


def predicted(J=None, scale=4):
    J = J or json.load(open(ev.OUT + "/ruled_sculpture.json"))
    E1, E2 = np.array(J["E1"]), np.array(J["E2"])
    img = np.zeros((941 * scale, 1672 * scale), np.uint8)
    for i in range(len(E1) - 1):
        q = np.array([E1[i], E2[i], E2[i + 1], E1[i + 1]]) * scale
        cv2.fillPoly(img, [np.round(q).astype(np.int32)], 255)
    return cv2.resize(img, (1672, 941), interpolation=cv2.INTER_AREA) > 127


def main():
    M = ev.transformed_mask()
    pm = predicted()
    valid = np.ones_like(M); valid[:130, 1180:] = False
    iou, mean, p95, dm, do, bo, bm = ev.metrics(pm, M, valid)
    print("predicted strip vs transformed sculpture: IoU %.3f chamfer mean %.2f p95 %.2f" % (iou, mean, p95))
    if "--engine" in sys.argv:
        em = ev.site_mask(sys.argv[sys.argv.index("--engine") + 1])
        i2, m2, p2, *_ = ev.metrics(em, pm, valid)
        print("parity (engine bare silhouette vs predicted strip): IoU %.3f chamfer mean %.2f p95 %.2f" % (i2, m2, p2))
    if "--out" in sys.argv:
        img = np.zeros((941, 1672, 3), np.uint8)
        img[M & ~pm] = (0, 0, 255); img[pm & ~M] = (255, 128, 0); img[M & pm] = (90, 90, 90)
        cv2.imwrite(sys.argv[sys.argv.index("--out") + 1], img)


if __name__ == "__main__":
    main()
