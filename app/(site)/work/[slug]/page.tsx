import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DisplayHeading } from "@/components/type/DisplayHeading";
import { ArrowRight, ArrowUpRight } from "@/components/site/icons";
import { projects } from "@/data/projects";
import { identity } from "@/data/site-content";
import "@/components/site/cards.css";
import "@/components/site/pages.css";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return projects.map((p) => ({ slug: p.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = projects.find((p) => p.slug === slug);
  if (!project) return { title: "Project not found" };
  return {
    title: project.name,
    description: project.summary,
    alternates: { canonical: `/work/${project.slug}` },
    openGraph: {
      title: `${project.name} — Ashmit Khurana`,
      description: project.summary,
      url: `/work/${project.slug}`,
      siteName: "Ashmit Khurana",
      type: "website",
      locale: "en_US",
      images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Ashmit Khurana — Full-Stack Developer" }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${project.name} — Ashmit Khurana`,
      description: project.summary,
      images: ["/twitter-image"],
    },
  };
}

export default async function CaseStudyPage({ params }: PageProps) {
  const { slug } = await params;
  const index = projects.findIndex((p) => p.slug === slug);
  if (index === -1) notFound();

  const project = projects[index];
  const prev = projects[(index - 1 + projects.length) % projects.length];
  const next = projects[(index + 1) % projects.length];
  const count = String(projects.length).padStart(2, "0");

  return (
    <article className="case" data-section="case-study">
      <section className="section page-section case__top">
        <div className="container">
          <Link className="label link-arrow case__back" href="/work">
            <ArrowRight className="case__back-arrow" />
            All work
          </Link>

          <header className="page-head">
            <p className="label">
              Case study
              <span aria-hidden="true"> · </span>
              {String(index + 1).padStart(2, "0")} / {count}
              <span aria-hidden="true"> · </span>
              {project.kind}
            </p>
            <DisplayHeading
              as="h1"
              size="l"
              lines={project.name.split(" ")}
              depth={0}
            />
            <p className="page-head__lede case__tagline">{project.tagline}</p>
            <ul className="case__links">
              {project.liveUrl ? (
                <li>
                  <a
                    className="button"
                    href={project.liveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Visit live site
                    <ArrowUpRight />
                  </a>
                </li>
              ) : null}
              {project.githubUrl ? (
                <li>
                  <a
                    className="button button--ghost"
                    href={project.githubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View on GitHub
                    <ArrowUpRight />
                  </a>
                </li>
              ) : null}
            </ul>
          </header>

          {project.cover ? (
            <div
              className="case__cover"
              data-ribbon-proxy=""
              data-ribbon-depth={0}
              data-ribbon-radius={20}
            >
              <Image
                src={project.cover}
                alt={`${project.name} website preview`}
                fill
                priority
                sizes="(min-width: 1700px) 1600px, 100vw"
                className="case__cover-image"
              />
            </div>
          ) : null}
        </div>
      </section>

      <section className="page-section case__story" aria-label="Case study">
        <div className="container">
          <div className="case__pair">
            <div className="case__block">
              <h2 className="label">The problem</h2>
              <p>{project.problem}</p>
            </div>
            <div className="case__block">
              <h2 className="label">The solution</h2>
              <p>{project.solution}</p>
            </div>
          </div>

          <div className="case__block case__impact">
            <h2 className="label">Impact</h2>
            <ol className="impact">
              {project.impact.map((item, i) => (
                <li key={item} className="impact__item">
                  <span className="label impact__n" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="impact__text">{item}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="case__block">
            <h2 className="label">Stack</h2>
            <ul className="chips">
              {project.stack.map((s) => (
                <li key={s} className="chip">
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <nav className="page-section case__pager" aria-label="More projects">
        <div className="container">
          <ul className="pager">
            <li>
              <Link className="pager__link" href={`/work/${prev.slug}`} rel="prev">
                <span className="label">Previous project</span>
                <span className="pager__name">{prev.name}</span>
              </Link>
            </li>
            <li>
              <Link
                className="pager__link pager__link--next"
                href={`/work/${next.slug}`}
                rel="next"
              >
                <span className="label">Next project</span>
                <span className="pager__name">{next.name}</span>
              </Link>
            </li>
          </ul>
          <p className="case__cta muted">
            Want to build something similar?{" "}
            <a className="case__cta-link" href={`mailto:${identity.email}`}>
              {identity.email}
            </a>
          </p>
        </div>
      </nav>
    </article>
  );
}
