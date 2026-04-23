"use client";

import { useParams } from "next/navigation";
import Navbar from "../../components/Navbar";
import MockDataBanner from "../../components/MockDataBanner";
import CaseStudyHero from "../../components/CaseStudyHero";
import { projects } from "../../data/projects";

export default function ProjectPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const project = projects.find((p) => p.slug === slug);

  if (!project) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-3xl font-bold mb-4">Project Not Found</h1>
            <p className="text-gray-400">The project "{slug}" does not exist.</p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <MockDataBanner />
      <CaseStudyHero 
        title={project.title}
        tagline={project.tagline}
        image={project.images[0]}
      />
    </>
  );
}