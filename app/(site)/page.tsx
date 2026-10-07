import type { Metadata } from "next";
import { HeroSection } from "@/components/site/sections/HeroSection";
import { UnravelSection } from "@/components/site/sections/UnravelSection";
import { WorkSection } from "@/components/site/sections/WorkSection";
import { BuildSection } from "@/components/site/sections/BuildSection";
import { TerminalSection } from "@/components/site/sections/TerminalSection";
import { ContactSection } from "@/components/site/sections/ContactSection";

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
  return (
    <>
      <HeroSection />
      <UnravelSection />
      <WorkSection />
      <BuildSection />
      <TerminalSection />
      <ContactSection />
    </>
  );
}
