import type { Metadata } from "next";
import { DisplayHeading } from "@/components/type/DisplayHeading";
import { ProjectCard } from "@/components/site/ProjectCard";
import { allProjects } from "@/data/site-content";
import "@/components/site/pages.css";

export const metadata: Metadata = {
  title: "Work",
  description:
    "Selected projects by Ashmit Khurana: products, platforms and sites built across interfaces, systems and AI.",
  alternates: { canonical: "/work" },
  openGraph: {
    title: "Work — Ashmit Khurana",
    description: "Selected projects by Ashmit Khurana: products, platforms and sites built across interfaces, systems and AI.",
    url: "/work",
    siteName: "Ashmit Khurana",
    type: "website",
    locale: "en_US",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Ashmit Khurana — Full-Stack Developer" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Work — Ashmit Khurana",
    description: "Selected projects by Ashmit Khurana: products, platforms and sites built across interfaces, systems and AI.",
    images: ["/twitter-image"],
  },
};

const DEPTHS = [0, -40, 20];

export default function WorkPage() {
  return (
    <section
      className="section page-section"
      data-section="work-index"
      aria-labelledby="work-index-title"
    >
      <div className="container">
        <header className="page-head">
          <p className="label">
            Selected projects
            <span aria-hidden="true"> · </span>
            {String(allProjects.length).padStart(2, "0")}
          </p>
          <DisplayHeading
            as="h1"
            id="work-index-title"
            size="xl"
            lines={["WORK"]}
            depth={0}
          />
          <p className="page-head__lede">
            Products and platforms across the stack: real-time data, commerce,
            healthcare and design-led sites.
          </p>
        </header>

        <ul className="work-grid">
          {allProjects.map((project, i) => (
            <li key={project.slug} className="work-grid__item">
              <ProjectCard
                project={project}
                depth={DEPTHS[i % DEPTHS.length]}
                headingLevel="h2"
                priority={i < 3}
                sizes="(min-width: 1600px) 520px, (min-width: 1100px) 32vw, (min-width: 700px) 46vw, 92vw"
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
