"use client";

import { LandingHeader } from "./landing-header";
import { LandingHero } from "./landing-hero";
import { FeaturesSection } from "./features-section";
import { HowItWorksSection } from "./how-it-works-section";
import { AgentMarketplaceSection } from "./agent-marketplace-section";
import { OpenSourceSection } from "./open-source-section";
import { FAQSection } from "./faq-section";
import { LandingFooter } from "./landing-footer";

export function XCTLanding() {
  return (
    <>
      <div className="relative">
        <LandingHeader />
        <LandingHero />
      </div>

      <FeaturesSection />
      <HowItWorksSection />
      <AgentMarketplaceSection />
      <OpenSourceSection />
      <FAQSection />
      <LandingFooter />
    </>
  );
}
