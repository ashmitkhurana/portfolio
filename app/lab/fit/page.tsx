import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FitView } from "@/lib/ribbon/fit/FitView";

export const metadata: Metadata = {
  title: "Pose fit",
  robots: { index: false, follow: false },
};

/** Fit the AK hero pose to the mockup silhouette (driven by scripts/fit/run.mjs). Dev only, or NEXT_PUBLIC_LAB=1. */
export default function PoseFitPage() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_LAB !== "1") notFound();
  return <FitView />;
}
