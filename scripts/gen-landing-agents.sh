#!/usr/bin/env bash
# Regenerate apps/web/features/landing/data/agents.ts from the agent template
# JSON files. Run this whenever templates are added/removed/renamed.
#
# Usage: bash scripts/gen-landing-agents.sh
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
SRC="$ROOT/server/internal/agenttmpl/templates"
DST="$ROOT/apps/web/features/landing/generated/agents.ts"

mkdir -p "$(dirname "$DST")"

{
  echo "// AUTO-GENERATED from server/internal/agenttmpl/templates/*.json"
  echo "// Regenerate via: scripts/gen-landing-agents.sh"
  echo "// Do not edit by hand."
  echo ""
  echo "export interface MarketplaceAgent {"
  echo "  slug: string;"
  echo "  name: string;"
  echo "  category: string;"
  echo "  accent: string;"
  echo "}"
  echo ""
  printf "export const MARKETPLACE_AGENTS: MarketplaceAgent[] = "
  jq -s '[.[] | {slug, name, category, accent}] | sort_by(.category, .name)' "$SRC"/*.json
  printf ";\n"
} > "$DST"

count=$(jq -s 'length' "$SRC"/*.json)
echo "✓ wrote $count agents to $DST"
