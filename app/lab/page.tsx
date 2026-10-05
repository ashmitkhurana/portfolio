import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LabScene } from "@/components/lab/LabScene";
import "./lab.css";

export const metadata: Metadata = {
  title: "Ribbon Lab",
  robots: { index: false, follow: false },
};

export default function LabPage() {
  // dev only; NEXT_PUBLIC_LAB=1 allows it in a local production build (perf testing)
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_LAB !== "1") {
    notFound();
  }
  return <LabScene />;
}
