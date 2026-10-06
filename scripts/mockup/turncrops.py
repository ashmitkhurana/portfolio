#!/usr/bin/env python3
"""Side-by-side crops (ours | sculpture mapped through the placement) of every turn: $OUT/turn_<name>.png.
Usage: ANALYZE_OUT=$SP/r2 turncrops.py <site capture 1672x941 at DPR 2 (3344x1882)> """
import json, os, sys
import cv2, numpy as np
OUT = os.environ.get("ANALYZE_OUT", "/private/tmp/claude-501/-Users-ashmitkhurana-Development-studio-portfolio/428f1961-b6ad-4758-ba30-ff5eb1800006/scratchpad/r2")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
REG = {  # sculpture px boxes
    "a_apex": (540, 30, 790, 230), "wrap": (740, 360, 960, 520), "k_upper_tip": (1060, 40, 1260, 260),
    "k_lower_tip": (1030, 620, 1340, 830), "s_curl": (420, 640, 840, 860), "crossbar_end": (290, 400, 520, 600),
}
def main():
    P = json.load(open(OUT + "/placement.json")); s, tx, ty = P["scale"], P["tx"], P["ty"]
    ours = cv2.imread(sys.argv[1])
    dpr = ours.shape[1] / 1672.0
    scul = cv2.imread(os.path.join(OUT, "sculpture.png"))
    # sculpture warped into the site frame at the capture resolution
    A = np.array([[s * dpr, 0, tx * dpr], [0, s * dpr, ty * dpr]], np.float32)
    sw = cv2.warpAffine(scul, A, (ours.shape[1], ours.shape[0]), flags=cv2.INTER_CUBIC)
    for n, (x0, y0, x1, y1) in REG.items():
        X0, Y0, X1, Y1 = [int(round(v * dpr)) for v in (s * x0 + tx, s * y0 + ty, s * x1 + tx, s * y1 + ty)]
        a = ours[max(Y0, 0):Y1, max(X0, 0):X1]; b = sw[max(Y0, 0):Y1, max(X0, 0):X1]
        h = min(a.shape[0], b.shape[0]); w = min(a.shape[1], b.shape[1])
        k = min(1.0, 900.0 / (2 * w))
        im = np.hstack([a[:h, :w], b[:h, :w]])
        im = cv2.resize(im, None, fx=k, fy=k, interpolation=cv2.INTER_AREA)
        cv2.putText(im, "ours | sculpture: " + n, (8, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
        cv2.imwrite(os.path.join(OUT, "turn_%s.png" % n), im)
    print("wrote", ", ".join("turn_%s.png" % n for n in REG))
if __name__ == "__main__":
    main()
