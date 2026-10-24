import type { Metadata } from "next";
import { SITE_TITLE } from "@/platform/document-title";
import { MulticaLanding } from "@/features/landing/components/multica-landing";
import { RedirectIfAuthenticated } from "@/features/landing/components/redirect-if-authenticated";

export const metadata: Metadata = {
  title: {
    absolute: SITE_TITLE,
  },
  description:
    "XCT is an AI-native workspace where humans and agents collaborate. Assign tasks, track progress, compound skills.",
  openGraph: {
    title: SITE_TITLE,
    description:
      "Manage your human + agent workforce in one place.",
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
      <MulticaLanding />
    </>
  );
}
