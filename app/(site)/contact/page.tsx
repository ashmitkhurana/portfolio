import type { Metadata } from "next";
import { DisplayHeading } from "@/components/type/DisplayHeading";
import { ContactSection } from "@/components/site/sections/ContactSection";
import { ContactIntro } from "@/components/site/ContactIntro";
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
  },
};

/**
 * A 1:1 copy of the home page's last screen (contact + footer, one screen): the same section, and the AK forming like
 * the hero intro. The AK is the hero's own pose at the hero's own screen spot, so an invisible copy of the hero's name
 * block gives the pose its anchor (exactly where the name sits in the hero).
 */
export default function ContactPage() {
  return (
    <>
      <div className="hero contact-anchor" aria-hidden="true">
        <div className="hero__pin">
          <div className="container hero__inner">
            <DisplayHeading as="div" size="hero" lines={identity.nameLines} proxy={false} anchor="hero-name" />
          </div>
        </div>
      </div>
      <ContactSection />
      <ContactIntro />
    </>
  );
}
