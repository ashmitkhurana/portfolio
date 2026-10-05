import type { Metadata } from "next";
import { NotFoundContent } from "@/components/site/NotFoundContent";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

/** 404 raised by notFound() inside the site (e.g. unknown /work/[slug]); the (site) layout supplies the chrome. */
export default function SiteNotFound() {
  return <NotFoundContent />;
}
