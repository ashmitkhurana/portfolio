"""Face audit: which ribbon face (A/B/edge-on) is visible at each engine ring.

usage: faceaudit.py <dump.json> <rings.csv> <outdir> [render.png]
Writes <outdir>/faces.csv, <outdir>/runs.txt and (if render given) <outdir>/faces.png.
"""
import json, sys, os
import numpy as np

EDGE_ON = 0.15


def load(dump, rings):
    d = json.load(open(dump))
    c = np.array(d["c"], float); B = np.array(d["B"], float); N = np.array(d["N"], float)
    hw = np.array(d["hw"], float); cam = np.array(d["meta"]["camPos"], float)
    r = np.genfromtxt(rings, delimiter=",", names=True)
    return d, c, B, N, hw, cam, r


def faces(c, B, N, hw, cam, pose_ring):
    def dots(P):
        v = cam - P
        v /= np.linalg.norm(v, axis=1, keepdims=True)
        return np.einsum("ij,ij->i", N, v)
    dc = dots(c)
    dl = dots(c - hw[:, None] * B)
    dr = dots(c + hw[:, None] * B)
    tail = (pose_ring >= 20) & (pose_ring <= 80)
    flip = -1.0 if np.median(dc[tail]) < 0 else 1.0   # normalise: tail face = A
    dc, dl, dr = flip * dc, flip * dl, flip * dr
    def lab(dv):
        return np.where(np.abs(dv) < EDGE_ON, 2, np.where(dv > 0, 0, 1))  # 0=A 1=B 2=edge-on
    return dc, dl, dr, lab(dc), lab(dl), lab(dr), flip


def runs(lbl):
    out = []; s = 0
    for i in range(1, len(lbl) + 1):
        if i == len(lbl) or lbl[i] != lbl[s]:
            out.append((s, i - 1, int(lbl[s]))); s = i
    return out


NAME = "AB~"

if __name__ == "__main__":
    dump, rings, outdir = sys.argv[1:4]
    render = sys.argv[4] if len(sys.argv) > 4 else None
    os.makedirs(outdir, exist_ok=True)
    d, c, B, N, hw, cam, r = load(dump, rings)
    dc, dl, dr, lc, ll, lr, flip = faces(c, B, N, hw, cam, r["pose_ring"])
    with open(os.path.join(outdir, "faces.csv"), "w") as f:
        f.write("ring,pose_ring,iv,sx,sy,Ndotv,face,faceL,faceR\n")
        for i in range(len(c)):
            f.write(f"{i},{int(r['pose_ring'][i])},{int(r['iv'][i])},{r['sx_c'][i]:.1f},{r['sy_c'][i]:.1f},{dc[i]:.3f},{NAME[lc[i]]},{NAME[ll[i]]},{NAME[lr[i]]}\n")
    with open(os.path.join(outdir, "runs.txt"), "w") as f:
        f.write(f"N sign flip applied: {flip}\n")
        for a, b, l in runs(lc):
            f.write(f"rings {a}-{b} (pose {int(r['pose_ring'][a])}-{int(r['pose_ring'][b])}, iv {int(r['iv'][a])}-{int(r['iv'][b])}) face {NAME[l]} "
                    f"screen ({r['sx_c'][a]:.0f},{r['sy_c'][a]:.0f})->({r['sx_c'][b]:.0f},{r['sy_c'][b]:.0f}) min|NdotV|={np.abs(dc[a:b+1]).min():.2f}\n")
    if render:
        from PIL import Image, ImageDraw
        im = Image.open(render).convert("RGB"); dr_ = ImageDraw.Draw(im)
        sc = im.size[0] / 390.0
        col = {0: (0, 255, 255), 1: (255, 0, 255), 2: (255, 255, 0)}
        for i in range(len(c)):
            x, y = r["sx_c"][i] * sc, r["sy_c"][i] * sc
            dr_.ellipse([x - 3, y - 3, x + 3, y + 3], fill=col[lc[i]])
        seg_file = os.path.join(outdir, "labels.json")
        if os.path.exists(seg_file):
            for lab_ in json.load(open(seg_file)):
                i = lab_["ring"]; x, y = r["sx_c"][i] * sc, r["sy_c"][i] * sc
                dr_.rectangle([x - 6, y - 6, x + 6, y + 6], outline=tuple(lab_.get("col", (255, 255, 255))), width=2)
                t = lab_["text"]; dr_.text((x + 9, y - 6), t, fill=(0, 0, 0), stroke_width=2, stroke_fill=(255, 255, 255))
        im.save(os.path.join(outdir, "faces.png"))
