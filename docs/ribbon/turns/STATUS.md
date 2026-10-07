# Status for Ashmit (overnight 2026-10-07)

## For you to review: the new 2D edge trace
Open these side-by-side sheets: the mockup is on the left, the trace on the right.
- `out_v6/sheet_overview.png`: the whole ribbon
- `out_v6/sheet_apex.png`, `sheet_farleft.png`, `sheet_scurve.png`, `sheet_bottomk.png`, `sheet_wrap.png`, `sheet_junction.png`, `sheet_topk.png`, `sheet_endstrand.png`: 3× crops of every turn

Legend:
- **magenta** = edge 1, **green** = edge 2
- **dashed** = hidden behind another strand
- **yellow dotted** = roll outline (surface turning away, never an edge)
- **thin white lines** = matched cross-sections of the strip

What to check: does each colour follow ONE physical edge all the way, crossing over at every flip, exactly as we discussed (the apex dive line, top-K tip, far-left fold, S twist)?

## What changed vs the previous agent's trace
- Edges are now labelled by **physical continuity**, never by "outer vs inner". The edges cross over at the S twist, the far-left fold, the apex, the hidden twist after the wrap, and the top-K tip.
- Roll outlines (the apex flat top, the far-left outline, the S outer bend, the top-K tip end, the bottom-K loop bottom, the wrap curl) are marked as outlines, not edges.
- The left-leg anomaly is removed along your white line. The return strand now emerges from behind that true edge.
- The full turn-by-turn breakdown with coordinates is in `TURNS.md`. The locked spec is in `HANDOFF.md` §5a.

## Automatic checks (from `out_v6/report.txt`)
| Check | Result |
|---|---|
| Visible face vs your face map (all non-turn spans) | **100%** agreement (488 cross-sections), gate ≥ 95% |
| Wobble (curvature ripples shorter than 1 ribbon width) outside turns | **0** |
| Snap accuracy to the real image edge lines (core, p95 / max) | edge 1 **0.58 / 1.82 px**, edge 2 **0.88 / 2.01 px** |

The blurred tail bottom (the mockup's depth of field) is used as low-confidence data so it can't bend the line.

## New facts found while tracing (now part of the spec)
1. The sweep passes **in front of** the bottom of the A's right leg (where the bottom-K loop starts).
2. At the V by the right leg, the return strand runs over the crossbar's lower corner just before both go behind the right leg (return in front, as you said).
3. The junction X sits entirely inside the right leg's width.

## Not started (waiting for your OK on the trace)
- The 3D solve (design in `SOLVE_SPEC.md`). A synthetic test of the new solver, an exact paper fold reconstructed from its 2D edges only, was run to de-risk it. It does not touch your ribbon. Results are below once available.

## Synthetic solver test
(pending)
