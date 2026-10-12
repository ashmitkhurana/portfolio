import type { Metadata } from "next";
import { SiteChrome } from "@/components/site/SiteChrome";
import { NotFoundContent } from "@/components/site/NotFoundContent";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

/** Global 404 (unmatched URLs). Next renders this outside route-group layouts, so it brings its own chrome. */
export default function NotFound() {
  return (
    <SiteChrome>
      <NotFoundContent />
    </SiteChrome>
  );
}
