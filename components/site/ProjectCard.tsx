import Image from "next/image";
import Link from "next/link";
import type { Project } from "@/data/projects";
import "./cards.css";

interface ProjectCardProps {
  project: Project;
  /** ribbon depth (world z) for this card */
  depth?: number;
  /** image sizes hint, depends on the grid the card sits in */
  sizes: string;
  /** above-the-fold images should not lazy load */
  priority?: boolean;
  headingLevel?: "h2" | "h3";
}

export function ProjectCard({
  project,
  depth = 0,
  sizes,
  priority = false,
  headingLevel: Heading = "h3",
}: ProjectCardProps) {
  return (
    <article
      className="project-card"
      data-ribbon-proxy=""
      data-ribbon-depth={depth}
      data-ribbon-radius={20}
    >
      <Link href={`/work/${project.slug}`} className="project-card__link">
        <div className="project-card__media">
          {project.cover ? (
            <Image
              src={project.cover}
              alt={`${project.name} website preview`}
              fill
              sizes={sizes}
              priority={priority}
              className="project-card__image"
            />
          ) : null}
        </div>
        <div className="project-card__body">
          <div className="project-card__text">
            <Heading className="project-card__title">{project.name}</Heading>
            <p className="label project-card__descriptor">{project.descriptor}</p>
            <p className="project-card__summary">{project.summary}</p>
          </div>
          <span className="project-card__arrow" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17 17 7M8 7h9v9" />
            </svg>
          </span>
        </div>
      </Link>
    </article>
  );
}
