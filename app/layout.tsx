import type { Metadata } from "next";
import "./globals.css";
import ScrollToTop from "./components/ScrollToTop";

export const metadata: Metadata = {
  title: "Ashmit Khurana - Portfolio Website",
  description: "Ashmit Khurana - Flutter, iOS & Web Developer. Building innovative mobile and web solutions with expertise in cross-platform development, UI/UX design, and modern web technologies.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr">
      <body className="bg-[#0a0a0a] text-white">
        <ScrollToTop />
        {children}
      </body>
    </html>
  );
}