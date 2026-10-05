import { SiteChrome } from "@/components/site/SiteChrome";

/** Everything except /lab: header, smooth scroll, main, footer and the interim ribbon stage. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <SiteChrome>{children}</SiteChrome>;
}
