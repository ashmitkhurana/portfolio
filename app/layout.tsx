import type { Metadata } from "next";
import Link from "next/link";
import SmoothScrollProvider from "@/app/components/SmoothScrollProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ashmit Khurana — Frontend Engineer",
  description:
    "Frontend Engineer specializing in real-time systems and Web3 products. Building fast, production-grade interfaces with React, Next.js, and TypeScript.",
  openGraph: {
    title: "Ashmit Khurana — Frontend Engineer",
    description:
      "Frontend Engineer specializing in real-time systems and Web3 products.",
    url: "https://ashmitkhurana.com",
    siteName: "Ashmit Khurana",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ashmit Khurana — Frontend Engineer",
    description:
      "Frontend Engineer specializing in real-time systems and Web3 products.",
  },
};

const navLinks = [
  { label: "Work",       href: "#work" },
  { label: "About",      href: "#about" },
  { label: "Experience", href: "#experience" },
  { label: "Contact",    href: "#contact" },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-background text-foreground antialiased">
        <SmoothScrollProvider>

          {/* ── Nav ─────────────────────────────── */}
          <nav className="fixed top-0 left-0 right-0 z-50 mix-blend-difference">
            <div className="section-container h-16 flex items-center justify-between">
              <Link
                href="/"
                className="font-display font-bold text-lg text-white tracking-tight hover:opacity-70 transition-opacity"
              >
                AK
              </Link>

              <div className="hidden md:flex items-center gap-8">
                {navLinks.map((link) => (
                  <a
                    key={link.label}
                    href={link.href}
                    className="text-sm text-white/60 hover:text-white transition-colors duration-200 tracking-wide"
                  >
                    {link.label}
                  </a>
                ))}
              </div>

              <a
                href="mailto:ashmit.khu@gmail.com"
                className="text-sm text-white border border-white/20 px-4 py-1.5 rounded-full hover:bg-white hover:text-black transition-all duration-200 hidden md:block"
              >
                Hire Me
              </a>
            </div>
          </nav>

          {children}
        </SmoothScrollProvider>
      </body>
    </html>
  );
}