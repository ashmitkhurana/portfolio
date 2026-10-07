import { SmoothScroll } from "@/components/scroll/SmoothScroll";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteRibbon } from "@/components/site/SiteRibbon";
import { SiteFooter } from "@/components/site/SiteFooter";
import { TerminalOverlay } from "@/components/terminal/TerminalOverlay";

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

        {/* Interim ribbon (lab "sweep" pose, idle motion, viewport-fixed). The
            stage wraps everything the ribbon weaves through: back canvas (opaque
            page bg) < transparent content < front canvas. Proxies: elements with
            data-ribbon-proxy / -depth / -radius. Scroll store for the real
            choreography: `scrollState` + `subscribe` in SmoothScroll. */}
        <SiteRibbon>
          <main id="content" tabIndex={-1}>
            {children}
          </main>
          <SiteFooter />
        </SiteRibbon>

        <TerminalOverlay />
      </SmoothScroll>
    </>
  );
}
