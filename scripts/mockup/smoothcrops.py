import json, sys, cv2, numpy as np
SP = "/private/tmp/claude-501/-Users-ashmitkhurana-Development-studio-portfolio/428f1961-b6ad-4758-ba30-ff5eb1800006/scratchpad"
R4 = SP + "/r4"
E = json.load(open(R4 + "/edges_snap.json"))
sm = [np.array(E["edge1"]), np.array(E["edge2"])]
# raw arrays are at 2 px resolution; compare by nearest raw point to each smoothed point
raw = [np.load(R4 + "/E1raw.npy"), np.load(R4 + "/E2raw.npy")]
im = cv2.imread(SP + "/r3/cutout.png")
cands = []
for k in (0, 1):
    R = raw[k]
    # jaggedness = deviation of raw from a heavy gaussian of raw
    from scipy import ndimage as ndi
    H = np.stack([ndi.gaussian_filter1d(R[:, c], 6, mode="nearest") for c in (0, 1)], 1)
    jag = np.hypot(*(R - H).T)
    jag = ndi.uniform_filter1d(jag, 25)
    for _ in range(5):
        i = int(np.argmax(jag)); cands.append((jag[i], k, R[i].copy())); jag[max(0, i - 80):i + 80] = 0
cands.sort(key=lambda c: -c[0])
tiles = []
for j, k, c in cands[:5]:
    x0, y0 = int(c[0]) - 60, int(c[1]) - 45
    x0 = max(0, min(852 - 120, x0)); y0 = max(0, min(1846 - 90, y0))
    row = []
    for which in ("before", "after"):
        t = cv2.resize(im[y0:y0 + 90, x0:x0 + 120], None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
        for kk, col in ((0, (60, 255, 60)), (1, (255, 60, 255))):
            P = raw[kk] if which == "before" else sm[kk]
            pts = np.array(((P - [x0, y0]) * 3 * 16).astype(np.int32))
            cv2.polylines(t, [pts], False, col, 1, cv2.LINE_AA, 4)
        cv2.putText(t, "%s (%d,%d) jag %.1f" % (which, c[0], c[1], j), (4, 14), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1)
        row.append(t)
    tiles.append(np.hstack(row))
cv2.imwrite(R4 + "/smooth_before_after.png", np.vstack(tiles))
print("wrote smooth_before_after.png", [(round(float(c[0]), 1), k, c[2].round().tolist()) for c in cands[:5]])
