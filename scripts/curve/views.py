#!/usr/bin/env python
"""Review views + metrics for a ribbon dump (scripts/curve/dump-pose.mjs).

  scripts/mockup/.venv/bin/python scripts/curve/views.py <dir>

Reads <dir>/dump.json; writes front.png, front_plain.png, side.png, top.png, sheet.png, metrics.txt into <dir>.
World: px, +y up, camera on +z looking down -z. Cutout px = css px * (852/390, 1846/844).
"""
import json, sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.spatial import cKDTree
from scipy import ndimage

d_dir = sys.argv[1]
D = json.load(open(os.path.join(d_dir, "dump.json")))
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
CUTOUT = os.path.join(ROOT, "docs/ribbon/ref/ak-signature-cutout.webp")

meta = D["meta"]
W_ = float(meta["width"]); HT = float(meta["ht"]); M = meta["M"]
VW, VH = meta["viewW"], meta["viewH"]
CW, CH = 852, 1846
KX, KY = CW / 390.0, CH / 844.0
cam = np.array(meta["camPos"], float)
P = np.array(meta["proj"], float).reshape(4, 4).T
V = np.array(meta["view"], float).reshape(4, 4).T
VP = P @ V

c = np.array(D["c"], float); B = np.array(D["B"], float); N = np.array(D["N"], float)
hw = np.array(D["hw"], float)
L = c - B * hw[:, None]
Rr = c + B * hw[:, None]


def project(pts):
    """world (n,3) -> cutout px (n,2)"""
    h = np.hstack([pts, np.ones((len(pts), 1))]) @ VP.T
    nd = h[:, :3] / h[:, 3:4]
    sx = (nd[:, 0] + 1) / 2 * VW
    sy = (1 - nd[:, 1]) / 2 * VH
    return np.stack([sx * KX, sy * KY], 1)


def font(sz):
    try:
        return ImageFont.load_default(size=sz)
    except TypeError:
        return ImageFont.load_default()


# ---- per-quad data
to_cam = cam[None, :] - c
dist_c = np.linalg.norm(to_cam, axis=1)
dotN = np.einsum("ij,ij->i", N, to_cam / dist_c[:, None])
faceA = dotN > 0
shade = 0.45 + 0.55 * np.abs(dotN)
ORANGE = np.array([255, 122, 26], float)
BLUE = np.array([58, 141, 222], float)
quad_col = [tuple(int(v) for v in (ORANGE if faceA[i] else BLUE) * shade[i]) for i in range(M)]
nq = M - 1
corners = np.stack([L[:-1], Rr[:-1], Rr[1:], L[1:]], 1)  # (nq,4,3)
qdist = np.linalg.norm(corners - cam, axis=2).mean(1)

folds = D["foldReports"]
hairs = D["hairpinReports"]
labels = []  # (ring, text)
for f in folds:
    labels.append(((f["ring0"] + f["ring1"]) // 2, f.get("name") or f"fold{f.get('index', '?')}"))
for h in hairs:
    labels.append((int(h["ring"]), h["name"]))


def draw_quads(img, ptsL, ptsR, order, ss, lw=2):
    dr = ImageDraw.Draw(img)
    for q in order:
        poly = [tuple(ptsL[q] * ss), tuple(ptsR[q] * ss), tuple(ptsR[q + 1] * ss), tuple(ptsL[q + 1] * ss)]
        dr.polygon(poly, fill=quad_col[q])
        dr.line([tuple(ptsL[q] * ss), tuple(ptsL[q + 1] * ss)], fill=(255, 0, 255), width=lw * ss)
        dr.line([tuple(ptsR[q] * ss), tuple(ptsR[q + 1] * ss)], fill=(0, 255, 0), width=lw * ss)


def text_tag(dr, xy, s, f, fill=(255, 255, 255)):
    x, y = xy
    bb = dr.textbbox((x, y), s, font=f)
    dr.rectangle([bb[0] - 2, bb[1] - 1, bb[2] + 2, bb[3] + 1], fill=(0, 0, 0))
    dr.text((x, y), s, font=f, fill=fill)


def annotate(img, pc, ss):
    dr = ImageDraw.Draw(img)
    f = font(10 * ss)
    for i in range(0, M, 50):
        x, y = pc[i] * ss
        dr.line([(x - 5 * ss, y), (x + 5 * ss, y)], fill=(255, 255, 255), width=ss)
        text_tag(dr, (x + 6 * ss, y - 5 * ss), str(i), f)
    f2 = font(13 * ss)
    for ring, name in labels:
        ring = min(max(ring, 0), M - 1)
        x, y = pc[ring] * ss
        dr.ellipse([x - 4 * ss, y - 4 * ss, x + 4 * ss, y + 4 * ss], outline=(255, 255, 255), width=2 * ss)
        text_tag(dr, (x + 8 * ss, y - 18 * ss), f"{name}@{ring}", f2)


# ---- front
pL, pR, pC = project(L), project(Rr), project(c)
order = np.argsort(-qdist)  # far -> near
SS = 2


def front(with_bg, path):
    if with_bg:
        cut = Image.open(CUTOUT).convert("RGBA")
        base = Image.new("RGBA", cut.size, (17, 17, 17, 255))
        base.alpha_composite(cut)
        arr = np.array(base.convert("RGB"), float) * 0.35
        bg = Image.fromarray(arr.astype(np.uint8))
    else:
        bg = Image.new("RGB", (CW, CH), (0, 0, 0))
    big = bg.resize((CW * SS, CH * SS), Image.BILINEAR)
    draw_quads(big, pL, pR, order, SS)
    annotate(big, pC, SS)
    big.resize((CW, CH), Image.LANCZOS).save(path)


front(True, os.path.join(d_dir, "front.png"))
front(False, os.path.join(d_dir, "front_plain.png"))


# ---- orthographic side / top
def ortho(axis_h, axis_v, flip_v, sort_axis, fit, path, h_label, v_label, zline_h):
    allp = np.vstack([L, Rr, c])
    h0, h1 = allp[:, axis_h].min(), allp[:, axis_h].max()
    v0, v1 = allp[:, axis_v].min(), allp[:, axis_v].max()
    marg = 40
    if fit == "height":
        sc = (900 - 2 * marg) / (v1 - v0)
    else:
        sc = (900 - 2 * marg) / (h1 - h0)
    Wi = int((h1 - h0) * sc + 2 * marg); Hi = int((v1 - v0) * sc + 2 * marg)

    def tr(p):
        x = (p[:, axis_h] - h0) * sc + marg
        y = ((v1 - p[:, axis_v]) if not flip_v else (p[:, axis_v] - v0)) * sc + marg
        return np.stack([x, y], 1)

    tL, tR, tC = tr(L), tr(Rr), tr(c)
    # painter: far first; the viewer looks from +x (side) / +y (top): increasing coordinate
    qs = corners[:, :, sort_axis].mean(1)
    od = np.argsort(qs)
    img = Image.new("RGB", (Wi * SS, Hi * SS), (0, 0, 0))
    dr = ImageDraw.Draw(img)
    f = font(11 * SS)
    # ticks every 50 px of the plane axes
    for axis, lo, hi, is_h in ((axis_h, h0, h1, True), (axis_v, v0, v1, False)):
        t = np.ceil(lo / 50) * 50
        while t <= hi:
            if is_h:
                x = ((t - h0) * sc + marg) * SS
                dr.line([(x, 0), (x, Hi * SS)], fill=(30, 30, 30), width=SS)
                text_tag(dr, (x + 2 * SS, 2 * SS), f"{int(t)}", f, (160, 160, 160))
            else:
                y = (((v1 - t) if not flip_v else (t - v0)) * sc + marg) * SS
                dr.line([(0, y), (Wi * SS, y)], fill=(30, 30, 30), width=SS)
                text_tag(dr, (2 * SS, y + 2 * SS), f"{int(t)}", f, (160, 160, 160))
            t += 50
    draw_quads(img, tL, tR, od, SS, lw=1)
    # z = 0 dashed line
    dash = 10 * SS
    if zline_h:  # z is horizontal (side)
        x = ((0 - h0) * sc + marg) * SS
        y = 0
        while y < Hi * SS:
            dr.line([(x, y), (x, y + dash)], fill=(255, 255, 255), width=SS)
            y += 2 * dash
        text_tag(dr, (x + 4 * SS, Hi * SS - 20 * SS), "z=0 (text plane)", font(12 * SS))
    else:
        y = (((0 - v1) * -1 if False else (0 - v0)) * sc + marg) * SS  # flip_v: larger z lower
        x = 0
        while x < Wi * SS:
            dr.line([(x, y), (x + dash, y)], fill=(255, 255, 255), width=SS)
            x += 2 * dash
        text_tag(dr, (4 * SS, y - 18 * SS), "z=0 (text plane)", font(12 * SS))
    f2 = font(10 * SS)
    for i in range(0, M, 50):
        x, y = tC[i] * SS
        dr.ellipse([x - 2 * SS, y - 2 * SS, x + 2 * SS, y + 2 * SS], outline=(255, 255, 255), width=SS)
        text_tag(dr, (x + 4 * SS, y - 4 * SS), str(i), f2)
    f3 = font(13 * SS)
    for ring, name in labels:
        ring = min(max(ring, 0), M - 1)
        x, y = tC[ring] * SS
        dr.ellipse([x - 4 * SS, y - 4 * SS, x + 4 * SS, y + 4 * SS], outline=(255, 255, 255), width=2 * SS)
        text_tag(dr, (x + 8 * SS, y - 18 * SS), f"{name}@{ring}", f3)
    text_tag(dr, (Wi * SS - 260 * SS, 24 * SS), f"{h_label} -> | {v_label}", font(12 * SS))
    img.resize((Wi, Hi), Image.LANCZOS).save(path)


# side: horizontal = z (camera on the right), vertical = y up, painter by increasing x
ortho(2, 1, False, 0, "height", os.path.join(d_dir, "side.png"), "z (cam right)", "y up", True)
# top: horizontal = x, vertical = z (larger z lower, camera at bottom), painter by increasing y
ortho(0, 2, True, 1, "width", os.path.join(d_dir, "top.png"), "x", "z (cam down)", False)

# ---- metrics
out = []
P_ = out.append
P_(f"width={W_:g} ht={HT:.4f} thickness={2*HT:.4f} M={M} E={meta['E']} view={VW}x{VH}")
P_("")
P_("== fold reports ==")
if not folds:
    P_("(none)")
for f in folds:
    P_(
        f"fold {f.get('name', f.get('index'))}: built={f['built']} rings={f['ring0']}..{f['ring1']} theta={np.degrees(f['theta']):.1f}deg "
        f"mismatch={f['mismatch']:.2f} liftError={f['liftError']:.2f} gap={f.get('gap', float('nan')):.1f} shear={np.degrees(f.get('shear', 0)):.1f}deg"
    )
    iss = f.get("issues") or f.get("issueTexts") or []
    for t in iss:
        P_(f"    issue: {t}")
    extra = [k for k in f if "issue" in k.lower() and k not in ("issues", "issueTexts")]
    for k in extra:
        P_(f"    {k}: {f[k]}")
P_("== hairpin reports ==")
if not hairs:
    P_("(none)")
for h in hairs:
    P_(f"hairpin {h['name']}: ring={h['ring']} turn={np.degrees(h['turn']):.1f}deg radiusW={h['radiusW']:.2f} (design {h.get('designRadiusW', float('nan')):.2f}) rolled={h['rolled']}")
P_("== smoothness ==")
P_("  " + "  ".join(f"{k}={v:.3f}" if isinstance(v, float) else f"{k}={v}" for k, v in D["smoothness"].items()))
P_("== edge report ==")
P_("  " + "  ".join(f"{k}={v:.3f}" if isinstance(v, float) else f"{k}={v}" for k, v in D["edge"].items()))
P_("")

# arc length
seg = np.linalg.norm(np.diff(c, axis=0), axis=1)
arc = np.concatenate([[0], np.cumsum(seg)])
P_(f"arc length total={arc[-1]:.1f}px, mean ring spacing={seg.mean():.3f}px")

# clearance
fr = np.array([0, 0.25, 0.5, 0.75, 1.0])
samples = (L[:, None, :] * (1 - fr)[None, :, None] + Rr[:, None, :] * fr[None, :, None]).reshape(-1, 3)
ring_of = np.repeat(np.arange(M), 5)
arc_of = arc[ring_of]
tree = cKDTree(samples)
sep = 3 * W_
thr = 2 * (2 * HT)


def pairs_within(r):
    pr = tree.query_pairs(r, output_type="ndarray")
    if len(pr) == 0:
        return pr, np.array([])
    ok = np.abs(arc_of[pr[:, 0]] - arc_of[pr[:, 1]]) > sep
    pr = pr[ok]
    dd = np.linalg.norm(samples[pr[:, 0]] - samples[pr[:, 1]], axis=1)
    return pr, dd


def px_of(p3):
    return project(np.asarray(p3, float).reshape(-1, 3))[0]


P_(f"== clearance (pairs > 3*width = {sep:.0f}px apart in arc, dist < {thr:.2f}px) ==")
pr, dd = pairs_within(thr)
if len(pr) == 0:
    P_("no hits")
else:
    ra = ring_of[pr[:, 0]]; rb = ring_of[pr[:, 1]]
    lo = np.minimum(ra, rb); hi = np.maximum(ra, rb)
    grid = np.zeros((M, M), bool)
    grid[lo, hi] = True
    lab, n = ndimage.label(ndimage.binary_dilation(grid, iterations=2), structure=np.ones((3, 3)))
    gl = lab[lo, hi]
    groups = []
    for g in range(1, n + 1):
        m = gl == g
        if not m.any():
            continue
        k = np.argmin(np.where(m, dd, np.inf))
        a, b = pr[k]
        mid = (samples[a] + samples[b]) / 2
        groups.append((lo[m].min(), lo[m].max(), hi[m].min(), hi[m].max(), dd[k], px_of(mid), int(m.sum())))
    groups.sort(key=lambda t: t[4])
    for g in groups:
        P_(f"  rings {g[0]}-{g[1]}  vs  {g[2]}-{g[3]}  min={g[4]:.2f}px  at cutout ({g[5][0]:.0f},{g[5][1]:.0f})  pairs={g[6]}")
    P_(f"  {len(groups)} group(s)")
# global minimum
gmin = None
for r in (thr, sep / 3, sep, 3 * sep):
    pr2, dd2 = pairs_within(r)
    if len(dd2):
        k = np.argmin(dd2)
        a, b = pr2[k]
        gmin = (dd2[k], ring_of[a], ring_of[b], px_of((samples[a] + samples[b]) / 2))
        break
if gmin:
    P_(f"  global min non-adjacent distance = {gmin[0]:.2f}px between rings {gmin[1]} and {gmin[2]} at cutout ({gmin[3][0]:.0f},{gmin[3][1]:.0f})")
else:
    P_("  global min: none found within 3*sep")
P_("")

# screen crossings
P_(f"== screen crossings (centreline, cutout px; rings > 2*width = {2*W_:.0f}px apart in arc) ==")
A = pC[:-1]; Bp = pC[1:]
d_ = Bp - A
hits = []
for i in range(nq):
    j = np.arange(i + 1, nq)
    j = j[np.abs(arc[j] - arc[i]) > 2 * W_]
    if len(j) == 0:
        continue
    r = d_[i]; s = d_[j]
    den = r[0] * s[:, 1] - r[1] * s[:, 0]
    qp = A[j] - A[i]
    with np.errstate(divide="ignore", invalid="ignore"):
        t = (qp[:, 0] * s[:, 1] - qp[:, 1] * s[:, 0]) / den
        u = (qp[:, 0] * r[1] - qp[:, 1] * r[0]) / den
    ok = (np.abs(den) > 1e-12) & (t >= 0) & (t < 1) & (u >= 0) & (u < 1)
    for jj, tt, uu in zip(j[ok], t[ok], u[ok]):
        hits.append((i, int(jj), float(tt), float(uu)))
# merge hits within 3 rings (both indices)
hits.sort()
clusters = []
for h in hits:
    for cl in clusters:
        if abs(cl[0][0] - h[0]) <= 3 and abs(cl[0][1] - h[1]) <= 3:
            cl.append(h)
            break
    else:
        clusters.append([h])
for cl in clusters:
    i, j, t, u = cl[len(cl) // 2]
    pi = c[i] + t * (c[i + 1] - c[i]); pj = c[j] + u * (c[j + 1] - c[j])
    di = np.linalg.norm(pi - cam); dj = np.linalg.norm(pj - cam)
    xy = A[i] + t * d_[i]
    front_r = i if di < dj else j
    P_(f"  ({xy[0]:.0f},{xy[1]:.0f})  ring {i}{'/'+str(cl[-1][0]) if cl[-1][0]!=i else ''} x ring {j}{'/'+str(cl[-1][1]) if cl[-1][1]!=j else ''}  front=ring {front_r}  depth gap={abs(di-dj):.1f}px")
P_(f"  {len(clusters)} crossing(s)")

txt = "\n".join(out)
open(os.path.join(d_dir, "metrics.txt"), "w").write(txt + "\n")
print(txt)

# ---- sheet
def tile(path, label, w, h):
    im = Image.open(path).convert("RGB")
    s = min(w / im.width, h / im.height)
    im = im.resize((max(1, int(im.width * s)), max(1, int(im.height * s))), Image.LANCZOS)
    t = Image.new("RGB", (w, h + 24), (24, 24, 24))
    t.paste(im, ((w - im.width) // 2, 24))
    dr = ImageDraw.Draw(t)
    dr.text((6, 5), label, font=font(14), fill=(255, 255, 255))
    return t


CWt, CHt = 880, 852
sheet = Image.new("RGB", (CWt * 2, (CHt + 24) * 2), (24, 24, 24))
for k, (fn, lb) in enumerate([("front.png", "front (mockup overlay)"), ("front_plain.png", "front plain"), ("side.png", "side (z right = camera)"), ("top.png", "top (z down = camera)")]):
    sheet.paste(tile(os.path.join(d_dir, fn), lb, CWt, CHt), ((k % 2) * CWt, (k // 2) * (CHt + 24)))
sheet.save(os.path.join(d_dir, "sheet.png"))
