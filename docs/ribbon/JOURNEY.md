# The AK ribbon: a project journey log

Material for the owner's future blog. Written 2026-10-09 (evening) from the repo history, `HANDOFF.md`, `RESUME.md` and `turns/STATUS.md`. It is meant to be honest, including the parts that did not work.

## In one paragraph

The portfolio's hero is a live 3D satin ribbon that forms the owner's AK monogram. It weaves in front of and behind the real HTML text (the name, the tagline), and later leads the visitor down the page as they scroll. There is no pre-rendered image: it is a real-time three.js scene with two layers (behind the text, in front of the text). The shape comes from a single AI-generated mockup of the monogram. That is the whole difficulty. A single picture of a ribbon that folds, twists and loops over itself does not say which way each fold rolls in 3D, and the picture is not even physically consistent. Between 2026-10-05 and 2026-10-09 the project went through roughly 270 distinct shapes and five very different methods. The engine (lighting, material, folds, ambient occlusion, resilience) came out solid. The shape is the hard part, and the real breakthrough was a change of goal rather than a change of algorithm: stop matching the mockup pixel for pixel, and build a physically believable, thick, luxurious strand that follows the mockup's flow.

## Version tally

**What counts as a version:** a ribbon SHAPE that was built and rendered. A folder counts if it contains a `pose.json`. Intermediate chain stages (`*_a`, `*_b`, `*_c`), gates (`*gate`), checks (`chk*`), temp folders (`tmp*`), `*_fit` stages, and non-pose folders (dumps, sheets, traces, material and lighting sweeps, `foldtest`, `enginetest`, the 14 `synth*` solver tests) are NOT counted. `curve/best` is an alias of a numbered version and is not counted separately.

Counts for era 1 combine three sources, marked in the table: `pose.json` on disk, solution files on disk without a pose, and "from notes" (a number that STATUS/RESUME mention or imply, whose folder is gone).

| Era | Method | Dates | Versions | Notable versions |
|---|---|---|---|---|
| 1 | Early methods: curvature frames (`author.py` v0-v28), explicit design surfaces (`surface.py` s0-s18), section fits (`msfit`), whole-ribbon solver runs | 2026-10-06 to 10-08 | **86** | v1-v29 curvature frames, s0-s18 design surfaces, msfit approved sections S, F, A, P |
| 2 | Rotosurf (`rotosurf.py`): copy the approved 2D trace ring by ring, design only depth, splice approved paper sections | 2026-10-08 to 10-09 04:22 | **95** | r7 (first), r14, r19, r23, r31, r34, r36, r37, r38, r39, r40 (last, rejected by the owner) |
| 3 | Smooth global fit (`fit3d.py` + `layer.py`): one B-spline ribbon fitted to the trace as a soft target | 2026-10-09 14:38 to 19:45 | **61** | fit0, g2 and h4 (wrinkles gone), k1 and e1 (wrap curl), e4, f3, kk4, rim-line fits rr/rs |
| 4 | Realism-first: physics and spec first, mockup as a loose guide | 2026-10-09 20:34 to 10-10 | **89** (growing) | R1-R3, F1-F4, T1-T5, V1-V4, W1-W6, X1-X3, Y1-Y6, Z1-Z4, D1-D4, E1-E3, G1-G3, H1-H3, I1-I3, J1-J3, K1-K3, L1-L3, Q50/Q35, P1-P9, S1-S3, X4-X6, scratch/N1-N12 (site hero: N12 = v331) |
| | **Running total** | | **331** | |

How era 1 splits (86):
- **29** curvature-frame versions v0-v28: 4 on disk with a pose (`curve/v0`, `v10b`, `v18w0`, `v19c`), **25 from notes**.
- **19** explicit-surface versions s0-s18: 2 on disk with a pose (`curve/s10`, `s15`), **17 from notes**.
- **30** distinct msfit section solutions (`msfit/sections/*.npz`, excluding `_pre`, `_prev`, `_APPROVED` and `_keep` copies). On disk, no pose.
- **8** other solver and test runs on disk: `chain`, `global`, `design`, `paper`, `paper2`, `paper3`, `ak_apex`, and `curve/spantest`. All but `spantest` have no pose.json.
- So era 1 is 7 on disk with a pose + 37 on disk without a pose + 42 from notes = 86.

How era 2 splits (95): the r-series ran r0 to r40 (41 numbers). 14 of those numbers still have folders (r7, r8, r14, r19, r23, r31, r33-r40), plus the variant `r39b`. **27 numbers are "from notes"** (r0-r6, r9-r13, r15-r18, r20-r22, r24-r30, r32; STATUS names r11, r12, r17, r18, r20, r21, r24-r28, r30 and r32 explicitly, the rest are implied by the contiguous numbering). The remaining 53 are one-off experiment folders around the main line: `c1-c8`, `b1-b5`, `f1-f5`, `g1-g4`, `k1-k4`, `n0-n4`, `s1-s4`, `e1-e4`, `sg1-sg3`, `lt0-lt7`, `at1-at3`. In total 14 + 1 + 27 + 53 = 95 (68 with a folder, 27 from notes).

Era 3 (61): every top-level `fit/<name>` with a `pose.json`, plus `fit/rim/rr1-rr3` and `rs1-rs2`. Era 4 (39 so far): `real/R1-R3`, `F1-F4`, `T1-T5`, `V1-V4`, `W1-W6`, `X1-X3`, then `Y1-Y6` (v268-v273), `Z1-Z4` (v274-v277), `D1-D4` (v278-v281), `E1-E3` (v282-v284), `G1-G3` (v285-v287), `H1-H3` (v288-v290), `I1-I3` (v291-v293), `J1-J3` (v294-v296), `K1-K3` (v297-v299), `L1-L3` (v300-v302), `Q50`, `Q35` (v303-v304), `P1-P9` (v305-v313; P8 was captioned v308 to the owner by mistake), `X4` (v314... see below), `S1-S3` (v315-v317, polish fits of P4, never shown), `X5` (v318).

**Current latest version: `real/X5` = v318 (shown to the owner as v314; X4 = v314 in this numbering would collide, so the tally now reads X4 = v314, S1-S3 = v315-v317, X5 = v318). Baseline: `real/X3` = v267.** **X6 = v319 (the owner: "the best one yet ... some tweaks left"); scratch/N1 = v320, N2 = v321, N3 = v322, N4 = v323, N5 = v324, N6 = v325, N7 = v326, N8 = v327, N9 = v328, N10 = v329, N11 = v330, N12 = v331 (the site hero). The next new version is v332.**

### Numbering scheme

`v<running number> = <folder>`. The running number is the position in the tally above: v1-v86 are era 1 (not itemised, see the splits above), then eras 2-4 in chronological order. Order is by the time the folder's pose was written (folder mtime, using the pose.json time; for era 4 the stage-a time, which is when the round started). Where a folder's mtime was only a git checkout time (the oldest ones), the r-number decides. A `*` marks "from notes" (no folder).

Era 2, `curve/` (v87-v181):

```
v87=r0*  v88=r1*  v89=r2*  v90=r3*  v91=r4*  v92=r5*
v93=r6*  v94=r7  v95=r8  v96=r9*  v97=r10*  v98=r11*
v99=r12*  v100=r13*  v101=r14  v102=r15*  v103=r16*  v104=r17*
v105=r18*  v106=r19  v107=r20*  v108=r21*  v109=r22*  v110=r23
v111=r24*  v112=r25*  v113=r26*  v114=r27*  v115=r28*  v116=r29*
v117=r30*  v118=r31  v119=r32*  v120=r33  v121=r34  v122=r35
v123=r36  v124=c1  v125=c2  v126=c3  v127=c4  v128=c5
v129=c6  v130=c7  v131=c8  v132=r37  v133=b1  v134=b2
v135=b3  v136=b4  v137=b5  v138=f1  v139=f2  v140=f3
v141=f4  v142=f5  v143=r38  v144=g1  v145=g2  v146=g3
v147=g4  v148=r39  v149=k1  v150=k2  v151=k3  v152=k4
v153=n0  v154=n1  v155=n2  v156=n3  v157=n4  v158=s1
v159=s2  v160=s3  v161=s4  v162=r39b  v163=e1  v164=e2
v165=e3  v166=e4  v167=sg1  v168=sg2  v169=sg3  v170=lt0
v171=lt1  v172=lt2  v173=lt3  v174=lt4  v175=lt5  v176=lt6
v177=lt7  v178=r40  v179=at1  v180=at2  v181=at3
```

Era 3, `fit/` (v182-v242):

```
v182=fit0_raw  v183=fit0  v184=f5  v185=g1  v186=g2  v187=g3
v188=g4  v189=h0  v190=h1  v191=h2  v192=h3  v193=h4
v194=i0  v195=i0k  v196=i1  v197=i1k  v198=i2  v199=i2k
v200=j0  v201=j1  v202=j2  v203=k0  v204=k1  v205=k2
v206=k3  v207=e1  v208=e2  v209=e3  v210=e4  v211=e5
v212=f1  v213=f2  v214=f3  v215=f4  v216=og1  v217=og2
v218=og3  v219=og4  v220=hh1  v221=hh2  v222=hh3  v223=hh4
v224=ii1  v225=ii2  v226=ii3  v227=ii4  v228=jj1  v229=jj2
v230=jj3  v231=kk1  v232=kk2  v233=kk3  v234=kk4  v235=ll1
v236=ll2  v237=ll3  v238=rim/rr1  v239=rim/rr2  v240=rim/rr3  v241=rim/rs1
v242=rim/rs2
```

Era 4, `real/` (v243-v267), with the in-flight round reserved:

```
v243=R1  v244=R2  v245=R3  v246=F1  v247=F2  v248=F3
v249=F4  v250=T1  v251=T2  v252=T3  v253=T4  v254=T5
v255=V1  v256=V2  v257=V3  v258=V4  v259=W1  v260=W2
v261=W3  v262=W4  v263=W5  v264=W6  v265=X1  v266=X2
v267=X3
(in flight, not counted yet)  v268=Y1  v269=Y2  v270=Y3
```

Note that folder names repeat across eras (`f1` exists in `curve/` and in `fit/`; `g1`-`g4`, `k1`-`k4`, `e1`-`e4` too). Always write the full `v<N>` or the folder path.

## Timeline

### 2026-10-05 to 10-06: the engine, and the first (hand-authored) shapes

The engine came first, and it has held up. A two-canvas depth-layered renderer (one ribbon in front of the text, one behind), render-once with contact shadows, GPU-swept shadows, quality tiers with poster fallbacks, and a pose editor at `/lab/editor`. The first AK poses were drawn by hand as control points and as soft folds. They were smooth but looked "vaguely AK" and plateaued there.

On 2026-10-06 the work turned to the mockup itself: masks, a skeleton graph, an S2 CMA-ES silhouette fit and then a rotoscope pipeline (edge extraction, lift to 3D, a "ruled pose" format where every ring is an exact pair of edge points). Two early lessons stuck: never use silhouette IoU as a success metric (an optimiser fattens the ribbon to cover the outline), and a per-slice 3D lift gives depth ripples and cannot make clean folds.

### 2026-10-06 to 10-07: the tracing bug, and the approved 2D trace

The big discovery of this phase was a labelling bug. The trace named edges by position ("outer" and "inner"). A fold or half-twist is a flip: the visible face swaps and the two physical edges swap sides at the same moment. One missed swap at the apex inverted every face downstream, and the 3D lift then fought the owner's face map everywhere.

The fix was to trace each physical edge as one continuous line that crosses over at every flip (S twist, far-left fold, apex, the twist after the wrap, top-K tip). After several owner reviews (hidden half twist in the wrap, the bottom-K double fold from the owner's sketch, a full-width end strand) the 2D trace `out_v9` was approved on 2026-10-07. This trace is still the foundation of every later method.

### Era 1 (2026-10-07 to 10-08): early methods, all rejected

Three families were tried to get from trace to 3D.

- **Solvers.** Fourteen synthetic tests (`synth1`-`synth14`) were run to de-risk an exact developable (paper-strip) solver. Fold primitives eventually solved on synthetic data, but on the real AK the chained section fits (`chain`, `msfit`, `global`, `design`) stalled: sections were good in isolation (S, F, A, P were approved and locked), but joining them broke depth consistency, and the global depth-plan fit blew the tail up toward the camera. The owner then set the priority that governs everything after: realism and flow over pixel overlap.
- **Curvature frames** (`author.py` v0-v28). Author the centreline and let curvature frames roll the band. The frames rolled the band on their own and flipped faces with tiny changes. A fold chose its side from its arrival angle.
- **Explicit design surfaces** (`surface.py` s0-s18). Build every turn from exact geometry (circles, arcs, twists). The owner called it "super bad": every reinvented turn looked wrong. Designing from circles and arcs is not how a real strip of satin behaves.

Both were rejected the same day. What survived was the pieces that had been approved: the trace, and the four paper sections.

### Era 2 (2026-10-08 to 10-09): the 2D trace plus rotosurf, r0 to r36

`rotosurf.py` flipped the problem. Each ring's two edge points are copied from the approved trace, exactly as they appear on screen, and only DEPTH is designed (roll from foreshortening, centre depth from the owner's layering, tail capped). The approved paper sections (S, F, A, P) are spliced in over their turn windows. The engine draws it as a ruled pose.

For the first time it was recognisably the mockup (r0-r10, "finally recognisable"). Then came a long run of surgical fixes, each diagnosed to ring numbers before changing anything:

- r14: bottom-K as a cylinder band whose ruling turns from the leg into the ring axis.
- r19: smoother edges and roll, after the owner reported small wrinkles all over the surface.
- r20-r21: with true tail depth the S rounds like the mockup, but the near tail renders pale. Root cause: a flat strip seen at a grazing angle mirrors the environment. The mockup's 4x perspective widening is artistic, not physical.
- r31: the S crease. Sections had been crossfaded by ring index while 60-80 px out of phase with the trace. Fix: align by arclength.
- r33/r35: the S fan and the S inner-corner ridge, fixed by re-pairing the two edges at equal arclength fractions.
- r34: the wrap's arch over the left leg. The edges were right; the crossbar was keyed behind the leg in depth.
- r36: the bottom-K loop. It was a 12-sided polygon, too small and seated too late. Refit as a smooth 120-point ring.

Also during this era, many knobs were tried and rejected (default-off flags remain in the code): `ZSM`, `ALIGN_DEDUP`, `EQS_POST`, `BK_FIT3`, `BK_TWIST`, `EDGE_SIGW1`. The S-to-F dent had three rejected fixes.

### Overnight 2026-10-09: r37 to r40, and the engine catches up

The shape work continued while the engine got its biggest upgrade.

- **Shape.** r37: the top-K loop rebuilt as a constant-ruling band (CYL), which removed the notch where it leaves the right leg. r38: the crease at the right leg's foot removed. r39: the apex's top-left corner rounded. r40: the A left leg's tilt halved so it catches the light.
- **Engine.** Baked environment ambient occlusion (inner faces darken from occlusion only, both faces keep the same colour). Bright rims instead of dark edge lines (`rimNormalMix` bends the rim normals toward the face like a rounded bevel). A golden-orange metallic material (metalness 0.7, no clearcoat, warm specular tint) after warm key colours and white clearcoat made salmon-pink highlights. A soft-box fill for broad satin gradients. The key light moved off the tail (blown-out glare dropped from 10.5 percent of tail pixels to 0.08 percent).
- **Site.** A desktop variant (`desktopify.mjs` uniformly scales the phone sculpture into the old desktop placement). The hero was swapped to r40 on both phone and desktop.

By its own numbers, r40 looked good: silhouette IoU 0.88, normal kinks down, the left leg lit. The morning summary said so.

### The owner's verdict on r40

The owner rejected it in plain words: "still a lot of wrinkles along the whole way ... the wrap around the left leg of A is completely fucked up". And the bar was restated: Apple-level polish, and "if you kept this in mind you would have never approved it".

The diagnosis was fair. Rotosurf copies a hand-traced outline ring by ring and splices approved sections, so every bit of trace noise and every splice becomes a 3D wrinkle. And with screen positions locked to the trace, the wrap curl could not go around the left leg: it passed through it. Metrics that looked fine had hidden what the eye saw in a close crop. New rule: nothing is shown or adopted unless it passes hard gates (no ripples in full-res close crops of every region, engine normal change at most about 3 degrees, zero clearance intersections including hidden ones, silhouette no worse than r40).

### Era 3 (2026-10-09 day): the smooth global fit

The reset was to stop copying the trace. `fit3d.py` fits ONE smooth ribbon (a B-spline centreline, a B-spline ruling direction, a half-width) to the trace as a soft target, with smoothness, developability and "ruling perpendicular to the tangent" as residuals, started from r40. `layer.py` then moves rings along their camera rays (so the screen image does not change) to enforce front/back order, and the fit is repeated with the layered depth as prior.

What worked: the owner confirmed it ("the ripples/wrinkles are gone though so awesome work on that"). Versions g2 and h4 removed the wrinkles; k1 and e1 turned the wrap curl into a face-on band of the mockup's width; e4 (minimum bend radius 25) reached zero clearance intersections and zero order violations; f3 matched the silhouette best. The engine was also verified clean in this phase: analytic helices render with under 0.03 degrees of normal error, so any remaining defect is the shape, not the renderer.

What did not work was matching the mockup exactly. The owner marked five turns as still wrong (the wrap around the A left leg, the top-K loop, the far-left fold, the bottom-K lower right, the S bend), and the wrap had to truly encircle the left leg in 3D for the planned slide animation. Everything tried to force the match failed:

- fixed outline assignment per turn (`ii`): crinkles gone, pinches remain;
- width floors (`jj`);
- oblique folds plus an edge roll radius (`kk`): `kk4` was the best numerically, but the turns still did not read right;
- mockup-outline targets inside five boxes (`ll`): buckles;
- turn cylinder primitives taken from the mockup outline: the silhouette does not contain the inner edges;
- fits to hand-picked interior rim lines, including the owner's hand sketch of the bottom-K loop, digitised (`rr`, `rs`): with forced sides the bottom-K hole improved, but every turn still folded sharply (normal jumps of 84 to 172 degrees).

Then a last resort: free AI image-to-3D (Hunyuan3D-2.1 on a public Hugging Face Space). It produced a smooth, well-made ribbon tangle that was not the AK at all. The owner's reaction: "bruhhhh ... so freaking bad lmao". Two other models were blocked by the free GPU quota.

The honest conclusion at the end of the day: single-image fitting cannot recover which way each turn rolls in 3D.

### The reframe from the owner

The turning point was a change of goal, from the owner:

> "you dont have to match the mockup 100% its ai generated ... our goal is to make it as realistic as possible a thick luxurious ribbon strand ... the mockup the trace is just to give you an idea"

and a pointer to the information that was there all along:

> follow the textual spec (faces, folds, flow) - it clears every ambiguity.

That is, an AI mockup is not a physically consistent object, so there is no 3D shape that matches it exactly. The written spec in `HANDOFF.md` section 5a (which face shows where, which edge crosses over where, what is in front of what) does determine a believable shape.

### Era 4 (2026-10-09 evening): realism-first rounds

Same optimiser, new priorities: physics and the written spec first, the trace as a loose guide, and every round judged in close crops, not in thumbnails. Each round fixes the one thing the previous round's crops exposed.

- **R (v243-v245), physics-first.** The physical behaviour of the strand leads and the trace only guides.
- **F (v246-v249), no edge-on stretches.** Long stretches where the strip is seen edge-on read as a thin wire or a smear, so F removes them (checked with `faceaudit.py` and `edgecheck.py`). The wrap now truly encircles the left leg, verified in 3D with `wrapcheck.py`.
- **T (v250-v254), smooth-flow energies.** Ripples were measured with `ripple.py` and came down by about 40 to 60 percent.
- **The fold investigation.** The "transparent fold top" the owner kept seeing turned out to be a twist, not a fold. The `foldtest` rig (six analytic poses) showed that true folds render cleanly in the engine, and that a bend leaning away shows its inside face. So the rule became: build real folds, and make sure the visible surface is the OUTSIDE of the roll.
- **V (v255-v258)** were the rounds of the fold investigation above.
- **W and X (v259-v267), true folds.** Folds with a radius of about 40 that roll toward the camera, an outside-only rule (`convexcheck.py` measures whether the visible surface is the outside of each roll), and a flip guard against sudden face changes.
- **Y (v268-v270, in flight).** The latest observation is that the folds now read as real folds but their edges are wavy. Y is edge fairness: smoothing the folds' edges without softening the folds.

## What the numbers say about the hard part

About 267 shapes in four days. The first 86 were methods that either invented geometry or could not join their sections (the approved sections survived and were reused). Another 95 were rotosurf steps and experiments that improved the trace match, and ended in a shape the owner correctly rejected. 61 smooth fits proved that wrinkles are solvable and that exact matching is not. Only the last 25 targeted the actual goal.

## Lessons learned

- **When a hundred rounds of tuning fail, the problem is upstream of the knobs.** Here it was the inherited 3D depth layout: a picture-identical shape can still be physically absurd in depth. Measure the 3D shape ring by ring before adding another term.

- **Single-image 3D is ill-posed.** A picture does not say which way a fold rolls. Any method that fits a 3D shape to one view will find many wrong answers that match the view.
- **An AI mockup is not physically consistent.** It is art, not a photograph of an object. Chasing it pixel for pixel means chasing a shape that cannot exist.
- **Realism beats pixel match.** The owner's rule, and the one that finally worked. A believable strand that follows the flow looks better than an exact copy of impossible geometry.
- **Do not use overlap metrics as the goal.** Silhouette IoU is fine as a regression check, but an optimiser will fatten the ribbon to win it. An outline target cannot see the inner edges.
- **Judge in close crops, in the real engine, at full resolution.** Many results looked fine as a metric or a thumbnail and failed in a crop. The morning summary for r40 is the example.
- **Distinguish a twist from a fold.** The "transparent fold top" was a twist. They look similar and need opposite fixes.
- **Verify the renderer separately.** Analytic helices proved the engine is clean (under 0.03 degrees normal error), which made it safe to blame the shape.
- **Diagnose to a ring number first.** Every real fix in r31-r40 started with "which ring, which quantity breaks (edges, ruling pairing, depth, normal change)".
- **Automatic fitting needs the right 3D starting shape.** Optimisers fall into the nearest wrong minimum (the fold-window local minimum, the sign of each roll). Initialising from a physically sensible shape matters more than the residual weights.
- **Do not reinvent what the owner approved.** The trace labelling and the approved sections were the only stable ground; designing turns from circles and arcs was rejected by eye.
- **Be honest in the notes.** Each rejected knob is recorded with its numbers, so the same idea is not tried twice.

## Tools built

All in `scripts/` (Python in `scripts/mockup/.venv`).

- `scripts/curve/rotosurf.py`: the rotosurf builder (era 2). Trace edges plus designed depth plus spliced paper sections, with env-gated knobs for each fix.
- `scripts/curve/fit3d.py`: the smooth global fit: one B-spline ribbon fitted to the trace as a soft target (era 3 and 4), with fold, face, clearance and bend terms.
- `scripts/curve/layer.py`: re-layers a ruled pose in depth along camera rays so the screen image does not change, while enforcing front/back order.
- `scripts/curve/diagnose.py`: per-ring engine metrics (normal change, obliquity, curvature), ring-to-pose mapping, overlays.
- `scripts/curve/clearance.py`: 3D clearance clusters between non-adjacent strands (flags intersections, hidden ones included).
- `scripts/curve/silhouette.py`: render vs mockup silhouette diff and per-region IoU.
- `scripts/curve/wrapcheck.py`: does the wrap truly encircle the A left leg in 3D (front, then round the outside, then behind).
- `scripts/curve/faceaudit.py`: which face (A, B or edge-on) shows at each ring.
- `scripts/curve/edgecheck.py`: fold-zone rule: a face may change only where the edge crosses over at a fold, never by sliding.
- `scripts/curve/convexcheck.py`: is the visible surface the outside of each fold's roll.
- `scripts/curve/ripple.py`: ripple metric, the second difference of the unit normal along the strip.
- `scripts/render-pose.mjs`: headless pose renderer through the real engine, with `--settings` (live engine settings patch), `--material` and `--tier` overrides.
- Baked ambient occlusion (engine): depth maps from 32 directions baked into a per-vertex texture, re-baked only when geometry changes.
- `scripts/curve/desktopify.mjs`: builds the desktop variant of the pose from the phone sculpture (exact port of the pose-to-world mapping).
- Smaller helpers worth a mention: `cylfit.py` (constant-offset cylinder bands), `ringmod.py` and `bkfit2.py` (bottom-K ring), `dump-pose.mjs` with `views.py` (false-colour and side/top views), `pose-check.mjs`.

## How to continue this log

Each new round is appended, not rewritten.

1. Give every new shape the next number (see the "Current latest version" line above). Use `v<N> = <folder>`.
2. Count a folder as a version only if it contains a `pose.json` (same exclusions as the tally section).
3. Add one row to the "Version tally" table when a new era starts, or bump the count of the current era (era 4). Update the running total and the "Current latest version" line.
4. Append the new `v<N>=<folder>` entries to the numbering block for that era.
5. Add a short section to the Timeline in the same format as above: date, method, what worked, what failed and why, the owner's words if they matter.
6. If a lesson changes, update "Lessons learned"; if a tool is added, add one line under "Tools built".

## 2026-10-09/10: rounds after X3 (v268+)
- Y (v268–v273): far-left convexity, apex hand-off, local smoothing, edge fairness — no improvement over X3; strong edge fairness distorts the figure.
- Z (v274–v277): forcing the fold line from the leg directions made folds worse; narrowing the face-rule zones helped the K-junction streak only in combination.
- Key insight: the A legs run steeply in depth in our 3D shape (they barely reverse direction in 3D), so the apex can only twist, not fold — the depth layout inherited from the old trace pipeline is too deep.
- D (v278–v281): flatten the sculpture. A new residual (`--flat w`) pushes the centreline's direction toward the screen plane, so the A legs can lie across the view and the folds can really reverse.
  - D1 (flat 2 everywhere): little change; the top-K tip turned into a pinched point. Rejected.
  - D2 (flat 6 everywhere): the whole figure distorted and the wrap no longer went round the leg (wrapcheck FAIL). Rejected.
  - D3 (flat 6 + far-left roll R30 + narrower face rule): the far-left fold finally showed its outside, but the wrap broke and the apex went edge-on. Rejected.
  - **D4 (flat 6 only around the apex and the top-K tip, `--flat_ranges 470:560,1140:1240`): the new best (v281).** The apex became a true rounded arch like the mockup's, and the top-K tip a clean big loop: in 3D its legs now reverse almost exactly (T_in·T_out −0.996 vs −0.83 for X3). The worst ring-to-ring normal change fell from 64° to 35°. Zero intersections, and the wrap still truly encircles the leg.
  - Lesson: flatten locally, where a fold must reverse, not globally. Global flattening moves everything else and breaks the over/unders.
  - Still open on D4: the far-left fold still shows its inside (25 % outside), the right leg runs nearly edge-on for a short stretch just below the apex, and a thin edge-on rim at the right of the top-K tip.
- E (v282–v284), 2026-10-10: building on D4.
  - E1 (D4 + flattening and an outside-shown roll at the far-left fold): the far-left became a pinched vertical twist (normal jump 113°). Rejected.
  - **E2 (D4 + the narrower face rule `faces_v2.json`): the new best (v283).** By eye it is the same as D4, but twice as smooth: the worst ring-to-ring normal change is 17° (D4 35°, X3 64°).
  - E3 (E1 + E2): the same far-left pinch as E1. Rejected.
  - Lesson: the far-left fold cannot be forced to show its outside by local terms; the roll pinches instead. It needs a different approach later.
  - Still open on E2: the right leg runs edge-on for a short stretch below the apex (the fold line still points into depth); the far-left still shows its inside.
- Owner review of E2 (2026-10-10), boxes drawn on the side-by-side: "ive boxed everything thats wrong the apex and the fodls thats it" (apex, top-K tip, far-left fold, bottom-K corner at the right leg), then "also just noticed this wrap around is also wrong not phsycally possible" (the wrap's curl down the outside of the left leg). Everything else (tail, S, sweep, crossbar, return, legs) passed.
- G (v285–v287): wider flattening around the apex/top-K (G1), plus the in-plane fold line (G2), plus a stronger face rule (G3). The apex now changes face cleanly, but as a creased flat top with a short ledge, and the worst normal change climbs back to 63–67°. Rejected.
- **The breakthrough diagnosis (2026-10-10).** Close crops of the five boxed turns against the mockup show that NONE of the mockup's turns is a crease. Every one is a ring-like CURL: the band bends around one axis, keeps its full width, its width stays square to the path, and its edges stay smooth concentric curves. The visible face changes only because the curl is seen at an angle (outside face on one side, the darker inside face on the other); the two edges then cross over in projection, exactly as the owner's "edge crossover" rule describes. Since round W we had been building oblique paper folds (the ruling at 30–60° to the path at the crease), which is what produced the gooseneck apex, the edge-on stretches, the chamfered far-left and the sliver at the wrap.
- The owner, on seeing this: "please dude for gods sake just imagine for yourself ... get it done apple level polish and detail and attention to detail and smoothness everythingggg".
- New fitter term `--curl a:b:R:w` (commit facf876): inside a turn window the band is a true cylinder band: its width stays square to the path, it does not rotate (no twist), and the radius has a minimum. A regression test confirmed the old settings give identical results.
- H (v288–v290), the curl rebuild: all five turns (far-left, apex, bottom-K, wrap, top-K tip) as curls, no creases.
  - H1 (weight 30, smaller radii): the smoothest yet (normal change 6°), but the wrap no longer goes round the leg. Rejected.
  - H2 (H1 + flattening): the curls coiled into extra loops, and one intersection. Rejected: flattening fights curls.
  - **H3 (weight 60, radii 35–55): v290.** Normal change at most 9.8° (E2 17°), wrap verified, no intersections. The wrap is finally a full-width curl round the leg, and the bottom-K a round ring showing its inner face. But the apex reads as a flat ledge (its curl axis lies in the screen plane, so it rolls backward in depth), the top-K tip pinches, and the far-left is a stepped overlap.
  - Lesson: a curl also needs the right AXIS. To read as a round arch from the front, the apex's axis must point mostly at the viewer (tilted about 45°); the wrap's axis must lie along the leg. New term `--bz a:b:t:w` targets the axis's depth component.
- I (v291–v293): H3 plus aimed curl axes. All three lost the wrap around the leg (wrapcheck FAIL). Rejected unseen.
- **The owner stopped the slide (2026-10-10):** they showed X3 from the previous session next to H3: "your attempts are fucking it up more than before ... how can you be fucking going backwards dude????". They were right. Each round re-solved the WHOLE ribbon from an old starting shape (kk4), so fixing five turns moved everything already accepted: the A legs, the far-left, the overall figure. New rule: X3 is the baseline, every round starts from X3 and pins everything outside the turn windows to it (`--keep W --keep_free a:b,...`), and the whole figure is compared with X3 before anything is sent.
- The owner then boxed X3's remaining faults: a ripple at the base of the A's left leg (far-left), a ripple on the left leg approaching the apex, the wrap, and the top-K loop's front strand looking dark: "when it comes out the back its other face is supposed to be showing and how is it dark if its in front of the other one????" ... "if oyu fix the face of the wraparound the bottom crossbar the top k loop fixes itself". Also: "if you can fix the bottom k loop to look a little more like the mockup it would be awesome".
  - Measured: X3's faces match the spec labels (B after the wrap), but along the return and the top-K front strand the visible face points DOWN (normal −0.66 vertical) and away from the key light. We see the band's underside, hence dark. X3's wrap is edge-on for ~70 rings: it never curls round the leg. The owner's diagnosis was exactly right.
- J (v294–v296): from X3 with `--keep`. The centreline held within 1 px outside the windows, but the band's orientation drifted up to 80° even in pinned regions. Cause: the fitter's `--init perp` replaces the starting pose's real ruling with one square to the path, so the pin held the wrong orientation. The wrap also ballooned out to the left (64 px). Rejected. Fix: `--init raw` when starting from a finished pose, plus a stronger trace weight inside the free windows.
- New fitter term `--lit a:b:t:w`: the visible face must tilt up toward the light (used on the return and the top-K front strand).
- The owner on J1 (shown on request): "sooooo muchhhh worseeeeee".
- K (v297–v299): from X3 with `--init raw`, free windows at the far-left, the left leg below the apex, the bottom-K, and the wrap through the end strand; curls, the light-facing term on the return and the top-K front.
  - K1/K2 lost the wrap (wrapcheck FAIL; K2 also intersects). Rejected.
  - K3: the top-K front strand now shows its lit top surface (the owner's "how is it dark" point), and the bottom-K is a bigger, rounder loop like the mockup. But the wrap ends in a cut-off vertical sheet and the return wiggles. Not better than X3 everywhere, so not shown.
- **Why every wrap was a sliver (2026-10-10).** The wrap's curl axis was held in the screen plane (along the left leg, via `--faceon`). A band coiled around an axis lying in the screen plane is always seen exactly edge-on at its sides. In the mockup the loop around the leg is seen at an angle, like a tilted ring you look into. Its axis must tilt toward the camera (`--bz` about 0.45–0.6), with the loop loose enough to clear the leg.
- L (v300–v302): the wrap alone, from K3, with the curl axis tilted toward the camera. All three render the same edge-on cut as X3. Rejected.
- The owner: "maybe just stop and think for a minute that what could be a good fix cause you are just degrading dude ffs please" and "shouldnt that have been fucking obvious that if its still failing at 300 versions fucking stop and think about it??" They were right: the handoff already said the 3D depth layout was too deep, and I kept adding optimiser terms on top of it.
- **What stopping to think found (2026-10-10).** Measured ring by ring in X3:
  - The wrap crosses in front of the left leg at depth +88, turns 90° and dives straight away from the camera for ~100 px of depth while moving only ~15 px on screen, then returns behind the leg at −51. That straight dive is a flat sheet pointed at the camera: the "vertical cut". Wrapping a thin flat leg needs only about ±20 px of depth. The wrap's SCREEN path was already fine (it stands ~20 px off the leg's edge).
  - The A's left leg itself waves in depth: 46 → 8 → 7 → 22 → 55 from its foot to the apex, tilting ±0.7 toward and away from the camera. Those are exactly the owner's two ripples (at the base of the leg and approaching the apex). The old layering step dented the leg to let the wrap pass over it.
  - Physically, the wrap is a ribbon draped over the leg's edge, like over a ruler: the crossbar comes in at a slant, rolls round the edge, and the return leaves at the mirrored slant (the upper/lower "V" of the spec). Our curl term forced the band square to its path, which forbids that slant. The trace, the deep layering and the curl term were all fighting the correct shape, so no tuning could converge.
- Q50/Q35 (v303–v304): X3 with all depth squeezed to 50% / 35% around its median, keeping every screen position. The outline is pixel-identical, no new intersections, the wrap still goes round the leg; the cut gets thinner but remains. A uniform squeeze isn't enough; the depth needs to be designed where it's wrong.
- Next, `real/P1`: a targeted depth edit, no optimiser: straighten the left leg in depth, and rebuild the wrap's depth as a round roll (front pass ~22 px in front of the leg, a half-turn round its edge, back pass ~22 px behind). The screen image stays identical.
- P1–P9 (v305–v313): direct edits on X3 (depth and band orientation, no optimiser): leg straightened in depth, the wrap's dive removed, the band's width laid flat (P3: the wrap became a full-width loop and the return lit, but as a flat "C" that bends in its own plane), then a hidden twist and two-roll variants (P6–P9). The owner: "this is so fucked dude?????????" on P8 and "just stop all work for a second and come to me to talk about it". The patches fought the traced outline and produced crumples, kinks and contacts.
- **The owner's own fix (2026-10-10):** "just abandon everything after x3 and come back to x3 ... all we need to fix is the ripple in the ribbon at the bottom left leg of a ... the similar thing near the apex ... after that till it enters the wraparound everything is fine. What goes wrong is when it comes out its on the opposite face. Do exactly what you did to enter the wraparound and flip it 180 degrees and connect it properly ... we get same face on both crossbars ... the top k loop fixes itself (hopefully). Just do this and send it to me without moving onto another approach yourself."
- X4 (v314): exactly that. The left leg's depth smoothed (the ripple band gone), and the wrap exit mirrored: the band's tilt flipped 180° behind the leg (rings 987–1002), carried through the return, top-K and end strand. The return's visible face now points up (+0.48, was −0.66 in X3), the same face as the incoming crossbar. Two issues: mirroring X3's creased top-K tip made a pinch, and one contact.
- The owner on the far-left: "why does it fucking bend forwards for no fucking reason????" The leg base rose toward the camera (36 → 47) right after the fold, a leftover of X3's depth. Fixed by letting the leg leave the fold at a straight, even slope (37 → 62).
- X5 (v318, shown as v314): X4 + the straight leg + a round top-K tip (one steady axis square to both strands) + small depth nudges (return in front of the back layer, end strand further back). No intersections. Left: a small hook where the flip's end peeks out from behind the leg, and a small kink at the top-K tip's outer edge.
- Lesson: when the owner gives a concrete fix, do exactly that, on the baseline they named, and nothing else.
- The owner's review of X5, item by item (no work until their green light): the A's left leg still bends at its base and near the apex ("why cant it be fucking straight"); the apex is wrong ("we have gotten the apex right multiple times in the past just use that"); a glitch (little triangle) where the wrap comes back; the top-K loop and the strand coming back fold the wrong way.
  - Measured: the leg's depth was already smooth; the bends were in its traced screen outline (heading −40° → −76° → −62° at the base, −54° → −95° near the apex).
- X6 (v319), on the owner's green light for one round: the left leg rebuilt as a straight band (straight centreline on screen and in depth, the band's orientation turning evenly); r40's approved apex and right leg and r40's approved top-K loop transplanted in (same ring numbering, crossfaded joins, the top-K join within 6°); the flip shortened to end by ring 997.
  - Fixed: the straight leg; the top-K loop rolls the right way.
  - Not fixed: r40's apex reads as a flat squared top in the full view; a crease on the right leg at the transplant join; the little triangle on the return is still there (so it was not the flip); the straight leg touches the wrap's front pass at one point.
- The owner on X6: "okay this is the best one yet like literally some tweaks left". Their tweak list: the translucent look at every fold and on the top-K strand; the left leg still bends at its base; the wrap entry passes through the left leg; the glitch (triangle) where the wrap comes back; the top-K loop not as beautiful as the mockup's; the A's right leg broken (the r40 transplant brought r40's whole right leg); a crumple behind the right leg (the top-K transplant join).
- N1 (v320), the owner's "try once from complete scratch": a new builder (scripts/curve/scratch/build.py). Screen path = the smoothed trace with straight legs; depth optimised for the face spec, the over/unders, smoothness and shallowness; band orientation from physics (no in-plane bending: the width follows the centreline's binormal in turns, minimal twist on straights). It failed badly: crumpled everywhere. The binormal is unstable where the curve is nearly straight or inflects, so the band flipped back and forth; the depth optimiser also stopped early with wild depths and left the sweep on the wrong face. The principle (a ribbon's shape follows from its centreline) stands, but it needs a robust, explicitly controlled frame, not one read from noisy curvature.
- The owner on N1: "why is it so fucked up??" and "what have i told you?? you decide every single thing what is supposed to be done and execution agent only executes doesnt think at all". The N1 brief had left four design choices to the agent.
- N2 (v321), from scratch again, every number decided by me in a config file (docs/ribbon/turns/scratch/N2/config.json): each turn is a section of a cylinder (one tilted plane; the band's width held on the plane's axis: physically exact, cannot crease or crumple); straights are straight in depth with an even, minimal twist; the screen path is the approved trace, smoothed, with straight legs. Result: smooth everywhere (worst normal change 8°). The owner (after waking): "yes a lot of things in this is right except a few wrong twists". The right leg twisted 87° and the crossbar 74°.
- The owner then asked me to work end to end myself without subagents, for this session only.
- N3 (v322): turn axes solved for zero twist; the right leg came out on the wrong face (the solver didn't know faces).
- N4 (v323): a full solver over every ring: faces per the spec, X3's over/unders (with the spec's order at the junction, where X3 itself was wrong), gentle climbs, minimal visible twist, a helical pitch per turn (a ribbon spiralling round a cylinder is still exact), and the owner's own trick: unavoidable twists hidden behind the A right leg, with a deliberate half twist allowed there. Visible twists 1–22°.
- N5 (v324): + a visible-width target, so bands read wide (the sweep and right leg had been edge-on-ish).
- N6 (v325): + junction clearance. Zero intersections, worst normal change 12°, no visible twists. Open: the sweep is still narrowish and dark, the tail dark, the apex top flat.
- Lesson: a ribbon's look is set by the axes of its turns; the right parametrisation (cylinder turns + straights) makes it smooth by construction, and then a solver on a smooth model actually works.
- The owner on N6: "i think only this is left everything else seems perfectttttt" (one box: the junction at the A's right leg).
- N7 (v326): the hidden twists had been placed over ring windows wider than the part actually covered by the right leg, so their ends peeked out as a pinched neck and a corner. Measured the fully covered rings (back layer 836-848, return 1070-1079) and confined the twists to them. Nothing else changed. Zero intersections.
- N7 went onto the local site (phone + a desktop version), with a new material. Two bugs surfaced:
  - Desktop: the desktop sculpture was the phone one scaled and moved right, so the camera saw it ~10° from the side and the twists hidden behind the A's right leg showed. Fix: rotate it so the desktop camera sees it from exactly the phone's direction (scripts/curve/scratch/desktopify_view.py).
  - **The "translucency" bug, finally solved (2026-10-10).** For days I treated it as lighting (rim glow, metalness, bloom, then a thinner band). The owner: "how can lighting make something opaque translucent????" Right. Test: draw both sides of every triangle. 500k pixels changed, and the owner, watching the dev server live, saw the translucency vanish. Parts of the closed band are wound inside out (the ruled pose's ruling sign vs the sweep frame), and the engine culled back faces, so on those parts the near surface wasn't drawn and you saw into the band. Fix: the ribbon material draws both sides (THREE.DoubleSide). The thick band is restored (0.147).
  - The owner: "yes its perfect".
- N8 (v327): the owner spotted a hiccup behind the A's right leg (a hidden half twist leaking ~6 rings past the leg's edge through band smoothing); twists moved to the middle of the covered stretch, smoothing reduced. Ribbon ends now cut straight (the engine's rounded caps off: "what ribbon has rounded ends??").
- Responsive desktop tail (engine feature `tail` / steerTail): per viewport, the leading end is rebuilt from the end of the S as a smooth face-on band that leaves the bottom edge with its RIGHT edge at the screen centre (owner's mockup). First try started it too early (it swung far right); now it starts after the S (ring 250).
- First animation (owner, before sleeping: "the ribbon should enter the pose from the hidden end in the back and follow the whole pose's flow until it reaches the bottom leading end"): the pose stays locked and the existing slide mode moves the ribbon along its own path. New `hiddenEntry`: the path beyond the hidden end runs along the camera ray through the tip, so it projects to a single point behind the A's right leg; the ribbon grows out of that point and slides through the whole flow until the leading end reaches the bottom, critically damped, about 5 s, no scroll or sway yet.
- The owner caught a crumple at the junction during the intro, and insisted it wasn't animation-only ("dont assume the bug"). Measured: both hidden half twists turned 180° in 6-8 rings (up to 53°/ring, 14-18 px of a 51 px band): a physically impossible twist rate, present in the final pose and merely covered by the right leg. A diagonal fold can't replace it (a fold always turns the strip; folds that keep direction need 2-3 band widths). Measured which stretches are fully hidden in the final pose (only 830-856, 1070-1082, 990-998), then gave each twist its whole hidden stretch: 11°/ring and ~13-20°/ring. A visible "small twist after the wrap" (from the spec) was tried and read as a hook, so it was dropped.
- The apex fold-over (inner edge running backwards at rings 476-482) was a 9 px-radius kink in the traced screen path at the apex's left shoulder; fixed with local path smoothing (N9, v328). No fold-overs anywhere now.
- Desktop tail redone like the owner's desktop mockup: rebuilt from mid-S (ring 165), the band's real orientation carried through the U (no forced face-on inside the turn, which had pinched it), turned face-on only on the straight lower run.
- The owner: "why is it flipping at all dude it shouldnt it should have travelled smoothly straight??" Right again. The hidden half twists existed only so the face LABELS (A/B) matched the spec, which mattered when the two faces had different colours. Since the material change both faces are the same orange and both sides are drawn, so a 180° flip is invisible except as the twist itself. N10 (v329): flips removed; the strands travel straight, each connecting stretch twists at most 17° spread evenly (max 1.8°/ring there).
- N11 (v330): the owner spotted a hitch on the A's left leg heading to the apex and on the desktop sweep. Measured edge-curvature jitter found three construction seams on the leg (end of the straight section, the leg-to-apex turn hand-over, the edge of the shoulder smoothing patch) and the tail-to-S join on desktop. Fixes: 25-ring blends at straight-section ends, a wider shoulder patch, band-angle smoothing only at turn/straight seams, and on desktop the rebuilt tail is smoothed across its join with the S. Edge jitter dropped 2-7x; nothing folds back anywhere.
- Material round 2: a glossy metallic satin reflecting narrow strip lights brought back highlight streaks, but the owner saw the BACK faces lit instead of the front ones, and asked for matte. Final: metalness 0, roughness 0.4, the key just upper-left of the camera, and the engine's depth shading (0.6) so nearer surfaces read brightest. The light exactly at the camera alone looked flat; the depth shading gives the front-to-back falloff.
- N12 (v331): the apex shoulder hitch, now clearly visible in the glossy render, removed by smoothing both band edges directly over rings 440-530 (sigma 7). Edge jitter there 0.121 -> 0.013, the smoothest part of the ribbon. Intro slowed (spring stiffness 3 -> 1.6).
- Lesson: re-check old constraints when the thing they protected changes; the A/B face rule outlived the two-colour material that motivated it.
- Lesson: when a visual bug survives every shading change, test the renderer's geometry assumptions (culling, winding, depth) directly. One A/B render would have found this days earlier.
