import type { Metadata } from "next";
import { SITE_TITLE } from "@/platform/document-title";
import { MulticaLanding } from "@/features/landing/components/multica-landing";

export const metadata: Metadata = {
  title: "Homepage",
  description:
    "XCT — AI-native workspace where humans and agents collaborate. Assign tasks, track progress, compound skills.",
  openGraph: {
    title: SITE_TITLE,
    description:
      "Manage your human + agent workforce in one place.",
    url: "/homepage",
  },
  alternates: {
    canonical: "/homepage",
  },
};

export default function HomepagePage() {
  return <MulticaLanding />;
}
