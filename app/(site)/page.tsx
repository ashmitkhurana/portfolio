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
