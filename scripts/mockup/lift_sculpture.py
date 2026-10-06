#!/usr/bin/env python3
"""Lift the sculpture edges (edges.json, sculpture px) onto camera rays at the OLD hero mockup placement (placement.json, a similarity
transform, 1672x941), with the weaving z design, then check the weave / over-under constraints and write ruled_sculpture.json.

Usage: ANALYZE_OUT=$SP/r2 .venv/bin/python lift_sculpture.py [--pose]     (--pose also writes lib/ribbon/poses/ak-hero.json desktop)
"""
import json, math, os, subprocess, sys
os.environ["ROTO_SRC"] = "sculpture"
import numpy as np
from scipy import ndimage as ndi
from scipy.interpolate import PchipInterpolator
sys.path.insert(0, os.path.dirname(__file__))
import edges as ed
import lift as L

OUT = ed.OUTD
ROOT = ed.ROOT
ANCHOR = L.ANCHOR
ASHMIT = (56.609, 192.625, 977.047, 392.984)     # site-measured .display__line rects at 1672x941
KHURANA = (56.609, 392.984, 1253.531, 593.344)
PLANE_A, PLANE_K = -45.0, 45.0
GATE_PAIRS = []
SEP_MARGIN = 4.0
INSET = float(os.environ.get("INSET", "0"))
SMOOTH_SIGMA = float(os.environ.get("SMOOTH_SIGMA", "6"))

# centre depth anchors (world px), End 1 -> End 2. Edit here.
Z = [
    ("tail_a", 420), ("tail_b", 280), ("S_turn", 160), ("S_mid", 110), ("S_left", 60), ("leg_bottom", -30),
    ("leg_under_crossbar", -125), ("A_apex", -70), ("rleg_top", -10), ("rleg_mid", 0), ("rleg_under_wrap", -8),
    ("lower_back", 15), ("lower_tip", 30), ("lower_return", 0), ("ret_pre", -90), ("ret_behind", -210), ("wrap", 10), ("wrap_front", 175),
    ("lowerarm_mid", 190), ("upper_tip", 80), ("top_arm", -40), ("top_behind", -150), ("crossbar_right", -100),
    ("crossbar_mid", 5), ("crossbar_curl", 5), ("end2", 5),
]
if os.environ.get("ZOVR"):
    _o = json.loads(os.environ["ZOVR"]); Z = [(n, _o.get(n, z)) for n, z in Z]
# section names (arc ranges between anchors) used by the weave report
SECTIONS = [
    ("tail+S", "tail_a", "leg_bottom"), ("left leg", "leg_bottom", "A_apex"), ("right leg", "A_apex", "lower_back"),
    ("K lower loop", "lower_back", "ret_behind"), ("wrap", "ret_behind", "wrap_front"), ("K upper loop", "wrap_front", "top_behind"),
    ("crossbar", "top_behind", "end2"),
]


def load():
    E = json.load(open(OUT + "/edges.json"))
    P = json.load(open(OUT + "/placement.json"))
    cl = json.load(open(ed.FIT + "/trace.json"))
    return E, P, cl


def main(write_pose=False):
    E, Pl, cl = load()
    s, tx, ty = Pl["scale"], Pl["tx"], Pl["ty"]
    xf = lambda a: np.asarray(a, float) * s + np.array([tx, ty])
    t = np.array(E["s"])
    E1, E2, Qc = xf(E["edge1"]), xf(E["edge2"]), xf(E["centre"])
    if INSET > 0:   # the engine's band has thickness and bevels: its silhouette is ~INSET px fatter per side than the ruling quads
        u = E2 - E1
        u = u / np.maximum(np.hypot(u[:, 0], u[:, 1]), 1e-6)[:, None]
        E1, E2 = E1 + u * INSET, E2 - u * INSET
    N = len(t)
    Qs, tt, vis, P_, s_orig = ed.prep_trace(cl)
    ext = 200
    xs, zs = [], []
    first = float(s_orig[ext + cl["anchors"][Z[0][0]]])
    xs.append(float(t[0])); zs.append(Z[0][1] + 150.0)
    for nm, z in Z:
        a = float(s_orig[ext + cl["anchors"][nm]])
        if a <= xs[-1]:
            a = xs[-1] + 1.0
        xs.append(a); zs.append(float(z))
    if xs[-1] < t[-1]:
        xs.append(float(t[-1])); zs.append(zs[-1])
    zc = PchipInterpolator(xs, zs)(np.clip(t, xs[0], xs[-1]))
    arc = {nm: float(s_orig[ext + i]) for nm, i in cl["anchors"].items()}

    tw = np.zeros(N, bool)
    for w in E["turn_windows"]:
        if "i0" in w:
            tw[w["i0"]:w["i1"] + 1] = True
    trusted = np.array(E["trusted"], bool)
    # observed visible face per ring from the sculpture's own shading along the ruling (dark inner face vs bright face)
    from PIL import Image
    im = np.array(Image.open(os.path.join(ROOT, "public/lab/ref/ak-sculpture.webp")).convert("RGB")).astype(np.float32).max(2) / 255.0
    imb = ndi.gaussian_filter(im, 1.0)
    obs = np.zeros(N)
    E1s, E2s = np.array(E["edge1"]), np.array(E["edge2"])
    for i in range(N):
        fr = np.linspace(0.15, 0.85, 9)
        xy = E1s[i][None] * (1 - fr[:, None]) + E2s[i][None] * fr[:, None]
        v = ndi.map_coordinates(imb, [xy[:, 1], xy[:, 0]], order=1, mode="nearest")
        m = float(np.median(v))
        obs[i] = -1 if m < 0.50 else (1 if m > 0.62 else 0)
    best = None
    for fs in (1, -1):
        r_ = L.solve_rings(E1, E2, t, zc, tw, trusted, 90, obs=obs, fs=fs, verbose=False)
        c_ = L.solve_rings.last_cost
        print("faceSign %+d: DP cost %.2f" % (fs, c_))
        if best is None or c_ < best[0]:
            best = (c_, fs, r_)
    FS = int(os.environ.get("FORCE_FS", best[1]))
    Wt, sg, flips, Lw, Rw, dzs, gr, ln = L.solve_rings(E1, E2, t, zc, tw, trusted, 90, obs=obs, fs=FS)
    print("chosen faceSign %+d" % FS)
    # 3D regularisation: the per-ring depth solve is noisy where the projected ruling is close to the true width (sqrt singularity);
    # a Gaussian along the arc on the lifted ring ends removes the ripple the engine's curvature / roll metrics see
    if SMOOTH_SIGMA > 0:
        Lw = ndi.gaussian_filter1d(Lw, SMOOTH_SIGMA, axis=0, mode="nearest")
        Rw = ndi.gaussian_filter1d(Rw, SMOOTH_SIGMA, axis=0, mode="nearest")
        ln = np.linalg.norm(Rw - Lw, axis=1)
        dev = []
        for P3, E_ in ((Lw, E1), (Rw, E2)):
            k = (L.D - P3[:, 2]) / L.D
            sx = P3[:, 0] / k + L.VW / 2; sy = L.VH / 2 - P3[:, 1] / k
            dev.append(np.hypot(sx - E_[:, 0], sy - E_[:, 1]))
        dev = np.concatenate(dev)
        print("3D smoothing sigma %g samples: projected deviation from the edges mean %.2f max %.2f px; ruling length %.3f..%.3f W" % (SMOOTH_SIGMA, dev.mean(), dev.max(), ln.min() / Wt, ln.max() / Wt))
    # report: sign / visible-face agreement per turn window
    Tc = np.gradient(L._lift_vec(0.5 * (E1 + E2), zc), axis=0); Tc /= np.maximum(np.linalg.norm(Tc, axis=1), 1e-9)[:, None]
    Bn = (Rw - Lw) / np.maximum(np.linalg.norm(Rw - Lw, axis=1), 1e-9)[:, None]
    Nz = -FS * np.cross(Tc, Bn)[:, 2]
    vis = np.where(Nz > 0, 1, -1)
    chk = (obs != 0) & (np.abs(Nz) > 0.2)
    print("visible-face agreement with the sculpture shading: %.1f %% of %d rings overall" % (100 * np.mean(vis[chk] == obs[chk]), chk.sum()))
    for w in E["turn_windows"]:
        if "i0" in w:
            a_, b_ = w["i0"], w["i1"]
            c_ = chk[a_:b_ + 1]
            print("  window %d (samples %d-%d, screen %s): agreement %.0f %% of %d; E2-nearer fraction %.2f; max |dz| %.0f" % (
                w["id"], a_, b_, np.round(0.5 * (E1[(a_ + b_) // 2] + E2[(a_ + b_) // 2])).astype(int).tolist(), 100 * np.mean(vis[a_:b_ + 1][c_] == obs[a_:b_ + 1][c_]) if c_.any() else -1, c_.sum(),
                np.mean(dzs[a_:b_ + 1] > 0), np.abs(dzs[a_:b_ + 1]).max()))
    print("sign flips at samples", flips, "(arc", [round(float(t[i])) for i in flips], ")")
    print("dz = 0 (grown) samples: %d of %d (%.1f %%), max ruling %.2f W; |dz| max %.0f mean %.0f" % (gr.sum(), N, 100 * gr.mean(), ln.max() / Wt, np.abs(dzs).max(), np.abs(dzs).mean()))
    print("  grown spans (sample idx):", [(a, b) for a, b in ed.spans(gr)][:40])

    # ---------------------------------------------------------------- weave report
    def rect_in(p, r):
        return (r[0] <= p[:, 0]) & (p[:, 0] <= r[2]) & (r[1] <= p[:, 1]) & (p[:, 1] <= r[3])
    fr = np.linspace(0, 1, 7)
    rep = {}
    print("\nweave (z of ribbon points whose projection lies inside each text rect; planes ASHMIT %g, KHURANA %g):" % (PLANE_A, PLANE_K))
    viol = 0
    for name, a_n, b_n in SECTIONS:
        i0 = int(np.searchsorted(t, arc[a_n])); i1 = min(N - 1, int(np.searchsorted(t, arc[b_n])))
        pts, zz, cz = [], [], []
        for i in range(i0, i1 + 1):
            for f in fr:
                pts.append(E1[i] * (1 - f) + E2[i] * f)
                zz.append(Lw[i][2] * (1 - f) + Rw[i][2] * f)
            cz.append(zc[i])
        pts, zz = np.array(pts), np.array(zz)
        inA, inK = rect_in(pts, ASHMIT), rect_in(pts, KHURANA)
        def rng(m):
            return (zz[m].min(), zz[m].max(), int(m.sum())) if m.any() else None
        # ruling-point extents and centreline extents inside each rect
        cpts = Qc[i0:i1 + 1]; cA, cK = rect_in(cpts, ASHMIT), rect_in(cpts, KHURANA); czz = np.array(cz)
        rep[name] = dict(ashmit=rng(inA), khurana=rng(inK),
                         c_ashmit=(czz[cA].min(), czz[cA].max()) if cA.any() else None, c_khurana=(czz[cK].min(), czz[cK].max()) if cK.any() else None)
        print("  %-13s in ASHMIT rect: %s   in KHURANA rect: %s   | centreline: A %s K %s" % (
            name, None if rng(inA) is None else "z %.0f..%.0f (%d pts)" % rng(inA), None if rng(inK) is None else "z %.0f..%.0f (%d pts)" % rng(inK),
            None if rep[name]["c_ashmit"] is None else "%.0f..%.0f" % rep[name]["c_ashmit"], None if rep[name]["c_khurana"] is None else "%.0f..%.0f" % rep[name]["c_khurana"]))

    # ---------------------------------------------------------------- crossings (over/under), checked on the lifted surface
    def surf_z(p, i0, i1):
        best, bz = 1e9, None
        for i in range(i0, i1 + 1):
            a, b = E1[i], E2[i]
            d = b - a
            f = np.clip(((p - a) @ d) / max(d @ d, 1e-9), 0, 1)
            q = a + d * f
            dist = np.hypot(*(q - p))
            if dist < best:
                best, bz = dist, Lw[i][2] * (1 - f) + Rw[i][2] * f
        return bz, best
    cr = [  # (name, point in sculpture px, arc of the OVER strand, arc of the UNDER strand)
        ("crossbar over left leg", (520, 412), "crossbar_mid", "leg_under_crossbar"),
        ("right leg over upper-K return / crossbar", (850, 350), "rleg_mid", "top_behind"),
        ("right leg over lower-K return", (885, 447), "rleg_under_wrap", "ret_behind"),
        ("wrap front over right leg", (860, 425), "wrap_front", "rleg_under_wrap"),
    ]
    ok_all = True
    print("\nover/under (surface depth at the crossing point):")
    for nm, p, over, under in cr:
        pp = xf(p)
        res = []
        for an in (over, under):
            c = min(N - 1, int(np.searchsorted(t, arc[an])))
            lo, hi = max(0, c - 70), min(N - 1, c + 70)
            # restrict to samples whose ruling passes near p
            best = (1e9, None)
            for i in range(lo, hi + 1):
                z, d = surf_z(pp, i, i)
                if d < best[0]:
                    best = (d, z)
            res.append(best)
        good = res[0][1] is not None and res[1][1] is not None and res[0][1] > res[1][1]
        ok_all &= bool(good)
        print("  %-42s over z %s (miss %.1f px)  under z %s (miss %.1f px)  -> %s" % (nm, None if res[0][1] is None else "%.0f" % res[0][1], res[0][0],
              None if res[1][1] is None else "%.0f" % res[1][1], res[1][0], "OK" if good else "VIOLATED"))
    print("all four over/under constraints satisfied:", ok_all)

    # ---------------------------------------------------------------- 3D self-intersection gate
    THICK = (1672 * 0.0 + 79.0) / 11.0        # engine ribbon thickness (px): width param 79 at 1672 x thicknessRatio 1/11
    fr7 = np.linspace(0, 1, 9)
    pts3 = np.array([[Lw[i] * (1 - f) + Rw[i] * f for f in fr7] for i in range(N)]).reshape(-1, 3)
    ring = np.repeat(np.arange(N), len(fr7))
    arcw = np.repeat(np.r_[0, np.cumsum(np.linalg.norm(np.diff(0.5 * (Lw + Rw), axis=0), axis=1))], len(fr7))
    from scipy.spatial import cKDTree
    tree = cKDTree(pts3)
    worst = (1e9, None, None)
    bad_rings = set()
    GATE_PAIRS.clear()
    for a, b in tree.query_pairs(2.0 * THICK + 20.0):
        if abs(arcw[a] - arcw[b]) < 1.5 * Wt:
            continue
        d = float(np.linalg.norm(pts3[a] - pts3[b]))
        if d < 2.0 * THICK + SEP_MARGIN:
            GATE_PAIRS.append((int(ring[a]), int(ring[b]), float(t[ring[a]]), float(t[ring[b]]), float(zc[ring[a]]), float(zc[ring[b]])))
        if d < 2.0 * THICK:
            bad_rings.add(int(ring[a])); bad_rings.add(int(ring[b]))
        if d < worst[0]:
            worst = (d, int(ring[a]), int(ring[b]))
    print("self-intersection gate: need >= %.1f px (2 x thickness %.1f); min distance between non-adjacent rings %.1f px at rings %s (screen %s / %s); %d rings below the limit" % (
        2 * THICK, THICK, worst[0], worst[1:], None if worst[1] is None else np.round(0.5 * (E1[worst[1]] + E2[worst[1]])).tolist(),
        None if worst[2] is None else np.round(0.5 * (E1[worst[2]] + E2[worst[2]])).tolist(), len(bad_rings)))
    if bad_rings:
        br = sorted(bad_rings)
        runs = [(a, b) for a, b in ed.spans(np.isin(np.arange(N), br))]
        print("  offending sample runs (sample idx -> screen centre):", [(a, b, np.round(0.5 * (E1[a] + E2[a])).tolist()) for a, b in runs][:20])

    def to_anchor(P3, scr):
        return [round((scr[0] - ANCHOR["left"]) / ANCHOR["width"], 5), round((scr[1] - ANCHOR["top"]) / ANCHOR["height"], 5), round(P3[2] / ANCHOR["height"], 5)]
    rings = [dict(L=to_anchor(Lw[i], E1[i]), R=to_anchor(Rw[i], E2[i])) for i in range(0, N, 2)]
    json.dump(dict(rings=rings, W=Wt, anchor=ANCHOR, fov=L.FOV, flips=flips, zc=[round(float(v), 1) for v in zc], dz=[round(float(v), 1) for v in dzs],
                   t=[round(float(v), 1) for v in t], grown=[bool(v) for v in gr], E1=np.round(E1, 2).tolist(), E2=np.round(E2, 2).tolist(),
                   Lw=np.round(Lw, 2).tolist(), Rw=np.round(Rw, 2).tolist(), dz0=int(gr.sum()), over_under_ok=bool(ok_all)), open(OUT + "/ruled_sculpture.json", "w"))
    print("wrote", OUT + "/ruled_sculpture.json", len(rings), "rings")
    if write_pose:
        write_pose_file(rings, FS)


def write_pose_file(rings, fs=1):
    path = os.path.join(ROOT, "lib/ribbon/poses/ak-hero.json")
    head = json.loads(subprocess.check_output(["git", "show", "HEAD:lib/ribbon/poses/ak-hero.json"], cwd=ROOT))
    r4 = lambda v: repr(round(v * 10000) / 10000)
    out = ["{", '  "version": 1,', '  "name": "ak-hero",', '  "anchor": "hero-name",',
           '  "notes": ' + json.dumps("AK monogram: desktop is RULED (rotoscoped edges of public/lab/ref/ak-sculpture.webp, placed on the hero layout and lifted onto camera rays: scripts/mockup/analyze.py trace.py edges.py place.py lift_sculpture.py); phone keeps the earlier centreline pose") + ",",
           '  "orientation": "curvature",', '  "variants": {', '    "phone": {']
    ph = head["variants"]["phone"]
    out.append('      "points": [')
    for i, p in enumerate(ph["points"]):
        extra = ""
        if p.get("fold"):
            f = p["fold"]
            extra += ', "fold": { "angle": %s, "radius": %s%s }' % (r4(f["angle"]), r4(f["radius"]), (', "name": ' + json.dumps(f["name"])) if f.get("name") else "")
        if p.get("hairpin"):
            h = p["hairpin"]
            extra += ', "hairpin": { "name": %s, "radius": %s }' % (json.dumps(h["name"]), r4(h["radius"]))
        out.append('        { "x": %s, "y": %s, "z": %s, "twist": %s, "width": %s%s }%s' % (r4(p["x"]), r4(p["y"]), r4(p["z"]), r4(p["twist"]), r4(p["width"]), extra, "," if i < len(ph["points"]) - 1 else ""))
    out.append("      ]")
    out.append("    },")
    out.append('    "desktop": {')
    out.append('      "faceSign": %d,' % fs)
    out.append('      "ruled": [')
    t3 = lambda a: "[%s, %s, %s]" % (r4(a[0]), r4(a[1]), r4(a[2]))
    for i, r in enumerate(rings):
        out.append('        { "L": %s, "R": %s }%s' % (t3(r["L"]), t3(r["R"]), "," if i < len(rings) - 1 else ""))
    out += ["      ]", "    }", "  }", "}"]
    txt = "\n".join(out) + "\n"
    json.loads(txt)     # never leave the live site with an invalid pose
    open(path, "w").write(txt)
    print("wrote", path)


FIXED = {"tail_a", "tail_b", "S_turn", "S_mid", "S_left", "leg_bottom", "leg_under_crossbar", "A_apex", "rleg_top", "rleg_mid", "rleg_under_wrap",
         "lower_back", "crossbar_mid", "crossbar_curl", "end2"}


def auto_separate(iters=40, step=12.0):
    """Move the free depth anchors apart until no two non-adjacent rings come closer than 2 x thickness (+ margin): the lower strand of
    each offending pair goes down, the higher one up (anchors that carry the text weave stay fixed)."""
    import io, contextlib
    global Z
    for it in range(iters):
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            main(False)
        if not GATE_PAIRS:
            print("auto_separate: gate clear after %d iterations" % it)
            return
        E, Pl, cl = load()
        _, _, _, P_, s_orig = ed.prep_trace(cl)
        arcs = {nm: float(s_orig[200 + i]) for nm, i in cl["anchors"].items()}
        names = [z[0] for z in Z]
        votes = {}
        for ra, rb, ta, tb, za, zb in GATE_PAIRS:
            lo, hi = (ta, tb) if za < zb else (tb, ta)
            for tt_, sgn in ((lo, -1), (hi, +1)):
                # the two bracketing anchors
                k = int(np.searchsorted([arcs[n] for n in names], tt_))
                for n in names[max(0, k - 1):k + 1]:
                    if n not in FIXED:
                        votes[n] = votes.get(n, 0) + sgn
        if not votes:
            print("auto_separate: only fixed anchors involved; stop"); return
        Zd = dict(Z)
        for n, v in votes.items():
            Zd[n] += step * np.sign(v) if v else 0
        Z = [(n, Zd[n]) for n in names]
    print("auto_separate: did not converge in %d iterations" % iters)


if __name__ == "__main__":
    if "--sep" in sys.argv:
        auto_separate()
        print("Z =", Z)
    main("--pose" in sys.argv)
