import { unravel } from "@/data/site-content";
import "./sections.css";

/** Mostly empty on purpose: the ribbon unravels here. */
export function UnravelSection() {
  return (
    <section
      id="unravel"
      data-section="unravel"
      className="section unravel"
      aria-label="Introduction"
    >
      <div className="unravel__inner">
        <p className="unravel__line label">{unravel.line}</p>
      </div>
    </section>
  );
}
