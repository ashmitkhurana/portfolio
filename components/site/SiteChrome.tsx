import { SmoothScroll } from "@/components/scroll/SmoothScroll";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteFooter } from "@/components/site/SiteFooter";
import { TerminalPlaceholder } from "@/components/site/TerminalPlaceholder";

/**
 * The shared page chrome: skip link, Lenis provider, header, <main id="content">,
 * footer and the terminal dialog. Used by app/(site)/layout.tsx and by the
 * global app/not-found.tsx (which Next renders outside route-group layouts).
 * /lab is intentionally NOT wrapped in this: it is a separate full-screen tool.
 */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#content">
        Skip to content
      </a>
      <SmoothScroll>
        {/* Header, menu and terminal dialog live OUTSIDE the ribbon stage so they
            always sit above both ribbon canvases (z-index tokens in tokens.css). */}
        <SiteHeader />

        {/*
          ── RIBBON INTEGRATION SLOT ────────────────────────────────────────
          <RibbonStage> (components/ribbon/RibbonStage.tsx) mounts exactly
          here, wrapping the content. It renders: back canvas (opaque, paints
          the page bg) < this content (transparent) < front canvas. Everything
          the ribbon should weave through belongs INSIDE it:

            import { RibbonStage } from "@/components/ribbon/RibbonStage";
            <RibbonStage>
              <main id="content" tabIndex={-1}>{children}</main>
              <SiteFooter />
            </RibbonStage>

          Until then this is a plain fragment and <body> supplies the bg colour.
          Proxies: elements carry data-ribbon-proxy / -depth / -radius.
          Scroll: `scrollState` + `subscribe` in @/components/scroll/SmoothScroll
          (module-level store, no React re-renders).
          ─────────────────────────────────────────────────────────────────
        */}
        <>
          <main id="content" tabIndex={-1}>
            {children}
          </main>
          <SiteFooter />
        </>

        <TerminalPlaceholder />
      </SmoothScroll>
    </>
  );
}
