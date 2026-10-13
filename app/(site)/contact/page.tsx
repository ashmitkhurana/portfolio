import type { Metadata } from "next";
import { DisplayHeading } from "@/components/type/DisplayHeading";
import { ContactSection } from "@/components/site/sections/ContactSection";
import { identity } from "@/data/site-content";
import "@/components/site/sections/sections.css";

export const metadata: Metadata = {
  title: "Contact",
  description: "Open to full-time roles, freelance projects and ideas with room to play.",
  alternates: { canonical: "/contact" },
  openGraph: {
    title: "Contact — Ashmit Khurana",
    description: "Open to full-time roles, freelance projects and ideas with room to play.",
    url: "/contact",
    siteName: "Ashmit Khurana",
    type: "website",
    locale: "en_US",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Ashmit Khurana — Full-Stack Developer" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact — Ashmit Khurana",
    description: "Open to full-time roles, freelance projects and ideas with room to play.",
    images: ["/twitter-image"],
  },
};

/**
 * A 1:1 copy of the home page's last screen (contact + footer, one screen): the same section and the footer's own
 * entrance (components/site/journey.ts: the fly-through, back in from the bottom left into the AK, the heading typing). The AK is the hero's own pose at the hero's own screen spot, so an invisible copy of the hero's name
 * block gives the pose its anchor (exactly where the name sits in the hero).
 */
export default function ContactPage() {
  return (
    <>
      <div className="hero contact-anchor" aria-hidden="true" data-contact-page="">
        <div className="hero__pin">
          <div className="container hero__inner">
            <DisplayHeading as="div" size="hero" lines={identity.nameLines} proxy={false} anchor="hero-name" />
          </div>
        </div>
      </div>
      <ContactSection headingAs="h1" />
    </>
  );
}
