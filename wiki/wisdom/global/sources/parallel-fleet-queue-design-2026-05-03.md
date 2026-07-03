---
title: "Parallel fleet queue design 2026-05-03"
type: source
created: 2026-05-03
updated: 2026-05-03
tags: [fleet, queue, multi-team, tailscale, install-agnostic]
sources: [raw/articles/parallel-fleet-queue-design-2026-05-03.md]
related: ["[[fleet-architecture]]", "[[cascade-dispatch]]", "[[free-router]]"]
status: draft
---

# Parallel fleet queue design 2026-05-03

## Summary

Research deliverable for #781. Designs a global queue + skill/tool surface for cross-team Tailscale fleet sharing.

## Decision

- **Queue substrate**: SQLite-WAL default (#739); opt-in Worker DO when `.dashboard/capabilities.json` reports Cloudflare available (#740/#788).
- **Job model**: per-request job with team + agent_id + tier + payload + max_wait_ms; tier-scoped weighted round-robin with aging.
- **Capacity**: heartbeat primary, `/api/ps` corroboration, `tailscale ping` liveness gate.
- **Per-vendor surface**: skill (Claude Code), MCP tool (Copilot/Cursor), agent file (Codex), config.yaml provider (Continue), CLI wrapper (Aider).
- **Wait/escalate**: tier defaults 60s/30s/15s; team override via signed `fleet-policy.json` (#737).
- **Backpressure**: HTTP 202 + SSE on `/queue/events`.
- **Observability**: dashboard panels compose with #742.
- **Fairness**: WRR with aging; identity-coalesced (#737) to prevent spoofing.
- **Pre-emption**: gated, feature-flagged-off by default.
- **Auth**: reuse #737 JWT.

## Free-fleet usage

- Cerebras qwen-3-235b: Q5–Q10
- 36gbwinresource qwen2.5-coder:32b: Q4
- Groq llama-3.3-70b: Q1–Q3
- Zero paid LLM tokens

## Manager review checkpoint

Implementation children NOT spawned until client review. 7 follow-ups identified.

*Source: raw/articles/parallel-fleet-queue-design-2026-05-03.md*

See: [[fleet-architecture]], [[cascade-dispatch]], [[free-router]]
