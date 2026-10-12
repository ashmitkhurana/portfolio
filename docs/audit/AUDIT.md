# Portfolio audit (2026-10-07)

Method: production build (`NEXT_DIST_DIR=.next-audit`) served on :4500, Playwright crawl, source review.
Scripts: `scripts/audit/{crawl,perf,overflow,contrast}.mjs`. Lighthouse is not installed locally, so Playwright
performance observers were used instead (Pixel 7 emulation, 4x CPU, ~1.6 Mbps for mobile).

## Summary
No hard blockers: no a11y failures, no broken internal links, no horizontal overflow, banned names absent.
The two P0s are both share-metadata gaps on the top-level routes (/, /work, /about).

## P0 (must fix)
1. **No OG/Twitter image on /, /work, /about.** `app/layout.tsx:36-52` defines `openGraph`/`twitter` with no `images`; only
   case studies have one. `twitter.card` is `summary_large_image`, so shares of the home page render with no image.
   Fix: add `app/opengraph-image.png` (1200x630) or `images: ["/og.png"]` in both blocks.
2. **Per-route OG/Twitter metadata is inherited from the root.** /work and /about emit `og:title` "Ashmit Khurana — Full-Stack Developer"
   and the root description/URL (`app/(site)/work/page.tsx:7`, `app/(site)/about/page.tsx:20`, `app/(site)/page.tsx:9`).
   Next replaces `openGraph` wholesale per route, so declaring just `title/description` is not enough. Fix: add an `openGraph`
   block (title, description, url) to each of the three pages. The case-study pages also lack `openGraph.url`/`type` and a
   `twitter` block (`work/[slug]/page.tsx:30`).

## P1 (should fix)
1. **OG images are 3000+ px PNGs of up to 3 MB** (`public/images/*.png`: sleepara 2.9M, nerdwithabindi 3.0M, monk-tech 1.9M,
   arcadia 1.2M). Social scrapers may drop >1-5 MB images. Also, `arcadia.png` is actually a JPEG with a .png extension.
   Fix: export 1200x630 `*-og.jpg`/webp variants, use them for `openGraph.images` (`work/[slug]/page.tsx:32`) and rename arcadia.
   `portfolio.png` (1.8M) is unreferenced if not used; delete it or confirm usage.
2. **No structured data (JSON-LD).** 0 `ld+json` blocks on any route. Fix: add a `Person` (name, url, sameAs: GitHub/LinkedIn/Instagram,
   jobTitle) script in `app/(site)/layout.tsx` or `page.tsx`; optional `CreativeWork` per case study.
3. **`sitemap.ts:7` uses `new Date()` for every lastmod**, so every build claims everything changed. Fix: hard-code real dates
   (or omit lastModified), and add per-project dates from `data/projects`.
4. **`robots.ts` disallows `/lab` while it returns 404 in production** (`app/lab/page.tsx:13` calls `notFound()`). Harmless, but
   the disallow also advertises the path. The 404 body still emits `robots: noindex` and the full site chrome. Fix: keep, or drop the
   Disallow line; also `/lab/*` sub-routes (`/lab/fit`, `/lab/editor`, `/lab/fonts`) are built into the production bundle
   (`/lab/fit` first load 302 kB); confirm each is gated the same way.
5. **Menu and terminal dialogs do not make the rest of the page inert.** `MobileMenu.tsx:36` only inerts `<main>` (footer and ribbon remain
   reachable by screen-reader virtual cursor although `aria-modal` is set); `TerminalOverlay.tsx` inerts nothing and uses a hand-rolled trap.
   Fix: set `inert` on `.site-footer` and the other non-dialog siblings, or use `<dialog>.showModal()`.
6. **Terminal input has no visible focus ring** (`terminal.css:230` `outline:0`; only the prompt glyph glows via `:focus-within`, a text-shadow
   with 0.45 alpha). WCAG 2.4.7 / 2.4.11 risk. Fix: give `.term__inputrow:focus-within` a 2px `var(--accent)` outline or underline.
7. **Global `:focus` outline removal** (`base.css:95`) is safe because `:focus-visible` is defined, but `:focus-visible { border-radius: 4px }`
   (`base.css:102`) alters the shape of pill/round controls on focus. Fix: drop `border-radius` from the global rule.

## P2 (nice to have)
1. Terminal welcome output on phones is wider than the card (`.terminal__col > .terminal-window` scrollW 483 vs clientW 278-348 at 320-390 px;
   `.term__output` right edge 504 px). It is clipped, not page overflow, so lines are cut off. Fix: `white-space: pre-wrap; overflow-wrap:anywhere`
   on `.term__line` in `components/terminal/terminal.css`.
2. `og:locale` set but `og:image:alt`, `twitter:site`/`creator` absent. Add handles.
3. `canonical` for `/` is `https://ashmitkhurana.com` (no trailing slash); fine, but the sitemap lists `https://ashmitkhurana.com/`. Make both consistent.
4. Case-study `<h1>` accessible name is "Alpha Block" via `aria-label`, but visible lines are "ALPHA" "BLOCK" -> fine; just ensure that
   `aria-label` is not the only text in `<title>`-less contexts (print, reader mode show the empty heading because glyph spans are `aria-hidden`).
   Fix: also include a `.visually-hidden` text node in `DisplayHeading.tsx:~110` so Reader mode and copy/paste see the title.
5. Ribbon canvases are created with `aria-hidden="true"` (`RibbonStage.tsx:245`) and posters have `alt=""` / `aria-hidden` (`RibbonPoster.tsx:57`): correct.
6. Image `public/images/.DS_Store` (6 KB) is shipped from `public/`. Delete and gitignore.
7. Colour: `--line-strong` (rgba .24) is 1.97:1 on `--bg` (borders only; below 3:1 for UI component boundaries, WCAG 1.4.11, if used on
   input/button borders). Raise to ~0.4 where it outlines interactive elements.

## 1. Accessibility detail
- **Headings** (all single H1, no skipped levels): `/` H1 AshmitKhurana > H2 Selected Work > H3 x3 > H2 How I Build > H3 x3 + H3 "Experience" label > H2 Let's Build.
  `/work` H1 > H2 x6 (cards). `/about` H1 > H2 Experience (H3 x4) > H2 Skills (H3 x3) > H2 Education > H2. Case studies H1 > H2 x4. 404 has H1 "404".
  Note: the home terminal section (05) has `aria-labelledby` but no heading in the heading outline.
- **Landmarks**: header, nav[Primary], nav[Mobile] (inside role=dialog "Menu"), main#content, footer, nav[Footer]; two `header` elements on pages (site header
  + in-page header) are fine since the second is nested in `main`. Mobile menu dialog is `hidden` when closed (correct).
- **Skip link**: present on every route (`#content`, `SiteChrome.tsx:16`, `main tabIndex=-1`), visible on focus.
- **Focus styles**: global 2px accent `:focus-visible` (see P1.6/P1.7 for exceptions).
- **Contrast** (`scripts/audit/contrast.mjs`, WCAG relative luminance, alpha composited over bg):
  | token | on --bg #0d0c0b | on --bg-raised | on --bg-raised-2 |
  |---|---|---|---|
  | --fg | 17.07 | 16.19 | 15.43 |
  | --fg-muted (.7) | 8.54 | 8.30 | 8.05 |
  | --fg-faint (.55) | 5.60 | 5.54 | 5.45 |
  | --accent #ff6a00 | 6.81 | 6.45 | 6.15 |
  | --line-strong (.24) | 1.97 | 2.03 | 2.06 |
  All text tokens pass AA (4.5:1) incl. faint; `--fg-faint` passes but only by ~1.0 so avoid any further opacity on it. Terminal colors (`--term-*`) not computed.
- **Alt text**: all project images have `"<name> website preview"` alt (descriptive enough; could say what is shown); decorative posters `alt=""`.
  No unnamed links/buttons found (0 on all 11 routes).
- **ARIA**: ribbon canvases `aria-hidden`; terminal overlay `role=dialog aria-modal aria-label="Terminal"`, output `role=log aria-live=polite`, input has a
  `<label class=term__sr>`; matrix canvas `aria-hidden`. A `role=status` span exists on pages (route announcer).
  Concern: a `role=log` with `aria-live=polite` will read out matrix/`hack` output lines in full; acceptable.
- **Keyboard traps**: mobile menu and terminal overlay both trap Tab by design and release on Esc (focus returns to the trigger). `Cmd/Ctrl+K` and backtick open the terminal;
  backtick is suppressed in typing targets (`TerminalOverlay.tsx:~90`). Inline terminal in section 05 does not trap Tab. Single-key shortcut (backtick) conflicts
  with WCAG 2.1.4 only if it cannot be disabled; consider requiring a modifier.
- **Reduced motion**: global CSS kill switch (`base.css:163`), Lenis not created (`SmoothScroll.tsx:20`), ribbon transitions shortened, terminal `hack`/`nuke`
  effects skipped. Good. `forced-colors` hides the ribbon layers (`ribbon.css:90`).
- **Mobile menu**: dialog + aria-modal + inert main + Esc + focus return + closes when crossing 768px. Gap: footer/ribbon not inert (P1.5). The
  `FOCUSABLE` selector omits `input`, `[tabindex]` (fine here).

## 2. Performance detail
Build (`next build`, Next 15.5.27):
| Route | Size | First Load JS |
|---|---|---|
| / | 923 B | 128 kB |
| /about | 4.5 kB | 111 kB |
| /work, /work/[slug] (6) | 217 B | 112 kB |
| /_not-found | 201 B | 103 kB |
| shared by all | | 103 kB |
| /lab | 5.09 kB | 286 kB |
| /lab/fit | 26.3 kB | 302 kB |
| /lab/editor, /lab/editor/stage | 20.2 / 4.75 kB | 131 / 129 kB |
| /lab/fonts | 3.85 kB | 107 kB |
Public routes are well within budget (128 kB on home; ribbon/three.js is evidently loaded lazily). Lab routes are heavy but gated.

Runtime (Playwright, Chromium headless; Lighthouse unavailable; synthetic, single run each):
| Device | Route | FCP/LCP | CLS | TBT (long tasks) | LCP element |
|---|---|---|---|---|---|
| desktop | / | 320 ms | 0 | 25 ms | hero display text |
| desktop | /work, /about, /work/sleepara | 64-88 ms | 0 | 0 | display text |
| mobile (4x CPU, slow 4G) | / | 696 ms | 0 | 67 ms | hero display text |
| mobile | /work | 988 ms | 0 | 100 ms | display text |
| mobile | /about | 1084 ms | 0 | 75 ms | display text |
| mobile | /work/sleepara | 1460 ms | 0 | 75 ms | cover image (priority, preloaded) |
Total transfer ~340-540 kB incl. fonts and the AVIF posters over ~31-44 requests. No console errors on any public route. Desktop values are warm-cache localhost.

- **Fonts**: `next/font/google` for Inter, Mona Sans (wdth axis) and JetBrains Mono, all `display: "swap"`, self-hosted, 3 woff2 preloaded on every route
  (`layout.tsx:7-26`). Fine. Improvement: JetBrains Mono is preloaded on pages where it is only used for small labels; consider `preload: false` for mono.
  Mona Sans variable with wdth+wght is large; check the woff2 size (P2).
- **Images**: ribbon posters are AVIF + WebP (good, 0.6-334 kB). Project screenshots are 3-3.6k px PNGs (0.4-3 MB) served through `next/image` (becomes
  WebP/AVIF at w=640/1920, good) but unoptimised originals are used for OG (P1.1). `public/lab/ref` has `storyboard.jpg` (362 kB) and reference webps that ship in prod
  (not linked; move out of `public/` or exclude).
- Lenis smooth scroll runs on every route, including the static 404; fine.

## 3. SEO / meta detail
| Route | title | description | canonical | og:image |
|---|---|---|---|---|
| / | Ashmit Khurana — Full-Stack Developer | yes | https://ashmitkhurana.com | none |
| /work | Work — Ashmit Khurana | yes (page-specific) | .../work | none, og:title inherited |
| /about | About — Ashmit Khurana | yes | .../about | none, og:title inherited |
| /work/<slug> x6 | <Name> — Ashmit Khurana | project summary | yes | project PNG (large) |
| /lab | (404 in prod) | | | `noindex, nofollow` |
- `robots.txt`: `Allow /`, `Disallow /lab`, Sitemap and Host lines present. `Host:` is a non-standard (Yandex) directive: harmless.
- `sitemap.xml`: / , /work, /about, 6 case studies; /lab excluded. Correct apart from lastmod (P1.3).
- `themeColor` set; `lang="en"`; favicon SVG only (no `apple-touch-icon`, no PNG fallback, no manifest): P2, add `app/apple-icon.png`.

## 4. Content rules
- `Bellarisse`, `Gamorite`: absent from app/, components/, data/, lib/, public/ (only `scripts/qa-terminal.mjs:87` mentions them as a negative assertion).
- No lorem/placeholder/TODO/"coming soon"/Flutter-era copy found in app/, components/, data/ (grep of flutter|dart|lorem|placeholder|todo|fixme|tbd|coming soon).
- Link crawl from `/`, `/work`, `/about`, `/lab`, case studies (11 internal routes): all 200 except `/lab` which is the intentional production 404.
  Anchors `#content`, `#unravel`, `/#contact` exist on `/`. Resume PDF at `/AshmitKhuranaResume.pdf` is linked from / and /about (present in public/).
  External links (not fetched): app.alpha-block.ai, sleepara.com, arcadiadesignsinc.com, monktechnology.net, GitHub/LinkedIn/Instagram, github.com/ashmitkhurana/EventSync.
  Verify those four client sites are still live before launch.
- 404 pages exist at app/not-found.tsx and app/(site)/not-found.tsx.

## 5. Responsiveness
`node scripts/qa-screens.mjs --base http://localhost:4500 --widths 320,390,1512 --routes /,/work,/about` : 11/11 checks passed, no horizontal overflow
(screenshots in the scratchpad `audit-screens`). Own check (`scripts/audit/overflow.mjs`) at 320, 375, 390, 768, 1024, 1512, 1920, 2560 on /, /work, /about:
`scrollWidth == clientWidth` at every size; the only elements outside the viewport are the terminal output lines on `/` at 320/375/390 (P2.1), clipped inside their window.
