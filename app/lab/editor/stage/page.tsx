import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StageClient } from "@/components/lab/pose-editor/StageClient";

export const metadata: Metadata = {
  title: "Pose stage",
  robots: { index: false, follow: false },
};

/** The iframe content of /lab/editor: the real hero + live ribbon. Dev / NEXT_PUBLIC_LAB only. */
export default function PoseStagePage() {
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_LAB !== "1") notFound();
  return <StageClient />;
}
