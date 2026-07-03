---
title: "Multi-Agent Command Center Round 2 2026-05-01"
type: source
created: 2026-05-01
updated: 2026-05-01
tags: [multi-agent, vs-code, mcp, coordination, worktree, claude-code, codex, copilot, cloudflare, agent-presence]
sources: [/home/curtisfranks/devenv-ops/research/multi-agent-command-center-round-2-2026-05-01.md]
related: ["[[36gbwinresource]]", "[[openclaw]]", "[[penguin-1]]", "[[fleet-architecture]]", "[[baton-protocol]]", "[[governance-enforcement]]", "[[cascade-dispatch]]"]
status: draft
---

# Multi-Agent Command Center Round 2 2026-05-01

## Summary

Cutting-edge 2026-Q2 research into VS Code as a multi-agent command center. Confirmed: Claude Code Desktop unilaterally creates `<repo>/.claude/worktrees/<n>/` per session (the "instinctive worktree separation" the operator observed); other agents do not. VS Code 1.109 (Jan 2026) shipped a unified Agent Sessions view but no agent-presence API. MCP added server-card discovery (SEP-1649) but explicitly excluded agent-to-agent presence. No formal "agent rendezvous" research artifact exists as of 2026-Q2.

## Key concepts captured

- **Agent presence**: still an open primitive in 2026-Q2; harness must build its own.
- **Composition over override**: Claude Code already does Layer 2 isolation; harness must compose with `.claude/worktrees/` rather than fight it.
- **Codex MultiAgentV2** (`agents.max_threads=6`, `agents.max_depth=1`) + sandbox-mode + per-profile `cwd` controls = real Tier-B identity surface.
- **Cloudflare Worker + Durable Object** is the resource-constrained sweet spot for coordination-server hosting (zero free-fleet impact, 100k req/day free, edge SQLite, FastMCP-compatible).
- **Defense against `.claude.json` corruption** via per-agent `CLAUDE_CONFIG_DIR` env override (Anthropic issue #28829 + #54393).

## Entities

- Claude Code Desktop — auto-worktree per session (`.claude/worktrees/<n>/`)
- GitHub Copilot CLI `/fleet` (April 2026) — vendor-internal multi-agent orchestrator
- OpenAI Codex MultiAgentV2 — `agents.max_threads`, `agents.max_depth`, sandbox profiles
- VS Code 1.109+ Agent Sessions view — unified host, no cross-vendor coordination
- `vscode.proposed.chatSessionsProvider.d.ts` — extensibility surface
- MCP `.well-known/mcp.json` server cards (SEP-1649, 2026-06 spec target)
- A2A protocol (Google) — agent-to-agent layer building on MCP
- `mcp_agent_mail` (Dicklesworthstone) — coordination layer with TTL leases
- Cloudflare Workers + Durable Objects — recommended hosting

## Failure-class catalog (Claude Code multi-session bugs)

- #31787 sessions disappearing
- #28829 `.claude.json` corruption (non-atomic R-M-W, regression v2.1.59)
- #49166 `/effort` leaks across sessions
- #39808 globally-enabled plugins channel collision
- #54393 post-mortem: 12 multi-agent bugs in one autonomous overnight cycle

## Architecture stack

5 layers, see [[multi-agent-command-center-round-1]] for Round 1 context. Updates from Round 2:

1. VS Code Profile + Window per agent (Round 1 unchanged)
2. Per-agent worktree — **compose with Claude Code's existing `.claude/worktrees/`**, harness adds `.harness/worktrees/<agent-id>/` for Codex/Copilot
3. Coordination server hosted on **Cloudflare Worker + Durable Object** (Round 2 — replaces Round 1 localhost-only assumption)
4. Local SQLite WAL + per-agent `CLAUDE_CONFIG_DIR` defense (Round 2 — adds Claude bug defense)
5. GitHub issue assignee + Tier-C fallback to GitHub-Actions-as-coordinator (Round 2 — adds fallback)

## Tier policy

- A: multi-agent-safe (Cursor BG Agents, native VS Code MCP host, Copilot Chat, Claude Code, Continue ≥1.0.20)
- B (priority Codex): supported with forced isolation (Codex via `cwd` profile, Amazon Q, Cody)
- C: opt-in with warnings (Cline, Aider, Tabnine)

## Cross-links

- See [[fleet-architecture]] for system topology
- See [[baton-protocol]] for ticket ownership semantics that map to Layer 5
- See [[governance-enforcement]] for hook layering precedent
- See `research/concurrent-agent-worktrees-2026-04-24.md` (existing repo runbook)
