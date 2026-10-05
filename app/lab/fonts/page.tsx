import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FontLab } from "@/components/lab/FontLab";
import "./fonts.css";

export const metadata: Metadata = {
  title: "Font Lab",
  robots: { index: false, follow: false },
};

export default function FontLabPage() {
  // dev only; NEXT_PUBLIC_LAB=1 allows it in a local production build (same gate as /lab)
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_LAB !== "1") {
    notFound();
  }
  return <FontLab />;
}
