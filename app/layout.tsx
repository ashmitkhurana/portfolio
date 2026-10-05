import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
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
  icons: {
    icon: "/favicon.svg",
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
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
