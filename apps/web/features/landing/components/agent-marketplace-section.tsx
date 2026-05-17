"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { useAuthStore } from "@multica/core/auth";
import { cn } from "@multica/ui/lib/utils";
import { MARKETPLACE_AGENTS } from "../generated/agents";
import { useLocale } from "../i18n";
import { GitHubMark, githubUrl, heroButtonClassName } from "./shared";

/**
 * Agent Marketplace section — "explosive" word-cloud showcase of the agent
 * templates the backend ships, with live search + category filter.
 *
 * Each agent renders as a tag with a size tier and opacity derived
 * deterministically from a hash of its slug, so the layout is stable across
 * SSR and CSR (no hydration mismatch) and matches between filtered and
 * unfiltered views (filtering hides tags, never re-tiers them).
 *
 * Data source: apps/web/features/landing/generated/agents.ts, regenerated
 * from server/internal/agenttmpl/templates/*.json via
 * scripts/gen-landing-agents.sh whenever templates change.
 */
export function AgentMarketplaceSection() {
  const { t } = useLocale();
  const user = useAuthStore((s) => s.user);

  // Deterministic shuffle + tier assignment — computed once.
  const tags = useMemo(
    () =>
      MARKETPLACE_AGENTS.map((a) => {
        const h = hash(a.slug);
        // Distribution targets more breathing room than the v1 mix:
        //   ~2% huge → ~9% large → ~28% medium → ~38% small → ~23% tiny.
        // Medium is now the dominant impression so the cloud reads at scan
        // distance instead of disappearing into a fog of tiny tags.
        const tier = h < 2 ? 0 : h < 11 ? 1 : h < 39 ? 2 : h < 77 ? 3 : 4;
        const useAccent = h % 7 === 0;
        return { agent: a, tier, useAccent, sortKey: h };
      }).sort((a, b) => a.sortKey - b.sortKey),
    [],
  );

  // Category list + per-category counts for the chip row.
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of MARKETPLACE_AGENTS) {
      counts.set(a.category, (counts.get(a.category) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, []);

  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term && !filterCategory) return tags;
    return tags.filter(({ agent }) => {
      if (filterCategory && agent.category !== filterCategory) return false;
      if (term && !agent.name.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [tags, search, filterCategory]);

  const hasFilters = Boolean(search.trim() || filterCategory);
  const clearAll = () => {
    setSearch("");
    setFilterCategory(null);
  };
  const showingText = t.marketplace.showing
    .replace("{count}", String(filtered.length))
    .replace("{total}", String(MARKETPLACE_AGENTS.length));

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

        {/* --- Controls: search + category filter ----------------------- */}
        <div className="mt-12 flex flex-col gap-4 sm:mt-16 sm:flex-row sm:items-center sm:justify-between">
          {/* Search */}
          <div className="relative flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-4 py-2.5 backdrop-blur-sm transition-colors focus-within:border-white/30 focus-within:bg-white/[0.06] sm:max-w-sm sm:flex-1">
            <Search className="size-4 text-white/40" aria-hidden />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.marketplace.searchPlaceholder}
              aria-label={t.marketplace.searchPlaceholder}
              className="flex-1 bg-transparent text-[14px] text-white placeholder:text-white/30 outline-none"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="rounded-full p-0.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Counter + clear */}
          <div className="flex items-center gap-3 text-[12px] tabular-nums text-white/50 sm:text-right">
            <span>{showingText}</span>
            {hasFilters && (
              <button
                type="button"
                onClick={clearAll}
                className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70 transition-colors hover:border-white/30 hover:bg-white/5 hover:text-white"
              >
                {t.marketplace.clearFilters}
              </button>
            )}
          </div>
        </div>

        {/* Category chips. Horizontal scroll on mobile, wrap on desktop. */}
        <div
          className="mt-5 -mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:flex-wrap sm:px-0 sm:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Filter by category"
        >
          <CategoryChip
            label={t.marketplace.allCategories}
            count={MARKETPLACE_AGENTS.length}
            active={filterCategory === null}
            onClick={() => setFilterCategory(null)}
          />
          {categories.map((c) => (
            <CategoryChip
              key={c.name}
              label={c.name}
              count={c.count}
              active={filterCategory === c.name}
              onClick={() =>
                setFilterCategory(filterCategory === c.name ? null : c.name)
              }
            />
          ))}
        </div>

        {/* --- Word cloud ------------------------------------------------ */}
        <div className="relative mt-12 sm:mt-16">
          {filtered.length === 0 ? (
            <p className="py-20 text-center text-[15px] text-white/40">
              {t.marketplace.empty}
            </p>
          ) : (
            <div
              className="flex flex-wrap items-baseline justify-center gap-x-6 gap-y-4 leading-[0.95] sm:gap-x-10 sm:gap-y-7"
              role="list"
              aria-label={t.marketplace.label}
            >
              {filtered.map(({ agent, tier, useAccent }) => (
                <button
                  key={agent.slug}
                  type="button"
                  role="listitem"
                  title={`${agent.name} · ${agent.category}`}
                  onClick={() => setFilterCategory(agent.category)}
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
                </button>
              ))}
            </div>
          )}
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

interface CategoryChipProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}

function CategoryChip({ label, count, active, onClick }: CategoryChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className={cn(
        "group inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-all",
        active
          ? "border-white/40 bg-white/15 text-white"
          : "border-white/12 bg-white/[0.04] text-white/65 hover:border-white/25 hover:bg-white/[0.08] hover:text-white",
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "tabular-nums text-[11px]",
          active ? "text-white/70" : "text-white/35",
        )}
      >
        {count}
      </span>
    </button>
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

// Size tiers. v2: top end capped at text-6xl (down from text-7xl) so the
// cloud reads as a field rather than a billboard, and the medium tier is
// the dominant impression after distribution tilted to it.
const TIER_CLASS = [
  "text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight",
  "text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight",
  "text-xl sm:text-2xl md:text-3xl lg:text-4xl font-medium tracking-tight",
  "text-lg sm:text-xl md:text-2xl font-normal tracking-tight",
  "text-sm sm:text-base md:text-lg font-light tracking-tight",
];

const OPACITY_CLASS = [
  "text-white/95",
  "text-white/85",
  "text-white/70",
  "text-white/50",
  "text-white/30",
];

const ACCENT_CLASS: Record<string, string> = {
  primary: "text-indigo-300/85",
  info: "text-cyan-300/85",
  success: "text-emerald-300/85",
  warning: "text-amber-300/85",
  secondary: "text-fuchsia-300/85",
  muted: "text-white/55",
};
