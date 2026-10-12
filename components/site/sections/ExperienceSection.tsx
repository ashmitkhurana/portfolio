import Link from "next/link";
import { ArrowRight } from "@/components/site/icons";
import { build, experience } from "@/data/site-content";
import "./sections.css";

/**
 * Experience: the four roles. On desktop it shares one screen with the terminal (see .exterm in sections.css);
 * on phones it is a screen of its own.
 */
export function ExperienceSection() {
  return (
    <section
      id="experience"
      data-section="experience"
      className="section experience"
      aria-labelledby="experience-title"
    >
      <div className="container">
        <div className="experience__head">
          <h2 id="experience-title" className="label">{build.experienceLabel}</h2>
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
    </section>
  );
}
