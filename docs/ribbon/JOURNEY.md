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
| 4 | Realism-first: physics and spec first, mockup as a loose guide | 2026-10-09 20:34 to 10-10 | **48** (growing) | R1-R3, F1-F4, T1-T5, V1-V4, W1-W6, X1-X3, Y1-Y6, Z1-Z4, D1-D4, E1-E3, G1-G3, H1-H3 (H3 = v290, smoothest so far) |
| | **Running total** | | **290** | |

How era 1 splits (86):
- **29** curvature-frame versions v0-v28: 4 on disk with a pose (`curve/v0`, `v10b`, `v18w0`, `v19c`), **25 from notes**.
- **19** explicit-surface versions s0-s18: 2 on disk with a pose (`curve/s10`, `s15`), **17 from notes**.
- **30** distinct msfit section solutions (`msfit/sections/*.npz`, excluding `_pre`, `_prev`, `_APPROVED` and `_keep` copies). On disk, no pose.
- **8** other solver and test runs on disk: `chain`, `global`, `design`, `paper`, `paper2`, `paper3`, `ak_apex`, and `curve/spantest`. All but `spantest` have no pose.json.
- So era 1 is 7 on disk with a pose + 37 on disk without a pose + 42 from notes = 86.

How era 2 splits (95): the r-series ran r0 to r40 (41 numbers). 14 of those numbers still have folders (r7, r8, r14, r19, r23, r31, r33-r40), plus the variant `r39b`. **27 numbers are "from notes"** (r0-r6, r9-r13, r15-r18, r20-r22, r24-r30, r32; STATUS names r11, r12, r17, r18, r20, r21, r24-r28, r30 and r32 explicitly, the rest are implied by the contiguous numbering). The remaining 53 are one-off experiment folders around the main line: `c1-c8`, `b1-b5`, `f1-f5`, `g1-g4`, `k1-k4`, `n0-n4`, `s1-s4`, `e1-e4`, `sg1-sg3`, `lt0-lt7`, `at1-at3`. In total 14 + 1 + 27 + 53 = 95 (68 with a folder, 27 from notes).

Era 3 (61): every top-level `fit/<name>` with a `pose.json`, plus `fit/rim/rr1-rr3` and `rs1-rs2`. Era 4 (39 so far): `real/R1-R3`, `F1-F4`, `T1-T5`, `V1-V4`, `W1-W6`, `X1-X3`, then `Y1-Y6` (v268-v273), `Z1-Z4` (v274-v277), `D1-D4` (v278-v281), `E1-E3` (v282-v284), `G1-G3` (v285-v287), `H1-H3` (v288-v290).

**Current latest version: `real/H3` = v290 (smoothest so far; the apex still wrong).** **The next new version is v291** (round I: I1-I3 = v291-v293).

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
- Running total: 290 versions.
