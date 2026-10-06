# Portfolio Rebrand: Ribbon Handoff

This doc is for whoever continues this work: Codex, another agent, or a human. It covers the vision, every decision the owner (Ashmit) has made, what is built, what failed and why, and a step-by-step plan to finish. Read all of it before changing anything. Most of the expensive mistakes so far came from re-deciding things that were already decided.

- Repo: `/Users/ashmitkhurana/Development/studio/portfolio`
- Branch: `rebrand/ribbon`. It is **local only and not pushed**; push it first so it is backed up.
- `main` is the live site at ashmitkhurana.com. Do not touch it until the rebuild ships through a PR.
- Last commit when this was written: `938cce8`.

---

## 0. TL;DR status

| Area | Status |
|---|---|
| Site skeleton (home sections, `/work`, `/work/[slug]`, `/about`, 404, header, mobile menu, content, SEO) | ✅ Built and responsive. Layout QA script passes at 16 sizes. Needs a design-polish pass later. |
| Ribbon render engine (two-layer weave behind/in front of HTML, single offscreen renderer, MRT mask, contact shadows, GPU sweep, tiers, posters, resilience) | ✅ Built, fast (120 fps on M-series ProMotion), and stable (no flicker). |
| Signature pose geometry | ❌ **Not correct yet.** The 2D edge tracing is close, but the trace mislabels edges at folds (see §6). The per-slice 3D lift cannot produce clean folds (see §7). This is the #1 remaining task. |
| Material / lighting | 🟡 Neutral-light pipeline is in. The look does not yet match the mockup (gloss streaks, rims, deep inner faces). |
| Intro choreography, scroll-linked journey | ⏳ Designed (§9), not built. |
| Terminal (command palette with the fun commands from the live site) | ⏳ Placeholder only (§10). |
| Desktop / tablet / ultrawide placement of the signature pose | ⏳ The phone variant is the reference. Desktop is stale. |
| Deploy | ⏳ PR → Vercel preview → owner review → merge. |

---

## 1. Vision and non-negotiables (from the owner)

- **Quality bar: at least Apple-level polish.** Animation feel, frame rate, typography and responsiveness are hard requirements. "It works" is not done.
- **Design language:**
  - near-black warm background
  - off-white huge heavy display type (Mona Sans 900, variable `wdth`)
  - small mono uppercase labels (JetBrains Mono)
  - Inter for body
  - one accent: the glossy orange ribbon
- **The ribbon is the product.** One continuous 3D ribbon weaves **in front of and behind** the real HTML text and components. It forms the **AK monogram** (the signature pose) in the hero, then leads the user through the whole site as they scroll.
- **Ribbon physics must look like satin or paper, never jelly or a steel rod:**
  - it never stretches
  - it bends only across its width (out of plane), never sideways within its own plane
  - sharp turns are **folds**: soft, rounded, never a hard crease
  - smooth lines and curves everywhere: **no wrinkles, kinks or jaggies, ever**
- **Motion:** calm when idle (gentle breathing only). Energy and playfulness come from **scrolling**.
- **Two faces:** face A and face B must be **independently colourable**. The default is the **same orange** for both; inner faces read darker purely from shadow.
- **No shortcuts.** The owner explicitly rejected a pre-rendered image hero. The hero must be the live 3D ribbon.
- **Content decisions:**
  - identity: "Full-Stack Developer — Building across interfaces, systems, and AI."
  - email itsme@ashmitkhurana.com
  - LinkedIn https://www.linkedin.com/in/ashmitkhurana/
  - Alpha Block is the **current** role (Oct 2025 — Present)
  - **no Bellarisse** anywhere (the client abandoned it)
  - **no Gamorite** until the owner says so
  - free fonts only

---

## 2. Running things

```bash
# dev (the owner watches this live; keep it running while working)
NEXT_DIST_DIR=.next-dev NEXT_PUBLIC_LAB=1 npx next dev --turbopack -p 3100 -H 0.0.0.0

# production build (any extra build uses its own NEXT_DIST_DIR to avoid clobbering)
NEXT_DIST_DIR=.next-x NEXT_PUBLIC_LAB=1 npm run build
NEXT_DIST_DIR=.next-x NEXT_PUBLIC_LAB=1 npx next start -p 4000
```

**Lab routes** (only when `NODE_ENV=development` or `NEXT_PUBLIC_LAB=1`):

| Route | What it is |
|---|---|
| `/lab` | Ribbon look-dev: Tweakpane panel, HUD, reference overlay, debug views (mask, ribbon RT, shadow catcher). |
| `/lab/fonts` | Font comparison. |
| `/lab/editor` | Pose editor (drag points, depth/top views, diagnostics, save via `app/api/lab/poses`). |
| `/lab/fit` | Silhouette-fit page used by the earlier pipeline. |

**Useful query flags on `/`:**

| Flag | Effect |
|---|---|
| `?ribbon=0` | No ribbon (layout QA). |
| `?tier=0..4` | Force a quality tier (0 = no JS, 1 = poster, 2 = low, 3 = medium, 4 = high). |
| `?debug=1` | `window.__ribbonLog`, an event log (tier, DPR, MSAA, shadow renders, pose apply, …). |

**Python venv** (for the mockup/rotoscope scripts): `scripts/mockup/.venv` (numpy, opencv, scikit-image, scipy, pillow). Install from `scripts/mockup/requirements.txt`.

**Headless Playwright** (Chromium) is used for all QA and screenshots.

> ⚠️ Never drive or resize the owner's real browser. An early agent did, and it left their Comet window larger than the screen.

**QA scripts:**

| Script | What it checks |
|---|---|
| `scripts/qa-screens.mjs` | Layout screenshots at 16 viewport sizes; fails on any horizontal overflow. Needs a server on :3300. |
| `scripts/qa-temporal.mjs` | Temporal-flicker heatmap of the live page. |
| `scripts/qa-resilience.mjs` | Tier/fallback matrix: WebKit, SwiftShader, CPU throttle, JS off, context loss, reduced motion, forced-colors. |
| `scripts/color-accept.mjs` | White faces must render neutral (saturation < 0.06). Guards against warm tint creeping back into the lights. |
| `scripts/pose-check.mjs` | Pose smoothness, kink and turn structure. |
| `scripts/render-posters.mjs` | Renders poster stills (two layers, back/front) through the real engine from `lib/ribbon/posters.json`. |

---

## 3. Site skeleton (built)

- **Routes:** `app/(site)/` holds home, `/work`, `/work/[slug]` (6 projects, static params) and `/about`. Also `app/not-found.tsx`, `sitemap.ts` and `robots.ts` (`/lab` disallowed).
- **Chrome:** `components/site/SiteChrome.tsx` (skip link, Lenis smooth scroll, header, footer, terminal placeholder, ribbon mount). `/lab` does not use it.
- **Home sections:** `components/site/sections/*`, in the order hero → unravel → work → build → terminal → contact. Section heights are tokens (`--h-hero` etc.) to give the ribbon scroll room.
- **Content:** `data/site-content.ts` and `data/projects.ts`.
- **Type:** `components/type/DisplayHeading.tsx` renders giant display lines with **per-glyph spans** (`.glyph`) and ribbon proxy attributes. Mona Sans `wdth` per screen class: phone 82, tablet 90, desktop 96, ultrawide 100. Tracking −0.04em, leading ≈ 0.82.
- **Scroll store:** `components/scroll/SmoothScroll.tsx` exports `scrollState { y, velocity, progress, limit }`. Lenis runs on wheel only (`syncTouch` off, so touch scroll is native). It respects reduced motion.
- **Ribbon proxies:** any element with `data-ribbon-proxy` (plus `data-ribbon-depth`, `data-ribbon-radius`, `data-ribbon-pad`) is something the ribbon weaves around. The registry (`lib/ribbon/proxies.ts`) tracks up to 256 and sends the ones near the viewport each frame.
- **Taglines:** the tagline on phone has a huge depth (5000) so the ribbon always passes behind it.

---

## 4. Ribbon engine architecture (built; see also `lib/ribbon/README.md`)

**Layering**

```
z=2 front canvas  (bitmaprenderer, pointer-events none)  ← ribbon pixels in FRONT of content
z=1 HTML           (transparent backgrounds)
z=0 back canvas   (bitmaprenderer)                        ← background, floor, glow, ribbon BEHIND content
```

**One** WebGL2 renderer on an `OffscreenCanvas` (`lib/ribbon/core.ts`, DOM-free; `engine.ts` is the DOM adapter). Each frame:
1. Render the shadow map once.
2. Render the ribbon once into an MSAA **MRT** target: colour (premultiplied) + a front mask. They share a depth buffer, so self-occlusion is correct.
3. Back composite = backdrop + ribbon × back weight.
4. Front composite = ribbon × mask + contact shadows.
5. Each composite is handed to its canvas with `transferToImageBitmap` → `transferFromImageBitmap`, both in the same rAF.

Both layers sample the same pixels, so **seams are impossible**. The back weight is `(1−wf)/(1−a·wf)`, the exact complement under "over" compositing.

**Front mask:** a fragment counts as "in front" if it is inside a proxy's rounded-rect SDF AND its world z is greater than the proxy depth. The text planes are per line: ASHMIT ≈ −0.25 cap height (≈ −45 px), KHURANA ≈ +0.25 cap (≈ +45 px). The hero name lines get these depths from `DisplayHeading`.

**Camera:** perspective, with the z=0 plane mapped to **1 world unit = 1 CSS px**, origin at the viewport centre, +y up. Any DOM rect therefore maps exactly onto the z=0 plane.

**Geometry**
- The **sweep runs on the GPU**: per-ring data (centre, frame, half-width, shear, tangent, arc) is packed into an RGBA32F DataTexture, and the vertex shader rebuilds position, normal and tangent.
- One shared GLSL chunk does this for all passes (colour/mask, shadow depth, contact catcher).
- Static index mesh. Flat-band cross-section with tiny bevels and split normals.
- `aFace` gives a hard face A/B.
- Edge strip mode `'gradient'` blends A → B across the thickness.

**Pose kinds**
- `points`: centreline control points (x, y, z, twist, width) in **anchor space**. x and y are fractions of the anchor element's box; z is in anchor-height units.
- `ruled`: rings as L3/R3 edge points in anchor space. **This is what the rotoscope pipeline emits.** Engine support is in `lib/ribbon/ruled.ts` plus the resolver.
- Variants per screen class: `phone | tablet | desktop | ultrawide` (tablet and ultrawide can be derived).
- Re-resolved on resize and on font load.

**Sim:** `lib/ribbon/sim.ts`. The site default is `frozen` (the pose renders exactly). The old spring/noise idle sim is the "jelly" one and must be replaced (§9).

**Material** (`material.ts`, `environment.ts`, `siteSettings.ts`)
- `MeshPhysicalMaterial` with per-face colour, roughness, clearcoat and specular via `onBeforeCompile`, plus anisotropy along the band.
- Procedural studio environment: soft gaussian softboxes, PMREM generated once.
- **Lighting is colour-neutral by design.** All the warmth was removed from the lights; colour comes only from the material. `color-accept.mjs` enforces this.
- Tone map: Khronos Neutral.
- Current default face colours: A = B = `#ff7a12`.

**Tiers and resilience** (`capability.ts`, `tiers.ts`)

| Tier | Who gets it | Details |
|---|---|---|
| T0 | No JS | `<noscript>` posters. |
| T1 | Posters | No WebGL2, a software renderer (SwiftShader/llvmpipe/…), Save-Data, forced-colors, or no OffscreenCanvas/bitmaprenderer. three.js is never even downloaded. |
| T2 | Low | DPR ≤ 1.25, 360 rings, no contact shadows, 30 fps when idle. |
| T3 / T4 | Medium / high | Full quality. |

How the tier is chosen and protected:
- **Detection:** a static probe, then a runtime frame probe; the tier is then locked. It can only downgrade (with hysteresis), and the result is cached in localStorage.
- **Load timing:** three.js is dynamically imported after first paint, which cut the initial JS from 318 KB to 167 KB gzip.
- **Fallbacks:** a 4 s deadline falls back to posters. Context loss crossfades to posters.
- **Mobile:** the canvas is sized to `lvh`, so the URL bar doesn't trigger resizes.
- **Tab state:** rendering pauses on `document.hidden`.

**Perf:** 120 fps on an M5 Max ProMotion and 60 on a 60 Hz MacBook. Two Comet/Chrome traps:
- Energy Saver caps animation at 30 fps.
- The GPU-timer HUD is opt-in (`debug.gpuTimer`) because it stalls.

---

## 5. The signature pose: FINAL spec

**Source of truth:** `docs/ribbon/ref/ak-signature-cutout.webp`. It is 852×1846 RGBA (the ribbon alone on transparent alpha, in **exactly** the phone hero mockup's coordinates; `hero-mobile.webp` shows the composition). A zoomed reference is `ak-signature-crop.webp`. Older references (`hero-desktop.webp`, `ak-sculpture.webp`) are **superseded** for the pose, but still show the desktop composition.

**This pose is the signature for ALL devices.** Phone is placed exactly as in the mobile mockup. Desktop is the same 3D ribbon, adapted: on the right like `hero-desktop.webp`, with the apex near ASHMIT's "T", the K reaching toward the right edge, and the tail exiting bottom centre-left.

### Topology (one strip, two ends, in order)
1. **End 1, the leading end.** It exits off the bottom-left edge. This is the end that later leads the scroll journey.
2. It rises up-right into the **S bend** (≈ 650–800, 1300–1500). It **half-twists** through the bend, rolling over its edge so a thin rim is visible. Then it runs as a long band leftward across the lower middle (y ≈ 1100–1250).
3. At the far left (≈ 40–150, 1000–1180) it **folds up** into the **A left leg**.
4. **A apex fold** (≈ 290–430, 550–620), then the **A right leg**. **The right leg is the FRONTMOST strand of all** and doubles as the K's straight stem.
5. At its bottom it **folds** into the **bottom K loop** (≈ 560–840, 900–1240). The loop returns and passes **behind** the A right leg.
6. It becomes the **crossbar**, heading left.
7. It loops over the **A left leg from the FRONT**, wraps **BEHIND** it, goes down, and folds/twists (the far-left wrap, ≈ 40–260, 780–1050).
8. It crosses right **behind** the A right leg.
9. The **upper K loop** (≈ 530–830, 680–900), with a fold at its tip.
10. It folds back **behind** the top part of the K and heads down.
11. **End 2** stops hidden behind the K ribbons. It is never visible.

### Faces
Face A is the face visible on the leading end at the bottom.

- **Face A is visible on:**
  - the tail and leading part, up to the S twist
  - the **A left leg**, after the far-left fold
  - the back section of the top K that folds behind
  - small natural glimpses as the darker inner face: inside the wrap around the A left leg, inside the bottom K loop, inside the top K loop
- **Face B is visible everywhere else:** the leftward band after the S twist, the apex onward, the right leg, the bottom K loop's outer face, the crossbar, the wrap's outer face, the front of the top K.

### Over/under (hard constraints)
- The A right leg is in front of everything.
- The bottom-K return is behind the right leg; the cross to the top K is behind the right leg.
- The crossbar is in front of the A left leg, then wraps behind it.
- The top-K back section is behind the top-K front.
- End 2 is fully hidden.
- 3D clearance ≥ 2 × thickness between non-adjacent strands, everywhere.

### Weave with the HTML text
- **Phone:**
  - the apex and the top of the legs go **behind** KHURANA where they overlap
  - the tagline is in front of the tail
- **Desktop:**
  - the A right leg and the tail are **in front** of the name
  - other strands overlapping the name are behind KHURANA
  - the apex is behind ASHMIT where they overlap

---

## 6. The tracing bug that broke everything (read this twice)

**The rule:** a fold (and a half-twist) is a **flip**. When the strip turns over, two things happen **at the same time**, because they are the same event:
1. The **visible face swaps** (A ↔ B).
2. The **physical edges swap sides relative to the direction of travel.** The edge on your left walking along the ribbon is on your right after the fold.

**The consequence:** the visible face is a pure 2D quantity:

```
face(s) = sign( cross2D( T_proj(s),  p_edge2(s) − p_edge1(s) ) )
```

It does **not** depend on depth. So which traced line is *physical* edge 1 versus edge 2 decides the face everywhere.

**What went wrong:** the trace labelled edges by **side**: "outer silhouette = edge 1, inner hole = edge 2". At the A apex it kept magenta on the outer outline and green on the inner hole (see `docs/ribbon/apex-trace-error-1.png` and `-2.png`). That is only valid for an in-plane bend, which is exactly what this ribbon never does. One missed swap at the apex mislabelled the edges for the **entire rest of the strip**, so every face downstream was inverted. The 3D lift then fought the owner's face map everywhere and produced the flares, crumples and wrinkles.

**The fix:** trace each physical edge as **one continuous visible line**. In the mockup you can literally see each edge's thin rim catch the light and roll over to the other side at a fold. Follow that line itself, wherever it goes, never "outer vs inner".

**How the A apex actually decomposes** (also the template for every fold):
- **E1:** the left leg's outer-left rim → up to the top-left shoulder → over the fold → **down the visible diagonal line inside the left-leg area** (the front layer's edge crossing over the left leg) → continues as the right leg's inner edge, bordering the hole.
- **E2:** the left leg's inner rim (hole side) → up and **behind** the front layer (a hidden span: interpolate it C2-smoothly between its visible ends) → emerges at the **top-right shoulder** → down as the right leg's outer-right rim.
- **The flat top of the A is NOT an edge.** It is the **fold contour**: the silhouette where the strip's surface rolls over (the surface normal is perpendicular to the view direction). It connects the two shoulders. Exclude it from edge snapping completely. In 3D it appears on its own when the surface turns over. Use it only as a **check**: the rendered contour must match the mockup's flat top.

**Every turn therefore has three kinds of lines:**
1. **Rim edges:** E1/E2, real strip edges. Snap to them.
2. **Fold/roll contours:** surface silhouettes where the strip turns away. Don't snap; verify after rendering.
3. **Hidden edge spans:** behind another layer. Interpolate them smoothly.

Classify every silhouette and interior line into one of these before snapping.

**Face-map parity check:** between any two spans of known face (§5), the number of flips (edge crossings in projection) must have the right parity: odd if the face changes, even if not. Run this check automatically. Any violation means a mislabelled edge.

---

## 7. Geometry pipeline: what exists, what failed, what to do

### What failed, and the lessons (don't repeat these)
1. **Eyeballing control points from the mockup.** Plateaus at "vaguely AK". Smooth-looking but wrong.
2. **Silhouette-IoU / outline-chamfer fitting (CMA-ES).** It gamed the metric by fattening the ribbon (width 112 vs ~65). A fat blob covers the outline but looks nothing like the mockup. **Never use outline IoU as the success metric.**
3. **Centreline + width + roll inferred from shading.** Roll sign is ambiguous at crossings, which caused chaotic face flips and kinks.
4. **"Crease direction" re-pairing in turns.** The rays crossed both legs and degraded even straight spans.
5. **Per-slice lift.** Δz = √(W² − d²) for each ruling independently, where d is the projected ruling length. It has a √-singularity as d → W, so tiny edge noise becomes big depth ripples (wrinkles). In folds d → 0 and the slice can't tell how the strip rolls (flares and crumples). Low-passing helps, but **this method fundamentally can't make clean folds.**
6. **Process lessons:**
   - Only review the **live, moving, production** render at full resolution, at the owner's screen size (1512×982 desktop, 390×844 phone), never frozen downscaled thumbnails.
   - Never show the owner anything that hasn't passed that review.
   - Never run two orchestrators on one repo; they collided once.

### What exists (scripts are in `scripts/mockup/`; see each file's header for args)

| Script | What it does |
|---|---|
| `analyze.py` | Masks (ribbon / text / shading classes), skeleton graph, review sheet. |
| `trace.py` | Ordered centreline trace, End 1 → End 2. |
| `snake.py` | Edge-line map (multi-scale Canny on L* + gradient + alpha boundary) and DP "snake" snapping of each edge to real image edge lines: direction agreement, smoothness, ≤ 2 px/sample offset change. **The snapping itself works well; the labelling at folds is wrong (§6).** |
| `edges.py` | Older ray-pairing edge extraction (superseded by `snake.py`). |
| `smoothcrops.py`, `edgecheck.py` | Global C2 smoothing of the snapped edges (arc-length knots); before/after crops. |
| `lift.py`, `lift_sculpture.py`, `lift_sig.py` | Per-slice lifts (`lift_sig.py` is the latest, for the signature pose). It uses the 2D face map, W = 1.06 × the max face-on projected width, low-passed d and z, and Gaussian z "clearance bumps" along camera rays at crossings. |
| `place.py` | Similarity placement plus anchor-space conversion per screen class. |
| `eval_edges.py`, `eval_sig.py`, `evalsite*.py`, `wrinkle.py`, `turncrops.py`, `predict.py` | Gates and crops. |

- Output pose: `lib/ribbon/poses/ak-hero.json`, ruled kind. The phone variant is from R4. The desktop variant is stale.
- Earlier experiments: `lib/ribbon/fit/*`, `scripts/fit/*`, `scripts/s2c/*`, and git stashes `s2c-wip-after-a646f72` / `s2d-wip-roll-continuity`. They are history; don't build on them.

### What to do: the recommended plan

**Step A: retrace with physical continuity** (2D only; verify before any 3D).
1. Classify every line in the edge map as rim edge / fold contour / hidden span (§6). For each turn window (S twist, far-left fold, apex, bottom-K fold, wrap, top-K tip fold, top-K fold-back) draw the expected decomposition the way §6 does for the apex, then snap.
2. Snap E1 and E2 as continuous physical lines through every flip. Interpolate hidden spans C2.
3. Smooth to C2 everywhere (knots ≈ 0.5 W, ≈ 0.25 W in folds). If fidelity and smoothness conflict, **smoothness wins** (≤ 3 px).
4. Automatic checks:
   - face(s) from `cross2D` must match the owner's face map at ≥ 0.95
   - flip parity correct between spans
   - no curvature oscillation shorter than 1 W
5. Produce a 2× review sheet plus 3× crops of every turn, and get the owner's OK on the trace **before** going to 3D. The owner can spot trace errors instantly; use that.

**Step B: whole-strip 3D solve.** Replace the per-slice lift.
- **Unknowns:** depth along the camera ray for every edge sample, `z_e1(s)` and `z_e2(s)`. Moving points along their camera rays keeps the projection fixed, so the 2D trace is preserved exactly.
- **Energy** (minimise over the whole strip at once, with Gauss-Newton/L-BFGS; no per-slice sqrt):
  - **Inextensibility:** constant 3D width (|L3 − R3| = W) and constant edge arc-length spacing.
  - **Developability / bending:** penalise in-plane bending (geodesic curvature ≈ 0); penalise out-of-plane curvature changes; penalise the twist rate except inside flip windows.
  - **Smoothness:** 2nd differences of z along s.
  - **Constraints:** the over/under rules, clearance ≥ 2 × thickness (hinge penalty), the text-plane weave (§5), hidden End 2.
- **Folds:** inside a fold the strip is two layers connected by a rolled section of small radius (≈ 0.12 W, soft). Initialise there with the layer order from §5, and let the solver find the roll. The rendered fold contour must match the mockup's.
- **Gates:**
  - edge-line chamfer between our render's Canny and the mockup's, both directions (rim edges only), mean ≤ 2 px, p95 ≤ 5, per region
  - fold-contour match
  - wrinkle gate
  - clearance
  - face-map agreement ≥ 0.95
  - and the decisive one: **3× crops of every turn, ours vs the mockup, judged by eye**
- **Emit** the `ruled` pose, phone first, then the desktop variant (same 3D strip, placement/weave per §5).

**Step C: material.** Match the mockup crops:
- strong form shading
- satin sheen with brushed streaks along the band (anisotropy)
- bright thin rim highlights on the edges
- inner and away-facing surfaces deep (≈ #5a1c04 to #8a3008) from shadow, not paint

Keep lights neutral and colour in the material.

---

## 8. Owner's critique history (so you know what "wrong" looks like)

- The owner rejected every shape built by bending in-plane ("steel rod") or with flat creases. They want **soft satin folds that flip the face**.
- Wrinkles and cloth-like crumples were rejected every time.
- Passing through itself (the far-left wrap through the A left leg) was rejected.
- "Outline matches but inside it's wrong" was rejected. Interior lines matter.
- Live colour and lighting flicker was fixed in S0 (tier lock, no motion-gated shadows, static grain, frozen hero).
- The owner liked: the 2D edge tracing being close, the tail and S of the R4 phone version, 120 fps, calm idle, Mona Sans, the layout pass, and neutral lighting with no orange tint on white.

---

## 9. Motion design (designed, not built)

- **Preloader → hero:**
  1. The ribbon moves freely and wildly.
  2. It enters the signature pose with **End 2 leading**: the leading tip travels the entire path in order (from the hidden end behind the K back through the K, crossbar, wrap, right leg, apex, left leg, S) while the strip follows behind it. It is an **arc-length slide along the fixed ruled path**, so no shape distortion is possible.
  3. It overshoots a little, springs back (a damped spring on the slide parameter) and settles exactly in the pose.
  4. Only then does the hero content reveal.
  5. Never hold content hostage: there is a hard cap (≈ 4 s) and a poster fallback.
- **Idle:** calm, a gentle breathing that **never deforms the hero shape**: a tiny rigid sway or a slight global transform, not per-point noise.
- **Scroll journey:** **End 1 leads.** As the user scrolls, the ribbon slides along its own path and away from the pose, then travels through the sections (unravel → frame the work → weave through "How I Build" → its tail at the terminal → re-forms the AK at contact). Cheap and robust: a scroll-driven arc-length window along authored paths, with springs on the parameter for follow-through ("whip" on fast scroll).
- **Feel:** like a gymnast's ribbon or satin. Inextensible, with the motion travelling along the length. Never jelly (the old per-point spring/noise sim was rejected as jelly).
- **Reduced motion:** static poses with crossfades.
- **Low frame rates** (Energy Saver, 30 fps) must still look deliberate.

---

## 10. Remaining site work (not ribbon)

- **Terminal:**
  - port the live site's terminal (`git show main:app/components/Terminal.tsx`) as a command palette: an overlay from `>_` plus inline in section 05
  - keep every fun command: `help`, `about`, `contact`, `ls`, `ls skills/`, `ls projects/`, `cat …`, `sudo ask-me-anything`, `hack` (Matrix rain), `nuke` / `nuke confirm` (its CSS was missing on main; fix it, and self-host the explosion sound), `download resume`, `clear`
  - add arrow-key history, tab-complete, and navigation commands that fly the ribbon to a section
  - update the stale Flutter-era content
- **Desktop / tablet / ultrawide variants** of the pose and the weave. Small viewports (≈ 800×600) currently make the ribbon tiny; fix the scaling.
- **Polish:**
  - typography and spacing review with the owner
  - `/work` and `/about` ribbon moves (the ribbon persists across navigations, since it mounts in the layout)
  - accessibility (canvases are already aria-hidden)
  - OG image, Lighthouse
  - real-device tests: iPhone, Android, Safari, Firefox (Firefox couldn't launch in Playwright here)
- **Deploy:** push the branch → open a PR to `main` → Vercel preview → owner approval → merge. ashmitkhurana.com updates from `main`.

---

## 11. Gotchas

- `public/lab/ref/` is gitignored. The references are copied into `docs/ribbon/ref/` for safety.
- The built-in browser pane in the Claude desktop app could not screenshot the `bitmaprenderer` canvases (it showed no ribbon). Use headless Playwright with GPU (`--use-angle=metal`) for captures.
- The Next dev overlay's "1 Issue" came from exceeding the engine's control-point limits. The limits were raised to 320 control points and 512 spline points.
- Multiple Next servers in one checkout must use different `NEXT_DIST_DIR`s (`.next-*` is gitignored and eslint-ignored).
- Neutral lighting is enforced by `color-accept.mjs`. If white faces turn orange again, something warm crept back into the lights or post.
- Comet/Chrome Energy Saver caps animation at 30 fps. Check it before blaming performance.
- The owner's MacBook is 60 Hz; their brother's M5 Max is 120 Hz ProMotion.
