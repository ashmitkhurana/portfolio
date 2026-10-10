import { unravel } from "@/data/site-content";
import "./sections.css";

/**
 * One screen, pinned while the ribbon's head draws a wave through it (components/site/journey.ts). The statement is
 * split around the wave: landscape, the first line above it and "One continuous line." below; portrait, the first
 * part left of the (vertical) wave and "One continuous line." right of it. The journey reads these boxes to place
 * the wave between them. Both always sit in front of the ribbon.
 */
export function UnravelSection() {
  return (
    <section
      id="unravel"
      data-section="unravel"
      className="section unravel"
      aria-label={unravel.line}
    >
      <div className="unravel__pin" data-pin="unravel">
        <div className="container unravel__inner">
          <p className="unravel__line unravel__line--a" data-ribbon-proxy="" data-ribbon-depth="5000" data-ribbon-pad="6">
            {unravel.lines[0]}
          </p>
          <p className="unravel__line unravel__line--b" data-ribbon-proxy="" data-ribbon-depth="5000" data-ribbon-pad="6">
            {unravel.lines[1]}
          </p>
        </div>
      </div>
    </section>
  );
}
