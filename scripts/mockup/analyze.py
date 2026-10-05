#!/usr/bin/env python3
"""Mockup analysis: ribbon/text masks, shading classes, skeleton graph, review sheet.

Usage: .venv/bin/python analyze.py [desktop|mobile ...]
"""
import warnings
warnings.filterwarnings("ignore")
import json
import os
import sys
from collections import defaultdict

import cv2
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage.morphology import skeletonize, remove_small_objects, remove_small_holes

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
REF = os.path.join(ROOT, "public", "lab", "ref")
OUT = ("/private/tmp/claude-501/-Users-ashmitkhurana-Development-studio-portfolio/"
       "428f1961-b6ad-4758-ba30-ff5eb1800006/scratchpad/fit")

# ---------------------------------------------------------------- parameters
PARAMS = {
    "text": {"s_max": 0.12, "v_min": 0.80},
    # ribbon: hue 2..45 deg, sat > 0.35, val > 0.10 (floor glow is rejected by
    # V_GLOW_MIN, a second value floor that only applies to desaturated-dark px)
    "ribbon": {"h_min": 2.0, "h_max": 45.0, "s_min": 0.35, "v_min": 0.10},
    "text_dilate_px": 3,
    "highlight_s_min": 0.17,
    "floor_v_min": 0.40,
    "topo_pad_px": 20,
    "dark_comp_vmean": 0.19,
    "edge_sigma": 1.2,
    "edge_grad": 0.035,
    "seed_v": 0.45,
    "ring_sharp": 0.55,
    "min_component_frac": 0.001,
    "spur_px": 25,
    "resample_px": 6,
    "endpoint_touch_px": 6,
    "face_bright_v": 0.55,
    "face_dark_v": 0.30,
}

# Exclusion rectangles (x0, y0, x1, y1) in image pixels.
EXCLUDE = {
    "desktop": {
        "logo_AK": (45, 15, 135, 85),
        "nav_links": (1200, 20, 1640, 80),
        "subtitle_text": (55, 615, 580, 705),
        "scroll_label": (55, 810, 270, 890),
        "domain_label": (1385, 845, 1625, 882),
    },
    "mobile": {
        "logo_AK": (40, 40, 145, 112),
        "nav_buttons": (620, 35, 820, 120),
        "subtitle_text": (40, 1295, 530, 1455),
        "scroll_label": (40, 1600, 295, 1630),
        "scroll_arrow": (40, 1645, 95, 1695),
    },
}

# Floor-glow zone (x0, y0, x1, y1): stricter V floor applies inside (see PARAMS floor_v_min).
FLOOR_ZONE = {"desktop": [(0, 758, 1330, 941), (1330, 782, 1672, 941)],
              "mobile": [(0, 1245, 852, 1846)]}

# Topology regions in desktop 1672x941 coordinates; list of rects per label.
TOPO = {
    "T1": [(780, 80, 940, 460)],
    "T2": [(900, 70, 1040, 115)],
    "T3": [(1000, 100, 1140, 440), (1140, 380, 1265, 485)],
    "T4": [(1150, 470, 1610, 790)],
    "T5": [(1150, 170, 1600, 400)],
    "T6": [(740, 335, 1100, 430)],
    "T7": [(620, 430, 760, 700)],
    "T8": [(630, 680, 1150, 805)],
    "T9": [(480, 780, 625, 941)],
}


def load(name):
    im = Image.open(os.path.join(REF, f"hero-{name}.webp")).convert("RGB")
    return np.array(im)


def hsv_of(rgb):
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV_FULL).astype(np.float32) / 255.0
    return hsv[..., 0] * 360.0, hsv[..., 1], hsv[..., 2]


# ---------------------------------------------------------------- masks
def make_masks(rgb, name):
    H, W = rgb.shape[:2]
    h, s, v = hsv_of(rgb)
    p = PARAMS
    text = (s < p["text"]["s_max"]) & (v > p["text"]["v_min"])
    excl = np.zeros((H, W), bool)
    for (x0, y0, x1, y1) in EXCLUDE[name].values():
        excl[y0:y1, x0:x1] = True

    # text: clean, drop chrome
    text_raw = text.copy()
    text &= ~excl
    text = remove_small_objects(text, int(0.0005 * H * W))
    text = ndi.binary_closing(text, np.ones((3, 3)))
    text = remove_small_holes(text, 200)

    r = p["ribbon"]
    colour_ok = (h >= r["h_min"]) & (h <= r["h_max"]) & (s > r["s_min"]) & (v > r["v_min"])
    # specular highlights are cream-yellow (H up to ~55, S 0.2..0.35) and would otherwise
    # punch holes in the ribbon; text is S < 0.12 so the two stay separable.
    hl = (h >= 20) & (h <= 60) & (s >= p["highlight_s_min"]) & (v >= 0.85)
    colour_ok |= hl
    colour_ok &= ~excl
    # kill the antialiased fringe where letters meet the ribbon, and any text px
    tdil = ndi.binary_dilation(text_raw, iterations=p["text_dilate_px"])
    colour_ok &= ~tdil
    # floor-glow zone: below the contact line the glow (V <= ~0.38, S <= ~0.78) is the
    # same colour as the dark ribbon faces, so here only clearly lit ribbon passes.
    zone = np.zeros((H, W), bool)
    for fz in FLOOR_ZONE[name]:
        zone[fz[1]:fz[3], fz[0]:fz[2]] = True
    colour_ok &= ~(zone & (v < p["floor_v_min"]))

    # --- floor-glow rejection -------------------------------------------------
    # Colour alone cannot separate the soft orange floor glow from the dark brown
    # inner faces of the ribbon (same H/S/V range). The ribbon has crisp silhouette
    # edges; the glow is a smooth gradient. So: split colour_ok at strong V
    # gradients, then keep only components that either contain bright face pixels
    # or are enclosed by crisp edges.
    vs = cv2.GaussianBlur(v, (0, 0), p["edge_sigma"])
    gx = cv2.Sobel(vs, cv2.CV_32F, 1, 0, ksize=3) / 8.0
    gy = cv2.Sobel(vs, cv2.CV_32F, 0, 1, ksize=3) / 8.0
    grad = np.hypot(gx, gy)
    edge = grad > p["edge_grad"]
    core = colour_ok & ~ndi.binary_dilation(edge, iterations=1)
    lab, n = ndi.label(core, structure=np.ones((3, 3)))
    keep = np.zeros(n + 1, bool)
    idx = np.arange(1, n + 1)
    area = ndi.sum(np.ones_like(lab), lab, idx)
    vmax = ndi.maximum(v, lab, idx)
    vmean = ndi.mean(v, lab, idx)
    ring_grad = np.zeros(n)
    # boundary sharpness: mean of the strong-edge indicator in a ring around each comp
    sharp = (grad > p["edge_grad"]).astype(np.float32)
    k_ring = np.ones((7, 7), np.uint8)
    objs = ndi.find_objects(lab)
    for i, sl in enumerate(objs):
        if sl is None or area[i] < 40:
            continue
        y0, y1 = max(0, sl[0].start - 5), min(H, sl[0].stop + 5)
        x0, x1 = max(0, sl[1].start - 5), min(W, sl[1].stop + 5)
        m = (lab[y0:y1, x0:x1] == i + 1).astype(np.uint8)
        ring = cv2.dilate(m, k_ring) & ~cv2.dilate(m, np.ones((3, 3), np.uint8))
        ring = ring.astype(bool)
        # ignore ring pixels that are dark background-like (below colour floor): they
        # still carry the edge; so just average the sharp indicator
        ring_grad[i] = sharp[y0:y1, x0:x1][ring].mean() if ring.any() else 0
    for i in range(n):
        if area[i] < 40:
            continue
        if vmax[i] >= p["seed_v"] or (ring_grad[i] >= p["ring_sharp"] and vmean[i] >= p["dark_comp_vmean"]):
            keep[i + 1] = True
    rib = keep[lab]
    if os.environ.get('DBG'):
        for i in range(n):
            if area[i] > 800 and not keep[i+1]:
                ys, xs = np.nonzero(lab == i + 1)
                print('comp', i+1, 'area', int(area[i]), 'bbox', xs.min(), ys.min(), xs.max(), ys.max(), 'vmax %.2f ring %.2f keep %s' % (vmax[i], ring_grad[i], keep[i+1]))
    # give the silhouette its edge band back (edge px adjacent to kept comps)
    rib = ndi.binary_dilation(rib, iterations=3) & colour_ok & ~(
        ndi.binary_dilation(core & ~rib, iterations=3) & ~ndi.binary_dilation(rib, iterations=1)) | rib
    k5 = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    rib = cv2.morphologyEx(rib.astype(np.uint8), cv2.MORPH_CLOSE, k5)
    rib = cv2.morphologyEx(rib, cv2.MORPH_OPEN, k5).astype(bool)
    rib &= ~tdil
    rib = remove_small_holes(rib, 600)
    rib = remove_small_objects(rib, int(p["min_component_frac"] * H * W))
    rib &= ~excl
    return text, rib, excl, (h, s, v)


def shading_classes(rib, v):
    p = PARAMS
    cls = np.zeros(rib.shape, np.uint8)  # 0 none, 1 bright, 2 mid, 3 dark
    cls[rib & (v >= p["face_bright_v"])] = 1
    cls[rib & (v < p["face_bright_v"]) & (v >= p["face_dark_v"])] = 2
    cls[rib & (v < p["face_dark_v"])] = 3
    return cls


CLS_COL = {1: (255, 224, 70), 2: (255, 120, 20), 3: (40, 90, 255)}


# ---------------------------------------------------------------- skeleton graph
OFFS = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def neighbor_count(sk):
    k = np.ones((3, 3), int)
    k[1, 1] = 0
    return ndi.convolve(sk.astype(int), k, mode="constant")


def decompose(sk):
    """Split skeleton into branch pixel sets and junction clusters."""
    nc = neighbor_count(sk)
    junc = sk & (nc >= 3)
    jd = ndi.binary_dilation(junc, structure=np.ones((3, 3))) & sk
    jl, jn = ndi.label(jd, structure=np.ones((3, 3)))
    rest = sk & ~jd
    bl, bn = ndi.label(rest, structure=np.ones((3, 3)))
    return nc, jl, jn, bl, bn


def prune(sk, spur):
    sk = sk.copy()
    for _ in range(40):
        nc, jl, jn, bl, bn = decompose(sk)
        endpoints = sk & (nc == 1)
        changed = False
        if bn == 0:
            break
        sizes = ndi.sum(np.ones_like(bl), bl, index=np.arange(1, bn + 1))
        has_end = ndi.maximum(endpoints.astype(np.uint8), bl, index=np.arange(1, bn + 1))
        jtouch = ndi.maximum(
            ndi.binary_dilation(jl > 0, structure=np.ones((3, 3)), iterations=2).astype(np.uint8),
            bl, index=np.arange(1, bn + 1))
        for i in range(bn):
            if has_end[i] and jtouch[i] and sizes[i] < spur:
                sk[bl == i + 1] = False
                changed = True
        if not changed:
            break
        sk = skeletonize(sk)
    return sk


def trace_order(pix_mask):
    """Order pixels of a thin (8-connected) path. Returns list of (y, x)."""
    ys, xs = np.nonzero(pix_mask)
    pts = set(zip(ys.tolist(), xs.tolist()))
    if not pts:
        return []
    def nbrs(p):
        return [(p[0] + dy, p[1] + dx) for dy, dx in OFFS if (p[0] + dy, p[1] + dx) in pts]
    ends = [p for p in pts if len(nbrs(p)) <= 1]
    start = min(ends) if ends else min(pts)
    order, seen, cur = [start], {start}, start
    while True:
        nx = [q for q in nbrs(cur) if q not in seen]
        if not nx:
            break
        # prefer 4-neighbours
        nx.sort(key=lambda q: abs(q[0] - cur[0]) + abs(q[1] - cur[1]))
        cur = nx[0]
        order.append(cur)
        seen.add(cur)
    return order


def resample(poly, step):
    """poly: Nx2 array of (x, y). Resample by arclength."""
    poly = np.asarray(poly, float)
    if len(poly) < 2:
        return poly, 0.0
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(poly, axis=0).T))]
    L = d[-1]
    n = max(2, int(round(L / step)) + 1)
    t = np.linspace(0, L, n)
    return np.c_[np.interp(t, d, poly[:, 0]), np.interp(t, d, poly[:, 1])], float(L)


def build_graph(rib, text, name):
    p = PARAMS
    H, W = rib.shape
    sk = skeletonize(rib)
    sk = prune(sk, p["spur_px"])
    dt = ndi.distance_transform_edt(rib)
    dtext = ndi.distance_transform_edt(~text)
    border_d = np.minimum.reduce([
        np.broadcast_to(np.arange(W)[None, :], (H, W)),
        np.broadcast_to((W - 1 - np.arange(W))[None, :], (H, W)),
        np.broadcast_to(np.arange(H)[:, None], (H, W)),
        np.broadcast_to((H - 1 - np.arange(H))[:, None], (H, W)),
    ]).astype(float)

    nc, jl, jn, bl, bn = decompose(sk)
    endpoints_mask = sk & (nc == 1)

    nodes = {}  # id -> dict
    # junction nodes
    for j in range(1, jn + 1):
        ys, xs = np.nonzero(jl == j)
        nodes[f"J{j}"] = {"id": f"J{j}", "kind": "junction",
                          "xy": [float(xs.mean()), float(ys.mean())]}
    jl_d = ndi.grey_dilation(jl, size=(5, 5))  # label of nearby junction

    branches = []
    for b in range(1, bn + 1):
        m = bl == b
        order = trace_order(m)
        if len(order) < 3:
            continue
        poly = np.array([(x, y) for (y, x) in order], float)
        ends = [tuple(poly[0]), tuple(poly[-1])]
        end_ids = []
        for k, (ex, ey) in enumerate((poly[0], poly[-1])):
            ix, iy = int(ex), int(ey)
            # attach to junction cluster if adjacent
            y0, y1, x0, x1 = max(0, iy - 3), iy + 4, max(0, ix - 3), ix + 4
            near = jl[y0:y1, x0:x1]
            near = near[near > 0]
            if len(near):
                jid = f"J{int(np.bincount(near).argmax())}"
                end_ids.append(jid)
                jx, jy = nodes[jid]["xy"]
                poly = np.vstack([[jx, jy], poly]) if k == 0 else np.vstack([poly, [jx, jy]])
            else:
                nid = f"E{len([n for n in nodes if n.startswith('E')]) + 1}"
                r = float(dt[iy, ix])
                tex = bool(dtext[iy, ix] <= r + p["endpoint_touch_px"])
                brd = bool(border_d[iy, ix] <= r + p["endpoint_touch_px"])
                nodes[nid] = {"id": nid, "kind": "endpoint", "xy": [float(ex), float(ey)],
                              "radius": r, "occluded_by_text": tex, "exits_frame": brd}
                end_ids.append(nid)
        # re-orient: poly[0] should correspond to end_ids[0] (it does by construction)
        pts, L = resample(poly, p["resample_px"])
        # width samples from dt along the ORIGINAL (unresampled) skeleton pixels
        wx = np.clip(np.round(pts[:, 0]).astype(int), 0, W - 1)
        wy = np.clip(np.round(pts[:, 1]).astype(int), 0, H - 1)
        # snap to local max of dt in 3x3 (skeleton is 1px off after resampling)
        widths = []
        for x, y in zip(wx, wy):
            patch = dt[max(0, y - 2):y + 3, max(0, x - 2):x + 3]
            widths.append(2.0 * float(patch.max()))
        branches.append({
            "id": len(branches) + 1,
            "points": [[round(float(x), 1), round(float(y), 1)] for x, y in pts],
            "widths": [round(w, 1) for w in widths],
            "mean_width": round(float(np.mean(widths)), 1),
            "length": round(L, 1),
            "nodes": end_ids,
        })

    # drop junction nodes not referenced by >=1 branch
    used = {n for b in branches for n in b["nodes"]}
    nodes = {k: v for k, v in nodes.items() if k in used}
    return sk, dt, branches, nodes


def label_branches(branches):
    def in_rect(pt, r):
        pd = PARAMS["topo_pad_px"]
        return r[0] - pd <= pt[0] <= r[2] + pd and r[1] - pd <= pt[1] <= r[3] + pd
    area = {t: sum((r[2] - r[0]) * (r[3] - r[1]) for r in rs) for t, rs in TOPO.items()}
    for b in branches:
        counts = {}
        for t, rs in TOPO.items():
            counts[t] = sum(any(in_rect(p, r) for r in rs) for p in b["points"])
        n = len(b["points"])
        fr = {t: c / n for t, c in counts.items() if c > 0}
        if fr:
            best = max(fr, key=lambda t: (fr[t], -area[t]))
        else:
            cx, cy = np.mean(b["points"], axis=0)
            def dist(t):
                return min(np.hypot(max(r[0] - cx, 0, cx - r[2]), max(r[1] - cy, 0, cy - r[3]))
                           for r in TOPO[t])
            best = min(TOPO, key=dist)
        b["T"] = best
        b["T_fractions"] = {t: round(f, 2) for t, f in sorted(fr.items(), key=lambda kv: -kv[1])}


# ---------------------------------------------------------------- drawing
def branch_colour(i):
    hue = (i * 0.61803398875) % 1.0
    c = cv2.cvtColor(np.uint8([[[hue * 179, 255, 255]]]), cv2.COLOR_HSV2RGB)[0, 0]
    return tuple(int(x) for x in c)


def put_label(img, text, org, col, scale, thick=2):
    cv2.putText(img, text, org, cv2.FONT_HERSHEY_SIMPLEX, scale, (0, 0, 0), thick + 3, cv2.LINE_AA)
    cv2.putText(img, text, org, cv2.FONT_HERSHEY_SIMPLEX, scale, col, thick, cv2.LINE_AA)


def review_sheet(rgb, cls, branches, nodes, name, labelled):
    H, W = rgb.shape[:2]
    panel1 = rgb.copy()
    dim = (rgb.astype(np.float32) * 0.25).astype(np.uint8)
    for c, col in CLS_COL.items():
        dim[cls == c] = col
    panel2 = dim
    panel3 = (rgb.astype(np.float32) * 0.35).astype(np.uint8)
    sc = max(0.5, W / 1672.0 * 0.8)
    for b in branches:
        col = branch_colour(b["id"])
        pts = np.array(b["points"], np.int32).reshape(-1, 1, 2)
        cv2.polylines(panel3, [pts], False, col, max(2, int(3 * W / 1672)), cv2.LINE_AA)
    placed = []

    def free(r):
        return all(r[2] < q[0] or r[0] > q[2] or r[3] < q[1] or r[1] > q[3] for q in placed)

    for b in sorted(branches, key=lambda b: -b["length"]):
        pts = b["points"]
        txt = f"#{b['id']}"
        if labelled:
            txt += f" {b['T']}"
        txt += f" w{b['mean_width']:.0f}"
        if b["length"] < 40:
            txt = f"#{b['id']}"
        sc2 = sc if b["length"] >= 40 else sc * 0.8
        (tw, th), _ = cv2.getTextSize(txt, cv2.FONT_HERSHEY_SIMPLEX, sc2, 2)
        done = False
        for frac in (0.5, 0.35, 0.65, 0.2, 0.8, 0.5):
            mid = pts[int(len(pts) * frac)]
            for dx, dy in ((8, -8), (8, th + 8), (-tw - 8, -8), (-tw - 8, th + 8), (-tw // 2, -22), (-tw // 2, th + 22)):
                x, y = int(mid[0]) + dx, int(mid[1]) + dy
                r = (x - 2, y - th - 2, x + tw + 2, y + 4)
                if free(r) and r[0] > 0 and r[2] < W:
                    placed.append(r)
                    put_label(panel3, txt, (x, y), (255, 255, 255), sc2, 2)
                    cv2.line(panel3, (int(mid[0]), int(mid[1])), (x + tw // 2, y - th // 2), (255, 255, 255), 1, cv2.LINE_AA)
                    done = True
                    break
            if done:
                break
        if not done:
            put_label(panel3, txt, (int(mid[0]) + 8, int(mid[1]) - 8), (255, 255, 255), sc2, 2)
    for n in nodes.values():
        x, y = int(n["xy"][0]), int(n["xy"][1])
        if n["kind"] == "junction":
            cv2.circle(panel3, (x, y), 9, (255, 255, 255), 2, cv2.LINE_AA)
            cv2.drawMarker(panel3, (x, y), (255, 255, 255), cv2.MARKER_CROSS, 14, 2)
        elif n["occluded_by_text"]:
            cv2.rectangle(panel3, (x - 9, y - 9), (x + 9, y + 9), (255, 0, 255), 3)
            put_label(panel3, "occl", (x + 12, y + 18), (255, 0, 255), sc * 0.8, 2)
        elif n["exits_frame"]:
            cv2.rectangle(panel3, (x - 9, y - 9), (x + 9, y + 9), (0, 255, 255), 3)
            put_label(panel3, "exit", (x + 12, y + 18), (0, 255, 255), sc * 0.8, 2)
        else:
            cv2.circle(panel3, (x, y), 7, (255, 60, 60), -1, cv2.LINE_AA)
    for panel, t in ((panel1, "original"), (panel2, "shading: bright/mid/dark"), (panel3, "skeleton")):
        put_label(panel, t, (10, H - 12), (255, 255, 255), sc, 2)
    return np.hstack([panel1, panel2, panel3])


def qa_crops(rgb, rib, out_dir, name):
    cnt, _ = cv2.findContours(rib.astype(np.uint8), cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
    ov = rgb.copy()
    cv2.drawContours(ov, cnt, -1, (0, 255, 255), 1)
    H, W = rgb.shape[:2]
    if name == "desktop":
        boxes = [(640, 60, 1240, 460), (1150, 150, 1650, 520), (560, 560, 1200, 941)]
    else:
        boxes = [(0, 520, 500, 900), (350, 640, 852, 1260), (0, 1100, 852, 1846)]
    for i, (x0, y0, x1, y1) in enumerate(boxes):
        crop = ov[y0:y1, x0:x1]
        crop = cv2.resize(crop, None, fx=2, fy=2, interpolation=cv2.INTER_NEAREST)
        Image.fromarray(crop).save(os.path.join(out_dir, f"qa_edge_{i + 1}.png"))


def main():
    names = sys.argv[1:] or ["desktop", "mobile"]
    for name in names:
        out = os.path.join(OUT, name)
        os.makedirs(out, exist_ok=True)
        rgb = load(name)
        H, W = rgb.shape[:2]
        text, rib, excl, (h, s, v) = make_masks(rgb, name)
        cls = shading_classes(rib, v)

        Image.fromarray((text * 255).astype(np.uint8)).save(f"{out}/text_mask.png")
        Image.fromarray((rib * 255).astype(np.uint8)).save(f"{out}/ribbon_mask.png")
        Image.fromarray((excl * 255).astype(np.uint8)).save(f"{out}/exclusion_mask.png")
        col = np.zeros((H, W, 3), np.uint8)
        for c, cc in CLS_COL.items():
            col[cls == c] = cc
        Image.fromarray(col).save(f"{out}/shading_classes.png")
        Image.fromarray((np.where(rib, v, 0) * 255).astype(np.uint8)).save(f"{out}/ribbon_V.png")

        sk, dt, branches, nodes = build_graph(rib, text, name)
        labelled = name == "desktop"
        if labelled:
            label_branches(branches)
        sheet = review_sheet(rgb, cls, branches, nodes, name, labelled)
        Image.fromarray(sheet).save(f"{out}/review_sheet.png")
        qa_crops(rgb, rib, out, name)

        data = {
            "image": name, "size": {"width": W, "height": H},
            "params": PARAMS,
            "floor_zones": [list(z) for z in FLOOR_ZONE[name]],
            "exclusion_rects": {k: list(v_) for k, v_ in EXCLUDE[name].items()},
            "topology_regions": {k: [list(r) for r in v_] for k, v_ in TOPO.items()} if labelled else None,
            "class_pixel_counts": {"face_bright": int((cls == 1).sum()), "face_mid": int((cls == 2).sum()),
                                   "face_dark": int((cls == 3).sum())},
            "nodes": list(nodes.values()),
            "branches": branches,
        }
        with open(f"{out}/graph.json", "w") as f:
            json.dump(data, f, indent=1)
        print(f"== {name} {W}x{H}: ribbon px={int(rib.sum())} branches={len(branches)} nodes={len(nodes)}")
        for b in branches:
            print(f"  #{b['id']:>2} {b.get('T', '-'):>3} w={b['mean_width']:>6.1f} L={b['length']:>7.1f} "
                  f"nodes={b['nodes']} {b.get('T_fractions', '')}")
        for n in nodes.values():
            if n["kind"] == "endpoint":
                print(f"  {n['id']} @({n['xy'][0]:.0f},{n['xy'][1]:.0f}) occl={n['occluded_by_text']} exit={n['exits_frame']}")


if __name__ == "__main__":
    main()
