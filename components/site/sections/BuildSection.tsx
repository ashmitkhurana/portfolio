import { DisplayHeading } from "@/components/type/DisplayHeading";
import { build } from "@/data/site-content";
import "./sections.css";

export function BuildSection() {
  return (
    <section
      id="build"
      data-section="build"
      className="section build"
      aria-labelledby="build-title"
    >
      <div className="build__pin" data-pin="build">
        {/* desktop: the coil's box (placed by components/site/journey.ts); the ribbon draws in front of the page here,
            so the principles' divider lines always pass behind the coil */}
        <div className="build__veil" data-ribbon-proxy="" data-ribbon-depth="-5000" aria-hidden="true" />
        <div className="container">
          <DisplayHeading
            id="build-title"
            size="xl"
            lines={build.heading}
            depth={5000}
          />

          <div className="build__body">
            <div className="build__lede">
              <p className="build__eyebrow label">{build.eyebrow}</p>
              <p className="build__intro">{build.intro}</p>
            </div>

            <ol className="build__principles">
              {build.principles.map((p) => (
                <li key={p.number} className="principle">
                  <span className="principle__number label" aria-hidden="true">
                    {p.number}
                  </span>
                  <h3 className="principle__title">{p.title}</h3>
                  <p className="principle__text">{p.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
