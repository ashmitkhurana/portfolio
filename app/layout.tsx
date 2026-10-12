import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Mona_Sans } from "next/font/google";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/ui.css";
import { identity } from "@/data/site-content";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
  weight: "variable",
  axes: ["opsz"],
});

/** Display face: Mona Sans variable with the wdth axis (75-125). Weight 900 + per-screen width live in tokens.css. */
const display = Mona_Sans({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: "variable",
  axes: ["wdth"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

const title = `${identity.name} — ${identity.role}`;
const description = `${identity.role} building across interfaces, systems, and AI.`;

export const metadata: Metadata = {
  metadataBase: new URL(identity.url),
  title: {
    default: title,
    template: "%s — Ashmit Khurana",
  },
  description,
  openGraph: {
    title,
    description,
    url: identity.url,
    siteName: identity.name,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  // the AK mark (components/brand/AKMark.tsx) on a transparent background, in the brand orange (reads on light and
  // dark tabs); PNGs for browsers without SVG favicons (Safari) and the home-screen icon (scripts/brand-png.mjs)
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0d0c0b",
};

/**
 * Root layout: fonts, tokens, metadata only. The site chrome (header, smooth
 * scroll, main, footer, ribbon slot) lives in app/(site)/layout.tsx via
 * components/site/SiteChrome.tsx, so /lab stays a clean full-screen tool.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body>
        {/* a reload always starts at the very top (the scroll journey is built from the top; a restored mid-page
            position would start it half way): the browser's own scroll restoration is off, before anything paints */}
        <script
          dangerouslySetInnerHTML={{
            __html: "try{history.scrollRestoration='manual';window.scrollTo(0,0)}catch(e){}",
          }}
        />
        {children}
      </body>
    </html>
  );
}
