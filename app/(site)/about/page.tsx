import type { Metadata } from "next";
import Link from "next/link";
import { DisplayHeading } from "@/components/type/DisplayHeading";
import { CopyEmail } from "@/components/site/CopyEmail";
import { ArrowDown, ArrowUpRight } from "@/components/site/icons";
import {
  about,
  contact,
  education,
  experience,
  resume,
  skills,
  socials,
  stats,
} from "@/data/site-content";
import "@/components/site/cards.css";
import "@/components/site/pages.css";
import "@/components/site/sections/sections.css";

export const metadata: Metadata = {
  title: "About",
  description:
    "Ashmit Khurana is a full-stack developer building across interfaces, systems and AI. Experience, skills and education.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <div className="about" data-section="about">
      <section className="section page-section" aria-labelledby="about-title">
        <div className="container">
          <header className="page-head">
            <p className="label">{about.eyebrow}</p>
            <DisplayHeading
              as="h1"
              id="about-title"
              size="xl"
              lines={about.heading}
              depth={0}
            />
          </header>

          <div className="about__intro">
            <p className="about__lede">{about.lede}</p>
            <div className="about__copy">
              {about.paragraphs.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          </div>

          <ul className="stats">
            {stats.map((s, i) => (
              <li
                key={s.label}
                className="stat"
                data-ribbon-proxy=""
                data-ribbon-depth={i % 2 === 0 ? 0 : -30}
                data-ribbon-radius={20}
              >
                <span className="stat__value">{s.value}</span>
                <span className="stat__label label">{s.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="page-section" aria-labelledby="experience-title">
        <div className="container">
          <h2 id="experience-title" className="page-h2">
            Experience
          </h2>
          <ol className="timeline">
            {experience.map((e) => (
              <li key={e.company} className="timeline__item">
                <p className="timeline__period label">{e.period}</p>
                <div className="timeline__main">
                  <h3 className="timeline__company">
                    <a href={e.url} target="_blank" rel="noopener noreferrer">
                      {e.company}
                    </a>
                  </h3>
                  <p className="timeline__role">
                    {e.role}
                    <span className="timeline__type label">{e.type}</span>
                  </p>
                  <ul className="timeline__points">
                    {e.highlights.map((h) => (
                      <li key={h}>{h}</li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="page-section" aria-labelledby="skills-title">
        <div className="container">
          <h2 id="skills-title" className="page-h2">
            Skills
          </h2>
          <div className="skills">
            {skills.map((g) => (
              <div key={g.label} className="skills__group">
                <h3 className="label">{g.label}</h3>
                <ul className="chips">
                  {g.skills.map((s) => (
                    <li key={s} className="chip">
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="page-section" aria-labelledby="education-title">
        <div className="container">
          <h2 id="education-title" className="page-h2">
            Education
          </h2>
          <ul className="education">
            {education.map((e) => (
              <li key={e.degree} className="education__item">
                <p className="education__degree">{e.degree}</p>
                <p className="education__school muted">{e.school}</p>
                <p className="label">{e.period}</p>
              </li>
            ))}
          </ul>
          <a className="button" href={resume.href} download>
            {resume.label}
            <ArrowDown />
          </a>
        </div>
      </section>

      <section className="section about__cta" aria-labelledby="about-cta-title">
        <div className="container about__cta-inner">
          <p className="label">{contact.eyebrow}</p>
          <DisplayHeading
            id="about-cta-title"
            size="m"
            lines={contact.ctaHeading}
            depth={0}
          />
          <CopyEmail />
          <ul className="contact__links">
            {socials.map((s) => (
              <li key={s.href}>
                <a
                  className="label link-arrow"
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {s.label}
                  <ArrowUpRight />
                </a>
              </li>
            ))}
            <li>
              <Link className="label link-arrow" href="/work">
                See the work
                <ArrowUpRight />
              </Link>
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
