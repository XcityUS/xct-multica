"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAuthStore } from "@multica/core/auth";
import { cn } from "@multica/ui/lib/utils";
import { MARKETPLACE_AGENTS } from "../generated/agents";
import { useLocale } from "../i18n";
import { GitHubMark, githubUrl, heroButtonClassName } from "./shared";

/**
 * Agent Marketplace section — "explosive" word-cloud showcase of the 194
 * agent templates the backend ships. Each agent renders as a tag with a
 * size tier and opacity derived deterministically from a hash of its slug,
 * so the layout is stable across SSR and CSR (no hydration mismatch).
 *
 * Design intent: convey BREADTH. The visual chaos of mixed sizes
 * communicates "look at how many" more directly than any prose can.
 *
 * Data source: apps/web/features/landing/generated/agents.ts, regenerated
 * from server/internal/agenttmpl/templates/*.json via
 * scripts/gen-landing-agents.sh whenever templates change.
 */
export function AgentMarketplaceSection() {
  const { t } = useLocale();
  const user = useAuthStore((s) => s.user);

  // Deterministic shuffle + tier assignment so the cloud doesn't reshuffle
  // across renders (preserves SSR/CSR consistency, avoids Tailwind JIT
  // surprises from dynamic class names).
  const tags = useMemo(
    () =>
      MARKETPLACE_AGENTS.map((a) => {
        const h = hash(a.slug);
        // Distribution: ~3% huge, ~10% large, ~22% medium, ~35% small, ~30% tiny.
        const tier = h < 3 ? 0 : h < 13 ? 1 : h < 35 ? 2 : h < 70 ? 3 : 4;
        // Use the accent on every ~7th tag so the cloud has subtle color
        // splashes without becoming a rainbow. Otherwise default to a
        // white-on-dark opacity ramp keyed to tier.
        const useAccent = h % 7 === 0;
        return { agent: a, tier, useAccent, sortKey: h };
      }).sort((a, b) => a.sortKey - b.sortKey),
    [],
  );

  return (
    <section
      id="agent-marketplace"
      className="relative overflow-hidden bg-[#05070b] text-white"
    >
      {/* Radial glow behind the cloud — subtle "explosion" backdrop. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[80%] w-[120%] -translate-x-1/2 -translate-y-1/2 opacity-60 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(99,102,241,0.18) 0%, rgba(56,189,248,0.10) 30%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-[1320px] px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/40">
          {t.marketplace.label}
        </p>
        <h2 className="mt-4 font-[family-name:var(--font-serif)] text-[2.6rem] leading-[1.05] tracking-[-0.03em] sm:text-[3.4rem] lg:text-[4.2rem]">
          {t.marketplace.headlineMain}
          <br />
          <span className="text-white/40">{t.marketplace.headlineFaded}</span>
        </h2>
        <p className="mt-6 max-w-2xl text-[15px] leading-[1.7] text-white/55 sm:text-[16px]">
          {t.marketplace.description}
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-white/60">
          <span className="rounded-full border border-white/12 bg-white/4 px-3 py-1.5">
            {t.marketplace.stats.agents}
          </span>
          <span className="rounded-full border border-white/12 bg-white/4 px-3 py-1.5">
            {t.marketplace.stats.categories}
          </span>
          <span className="rounded-full border border-white/12 bg-white/4 px-3 py-1.5">
            {t.marketplace.stats.oneClick}
          </span>
        </div>

        {/* Word cloud */}
        <div className="relative mt-14 sm:mt-20">
          <div
            className="flex flex-wrap items-baseline justify-center gap-x-5 gap-y-3 leading-[0.95] sm:gap-x-7 sm:gap-y-5"
            role="list"
            aria-label={t.marketplace.label}
          >
            {tags.map(({ agent, tier, useAccent }) => (
              <span
                key={agent.slug}
                role="listitem"
                title={`${agent.name} · ${agent.category}`}
                className={cn(
                  "select-none whitespace-nowrap transition-all duration-200",
                  TIER_CLASS[tier],
                  useAccent
                    ? ACCENT_CLASS[agent.accent] ?? ACCENT_CLASS.muted
                    : OPACITY_CLASS[tier],
                  "hover:text-white hover:[text-shadow:_0_0_18px_rgba(255,255,255,0.4)]",
                )}
              >
                {agent.name}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-16 flex flex-wrap items-center gap-4">
          <Link
            href={user ? "/" : "/login"}
            className={heroButtonClassName("solid")}
          >
            {t.marketplace.cta}
          </Link>
          <Link
            href={githubUrl + "/tree/main/server/internal/agenttmpl/templates"}
            target="_blank"
            rel="noreferrer"
            className={heroButtonClassName("ghost")}
          >
            <GitHubMark className="size-4" />
            {t.marketplace.ctaSecondary}
          </Link>
        </div>
      </div>
    </section>
  );
}

// Deterministic 0-99 hash so SSR + CSR agree without hydration warnings.
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 100;
}

/* --- Static class maps so Tailwind's JIT scanner picks up every variant. --- */

// Size tiers. Mobile dampened (small screens can't host text-7xl bursts).
const TIER_CLASS = [
  "text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight",
  "text-2xl sm:text-4xl md:text-5xl font-semibold tracking-tight",
  "text-xl sm:text-3xl md:text-4xl font-medium tracking-tight",
  "text-lg sm:text-2xl md:text-3xl font-normal tracking-tight",
  "text-sm sm:text-lg md:text-xl font-light tracking-tight",
];

const OPACITY_CLASS = [
  "text-white/95",
  "text-white/85",
  "text-white/70",
  "text-white/45",
  "text-white/25",
];

const ACCENT_CLASS: Record<string, string> = {
  primary: "text-indigo-300/85",
  info: "text-cyan-300/85",
  success: "text-emerald-300/85",
  warning: "text-amber-300/85",
  secondary: "text-fuchsia-300/85",
  muted: "text-white/55",
};
