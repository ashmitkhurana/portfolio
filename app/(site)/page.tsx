import type { Metadata } from "next";
import { HeroSection } from "@/components/site/sections/HeroSection";
import { UnravelSection } from "@/components/site/sections/UnravelSection";
import { WorkSection } from "@/components/site/sections/WorkSection";
import { BuildSection } from "@/components/site/sections/BuildSection";
import { ExperienceSection } from "@/components/site/sections/ExperienceSection";
import { TerminalSection } from "@/components/site/sections/TerminalSection";
import { ContactSection } from "@/components/site/sections/ContactSection";
import { identity, socials } from "@/data/site-content";

export const metadata: Metadata = {
  // home uses the root default title
  alternates: { canonical: "/" },
  openGraph: {
    title: "Ashmit Khurana — Full-Stack Developer",
    description: "Full-Stack Developer building across interfaces, systems, and AI.",
    url: "/",
    siteName: "Ashmit Khurana",
    type: "website",
    locale: "en_US",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Ashmit Khurana — Full-Stack Developer" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Ashmit Khurana — Full-Stack Developer",
    description: "Full-Stack Developer building across interfaces, systems, and AI.",
    images: ["/twitter-image"],
  },
};

export default function Home() {
  // structured data for search engines: who this site is about
  const person = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: identity.name,
    jobTitle: identity.role,
    url: identity.url,
    email: `mailto:${identity.email}`,
    sameAs: socials.map((s) => s.href),
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(person) }} />
      <HeroSection />
      <UnravelSection />
      <WorkSection />
      <BuildSection />
      <div className="exterm">
        <div className="exterm__pin" data-pin="exterm">
          <ExperienceSection />
          <TerminalSection />
          <div className="fillbar" aria-hidden="true">
            <span className="fillbar__label label">Scroll to fill</span>
            <span className="fillbar__track">
              <span className="fillbar__fill" />
            </span>
          </div>
        </div>
      </div>
      <ContactSection />
    </>
  );
}
