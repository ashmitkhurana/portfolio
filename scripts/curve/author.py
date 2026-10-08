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

W = 51.0  # ribbon width, css px (engine width 34 x width multiplier 1.5)
CK = 2.185  # cutout px per css px

# The one flat fold is the apex (radius in widths). Every other turn is a ROUND arc the curvature frames roll (the band
# goes edge-on through the curve, a satin roll outline), joined tangentially to straight face-on runs.
RHO_A = 0.6
GAP_A = 2 * RHO_A * W
FA = -PI  # fold dihedral; the sign picks the side the strip rolls to

# depth layout (css px)
LZ = -24.0  # A left leg
RIGHT_Z = LZ + GAP_A  # A right leg: frontmost of all
BACK_Z = -20.0  # back layer: bottom-K band -> crossbar
MID_Z = 12.0  # middle layer: return -> top-K front
END_Z = -55.0  # top-K back section / end strand

T2 = 2 * PI  # base roll after the tail; level.py adds the per-run corrections (delta.json)

# review tags (not written to the pose): LB / LA = a straight run that must be face-on showing face B / A (level.py
# measures the roll the frames hold there and corrects it with twist); RAMP = where that correction changes (just after
# a turn, never inside one: a twist inside a curve would fight the frames' roll and flatten the band into a pinch)
LB, LA, RAMP = {"face": "B"}, {"face": "A"}, {"ramp": True}


def arc(E, heading, R, sweep, n, z0, z1, tag=None):
    """Points of a circular arc in the screen plane (cutout px), leaving E with `heading` (degrees, screen y down),
    radius R (css px), turning by `sweep` degrees (+ = clockwise on screen); depth eased z0 -> z1. E itself is not
    included. Returns the points and the exit heading."""
    h, sw, r = math.radians(heading), math.radians(sweep), R * CK
    sg = 1.0 if sweep > 0 else -1.0
    cx, cy = E[0] - sg * r * math.sin(h), E[1] + sg * r * math.cos(h)
    a0 = math.atan2(E[1] - cy, E[0] - cx)
    out = []
    for k in range(1, n + 1):
        f = k / n
        a = a0 + sw * f
        e = f * f * (3 - 2 * f)
        out.append((round(cx + r * math.cos(a), 1), round(cy + r * math.sin(a), 1), round(z0 + (z1 - z0) * e, 1), T2, tag))
    return out, heading + sweep


def ahead(P0, heading, d):
    h = math.radians(heading)
    return (round(P0[0] + d * math.cos(h), 1), round(P0[1] + d * math.sin(h), 1))


# left-leg frame for the wrap (cutout px): axis through L0 along U (up the leg), V across it (to the right)
L0, U, V = (115.0, 1000.0), (0.45, -0.89), (0.89, 0.45)


def leg(su, sv):
    return (round(L0[0] + su * U[0] + sv * V[0], 1), round(L0[1] + su * U[1] + sv * V[1], 1))


def helix():
    """The wrap: half a turn of a helix around the left leg (axis L0 + s U, depth LZ): front pass -> outer edge -> back
    pass, then heading right behind the leg. Screen in cutout px, depth in css px; a, b = the semi-axes across the leg
    (screen) and in depth. The start runs along the crossbar's screen line (no screen kink)."""
    a, b = 92.0, 32.0
    s0, s1, sd = 205.0, 60.0, -12.5
    out = []
    for k in range(7):
        ph = math.pi * k / 6
        su = s0 + sd * ph - 0.5 * (s0 + sd * math.pi - s1) * (1 - math.cos(ph))
        out.append(leg(su, -a * math.sin(ph)) + (round(LZ + b * math.cos(ph), 1), T2, RAMP if k >= 4 else None))
    out.append(leg(45, 60) + (LZ - b, T2, RAMP))  # behind the leg, heading right (the hidden half twist happens here)
    out.append(leg(35, 126) + (LZ - b + 4, T2, None))  # emerging past the true right edge, on the return's line
    return out


# ---- S: the tail rises (straight on screen near the bend), one round arc, then the sweep -------------------------------
S_E = (700.0, 1484.0)
S_ARC, S_OUT = arc(S_E, -27.6, 0.8 * W, -138.0, 7, 115.0, 92.0)
S_X = S_ARC[-1][:2]

# ---- far-left: a round rolled corner from the sweep into the left leg ---------------------------------------------------
# the corner of the two straight runs, then the arc's entry R tan(turn / 2) before it
FL_V = (64.0, 1150.0)
FL_TURN = (-63.2) - S_OUT  # into the left leg's heading (0.45, -0.89)
FL_R = 0.8 * W
FL_E = ahead(FL_V, S_OUT + 180, FL_R * CK * math.tan(math.radians(abs(FL_TURN)) / 2))
FL_ARC, FL_OUT = arc(FL_E, S_OUT, FL_R, FL_TURN, 6, 40.0, LZ)

# ---- bottom K: a round loop off the right leg (loopsolve.py: R 0.8 W, 207 deg, exits on the junction line) -------------
BK_E = (551.0, 1174.0)
BK_ARC, BK_OUT = arc(BK_E, math.degrees(math.atan2(0.96, 0.29)), 0.8 * W, -207.0, 8, RIGHT_Z - 4, -14.0)

# ---- top K: straight front strand, a round 180 degree end, the back section returns parallel below --------------------
TK_H = math.degrees(math.atan2(-0.467, 0.884))
TK_E = (760.0, 753.0)
TK_ARC, TK_OUT = arc(TK_E, TK_H, 0.75 * W, 180.0, 7, MID_Z, END_Z + 6)
TK_X = TK_ARC[-1][:2]

WRAP = helix()

# (cutout x, cutout y, z css, twist rad, tag/extra)   End 1 -> End 2
P = [
    # 1. tail: off-screen bottom-left, near the camera, rising into the sculpture (face A)
    (200, 1960, 1250, T2, None),
    (265, 1846, 1120, T2, None),
    (350, 1700, 700, T2, None),
    (478, 1600, 300, T2, None),
    (S_E[0], S_E[1], 130.0, T2, None),
    # 2. S: one round bend; the band rolls over its edge through it (A -> B)
] + S_ARC + [
    # the long sweep left (face B), in front of the right leg's foot
    ahead(S_X, S_OUT, 150) + (80.0, T2, RAMP),
    ahead(S_X, S_OUT, 300) + (68.0, T2, LB),
    ahead(S_X, S_OUT, 450) + (54.0, T2, LB),
    (FL_E[0], FL_E[1], 42.0, T2, None),
    # 3. far-left: a round rolled corner up into the A left leg (face A)
] + FL_ARC + [
    ahead(FL_ARC[-1][:2], FL_OUT, 90) + (LZ, T2, RAMP),
    (215, 800, LZ, T2, LA),
    (290, 650, LZ, T2, None),
    # 4. apex fold: down into the A right leg (face B), frontmost of all
    (362, 548, LZ, T2, dict(fold=dict(angle=FA, radius=RHO_A, name="apex"))),
    (408, 700, RIGHT_Z, T2, None),
    (468, 900, RIGHT_Z, T2, None),
    (512, 1045, RIGHT_Z, T2, LB),
    (BK_E[0], BK_E[1], RIGHT_Z - 4, T2, None),
    # 5. bottom K: a round loop, rolling back in depth (B outside, A glimpsed in the curl)
] + BK_ARC + [
    # 6. back layer: the band straight up-left to the junction, behind the right leg
    (650, 1034, -16, T2, RAMP),
    (606, 988, -18, T2, LB),
    (555, 935, BACK_Z, T2, None),
    (500, 912, BACK_Z, T2, None),
    # 7. crossbar left (upper strand), onto the front of the left leg
    (420, 884, BACK_Z, T2, RAMP),
    (330, 857, -14, T2, LB),
] + WRAP + [
    # 9. return (lower strand): from behind the leg's true right edge, straight up-right through the junction
    (300, 996, -32, T2, LB),
    (385, 951, -12, T2, LB),
    (465, 909, 4, T2, LB),
    (545, 867, MID_Z - 2, T2, LB),
    # 10. top-K front strand (same straight line)
    (650, 811, MID_Z, T2, LB),
    (TK_E[0], TK_E[1], MID_Z, T2, None),
    # 11. top-K: a round 180 degree end (the band rolls over through it: face A after)
] + TK_ARC + [
    # 12. end strand: back down-left, parallel below the front strand, tip hidden behind the right leg
    ahead(TK_X, TK_OUT, 90) + (END_Z, T2, RAMP),
    ahead(TK_X, TK_OUT, 180) + (END_Z, T2, LA),
    ahead(TK_X, TK_OUT, 260) + (END_Z, T2, LA),
    ahead(TK_X, TK_OUT, 330) + (END_Z, T2, None),
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
