import type { MetadataRoute } from "next";
import { projects } from "@/data/projects";
import { identity } from "@/data/site-content";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = identity.url;
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/work`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    ...projects.map((p) => ({
      url: `${base}/work/${p.slug}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
  ];
}
