import type { MetadataRoute } from "next";
import { identity } from "@/data/site-content";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/lab"] }],
    sitemap: `${identity.url}/sitemap.xml`,
    host: identity.url,
  };
}
