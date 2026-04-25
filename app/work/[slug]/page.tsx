import { notFound } from "next/navigation";
import Link from "next/link";
import { projects } from "@/data/projects";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return projects.map((project) => ({ slug: project.slug }));
}

export default async function ProjectPage({ params }: Props) {
  const { slug } = await params;
  const project = projects.find((p) => p.slug === slug);

  if (!project) {
    notFound();
  }

  return (
    <main className="min-h-screen py-20">
      <div className="max-w-[800px] mx-auto px-4">
        <Link
          href="/work"
          className="text-muted-foreground hover:text-foreground transition-colors mb-8 block"
        >
          ← Back to Work
        </Link>

        <h1 className="text-4xl font-bold mb-2">{project.title}</h1>
        <p className="text-xl text-muted-foreground mb-8">{project.tagline}</p>

        <div className="flex gap-4 mb-8">
          {project.liveUrl && (
            <Button asChild>
              <a href={project.liveUrl} target="_blank" rel="noopener">
                Live Site
              </a>
            </Button>
          )}
          {project.githubUrl && (
            <Button variant="outline" asChild>
              <a href={project.githubUrl} target="_blank" rel="noopener">
                GitHub
              </a>
            </Button>
          )}
        </div>

        <Separator className="my-8" />

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">The Problem</h2>
          <p className="text-muted-foreground">{project.problem}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">The Solution</h2>
          <p className="text-muted-foreground">{project.solution}</p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Impact</h2>
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            {project.impact.map((impact) => (
              <li key={impact}>{impact}</li>
            ))}
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Tech Stack</h2>
          <div className="flex flex-wrap gap-2">
            {project.stack.map((tech) => (
              <Badge key={tech} variant="secondary">
                {tech}
              </Badge>
            ))}
          </div>
        </section>

        <Separator className="my-8" />

        <div className="text-center">
          <h2 className="text-2xl font-semibold mb-4">
            Want to build something similar?
          </h2>
          <Button asChild>
            <a href="mailto:ashmit.khu@gmail.com">Let&apos;s Talk</a>
          </Button>
        </div>
      </div>
    </main>
  );
}