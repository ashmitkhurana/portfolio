#!/usr/bin/env python3
"""Author the AK signature as a designed smooth 3D centreline (docs/ribbon/turns/CURVE_PLAN.md).

Control points are written where they APPEAR in the phone mockup (cutout px, 852 x 1846 = 390 x 844 css) plus a depth z in
world css px (+ towards the camera, text plane = 0; the camera sits at D = 422 / tan(13.2 deg) ~ 1800 px). The resolver
unprojects them, so depth never moves a point on screen. Folds and hairpins are marked on the corner / tip point.

  python3 scripts/curve/author.py <version> [width multiplier] [delta.json]  ->  docs/ribbon/turns/curve/<version>/pose.json
"""
import json, math, os, sys

SX, SY = 852.0 / 390.0, 1846.0 / 844.0
ANCHOR = dict(left=20.0, top=118.15625, width=347.21875, height=154.1875)  # phone hero-name box (lift_sig.py)
PI = math.pi

# fold radii (ribbon widths) and the layer gap each makes (css px; W = engine width 34 x width multiplier 1.5 = 51)
RHO_F, RHO_A, RHO_K = 0.45, 0.6, 0.45  # far-left, apex, top-K tip
GAP_F, GAP_A, GAP_K = 2 * RHO_F * 51.0, 2 * RHO_A * 51.0, 2 * RHO_K * 51.0
FA = -PI  # fold dihedral; the sign picks the side the strip rolls to

# depth layout (css px). Left leg plane LZ; the sweep 2 rho_F in front of it, the right leg 2 rho_A in front of it.
LZ = -24.0
SWEEP_Z = LZ + GAP_F  # at the far-left fold
RIGHT_Z = LZ + GAP_A  # the A right leg: frontmost of all
BACK_Z = -20.0  # back layer: bottom-K band -> crossbar
MID_Z = 12.0  # middle layer: return -> top-K front
END_Z = MID_Z - GAP_K  # top-K back section / end strand

# cumulative roll: T2 after the S half twist, T3 after the twist through the bottom-K U, T4 after the hidden half twist
UTW = float(os.environ.get("UTW", "-0.5"))
T2 = 2 * PI
T3 = T2 + UTW * PI
T4 = T3 + PI

# review tags (not written to the pose): LB / LA = a straight run that must be face-on showing face B / A (scripts/curve/level.py
# measures the roll the frames hold there and corrects it with twist); RAMP = a turn where that correction may change
LB, LA, RAMP = {"face": "B"}, {"face": "A"}, {"ramp": True}

# left-leg frame for the wrap (cutout px): axis through L0 along U (up the leg), V across it (to the right)
L0, U, V = (115.0, 1000.0), (0.45, -0.89), (0.89, 0.45)


def leg(su, sv):
    return (round(L0[0] + su * U[0] + sv * V[0], 1), round(L0[1] + su * U[1] + sv * V[1], 1))


def helix():
    """The wrap: half a turn of a helix around the left leg (axis L0 + s U, depth LZ): front pass -> outer edge -> back
    pass, then heading right behind the leg (the hidden half twist). Screen in cutout px, depth in css px; a, b = the
    semi-axes across the leg (screen) and in depth. The start runs along the crossbar's screen line (no screen kink)."""
    a, b = 92.0, 32.0  # 92 cutout ~ 42 css: the leg's half width (25.5 css) + 16 clearance
    s0, s1, sd = 205.0, 60.0, -12.5  # up the leg at the front / back pass; ds/dphi at the start
    out = []
    for k in range(7):
        ph = math.pi * k / 6
        su = s0 + sd * ph - 0.5 * (s0 + sd * math.pi - s1) * (1 - math.cos(ph))
        tw = T3 + 0.5 * (T4 - T3) * max(0.0, (ph - 0.5 * math.pi) / (0.5 * math.pi))  # the twist starts out of sight
        out.append(leg(su, -a * math.sin(ph)) + (round(LZ + b * math.cos(ph), 1), tw, RAMP))
    out.append(leg(45, 60) + (LZ - b, T3 + 0.8 * (T4 - T3), RAMP))  # behind the leg, heading right
    out.append(leg(35, 126) + (LZ - b + 4, T4, RAMP))  # emerging past the true right edge, on the return's line
    return out


WRAP = helix()

# (cutout x, cutout y, z css, twist rad, extra)   End 1 -> End 2
P = [
    # 1. tail: off-screen bottom-left, near the camera, rising into the sculpture (face A)
    (200, 1960, 1250, PI, None),
    (265, 1846, 1120, PI, None),
    (350, 1700, 900, PI, None),
    (480, 1600, 620, PI, None),
    # 2. S: right-hand bend; the half twist (spread over the bend) rolls the band over its edge (A -> B)
    (610, 1525, 400, 1.15 * PI, None),
    (705, 1460, 240, 1.45 * PI, None),
    (745, 1385, 150, 1.75 * PI, None),
    (705, 1312, 105, 1.95 * PI, None),
    (620, 1270, 88, T2, None),
    # long sweep left (face B), in front of the right leg's foot
    (520, 1240, 76, T2, LB),
    (400, 1206, 62, T2, LB),
    (260, 1180, 42, T2, LB),
    (150, 1162, SWEEP_Z, T2, None),
    # 3. far-left fold: up into the A left leg (face A), 2 rho behind the sweep
    (64, 1147, SWEEP_Z, T2, dict(fold=dict(angle=FA, radius=RHO_F, name="far-left"))),
    (115, 1000, LZ, T2, None),
    (215, 800, LZ, T2, None),
    (290, 650, LZ, T2, None),
    # 4. apex fold: down into the A right leg (face B), frontmost of all
    (362, 548, LZ, T2, dict(fold=dict(angle=FA, radius=RHO_A, name="apex"))),
    (408, 700, RIGHT_Z, T2, None),
    (468, 900, RIGHT_Z, T2, None),
    (522, 1078, RIGHT_Z, T2, None),
    # 5. bottom K: the leg rolls BACK in depth into a U; the curvature frames roll it (rim / A glimpse in the curl)
    (548, 1165, RIGHT_Z - 8, T2, None),
    (600, 1228, 10, T2, RAMP),
    (680, 1252, -6, T2, RAMP),
    (760, 1236, -14, T2, RAMP),
    (800, 1190, -15, T2, RAMP),
    # 6. back layer: the broad band straight up-left, untwisting to face-on B; it turns left behind the right leg, level
    #    in depth so the roll can settle
    (730, 1117, -16, T2 + 0.5 * (T3 - T2), RAMP),
    (650, 1035, -18, T3, LB),
    (590, 968, BACK_Z, T3, RAMP),
    (535, 928, BACK_Z, T3, RAMP),
    (470, 902, BACK_Z, T3, RAMP),
    # 7. crossbar left (upper strand), level, onto the front of the left leg (LZ + 26 = 2)
    (390, 876, BACK_Z - 2, T3, LB),
    (300, 848, -10, T3, LB),
] + WRAP + [
    # 9. return (lower strand): from behind the leg's true right edge, STRAIGHT up-right through the junction
    (300, 996, -32, T4, RAMP),
    (385, 951, -12, T4, LB),
    (465, 909, 4, T4, LB),
    (545, 867, MID_Z - 2, T4, LB),
    # 10. top-K front strand (same straight line)
    (635, 820, MID_Z, T4, LB),
    (725, 772, MID_Z, T4, None),
    # 11. top-K tip: a flat fold like the apex turned sideways (face A after it), the back section 2 rho behind
    (815, 725, MID_Z, T4, dict(fold=dict(angle=FA, radius=RHO_K, name="top-k"))),
    (770, 806, END_Z, T4, None),
    (720, 896, END_Z - 6, T4, None),
    (672, 983, END_Z - 10, T4, None),
    # 12. end strand: down in the gap between the right leg and the bottom-K band, tip hidden behind the right leg
    (615, 1050, END_Z - 12, T4, None),
    (560, 1105, END_Z - 12, T4, None),
    (535, 1130, END_Z - 12, T4, None),
]


def to_point(cx, cy, z, tw, extra, width, dtw=0.0):
    sx, sy = cx / SX, cy / SY
    p = dict(
        x=round((sx - ANCHOR["left"]) / ANCHOR["width"], 5),
        y=round((sy - ANCHOR["top"]) / ANCHOR["height"], 5),
        z=round(z / ANCHOR["height"], 5),
        twist=round(tw + dtw, 5),
        width=width,
    )
    if extra:
        p.update({k: v for k, v in extra.items() if k not in ("face", "ramp")})
    return p


def build(points, width=1.0, name="ak-curve", delta=None):
    d = delta or [0.0] * len(points)
    return {
        "version": 1,
        "name": name,
        "anchor": "hero-name",
        "notes": "designed 3D centreline (scripts/curve/author.py)",
        "orientation": "curvature",
        "variants": {"phone": {"points": [to_point(*q, width, d[i]) for i, q in enumerate(points)]}},
    }


if __name__ == "__main__":
    ver = sys.argv[1] if len(sys.argv) > 1 else "v0"
    width = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "docs", "ribbon", "turns", "curve", ver)
    os.makedirs(out, exist_ok=True)
    delta = None
    if len(sys.argv) > 3:  # twist corrections from scripts/curve/level.py
        delta = json.load(open(sys.argv[3]))
        assert len(delta) == len(P), "delta file was made for a different point list"
    with open(os.path.join(out, "pose.json"), "w") as f:
        json.dump(build(P, width, delta=delta), f, indent=1)
    print(os.path.abspath(os.path.join(out, "pose.json")), len(P), "points")
