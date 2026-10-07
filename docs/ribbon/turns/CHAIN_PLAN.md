# Full AK as one paper chain: plan (starts once the apex passes)

## Model
- One flat strip (W = W_css), folded by a chain of rolls (paper.py): exact developable, C1, no stretch.
- Global pose plus about 23 rolls ≈ 100 parameters.
- Ring intervals (ak_problem_phone.npz):

| # | Interval | Rings |
|---|---|---|
| 0 | tail | 0–131 |
| 1 | S window | 132–225 |
| 2 | sweep | 226–288 |
| 3 | far-left window | 289–387 |
| 4 | left leg | 388–483 |
| 5 | apex window | 484–554 |
| 6 | right leg | 555–658 |
| 7 | bottom-K window | 659–764 |
| 8 | k_return | 765–813 |
| 9 | back layer (hidden) | 814–858 |
| 10 | crossbar | 859–910 |
| 11 | wrap window | 911–1066 |
| 12 | middle layer (hidden) | 1067–1101 |
| 13 | top-K front | 1102–1140 |
| 14 | top-K tip window | 1141–1230 |
| 15 | end strand | 1231–1298 |

## Roll plan (initial kind, ring position)

| Roll | Kind | Ring | Note |
|---|---|---|---|
| tail bend | bend | 66 | |
| S fold | fold φ≈±π, ρ0 0.3W | 178 | β from S roll-outline direction |
| S bend | bend | 150 | |
| sweep bend | bend | 257 | |
| far-left fold | fold | 338 | |
| left-leg bends | bend | 420, 455 | |
| apex fold | fold | 519 | params seeded from the passing paper3 apex |
| right-leg bends | bend | 585, 625 | |
| bottom-K fold 1 | fold | 690 | |
| bottom-K fold 2 | fold | 735 | |
| k_return bend | bend | 790 | |
| back-layer bend | bend | 836 | |
| crossbar bend | bend | 885 | |
| wrap curl | φ≈π, ρ≈0.6W, β≈90° | 960 | |
| wrap twist folds | oblique, hidden | 1010, 1040 | |
| middle-layer bend | bend | 1085 | |
| top-K front bend | bend | 1120 | |
| top-K tip fold | fold | 1185 | |
| end bend | bend | 1265 | |

Bend bounds: ρ ∈ [0.5W, 6W], φ ∈ [−0.6, 0.6]. Fold bounds: ρ ∈ [0.2W, 3W], φ ∈ [−π−0.3, π+0.3].

## Fit: a growing chain from End 1
1. Fit [tail + S] (pose + rolls).
2. Append the next interval's rolls, fitting only the new rolls plus the last 2 previous ones (earlier ones frozen).
3. Repeat to the end.
4. Global polish with all parameters.

Residuals:
- **Data:** per-ring point-to-point outside windows; sliding inside windows; λ per visibility run.
- **Coverage:** per-window silhouettes, alpha-filtered.
- **Over/under:** overunder_v1.json on a dense surface z-buffer (cells), with no pairs within 1.5W of flat arc.
- **Depth priors:** strand z-means toward the layer anchors (ak_solve depth_profile), weak.
- **Visible-side rules per fold window:**
  - outer surface toward the camera at the S, far-left, apex and top-K tip;
  - inner surface toward the camera at the bottom-K loop bottom and the wrap curl.
- **Clearance:** non-adjacent ≥ 2·thickness.
- **End hidden:** the last 20 rings project inside the right leg's footprint and lie behind it.

## Emit / render / gate
- Emit the TRUE rulings: in rolls, lines parallel to the roll axis; in flat runs, interpolated. The exporter refuses to write if consecutive rulings cross or if any ruling deviates from the surface by > 0.1 px.
- Render via render-pose.mjs at 390×844 and build per-turn sheets [mockup | engine | offline].
- Gates:
  - silhouette IoU ≥ 0.97 per window
  - contour ≤ 2 px
  - face map ≥ 0.95
  - all over/under satisfied
  - end hidden
  - no pinches (ρ ≥ 0.2W at folds)
  - then my visual review, then the owner's

## Lessons from apex v3 (paper3), applied to the chain
- **Geometry:** the roll is round, there's no pinch, and the top shows the outer face in the offline render. The fold structure is correct.
- **Problems:**
  - A hard depth pin at z = 0 fights the perspective data: λ goes to its bound and the leg bends go to their ρ bound, which shows as visible crease lines on the right leg in the engine.
  - **Chain fix:** no absolute z pin. Depth comes only from relative constraints (over/under, the text weave against the ±17 css headline planes, the floor). λ per run lies in [0.8, 1.25].
- **Leg/run bends must stay gentle:** ρ ≥ 1W, |φ| ≤ 0.5, at least 1.5W apart in flat u. Stacked tight bends read as creases.
- **Seen-from-above:** keep it as a soft rule (weight 5, not 40). Judge by render.
- **Engine shows creases where the offline render is smooth:** this is caused by the uneven ring spacing in the export (dense in rolls, sparse outside).
  - **Exporter rule:** uniform spacing in surface arc, with densification in rolls ramped geometrically (neighbour spacing ratio ≤ 1.25).
  - Respect the engine limits (320 control points per variant; check `lib/ribbon` for the exact cap and report it).
  - Rulings are taken as the TRUE rulings (axis-parallel in rolls).
- **The top-of-roll dark band and the bright shoulder cap in the engine** are a lighting/material matter (Step C), not geometry: the offline render is correct.
