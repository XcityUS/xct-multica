# ADR 0003: CLI Core (Go) vs. Rust Rewrite — Scope Analysis

**Status:** Proposed  
**Date:** 2026-06-30  
**Issue:** [XCT-300](https://github.com/XcityUS/xct-multica) — XCT-166 EPIC subtask  
**Author:** Architect Agent (f47174da)  
**Decision owner:** Javen (final call reserved per XCT-300 scope)

---

## Context

The `multica` CLI is a Go binary that serves two distinct roles:

1. **HTTP management surface** — thin Cobra commands wrapping a REST API client (`multica issue`, `multica agent`, `multica workspace`, etc.)
2. **Local agent runtime** — a long-lived daemon that detects AI CLIs, manages git worktrees, and maintains WebSocket connections to the server

This ADR examines whether any part of the CLI core should be rewritten in Rust, and documents the scope, cost, and tradeoffs of each option to support an informed decision by the project owner.

---

## Current Module Inventory

### `server/cmd/multica/` — CLI Command Surface (~9,200 LOC)

| File | LOC | Domain |
|------|-----|--------|
| `cmd_issue.go` | 1,507 | Issue CRUD, comments, labels, subscribers |
| `cmd_agent.go` | 925 | Agent registration and management |
| `cmd_daemon.go` | 788 | Daemon start/stop/restart/status |
| `cmd_autopilot.go` | 670 | Autopilot CRUD and triggers |
| `cmd_project.go` | 641 | Project and resource management |
| `cmd_id_resolver.go` | 530 | Short UUID ↔ full UUID resolution, issue-key routing |
| `cmd_auth.go` | 466 | Auth status, logout, token management |
| `cmd_skill.go` | 450 | Skill install/list/remove |
| `cmd_workspace.go` | 279 | Workspace management |
| `cmd_setup.go` | 278 | Interactive setup wizard |
| `cmd_label.go` | 269 | Label management |
| `cmd_runtime.go` | 240 | Runtime list/status |
| `cmd_squad.go` | 219 | Squad management |
| `cmd_issue_label.go` | 177 | Issue label add/remove |
| `cmd_login.go` | 175 | Browser OAuth + token login |
| `help.go` | 173 | Cobra help formatting |
| `cmd_daemon_windows.go` | 132 | Windows daemon signal handling |
| `cmd_repo.go` | 96 | Repo checkout |
| `cmd_attachment.go` | 92 | File upload/download |
| `cmd_config.go` | 89 | Config read/write/show |
| `cmd_update.go` | 71 | Self-update (GitHub Releases) |
| `cmd_version.go` | 42 | Version output |
| `cmd_daemon_unix.go` | 44 | Unix daemon forking |
| `main.go` | 93 | Entrypoint, Cobra root, group wiring |

### `server/internal/cli/` — Shared CLI Infrastructure (~700 LOC)

| File | Responsibility |
|------|----------------|
| `client.go` | `APIClient` — typed REST wrapper (GET/POST/PUT/PATCH/DELETE, multipart upload, signed-URL download) |
| `config.go` | Profile-aware JSON config (`~/.multica/config.json`), atomic writes |
| `flags.go` | Shared Cobra persistent-flag helpers (`--server-url`, `--workspace-id`, `--profile`) |
| `output.go` | JSON/table output formatting with `--output json` support |
| `update.go` + `update_unix.go` + `update_windows.go` | Self-update: GitHub Releases API, archive extraction, atomic binary replacement |

### `server/internal/daemon/` — Local Agent Runtime (~7,200 LOC)

| File | LOC | Responsibility |
|------|-----|----------------|
| `daemon.go` | 2,692 | Core daemon loop: workspace tracking, WebSocket re-registration, goroutine-per-runtime dispatch, task-claim polling |
| `gc.go` | 572 | Workspace GC: stale worktree pruning, session cleanup |
| `client.go` | 477 | Daemon ↔ server API client (task claim, heartbeat, status updates) |
| `config.go` | 444 | Daemon config: PID file, log path, workspace watch list, profile support |
| `local_skills.go` | 409 | Local skills discovery and caching |
| `diskusage.go` | — | Disk quota monitoring for worktrees |
| `health.go` | — | Daemon health-check endpoint (Unix socket) |
| `poisoned.go` | — | Detection and eviction of poisoned sessions |
| `prompt.go` | — | System prompt construction for agent runs |
| `wakeup.go` | — | Wakeup signal handling for on-demand task dispatch |
| `types.go` | — | Shared types (WorkspaceState, RuntimeEntry, etc.) |
| `identity.go` | — | Agent identity resolution |

#### `server/internal/daemon/execenv/` — Execution Environment Setup (~2,200 LOC)

| File | LOC | Responsibility |
|------|-----|----------------|
| `execenv.go` | 326 | Core exec-env builder: assembles subprocess args, env vars, and working directory |
| `runtime_config.go` | 362 | Agent runtime configuration (model, context limits, tool permissions) |
| `context.go` | 303 | Execution context: MULTICA_TOKEN injection, workspace env, CLAUDE.md generation |
| `codex_home.go` | 299 | Claude Code home directory setup and credential forwarding |
| `codex_sandbox.go` | 282 | macOS sandbox policy and process isolation configuration |
| `codex_multi_agent.go` | — | Multi-agent harness environment |
| `codex_user_skills.go` | — | User-installed skill injection |
| `codex_skill_strip.go` | — | Skill filtering for agent scope |
| `git.go` | — | Git environment variables and worktree setup |
| `reply_instructions.go` | — | Reply instruction template injection |
| `codex_home_link.go` / `_windows.go` | — | Symlink management for Codex home (platform-split) |

#### `server/internal/daemon/repocache/` (~200 LOC)

- `cache.go`: Repository checkout caching, dedup by URL+ref

### `server/internal/daemonws/` — WebSocket Hub (~300 LOC)

| File | Responsibility |
|------|----------------|
| `hub.go` | WebSocket connection registry, message routing |
| `metrics.go` | Prometheus metrics for active WS connections |
| `notifier.go` | Task-dispatch notifications from server → daemon |

### `server/pkg/agent/` — AI CLI Detection and Invocation (~2,000 LOC)

| File | Agent |
|------|-------|
| `claude.go` + `codex.go` | Claude Code (Anthropic) |
| `cursor.go` + `cursor_invocation.go` | Cursor |
| `copilot.go` | GitHub Copilot |
| `gemini.go` | Google Gemini |
| `hermes.go` | Hermes |
| `kimi.go` | Kimi |
| `kiro.go` | Kiro |
| `openclaw.go` | OpenClaw |
| `opencode.go` | OpenCode |
| `pi.go` | Pi |
| `version.go` | CLI version detection (shelling out to each agent CLI) |
| `models.go` | Model abstraction and capability mapping |
| `proc_other.go` / `proc_windows.go` | Process management (platform-split) |

### Modules That Stay Go Regardless (Server-Side Only)

These packages are imported only by `cmd/server`, not `cmd/multica`, and are out of scope for any CLI rewrite:

- `internal/handler/` — HTTP API handlers (42 files)
- `internal/service/` — Business logic (autopilot, task, email, cron)
- `internal/auth/` — JWT/PAT validation, CloudFront auth
- `internal/realtime/` — Redis-backed WebSocket broadcast hub
- `internal/middleware/` — HTTP middleware chain
- `internal/metrics/` — Prometheus registry and collectors
- `internal/storage/` — S3 and local file storage
- `internal/analytics/` — PostHog event tracking
- `internal/mention/` — Mention URL expansion
- `internal/migrations/` — Embedded SQL migrations
- `internal/agenttmpl/` — Agent template loader

---

## Performance Baseline

Measured on macOS 15 / Apple Silicon (arm64), `go1.26.1`, unmodified source tree.

| Metric | Value | Method |
|--------|-------|--------|
| Unstripped binary size | **17 MB** | `go build ./cmd/multica` |
| Production binary size (`-trimpath -ldflags="-s -w"`) | **12 MB** | Standard release flags |
| Cold startup (first run, disk cache cold) | **~570 ms** | `time multica version` (3 runs avg) |
| Warm startup (binary in page cache) | **~10 ms** | Subsequent `time multica version` |
| Peak RSS (`version` subcommand) | **~14.3 MB** | `/usr/bin/time -l` |
| Symbol count (unstripped) | **~18,271** | `go tool nm` |

**Notable contributors to binary size** (from go.mod direct deps bundled in CLI):

| Dependency | Role | Size impact |
|-----------|------|-------------|
| `aws/aws-sdk-go-v2` family | S3 upload, Secrets Manager, STS/SSO | High (multiple sub-modules) |
| `gorilla/websocket` | Daemon ↔ server WebSocket | Low |
| `spf13/cobra` + `pflag` | CLI framework | Low |
| `golang-jwt/jwt/v5` | Token validation | Low |
| `pelletier/go-toml/v2` | TOML config files | Low |
| `mattn/go-shellwords` | Shell tokenization in execenv | Low |
| `google/uuid` | UUID parsing | Low |
| `oklog/ulid/v2` | ULID generation | Low |

The AWS SDK accounts for the majority of the binary size delta between a minimal Go CLI (~4MB) and the current 12MB production binary. `pgx`, `prometheus`, and `redis` are **not linked into `cmd/multica`** — they are server-only.

---

## Candidate Rust Rewrite Scopes

### Scope A: Full CLI + Daemon (Full Rewrite)

**What moves to Rust:** Everything in `cmd/multica/`, `internal/cli/`, `internal/daemon/`, `internal/daemonws/`, `pkg/agent/`.

**What stays Go:** Server (`cmd/server` and all `internal/` server packages).

**Benefits:**
- Potential binary size: ~6–9 MB (Rust async runtime + no GC overhead)
- Memory at rest: ~5–8 MB RSS (no GC pause heap overhead)
- Startup: ~5 ms cold / ~2 ms warm (Rust startup is faster for simple tasks)
- Memory safety guarantees in daemon subprocess management

**Costs and risks:**

| Factor | Assessment |
|--------|------------|
| Rewrite effort | **10–14 person-months** (CLI surface + daemon + execenv + cross-platform + test coverage) |
| Rust AWS SDK maturity | `aws-sdk-rust` is production-ready but less battle-tested than `aws-sdk-go-v2` |
| Cross-platform parity | Windows daemon (`proc_windows.go`, `cursor_invocation_windows.go`) requires Rust `windows` crate — non-trivial |
| Goroutine → Tokio migration | Daemon uses ~15–20 goroutines for concurrent workspace management; `tokio` is the equivalent but behavioral parity requires careful design |
| Test coverage loss | ~3,000 LOC of existing Go tests would need full reimplementation |
| Shared module advantage lost | Go module boundary between `cmd/multica` and `cmd/server` lets them share types; Rust FFI boundary would break this |
| Net performance gain | **Marginal for a developer tool**: 12 MB → ~7 MB binary; 10 ms → ~2 ms warm startup; neither is a user-visible bottleneck |

**Verdict:** Not recommended at this stage. The cost is prohibitive relative to the benefit for a developer-facing CLI tool where startup time and binary size are already acceptable.

---

### Scope B: Subprocess Management Layer (`pkg/agent/`)

**What moves to Rust:** Only `pkg/agent/` — the code that detects, versions, and spawns AI CLI processes.

**What stays Go:** All CLI commands, daemon orchestration, daemon WebSocket, server.

**Benefits:**
- `pkg/agent/` is largely self-contained (no heavy external deps)
- Process lifecycle management is an area where Rust's ownership model prevents resource leaks
- Could be shipped as a standalone `multica-agent-runner` binary called by the Go daemon

**Costs and risks:**

| Factor | Assessment |
|--------|------------|
| FFI/IPC overhead | Go daemon → Rust subprocess launcher adds a process boundary or CGO complexity |
| Effort | **2–3 person-months** (PoC), **4–5 person-months** (production, with tests) |
| Net gain | Marginal: the existing Go subprocess code is not a known bug source or performance bottleneck |
| Interop complexity | Either CGO (unsafe, build complexity) or subprocess IPC (protocol definition, latency) |

**Verdict:** Technically feasible as a PoC, but the FFI/IPC boundary adds complexity without addressing a demonstrated problem. Recommend only if specific process-isolation security requirements emerge (e.g. sandboxing agent runners from the daemon process itself).

---

### Scope C: `execenv/codex_sandbox.go` — macOS Sandbox Policy

**What moves to Rust:** The macOS sandbox profile generation in `execenv/codex_sandbox.go` (282 LOC).

**Benefits:**
- Sandbox policy code involves syscall-adjacent concerns where Rust is strongest
- Self-contained: no network I/O, no external deps

**Costs and risks:**

| Factor | Assessment |
|--------|------------|
| Target size | 282 LOC — a very small target |
| Platform scope | macOS-only, no Linux or Windows benefit |
| Effort | ~0.5 person-months |
| Net gain | Near-zero — existing Go code is correct and already safe |

**Verdict:** Not worth pursuing as a standalone Rust effort. If sandbox policy becomes a security-critical surface, consider an OS-level approach (sandboxd, Seatbelt policies) before a language rewrite.

---

## Decision Options Summary

| Option | Scope | Effort | Binary ∆ | Startup ∆ | Risk |
|--------|-------|--------|----------|-----------|------|
| **Keep Go (recommended)** | No change | 0 | 0 | 0 | Low |
| **Go optimization** | `-trimpath -ldflags="-s -w"` already applied; lazy AWS init | 1–2 weeks | −5 MB (already done) | −3 ms warm | Very low |
| **Partial Rust: `pkg/agent/`** | Subprocess launcher only | 4–5 months | ~0 | ~0 | Medium |
| **Full Rust CLI + Daemon** | All CLI and daemon code | 10–14 months | −5 MB | −8 ms warm | High |

---

## Decision Arguments

### Argument for: Keep Go

The multica CLI is a **developer tool, not a latency-sensitive service**. Its bottlenecks are network round trips (API calls) and subprocess launches (AI CLI startup times measured in seconds), not the Go runtime. The daemon is inherently goroutine-concurrent — managing 10–20 workspace WebSocket connections simultaneously — which is Go's strongest use case. The codebase is already tested, cross-platform, and shipping. A Rust rewrite would trade proven reliability for marginal improvements in metrics users do not notice.

The production binary is already 12 MB with `–s –w –trimpath`. Cold startup at ~570 ms is dominated by macOS page-in (mmap cold-cache), not Go initialization — Rust would not improve this meaningfully. Warm startup at ~10 ms is imperceptible for a CLI tool.

**Bottom line:** The cost of rewrite (10–14 person-months) exceeds the expected benefit by an order of magnitude.

### Argument for: Partial Rust (`pkg/agent/`)

If the team wants to invest in Rust tooling experience or improve subprocess isolation guarantees (e.g. for running less-trusted third-party agent CLIs), the `pkg/agent/` package is the most defensible target. It has minimal external dependencies, clear input/output boundaries, and handles OS-level process management — exactly where Rust's ownership model prevents resource leaks and undefined behavior.

This is viable as a **time-boxed experiment** (1 person-month PoC) without committing to production replacement. If the PoC demonstrates clear wins, a phased migration of just this package could proceed without rewriting the CLI or daemon.

### Argument for: Full Rust Rewrite

The strongest case would be: (1) binary size matters for a distribution channel where 12 MB is a barrier (e.g. embedded or mobile), (2) a demonstrated memory-safety bug in the daemon's subprocess handling, or (3) a team already proficient in Rust who can absorb the rewrite cost. None of these conditions currently apply to xct-multica.

---

## Recommendation

**Retain Go for the CLI Core in its entirety.**

No Rust rewrite is warranted at this time. The existing architecture is sound, the performance baseline is acceptable for the use case, and the rewrite cost (10–14 person-months for full, 4–5 for partial) is not justified by the gains.

If binary size becomes a distribution concern: the 12 MB production binary can be further reduced to ~9 MB via `upx --best` compression with no code changes (adds ~20 ms decompression on first run).

If a Rust capability investment is desired for the 7/12 Tokenhub Demo milestone: scope it to a standalone `multica-agent-probe` binary (agent detection/version-checking only, ~500 LOC, ~1 month) that can be evaluated independently without touching the daemon.

**Decision is reserved for Javen** per XCT-300 scope. This document provides the data to support that decision.

---

## References

- `server/go.mod` — module dependencies
- `server/cmd/multica/main.go` — CLI entrypoint and command registration
- `server/internal/cli/client.go` — `APIClient` REST wrapper
- `server/internal/daemon/daemon.go` — daemon core loop (2,692 LOC)
- `server/internal/daemon/execenv/` — execution environment builder
- `server/pkg/agent/` — AI CLI detection and invocation
- `CLI_AND_DAEMON.md` — deployment and installation context
- Go binary measurements: `go build` + `/usr/bin/time -l` on macOS 15 / arm64 / go1.26.1
