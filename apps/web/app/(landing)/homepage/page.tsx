import type { Metadata } from "next";
import { XCTLanding } from "@/features/landing/components/multica-landing";

export const metadata: Metadata = {
  title: "Homepage",
  description:
    "XCT — AI Native workspace where humans and agents collaborate. Assign tasks, track progress, compound skills.",
  openGraph: {
    title: "XCT — AI Native Workspace for Human + Agent Teams",
    description:
      "Manage your human + agent workforce in one place.",
    url: "/homepage",
  },
  alternates: {
    canonical: "/homepage",
  },
};

export default function HomepagePage() {
  return <XCTLanding />;
}
