# AK signature pose: turn-by-turn edge decomposition

Companion to `HANDOFF.md` §5a/§6. Written 2026-10-07 from 3× gridded crops of `ref/ak-signature-cutout.webp`. All coordinates are in cutout pixels (852×1846, +y down) and are guide values (±5 px). The snapper refines them onto the real image lines.

## 0. Vocabulary

- **E1 / E2**: the two physical edges of the strip. They are continuous from End 1 to End 2 and never relabelled.
- **Rim line**: a visible edge line (an outline or an interior bright rim). It is a hard 2D constraint.
- **Roll outline (contour)**: silhouette where the surface turns away. It is not an edge, so it is never snapped as E1/E2. It is used only as a silhouette constraint and a check.
- **Hidden span**: an edge passing behind a layer. It has no 2D constraint; it is bridged C2-smoothly in 2D and solved freely in 3D.
- **Turn window**: a region around a fold, twist or curl. Inside it, ambiguous outline pieces are silhouette-only. Outside it, every visible span carries a hard E1/E2 label.

## 1. Global labelling (verified against the owner's face map)

Face rule: `face = sign(cross2D(T, E2 − E1))`, with T the travel direction End 1 → End 2 and y taken as up. A negative value is face A; a positive value is face B.

| # | Span | Travel (y up) | E1 side | E2 side | cross sign | Face | Owner map |
|---|---|---|---|---|---|---|---|
| 1 | Tail rising | NE | left (NW) | right (SE) | − | A | A ✓ |
| 2 | Sweep, after the S | W | top | bottom | + | B | B ✓ |
| 3 | A left leg | NE | outer-left | inner (hole side) | − | A | A ✓ |
| 4 | A right leg | SSE | west (inner, hole side) | east (outer) | + | B | B ✓ |
| 6 | Bottom-K return to junction | NW | upper outline | lower rim (hole side) | + | B | B ✓ |
| 7 | Crossbar | W | upper | lower | + | B | B ✓ |
| 9 | Return (after the wrap and twist) | ENE | lower | upper | + | B | B ✓ |
| 10 | Top-K front strand | NE | lower | upper | + | B | B ✓ |
| 11–12 | Top-K back section / end strand | SW | lower-right (outer) | upper-left (gap side) | − | A | A ✓ |

Edge crossovers (face changes): S twist (1→2), far-left fold (2→3), apex (3→4), the hidden twist after the wrap (inside 8→9), top-K tip (10→11). The junction (6→7, 9→10) changes no labels.

## 2. Turns

### 2.1 S twist (A → B). Window ≈ x 540–852, y 1240–1580
- **E1**: the tail's left outline, up through (540,1487) (620,1443) (667,1400) (680,1377). It then becomes the **interior bright rim** through the bend: (693,1350) (697,1337) (690,1317) (677,1297) (650,1273) (620,1250). It meets the top outline at ≈(610,1245) and continues as the **sweep's top edge**. This is one continuous visible rim from the tail all the way to the far-left fold.
- **E2**: the tail's right outline is a hard edge up to ≈(787,1507). From there up and around the outer bend to ≈(615,1248) the outline is **silhouette-only** (the roll outline; the 3D solve decides where E2 leaves it). E2 is then **hidden** behind the rolled bright part and emerges at ≈(677,1377), where the dark band's lower outline meets the E1 rim; that meeting point is the projected crossing. From there E2 is the **sweep's bottom edge**: (607,1320) (540,1290) …
- Face: bright region = tail (A) rolling over; dark band = sweep (B) seen inside the bend.

### 2.2 Far-left fold (B → A). Window ≈ x 0–330, y 960–1260
- **E1**: the sweep's top rim (330,1138) (200,1123) (140,1112) (100,1102) (70,1088) (45,1063), curling up as the **left leg's outer-left outline** (43,1047) (67,1010) (87,987) (100,960). The bright rim is visibly continuous.
- **E2**: the sweep's bottom outline … (233,1223) (150,1207) is a hard edge up to ≈(100,1187). The far-left outline from (100,1187) up to (43,1060) is **silhouette-only**. E2 is then **hidden** behind the sweep (front layer) up to ≈(140,1110), where it emerges as the **left leg's true right edge**: the owner's white line, following the faint real edge (160,1090) (177,1057) (200,1007) (220,973), up to the underside of the crossbar wrap.
- **Anomaly**: the dark stripe right of that edge is deleted (HANDOFF §5a).

### 2.3 Apex (A → B). Window ≈ x 180–480, y 530–760
- **E1**: the left leg's outer outline (193,760) (220,680) (240,630) (260,590) (280,563). A short bright rim runs along the top-left (300,560) (313,563), then **dives** down the thin bright diagonal: (323,572) (340,597) (357,640) (367,677) (380,730) (387,760). This is the **right leg's inner (hole-side) edge**. Above the hole apex at (340,640), this line separates the left leg's dark inner face from the right leg's bright face.
- **E2**: the left leg's inner edge, i.e. the hole's left side (300,760) (320,700) (340,640). It is **hidden** behind the right leg from (340,640) to the top-right shoulder ≈(420,560). It then becomes the **right leg's outer edge** (440,577) (460,617) (480,657) …
- **Roll outline**: the flat top ≈(295,556)→(420,560). It is never an edge.

### 2.4 Bottom-K loop (curl, B with an A glimpse). Window ≈ x 480–852, y 880–1260
- The right leg descends, and its lowest part passes **behind the sweep**. This is a new over/under constraint: **the sweep is in front of the bottom of the A right leg / the start of the bottom-K loop.** The right leg's west edge (E1) disappears behind the sweep's top rim at ≈(513,1197).
- The loop curls to the right and returns up-left to the junction as span 6.
  - Upper outline (E1): (838,1173) (797,1067) (697,963) (580,900) (553,890).
  - Lower rim (E2): (740,1213) (713,1147) (647,1067) (580,987) (557,980). This is the hole's right boundary.
- The hole's left boundary is the right leg's east edge (E2) coming down.
- Inside the loop bottom (≈x 630–760, y 1180–1240) the **inner face A** shows. The curl crosses the edges over twice in projection there.
  - The loop-bottom outline ≈(650,1240)→(838,1173) is **silhouette-only**.
  - E1 is hidden from (513,1197) until it rejoins the upper outline near (838,1173).
  - The exact rim/outline labelling inside the window is left to the 3D solve, checked against the mockup.

### 2.5 Junction (no label change). Window ≈ x 380–650, y 780–1010
- The A right leg (front) spans ≈x 393–513 at y 780 and ≈x 443–560 at y 1010.
- **Back layer** (6→7): enters at the right edge ≈(553–557, 890–980) heading NW and exits at the left edge as the crossbar, upper ≈(400,823), lower at the V point ≈(417,893).
- **Middle layer** (9→10): enters at the left edge as the return, upper at the V point ≈(417,893) and lower ≈(437,973). It exits right as the top-K front strand, upper ≈(520,793) and lower ≈(540,913).
- The two layers cross in an **X that is fully covered by the right leg**: hard constraint, crossing point inside the leg's projected width.
- Order, front to back: right leg, middle, back, end strand.

### 2.6 Wrap around the left leg (curl, B with an A glimpse, plus the hidden twist). Window ≈ x 20–470, y 740–1090
- **Crossbar** heading W, in **front** of the left leg. Upper outline (E1): (380,837) (320,800) (240,783) (180,793) (130,820). E1 is hard to ≈(130,820). The lower rim (E2) runs under the arch (120,873) (207,846) (273,867) (320,887) (380,930).
- **At the V point**, the return's upper rim runs over the crossbar's lower-right corner: from (380,930) to the right leg, the crossbar's lower edge is hidden behind the return. This matches the owner's order: the return (middle layer) is in front of the crossbar (back layer). They never cross visibly, because both go behind the right leg.
- **Curl** down the outside (left) of the leg: outline (100,867) (90,913) (90,940) (100,960) is **silhouette-only**. The inner face A shows between the crossbar's lower rim and the leg. The curl goes **behind the left leg's outer edge** at ≈(100–120, 940–967).
- **Hidden span** behind the left leg: the strip goes behind the leg heading E and makes the **small half-twist here, out of sight**. It emerges at the leg's **true right edge** (the owner's line, ≈x 186 at y 1040) as the **return** (span 9).
  - Return upper (E2): (220,1037) (320,987) (380,940) (417,895).
  - Return lower (E1): (227,1053) (320,1017) (387,987) (437,973).
  - With the anomaly removed, both edges extend left to the true edge.
- Risk for the 3D solve: the half-twist plus the wrap must fit in ≈1 W of hidden length. Allow the twist to start inside the visible curl if needed.

### 2.7 Top-K tip (B → A). Window ≈ x 540–852, y 640–930
- **E2**: the front strand's upper outline (540,777) (580,740) (640,700) (700,685) (740,683) (780,690) is hard to ≈(807,703). The tip's rounded end ≈(807,703)→(829,745) is the **roll outline**. E2 is **hidden** behind the front strand ≈(817,708)→(727,750). It emerges below the front strand's lower rim at ≈(727,750) as the back section's **upper-left (gap-side) edge**: (727,750) (603,907) …
- **E1**: the front strand's lower rim (540,917) (580,880) (620,840) (660,797) (700,760) (727,740) (773,712) continues **around the inside of the tip** (800,705) (820,712) (828,737). It joins the outer-right outline and runs down as the back section's **outer edge** (780,840) (740,907) …
- This mirrors the apex, with travel reversed.

### 2.8 End strand (A, tip hidden). Window ≈ x 480–720, y 880–1260
- The back section runs down-left behind the top-K front strand, then **behind the bottom-K return band** (≈ y 900–980).
- It is visible as the **dark wedge** between the right leg's east edge and the bottom-K return's lower rim, ≈x 560–590, y 990–1090.
- It then passes **behind the right leg**. The tip stops a little above the bottom of the right leg, ≈(565,1150), fully covered.

## 3. New constraints found in this pass (add to the 3D solve)
1. The sweep passes **in front of** the bottom of the A right leg / start of the bottom-K loop (§2.4).
2. The junction X lies within the right leg's projected width (§2.5).
3. The post-wrap half-twist happens in the hidden span behind the left leg (§2.6).
4. Outline pieces inside turn windows are silhouette constraints, not edge constraints: S outer bend, far-left outline, apex flat top, loop bottom, wrap curl and top-K tip.

## 4. Tracing rule that follows from this
Hard E1/E2 snapping only on (a) straight spans outside turn windows and (b) the interior rim lines named above (the S rim, the far-left rim, the apex dive line, the top-K inner rim). Inside windows: silhouette match plus the face map. Hidden spans are free. This removes the "outer = edge 1" assumption entirely.
