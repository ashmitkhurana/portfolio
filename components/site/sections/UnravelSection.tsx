import { unravel } from "@/data/site-content";
import "./sections.css";

/**
 * One screen, pinned while the ribbon forms a wave across it (horizontal on landscape, vertical on portrait;
 * components/site/journey.ts). The statement always sits in front of the ribbon.
 */
export function UnravelSection() {
  return (
    <section
      id="unravel"
      data-section="unravel"
      className="section unravel"
      aria-label="Introduction"
    >
      <div className="unravel__pin" data-pin="unravel">
        <div className="container unravel__inner">
          <p className="unravel__statement" data-ribbon-proxy="" data-ribbon-depth="5000" data-ribbon-pad="4">
            {unravel.lines.map((l) => (
              <span key={l} className="unravel__line">
                {l}
              </span>
            ))}
          </p>
        </div>
      </div>
    </section>
  );
}
