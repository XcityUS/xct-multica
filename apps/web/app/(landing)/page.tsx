import type { Metadata } from "next";
import { XCTLanding } from "@/features/landing/components/multica-landing";
import { RedirectIfAuthenticated } from "@/features/landing/components/redirect-if-authenticated";

export const metadata: Metadata = {
  title: {
    absolute: "XCT — AI Native Workspace for Human + Agent Teams",
  },
  description:
    "AI Native workspace where humans and agents collaborate. Assign tasks, track progress, compound skills.",
  openGraph: {
    title: "XCT — AI Native Workspace for Human + Agent Teams",
    description:
      "Manage your workforce in one place.",
    url: "/",
  },
  alternates: {
    canonical: "/",
  },
};

export default function LandingPage() {
  return (
    <>
      <RedirectIfAuthenticated />
      <XCTLanding />
    </>
  );
}
