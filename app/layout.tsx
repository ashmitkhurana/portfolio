import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./styles/tokens.css";
import "./styles/base.css";

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

const title = "Ashmit Khurana — Full-Stack Developer";
const description =
  "Full-stack developer building across interfaces, systems, and AI.";

export const metadata: Metadata = {
  metadataBase: new URL("https://ashmitkhurana.com"),
  title,
  description,
  openGraph: {
    title,
    description,
    url: "https://ashmitkhurana.com",
    siteName: "Ashmit Khurana",
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
