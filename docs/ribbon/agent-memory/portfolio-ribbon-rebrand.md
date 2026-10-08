---
name: portfolio-ribbon-rebrand
description: "Rebuild of ashmitkhurana.com around one live 3D orange ribbon forming the AK monogram; docs/ribbon/HANDOFF.md is the source of truth"
metadata:
  node_type: memory
  type: project
  originSessionId: 428f1961-b6ad-4758-ba30-ff5eb1800006
  modified: 2026-10-08T10:30:11.885Z
---

Branch `rebrand/ribbon` (pushed to origin), `main` = live site; ship via PR → Vercel preview → owner approval. Quality bar: Apple-level polish at minimum.

**Source of truth:** `docs/ribbon/HANDOFF.md` (written 2026-10-07 by the previous agent when its usage ran out). It holds the vision, every owner decision, the signature-pose topology/face/over-under spec, the edge-labelling bug (§6), failed approaches (§7), the motion design and the remaining work. Read it before any ribbon work; never re-decide what it records.

Status on 2026-10-07: the site skeleton and the render engine are done. The #1 blocker is that the signature AK pose geometry is wrong: the trace mislabels edges at folds, and the per-slice 3D lift can't make clean folds. Plan of record: Step A retrace (2D, owner approves before 3D) → Step B whole-strip 3D solve → Step C material. Then intro/scroll choreography, terminal, other screen-class variants, deploy.

2026-10-07: the owner APPROVED the 2D trace: docs/ribbon/turns/out_v9 (route_v8.json, guides_v5.json). Next is Step B, the 3D solve. Synthetic solver experiments are in docs/ribbon/turns/synth1–10. The synthetic fold solver PASSED all gates in synth13. The recipe: a per-fold paper-fold primitive fit (fold_primitive.py), converted to hinge parameters (hinge.py), plus a sliding point-to-curve data term (solve3d_synth13.py). Real-AK plumbing: ak_problem.py, emit_pose.py, render-pose.mjs (a build-flag pose override in lib/ribbon/poses/site.ts). Still needed: a twist primitive for the S twist and the wrap, then the real-AK solve window by window. The terminal port is done (components/terminal). The skeleton is pending the owner's answers: collapse the scroll room for now, and treat the storyboard as the layout target? The owner wants the live site running for them: the dev server at http://localhost:3100 (launch.json "site-live", NEXT_DIST_DIR=.next-dev, HMR), opened in their Comet with `open -a Comet <url>`. Opening a tab is fine; never resize or drive Comet. Keep it updated as work lands. The owner reviews sharply from images and catches trace errors fast, so show them sheets early.

An earlier "usage doesn't matter" overnight mandate (2026-10-06) is REVOKED. Usage economy applies again, per [[delegate-implementation-to-sonnet]].

**How to apply:** Only show the owner live, full-resolution, production renders at their sizes (1512×982 desktop, 390×844 phone), after they pass review. QA uses headless Playwright only, per [[agents-never-drive-user-browser]]. In this shell `rm` is aliased to `rm -i` and `ls` to `eza`, and both can hang a non-interactive command forever. Use `/bin/rm -f` and `/bin/ls`, and tell subagents to do the same.

Owner priority (2026-10-08): realism over exact overlap. Folds, curves and realism must be perfect (soft rolls, no fanning or crossing rulings, no kinks); a pixel-perfect match to the mockup is only a target. Current approach: multiple shooting (docs/ribbon/turns/MULTISHOOT_PLAN.md, scripts/mockup/msfit.py) with per-section overlays checked by Claude.

2026-10-08 (latest): every roll-chain approach (chain_fit, msfit, global_fit, design_fit) failed in the far half of the ribbon. NEXT = docs/ribbon/turns/CURVE_PLAN.md: a designed smooth 3D centreline using the engine's native points poses + curvature frames + soft folds (fold.ts), built from the owner's flow and judged by eye via the real engine renders. Start a fresh session with that file.

2026-10-08: the owner insisted, after repeated pixel-fitting failures, that the AK be BUILT FROM THEIR FLOW DESCRIPTION (HANDOFF §5a) with the mockup only as a loose landmark guide. Do not return to dense pixel fitting. Plan: docs/ribbon/turns/DESIGN_PLAN.md (scripts/mockup/design_fit.py).
