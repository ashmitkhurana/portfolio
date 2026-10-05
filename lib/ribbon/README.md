# Ribbon engine

One continuous, lacquered-orange 3D ribbon rendered with three.js that weaves in
front of and behind real HTML. DOM-free render core in `lib/ribbon/core.ts`, a
thin DOM adapter in `engine.ts`, React mount in `components/ribbon/RibbonStage.tsx`,
lab page at `/lab` (dev only, or `NEXT_PUBLIC_LAB=1` for a local production build).

## Render once, composite twice

```
z=3  front <canvas>  fixed, pointer-events none, TRANSPARENT  (ImageBitmapRenderingContext)
z=2  HTML content    transparent background
z=0  back  <canvas>  fixed, OPAQUE                            (ImageBitmapRenderingContext)
```

ONE `WebGLRenderer` lives on an `OffscreenCanvas` (WebGL2, `antialias:false`,
premultiplied alpha; MSAA happens in render targets). Per frame, in the same rAF:

1. shadow map (once; light + ribbon on layer 0)
2. **ribbon pass** -> `rtRibbon`, an MSAA MRT with two attachments and ONE shared
   depth buffer: attachment 0 = tone-mapped premultiplied colour (RGBA8 sRGB),
   attachment 1 = **front mask** (R8). Full physical shading happens once.
3. shadow catcher + blur (contact shadows) and, on `high`, a half-res bloom
4. **back composite** (default framebuffer): backdrop (bg, grain, bounce glow,
   floor/wall shadow receivers on layer 1) then the ribbon with its back weight
   -> `offscreen.transferToImageBitmap()` -> `back.transferFromImageBitmap()`
5. **front composite**: ribbon * front weight + contact shadows
   -> `transferToImageBitmap()` -> `front.transferFromImageBitmap()`

Both composites read the SAME `rtRibbon` texels, so shading is identical on both
canvases. Nothing in `core.ts` touches the DOM: the adapter passes plain data in
(size, DPR, proxy rects as typed arrays, time) and moves the bitmaps out, so the
core can move into a Worker unchanged (it is on the main thread for now).

### Mask and depth: MRT with a shared depth buffer

three r184 supports multisampled MRT (`WebGLRenderTarget({count: 2, samples: 4})`,
per-attachment renderbuffers + per-attachment resolve blit; the attachments may
have different formats). The mask is written by the same fragment that wins the
depth test, so a strand hidden behind another strand can never leak into the mask
and no second geometry pass is needed. A depth-texture share between two MSAA
targets is not possible in WebGL2 (multisampled depth is a renderbuffer), and
re-rendering the mask with `EQUAL` depth would double the geometry cost. The
depth renderbuffer is not resolved (`resolveDepthBuffer = false`).

Mask value per fragment (`material.ts`, `ribFrontMask`): max over proxies of
`inside(rect SDF, 1 device-px AA ramp) * front(z > proxyDepth, 1 px ramp from
fwidth(z))`. After the MSAA resolve it is coverage-weighted, so the composites
divide by the resolved alpha: `m = mask / a`.

### Seams: why they cannot appear

Front weight `wf = remap(m)`. Back weight `wb = (1 - wf) / (1 - a * wf)` (and
`1` where `a = 1`): this is the exact complement under premultiplied "over"
(front over HTML over back reproduces `c a + bg (1 - a)` for every `a`, `wf`).
For opaque ribbon pixels the back canvas simply holds the whole ribbon, the
front canvas adds identical colour on top, and the front weight only decides
what covers the HTML. So even when the browser resamples the two canvases
independently (fractional DPR, e.g. cap 1.5 on a 2x display) the proxy-rect
boundaries show no seam. (An earlier "pure complement" `wb = 1 - wf` version
showed a 25% dark line under resampling; that is why the formula is what it is.)
There is no overlap band and no stencil.

### Fallback

If OffscreenCanvas WebGL2 / `ImageBitmapRenderingContext` is missing
(`RibbonEngine.supportsWeave()`), `RibbonStage` mounts only the front canvas and
the core renders into it directly in "single" mode: ribbon (+ floor shadow) over
everything, no weaving, no backdrop (the page `--bg` shows). One `console.info`.

## Proxies

DOM elements with `data-ribbon-proxy`, optional `data-ribbon-depth` (world z,
default 0), `data-ribbon-radius` (px) and `data-ribbon-pad` (px the rect is grown
on every side, for glyph overhang with negative letter-spacing). `proxies.ts`
measures them (cached; re-measured on resize / fonts / `invalidate()`; scroll is
applied per frame) into typed arrays (`ProxyData`, max 16).

## Contact shadows on HTML (`catcher`, `passes.ts`)

* **Catcher**: the ribbon is rendered at `contact.resolution` (default 1/4) of the
  drawing buffer, no depth test, MAX blending, fragments with `z > proxyDepth`
  only, `occlusion = exp(-height / falloff)`. Proxies are grouped by depth (max 2
  groups, one RG channel pair each).
* **Offset**: each vertex is shifted in screen space along the (projected) light
  direction, proportional to its height, scaled by `contact.offset`.
* **Blur**: separable gaussian, two radii by height through channels: the
  "contact" channel (weight `o * (1-k)`) is blurred with `blurContact`, the
  "high" channel (`o * k`) with `blurHigh`; `k` grows with height.
* **Composite**: black with alpha `shadow * strength` (default 0.28), only inside
  the proxy rounded-rect SDF (fades over `contact.pad`), never over ribbon visible
  on the back layer; the front ribbon is drawn over it. Dithered.

## Camera mapping

1 world unit = 1 CSS px at z = 0. Perspective camera, fov 28 (tweakable) at
`z = (viewH/2)/tan(fov/2)`, looking at the origin; origin = viewport centre,
+y up. `engine.domToWorld(x, y)` converts viewport CSS px. The ribbon width and
bevel scale with viewport width (0.5x..1.4x of the 1440 value).

## Quality tiers and perf (`settings.ts`)

* `low` (T2): DPR cap 1.25, MSAA 2x, 360 rings, 512 shadow map, no contact shadows.
* `medium` (default): DPR cap 1.5, MSAA 4x, 600 rings, 1024 shadow map, contact shadows.
* `high`: DPR cap 2, 900 rings, 2048 shadow map, bloom.
* Adaptive resolution drops the pixel ratio by 0.25 steps (floor 1) when frames
  stay long and probes back up every ~20 s.
* The PMREM environment is built once (debounced on edits), never per frame.
* The ribbon target is RGBA8 *sRGB* (tone mapping happens in the ribbon shader so
  MSAA resolves LDR, no aliased HDR rims): half the MSAA bandwidth of HalfFloat.
  MSAA is the dominant GPU cost (see numbers in the commit message / lab HUD).

## Material and look

`MeshPhysicalMaterial` patched via `onBeforeCompile`, one draw call:

* Flat band profile: face A (flat), left rim, face B (flat), right rim; tiny
  corner bevels (`geometry.edgeBevel`, default 0.6 px, up to T/2 = fully round).
  Vertices are split at the creases and `aFace` is a HARD per-vertex value
  (+1 / -1 / 0), so no normal or colour bleeds across the edge. Each flat face is
  subdivided (`widthSegments`) so twisted faces stay smooth.
* Per-face `color / roughness / clearcoat / clearcoatRoughness / specularColor`
  (`material.faceA`, `material.faceB`) plus `material.edge` (`faceA | faceB | custom`
  and a colour). Presets in `FACE_PRESETS`: Mockup (default), Duotone, Ember, Mono.
* Colour comes from the MATERIAL only. The lighting is colour-neutral: white softboxes, a
  white key light, a floor bounce that takes the face A colour, and the Khronos PBR
  Neutral tone map (stock when highlightTint = 0; over-exposure desaturates towards white). White faces render white,
  grey faces grey, #0066ff reads as clean blue (`scripts/color-accept.mjs`).
  Optional, explicit warmth: `light.temperature` (Kelvin-ish, 6500 = neutral; also tints the
  environment) and `env.tint` (colour of all env light, default white).
  `material.highlightTint` (0..1) slides hot highlights / reflections towards the face's OWN
  hue (derived from its base colour, so white and grey faces are never tinted); the Mockup
  preset uses 1 to get its amber glints. `depthShade` is a subtle depth cue.
* Environment (`environment.ts`): mostly dark procedural studio of HDR softboxes
  baked to a 512px PMREM. One directional light casts self-shadows (PCF).
* Background colour, film grain (background only), dither and the bounce
  glow (face A coloured unless `shadows.glowFollowFace` is off) are one fullscreen shader in `backdrop.ts` (display-referred).

## Geometry (GPU sweep)

`frames.ts`: centripetal Catmull-Rom, resampled by arc length; rotation
minimising frames (double reflection, `transportFrames` + `twistFrames`).
`geometry.ts` + `sweep.ts`: **the sweep runs in the vertex shader**.

* CPU, per frame, per RING only (~0.4 ms): centreline, frame (B, N) after twist,
  effective half width, cap scales, tangent, arc param, packed into a
  `DataTexture` (RGBA32F, width = rings incl. caps, 4 rows: `[c, hw] [B, planScale]
  [N, thickScale] [T, s]`). It also derives a conservative AABB and a motion
  signature (two section corners per ring) used to gate the shadow map / catcher.
* The mesh is static (rebuilt only on topology changes): interleaved
  `position = (profile sx, sy, ring)`, `tangent = (cx, cy, face, 1)`; `normal`
  aliases `(cx, cy, face)` (three turns a standard material into flat shading and
  drops `USE_TANGENT` when `normal` is missing, so it must exist).
* `SWEEP_GLSL` (sweep.ts) reconstructs position, outward normal (dP/ds x dP/du,
  dP/ds = central difference of the neighbouring rings' swept positions, exactly
  the old CPU maths) and tangent. The SAME chunk is used by the colour/mask
  material (`onBeforeCompile`), the shadow depth/distance materials
  (`customDepthMaterial` / `customDistanceMaterial`) and the contact-shadow catcher.
* Caps are just extra rings with their own plan / thickness scale.
* Width is constant: a tight in-plane bend is relaxed by smoothing the centreline
  (`relaxPath`, sparse + prefix sums, frames resumed from the first edited ring).

## Perf notes (Step 1b)

* Ribbon target is cleared / drawn / MSAA-resolved only inside the ribbon's screen
  rect (`post.scissor`, off with bloom); composites read nothing outside it
  (`uRibRect`).
* Shadow map re-rendered only after the ribbon moved `shadows.moveThreshold` of a
  shadow texel (or the light frustum / settings changed); the contact-shadow
  catcher + blur only after it moved `contact.moveThreshold` px.
* `post.samplesRetina`: MSAA used when the pixel ratio is >= 1.75.
* Adaptive resolution has hysteresis and exponential probe back-off (engine.ts).
* Idle is calm by default (`idle.calm` in `sim.ts`, lab preset `idle.lively` = the
  Phase 1 idle): gentle breathing/drift, no twist churn; scrolling will add energy.

## Resilience (capability tiers, posters, fallbacks)

No visitor may ever see a broken, blank, janky or stuck site. The HTML always
SSRs and paints first; nothing 3D is in the initial bundle.

| Tier | Who | Gets |
|---|---|---|
| T0 | no JS | SSR site + `<noscript>` poster layers |
| T1 poster | no WebGL2, software renderer (SwiftShader / llvmpipe / "Software" / Basic Render / Mesa Offscreen / performance caveat), context failure, missing MRT/MSAA/float RTs, no OffscreenCanvas-WebGL2 or bitmaprenderer (poster weave beats the single-canvas fallback, which draws the ribbon over the text), `saveData`, 2g, `forced-colors` (no ribbon at all) | posters, three.js never downloaded |
| T2 low | `deviceMemory <= 2`, `cores <= 2`, touch + `deviceMemory <= 3`, or runtime-detected | `low` settings, DPR <= 1.25, 30 fps when idle |
| T3 medium | default | `medium` |
| T4 high | desktop, `cores >= 8`, memory >= 8 (or unknown) | `high` |

`capability.ts` (no three import) decides before the engine chunk is loaded.
`RibbonStage` runs it after first paint in an idle callback, then `import()`s the
engine. `?tier=0..4` overrides (no cache, no probe, no downgrade). The result is
cached in localStorage (`ribbon:tier`, version key, 14 d TTL; 1 d for T1).

* **Static CPU benchmark** (`cpuScoreMs`, min of <= 6 runs of a fixed float workload,
  ~3 ms on an M2, ~12 ms under Chrome's 4x CPU throttle): > 8.5 ms caps at T2,
  > 5.5 ms caps at T3. It can only lower the ceiling.
* **Probe** (`TierGovernor`): after 14 warm-up frames, 1.5 s of full-rate frames: p75
  frame interval > 24 ms or median per-frame sim+geometry CPU > 3.5 ms (backstop)
  steps one tier down and re-probes; then the tier LOCKS (never upgraded mid-session).
* **Downgrade**: after the lock, EMA frame time > 30 ms for 5 s (recover below 25 ms)
  steps one tier down (8 s cooldown); at T2, > 48 ms for 7 s gives up live rendering
  (posters, cached for a day). Adaptive DPR (`engine.adapt`) still acts first.
* **Loop policy** (engine): idle cap 30 fps on T2 and on every touch device once
  settled (no scroll / resize / pose change for 1.5 s); paused when hidden and on
  `pagehide`, resumed on `pageshow` (a lost context after bfcache -> posters);
  reduced motion = static pose (no idle) rendered only while something moves.
* **Memory**: pixel budget per tier (T2 2.2 M, T3 4.5 M, T4 7.5 M drawing-buffer px
  ~ 50 B/px of render targets) and the iOS 16.7 M px canvas limit lower the pixel ratio
  (floor 0.6).
* **Layers** are `100lvh` tall: URL bars never resize them; touch devices also ignore
  height-only changes <= 160 px. A resize repaints in the same task (no blank frame).
* **Failure -> posters** (crossfade, never restart): thrown error in the loop, three.js
  shader error, `webglcontextlost` / `isContextLost()`, engine not rendering within 4 s
  of import start, chunk load failure. One `console.warn`.

### Posters

`lib/ribbon/posters.json` lists `{ set, name, pose, route, time, idle, media, viewport }`.
`node scripts/render-posters.mjs` (server running; Metal-ANGLE headless Chromium) loads
`<route>?tier=4&capture=1`, freezes the pose (static pose by default) and writes
`public/ribbon/posters/<name>-{back,front}.{avif,webp}`. The front layer is the transparent
canvas; the opaque back layer is rendered over black and white and matted into a
transparent layer, so it composites over the page background. `RibbonPoster` /
`PosterPicture` render them in the same two fixed layers (AVIF > WebP, phone <= 767 px /
desktop). Poses change later: edit the list or pose, re-run, commit the images.

QA: `node scripts/qa-resilience.mjs` (see its header). Debug surface: `window.__ribbonState`
(`tier`, `phase`, `engine`, `loseContext()`), `window.__scrollState`.

## Files

`capability.ts` tier detection + governor (no three) - `tiers.ts` per-tier loop/memory policy - `types.ts` plain shared data - `settings.ts` types/defaults/tiers/face presets -
`core.ts` DOM-free pipeline - `engine.ts` DOM adapter (canvases, loop, adaptive DPR) -
`passes.ts` catcher/blur/bloom/composite shaders - `material.ts` ribbon shader patch -
`sim.ts` springs + idle - `noise.ts` - `frames.ts` curve + frames - `geometry.ts` sweep -
`environment.ts` PMREM studio - `backdrop.ts` bg/floor/wall - `proxies.ts` DOM proxies -
`sweep.ts` GPU sweep GLSL + shadow depth materials - `gpuTimer.ts` HUD timing - `testPoses.ts` lab poses (`sweep`, `twists` with clean half-twists, `knot`).

Debug (lab panel, Debug folder): `view` = mask (red behind / blue in front, proxy
outlines) | ribbon RT only | shadow catcher; `proxyOutlines`, `hud`, `gpuTimer`
(GPU queries, off by default), `wireframe`.
