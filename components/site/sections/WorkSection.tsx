import Link from "next/link";
import { DisplayHeading } from "@/components/type/DisplayHeading";
import { ProjectCard } from "@/components/site/ProjectCard";
import { ArrowRight } from "@/components/site/icons";
import { featuredProjects, work } from "@/data/site-content";
import "./sections.css";

export function WorkSection() {
  return (
    <section
      id="work"
      data-section="work"
      className="section work"
      aria-labelledby="work-title"
    >
      <div className="container">
        <header className="work__head">
          <DisplayHeading
            id="work-title"
            size="m"
            lines={work.heading}
            depth={0}
          />
          <Link className="work__all label link-arrow" href={work.viewAll.href}>
            {work.viewAll.label}
            <ArrowRight />
          </Link>
        </header>

        <ul className="work__grid">
          {featuredProjects.map((project, i) => (
            <li key={project.slug} className="work__item" data-index={i}>
              <ProjectCard
                project={project}
                depth={work.featuredDepths[i] ?? 0}
                sizes="(min-width: 1100px) 45vw, (min-width: 768px) 70vw, 92vw"
                priority={i === 0}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
