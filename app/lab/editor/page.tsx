import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PoseEditor } from "@/components/lab/pose-editor/PoseEditor";

export const metadata: Metadata = {
  title: "Pose Editor",
  robots: { index: false, follow: false },
};

/** Sculpt ribbon poses against the real hero. Dev only, or NEXT_PUBLIC_LAB=1 for a local production build. */
export default function PoseEditorPage() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_LAB !== "1") notFound();
  return <PoseEditor />;
}
