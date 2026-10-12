#!/usr/bin/env python3
"""R3: lift the signature knot's edges (r3/edges.json, cutout px = hero-mobile px) onto camera rays in the PHONE reference frame (390 x 844 css px;
the mockup is 852 x 1846 = 2.185 x) or, with FRAME=desktop, in the desktop frame (uniform similarity from the phone frame), then write the ruled
variant into lib/ribbon/poses/ak-hero.json.

Usage: ANALYZE_OUT=$SP/r3 FRAME=phone .venv/bin/python lift_sig.py [--pose]
"""
import json, math, os, subprocess, sys
os.environ["ROTO_SRC"] = "sig"
import numpy as np
from scipy import ndimage as ndi
from scipy.interpolate import PchipInterpolator
sys.path.insert(0, os.path.dirname(__file__))
import edges as ed
import lift as L

OUT = ed.OUTD
ROOT = ed.ROOT
FRAME = os.environ.get("FRAME", "phone")
INSET = float(os.environ.get("INSET", "0"))
SX, SY = 852.0 / 390.0, 1846.0 / 844.0
FOV = 26.4
if FRAME == "phone":
    VW, VH = 390.0, 844.0
    ANCHOR = dict(left=20.0, top=118.15625, width=347.21875, height=154.1875)
    PLANES = (-14.0, 14.0)          # +-0.25 cap heights at the phone size
    M = np.array([[1 / SX, 0, 0], [0, 1 / SY, 0]])          # cutout px -> css px
else:
    VW, VH = 1672.0, 941.0
    ANCHOR = L.ANCHOR
    PLANES = (-37.0, 37.0)
    # desktop: uniform scale + translate chosen so the knot spans x 860..1600 and sits with the apex near the T (see DESKTOP below)
    DS = 740.0 / 799.0                       # knot (x 41..840 in mockup px) spans x 860..1600
    DTX, DTY = 860.0 - 41.0 * DS, 75.0 - 550.0 * DS     # apex top (y 550) at y 75
    M = None
L.VW, L.VH, L.FOV = VW, VH, FOV
L.D = (VH / 2) / math.tan(math.radians(FOV) / 2)

# centre depth anchors (world px at the phone scale; desktop multiplies by DZ). Right leg frontmost; see the topology notes in trace.py.
Z = [
    ("tail_a", 150), ("tail_b", 110), ("S_turn", 60), ("band_mid", 25), ("fold_left", 0), ("leg_behind_arch", -45), ("A_apex", -8),
    ("rleg_mid", 60), ("K_bottom", 55), ("ret_behind", -45), ("arch_top", -4), ("curl_left", -10), ("thin_tip", -80),
    ("cross_behind", -75), ("K_top_tip", -60), ("end2", -110),
]
if FRAME != "phone":
    Z = [(n, z * 2.02) for n, z in Z]
if os.environ.get("ZOVR"):
    _o = json.loads(os.environ["ZOVR"]); Z = [(n, _o.get(n, z)) for n, z in Z]
# face visibility spans (designer): face A visible on these arcs, face B elsewhere
A_SPANS = [("tail_a", "S_turn"), ("fold_left", "A_apex"), ("K_top_tip", "end2")]


def main(write_pose=False):
    E = json.load(open(os.environ.get("EDGESFILE", OUT + "/edges.json")))
    cl = json.load(open(ed.FIT + "/trace.json"))
    t = np.array(E["s"])
    N = len(t)
    if FRAME == "phone":
        xf = lambda a: np.asarray(a, float) @ M[:, :2].T
    else:
        xf = lambda a: np.asarray(a, float) * DS + np.array([DTX, DTY])
    E1, E2 = xf(E["edge1"]), xf(E["edge2"])
    if INSET > 0:
        u = E2 - E1
        u = u / np.maximum(np.hypot(u[:, 0], u[:, 1]), 1e-6)[:, None]
        E1, E2 = E1 + u * INSET, E2 - u * INSET
    Qs, tt, vis, P_, s_orig = ed.prep_trace(cl)
    ext = 200
    arc = {nm: float(s_orig[ext + i]) for nm, i in cl["anchors"].items()}
    xs = [float(t[0])]; zs = [Z[0][1] + 60.0]
    for nm, z in Z:
        a = arc[nm]
        if a <= xs[-1]:
            a = xs[-1] + 1.0
        xs.append(a); zs.append(float(z))
    if xs[-1] < t[-1]:
        xs.append(float(t[-1])); zs.append(zs[-1])
    zc = PchipInterpolator(xs, zs)(np.clip(t, xs[0], xs[-1]))

    tw = np.zeros(N, bool)
    for w in E["turn_windows"]:
        if "i0" in w:
            tw[w["i0"]:w["i1"] + 1] = True
    trusted = np.array(E["trusted"], bool)
    obs = np.full(N, -1.0)
    for a_n, b_n in A_SPANS:
        obs[(t >= arc[a_n]) & (t <= arc[b_n])] = 1.0

    # ---- (1) 2D face map: vis(s) = sign(cross2D(T_proj, p_e2 - p_e1)) depends on the physical edge labels only, not on the depth sign ----
    cen = 0.5 * (E1 + E2)
    Tp = np.gradient(cen, axis=0)
    rul = E2 - E1
    cr2 = Tp[:, 0] * rul[:, 1] - Tp[:, 1] * rul[:, 0]
    vis2 = np.where(cr2 > 0, 1, -1)
    runs2 = ed.spans(np.r_[False, vis2[1:] != vis2[:-1]]) if False else None
    best_fs = max((1, -1), key=lambda f: np.mean((f * vis2) == obs))
    agree = float(np.mean((best_fs * vis2) == obs))
    print("2D face map: sign flips of cross2D(T, e2 - e1) at samples %s ; faceSign %+d ; agreement with the designer's spans %.3f" % (
        [int(i) for i in np.nonzero(vis2[1:] != vis2[:-1])[0] + 1], best_fs, agree))
    for nm_, tag in (("S_turn", "A -> B"), ("fold_left", "B -> A"), ("A_apex", "A -> B"), ("K_top_tip", "B -> A (fold-back)")):
        i = int(np.searchsorted(t, arc[nm_])); lo, hi = max(0, i - 50), min(N, i + 50)
        j = lo + int(np.argmin(np.hypot(*(rul[lo:hi]).T)))
        print("   required flip %-18s near %-10s min projected ruling %.0f px at screen %s (needs ~0 for a flip); 2D sign here %+d" % (
            tag, nm_, np.hypot(*rul[j]), np.round(cen[j]).astype(int).tolist(), vis2[j]))
    FS = best_fs

    # ---- (2) true width: 1.06 x the largest projected ruling over the face-on spans (ruling ~ perpendicular to the tangent) ----
    l0 = np.linalg.norm(L._lift_vec(E2, zc) - L._lift_vec(E1, zc), axis=1)
    cosr = np.abs((Tp * rul).sum(1)) / np.maximum(np.hypot(*Tp.T) * np.hypot(*rul.T), 1e-9)
    faceon = trusted & ~tw & (t >= arc["band_mid"]) & (cosr < 0.35)
    WFIX = 1.06 * float(np.percentile(l0[faceon], 99))
    print("true width W = %.2f world px (1.06 x p99 of the projected rulings over %d face-on samples)" % (WFIX, faceon.sum()))

    # ---- (3) depth: dz from the (smoothed) projected widths, sign by continuity; low-passed with support >= 1 W (3 samples inside fold windows) ----
    from scipy import ndimage as ndi2
    sigs = float(os.environ.get("DZSIG", "12"))
    def build(zc_):
        Wt_, sg_, flips_, Lw_, Rw_, dzs_, gr_, ln_ = L.solve_rings(E1, E2, t, zc_, tw, trusted, 90, obs=None, fs=FS, lam=0.0, verbose=False, Wfix=WFIX)
        wmask = ndi2.gaussian_filter1d(tw.astype(float), 4.0)
        wmask = np.minimum(1.0, wmask * 1.5)
        dz_far = ndi2.gaussian_filter1d(dzs_, sigs, mode="nearest")
        dz_win = ndi2.gaussian_filter1d(dzs_, 3.0, mode="nearest")
        dz_ = dz_far * (1 - wmask) + dz_win * wmask
        Lw_ = L._lift_vec(E1, zc_ - dz_ / 2); Rw_ = L._lift_vec(E2, zc_ + dz_ / 2)
        return Wt_, sg_, flips_, Lw_, Rw_, dz_, gr_
    zc0 = zc.copy()
    Wt, sg, flips, Lw, Rw, dzs, gr = build(zc)
    ln = np.linalg.norm(Rw - Lw, axis=1)
    print("dz smoothing sigma %g samples; ruling length %.2f..%.2f W; dz=0 samples %d of %d" % (sigs, ln.min() / Wt, ln.max() / Wt, gr.sum(), N))

    # ---- (4) clearance: smooth z bumps (sigma 0.7 W of arc, support >= 1.5 W) on the strand behind each offending pair, along the camera rays ----
    THICK = Wt / 11.0
    ds_ = np.median(np.hypot(*np.diff(cen, axis=0).T))
    sig_b = 0.7 * (WFIX * SX / ds_) if False else 0.7 * 113.0 / ds_
    from scipy.spatial import cKDTree
    def gate(Lw_, Rw_):
        fr7 = np.linspace(0, 1, 7)
        pts3 = np.array([[Lw_[i] * (1 - f) + Rw_[i] * f for f in fr7] for i in range(N)]).reshape(-1, 3)
        ring = np.repeat(np.arange(N), len(fr7))
        arcw = np.repeat(np.r_[0, np.cumsum(np.linalg.norm(np.diff(0.5 * (Lw_ + Rw_), axis=0), axis=1))], len(fr7))
        pairs = []; worst = 1e9
        for a_, b_ in cKDTree(pts3).query_pairs(2.0 * THICK + 4.0):
            if abs(arcw[a_] - arcw[b_]) < 1.5 * Wt:
                continue
            d_ = float(np.linalg.norm(pts3[a_] - pts3[b_]))
            worst = min(worst, d_)
            if d_ < 2.0 * THICK:
                pairs.append((int(ring[a_]), int(ring[b_]), d_))
        return pairs, worst
    bump = np.zeros(N)
    ORDER = {}
    idx = np.arange(N)
    for it in range(50):
        pairs, worst = gate(Lw, Rw)
        nb = len(set([p[0] for p in pairs] + [p[1] for p in pairs]))
        if it % 30 == 0 or not pairs:
            print("   clearance iter %d: min %.1f (need %.1f), %d rings below" % (it, worst, 2 * THICK, nb))
        if not pairs:
            break
        zmid = 0.5 * (Lw[:, 2] + Rw[:, 2])
        add = np.zeros(N)
        seen = set()
        for ra, rb, d_ in pairs:
            k0 = (min(ra, rb) // 15, max(ra, rb) // 15)
            if k0 not in ORDER:
                ORDER[k0] = (ra < rb) == (zmid[ra] < zmid[rb])      # True: the lower-index ring is the back one (fixed at first sight: no oscillation)
            lo_, hi_ = (min(ra, rb), max(ra, rb)) if ORDER[k0] else (max(ra, rb), min(ra, rb))
            key = (lo_ // 15, hi_ // 15)
            if key in seen:
                continue
            seen.add(key)
            step = 4.0 + 0.25 * (2 * THICK - d_)
            add -= step * np.exp(-0.5 * ((idx - lo_) / sig_b) ** 2)
            add += 0.4 * step * np.exp(-0.5 * ((idx - hi_) / sig_b) ** 2)
        bump = np.clip(bump + add, -120.0, 60.0)
        Wt, sg, flips, Lw, Rw, dzs, gr = build(zc0 + bump)
        zc = zc0 + bump
    ln = np.linalg.norm(Rw - Lw, axis=1)
    print("clearance bumps: max |bump| %.0f px" % np.abs(bump).max())
    Tc = np.gradient(L._lift_vec(0.5 * (E1 + E2), zc), axis=0); Tc /= np.maximum(np.linalg.norm(Tc, axis=1), 1e-9)[:, None]
    Bn = (Rw - Lw) / np.maximum(np.linalg.norm(Rw - Lw, axis=1), 1e-9)[:, None]
    print("face-map agreement (2D rule): %.3f" % agree)
    print("sign flips at samples", flips)
    print("dz = 0 (grown) samples: %d of %d (%.1f %%), max ruling %.2f W; |dz| max %.1f" % (gr.sum(), N, 100 * gr.mean(), ln.max() / Wt, np.abs(dzs).max()))

    # ---- over/under at the crossings (surface depth at the screen point) ----
    def surf_z(p, i0, i1):
        best_, bz = 1e9, None
        for i in range(i0, i1 + 1):
            a, b = E1[i], E2[i]
            d = b - a
            f = np.clip(((p - a) @ d) / max(d @ d, 1e-9), 0, 1)
            q = a + d * f
            dist = np.hypot(*(q - p))
            if dist < best_:
                best_, bz = dist, Lw[i][2] * (1 - f) + Rw[i][2] * f
        return bz, best_
    cr = [("crossbar arch over left leg", (240, 818), "arch_top", "leg_behind_arch"),
          ("right leg over bottom-K return", (505, 886), "rleg_mid", "ret_behind"),
          ("right leg over the thin band crossing", (540, 880), "rleg_mid", "cross_behind"),
          ("right leg over the thin band near the apex junction", (445, 880), "rleg_mid", "ret_behind")]
    ok_all = True
    print("over/under:")
    for nm, p, over, under in cr:
        pp = xf(p)
        res = []
        for an in (over, under):
            c = min(N - 1, int(np.searchsorted(t, arc[an])))
            lo, hi = max(0, c - 40), min(N - 1, c + 40)
            bestr = (1e9, None)
            for i in range(lo, hi + 1):
                z, d = surf_z(pp, i, i)
                if d < bestr[0]:
                    bestr = (d, z)
            res.append(bestr)
        good = res[0][1] is not None and res[1][1] is not None and res[0][1] > res[1][1]
        ok_all &= bool(good)
        print("  %-52s over z %s  under z %s -> %s" % (nm, None if res[0][1] is None else "%.0f" % res[0][1], None if res[1][1] is None else "%.0f" % res[1][1], "OK" if good else "VIOLATED"))
    # right leg frontmost: its surface z vs every other ring within 1.5 W of arc whose projection overlaps
    ia = int(np.searchsorted(t, arc["A_apex"])); ib = int(np.searchsorted(t, arc["K_bottom"]))
    zleg = 0.5 * (Lw[:, 2] + Rw[:, 2])
    print("right-leg centre z range %.0f..%.0f; other strands max centre z (excluding tail) %.0f" % (zleg[ia:ib].min(), zleg[ia:ib].max(),
          max(zleg[int(np.searchsorted(t, arc['fold_left'])):ia].max(), zleg[ib:].max())))
    # ---- clearance gate ----
    THICK = Wt / 11.0
    fr7 = np.linspace(0, 1, 7)
    pts3 = np.array([[Lw[i] * (1 - f) + Rw[i] * f for f in fr7] for i in range(N)]).reshape(-1, 3)
    ring = np.repeat(np.arange(N), len(fr7))
    arcw = np.repeat(np.r_[0, np.cumsum(np.linalg.norm(np.diff(0.5 * (Lw + Rw), axis=0), axis=1))], len(fr7))
    from scipy.spatial import cKDTree
    tree = cKDTree(pts3)
    worst = 1e9; bad = set()
    for a, b in tree.query_pairs(2.0 * THICK + 6.0):
        if abs(arcw[a] - arcw[b]) < 1.5 * Wt:
            continue
        d = float(np.linalg.norm(pts3[a] - pts3[b]))
        worst = min(worst, d)
        if d < 2.0 * THICK:
            bad.add(int(ring[a])); bad.add(int(ring[b]))
    print("clearance gate: need >= %.1f, min %.1f, %d rings below" % (2 * THICK, worst, len(bad)))
    if bad:
        runs = ed.spans(np.isin(np.arange(N), sorted(bad)))
        print("  runs:", [(a, b, np.round(0.5 * (E1[a] + E2[a])).tolist()) for a, b in runs][:12])

    def to_anchor(P3, scr):
        return [round((scr[0] - ANCHOR["left"]) / ANCHOR["width"], 5), round((scr[1] - ANCHOR["top"]) / ANCHOR["height"], 5), round(P3[2] / ANCHOR["height"], 5)]
    rings = [dict(L=to_anchor(Lw[i], E1[i]), R=to_anchor(Rw[i], E2[i])) for i in range(0, N, 2)]
    json.dump(dict(rings=rings, W=Wt, FS=FS, E1=np.round(E1, 3).tolist(), E2=np.round(E2, 3).tolist(), Lw=np.round(Lw, 2).tolist(), Rw=np.round(Rw, 2).tolist(),
                   zc=zc.tolist(), t=t.tolist(), frame=FRAME), open(OUT + "/ruled_%s.json" % FRAME, "w"))
    print("wrote ruled_%s.json" % FRAME, len(rings), "rings")
    if write_pose:
        write_variant(FRAME, rings, FS)


def write_variant(cls, rings, fs):
    path = os.path.join(ROOT, "lib/ribbon/poses/ak-hero.json")
    cur = json.load(open(path))
    r4 = lambda v: repr(round(v * 10000) / 10000)
    t3 = lambda a: "[%s, %s, %s]" % (r4(a[0]), r4(a[1]), r4(a[2]))
    cur["variants"][cls] = dict(faceSign=fs, ruled=[dict(L=r["L"], R=r["R"]) for r in rings])
    out = ["{", '  "version": 1,', '  "name": "ak-hero",', '  "anchor": "hero-name",',
           '  "notes": ' + json.dumps(cur.get("notes", "")) + ",", '  "orientation": "curvature",', '  "variants": {']
    order = [c for c in ("phone", "tablet", "desktop", "ultrawide") if c in cur["variants"]]
    for ci, c in enumerate(order):
        v = cur["variants"][c]
        out.append('    "%s": {' % c)
        if v.get("ruled"):
            out.append('      "faceSign": %d,' % (v.get("faceSign", 1)))
            out.append('      "ruled": [')
            for i, r in enumerate(v["ruled"]):
                out.append('        { "L": %s, "R": %s }%s' % (t3(r["L"]), t3(r["R"]), "," if i < len(v["ruled"]) - 1 else ""))
            out.append("      ]")
        else:
            if v.get("spline") == "bspline":
                out.append('      "spline": "bspline",')
            out.append('      "points": [')
            for i, p in enumerate(v["points"]):
                extra = ""
                if p.get("fold"):
                    f = p["fold"]
                    extra += ', "fold": { "angle": %s, "radius": %s%s }' % (r4(f["angle"]), r4(f["radius"]), (', "name": ' + json.dumps(f["name"])) if f.get("name") else "")
                if p.get("hairpin"):
                    h = p["hairpin"]
                    extra += ', "hairpin": { "name": %s, "radius": %s }' % (json.dumps(h["name"]), r4(h["radius"]))
                out.append('        { "x": %s, "y": %s, "z": %s, "twist": %s, "width": %s%s }%s' % (r4(p["x"]), r4(p["y"]), r4(p["z"]), r4(p["twist"]), r4(p["width"]), extra, "," if i < len(v["points"]) - 1 else ""))
            out.append("      ]")
        out.append("    }" + ("," if ci < len(order) - 1 else ""))
    out += ["  }", "}"]
    txt = "\n".join(out) + "\n"
    json.loads(txt)
    open(path, "w").write(txt)
    print("wrote", path, "variant", cls)


if __name__ == "__main__":
    main("--pose" in sys.argv)
