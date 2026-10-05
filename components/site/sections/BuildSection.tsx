import Link from "next/link";
import { DisplayHeading } from "@/components/type/DisplayHeading";
import { ArrowRight } from "@/components/site/icons";
import { build, experience } from "@/data/site-content";
import "./sections.css";

export function BuildSection() {
  return (
    <section
      id="build"
      data-section="build"
      className="section build"
      aria-labelledby="build-title"
    >
      <div className="container">
        <DisplayHeading
          id="build-title"
          size="xl"
          lines={build.heading}
          depth={0}
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

        <div className="build__experience">
          <div className="build__experience-head">
            <h3 className="label">{build.experienceLabel}</h3>
            <Link className="label link-arrow" href={build.experienceLink.href}>
              {build.experienceLink.label}
              <ArrowRight />
            </Link>
          </div>
          <ul className="strip">
            {experience.map((e) => (
              <li key={e.company} className="strip__item">
                <p className="strip__company">{e.company}</p>
                <p className="strip__role">{e.role}</p>
                <p className="strip__period label">{e.period}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
