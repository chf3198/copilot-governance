---
title: "Fleet harness-awareness v2 2026-05-04"
type: source
created: 2026-05-04
updated: 2026-05-04
tags: [fleet, governance, context, multi-repo, redundancy, caching, inter-team, a2a]
sources: [raw/articles/fleet-harness-awareness-v2-2026-05-04.md]
related: ["[[fleet-architecture]]", "[[cascade-dispatch]]", "[[free-router]]", "[[ticket-audit-pattern]]"]
status: draft
---

# Fleet harness-awareness v2 2026-05-04

## Summary

Revision of v1 (#861) deliverable for #863, addressing six client considerations. v1's CF Worker + R2 + KV + MCP substrate stands as the happy-path; v2 hardens six gaps:

1. **Fleet-agnostic** — three-tier fallback (npm-bundled `dist/last-good-bundle.json` via `prepack` + `files`; GitHub release-asset CDN at `*.s3.amazonaws.com` outside the May-2025 unauth rate-limit; runtime degraded mode).
2. **Living Wiki bidirectional** — fleet ingest writes to R2 queue; GitHub App PR opens to operator-merged. Identity via MCP OAuth 2.1; Yjs Y.Text CRDT for conflicts.
3. **Per-user multi-repo identity** — bound JWT (GitHub OAuth device-flow → CF `workers-oauth-provider` → installation claim `sha256(remote+first_commit)`); CF Access JWT validation; sigstore Cosign keyless for bundle sig. PASETO explicitly rejected. One wiki per user; cross-repo MCP tool union with collision policy.
4. **Redundancy + failover** — independent operator-side substrate health probe writes `substrate-health.json`; failure-mode table covers CF regional, R2, KV lag, quota exhaust, embedded staleness, githubusercontent 429.
5. **Per-fleet native caching** — 9-row matrix: Anthropic prompt cache, Ollama `keep_alive` + 0.5.13+ `OLLAMA_KV_CACHE_TYPE`, Groq (none), Cerebras (none), OpenRouter passthrough, Gemini `cachedContents` API, vLLM `--enable-prefix-caching`, llama.cpp `--prompt-cache`. Per-adapter wrap rules.
6. **Inter-team comms** — Agent mailbox: R2 JSONL inbox/outbox + Google A2A envelope + MCP `tools/send_message` / `resources/read`. Justifies A2A over MQTT/NATS for CF Worker envelope. Capacity math: 18K msgs/mo at 2% of R2 free cap; 7-day eviction lifecycle.

## MVP child scope (revised — 9 tickets)

Per Manager scope: NOT spawned until client review. Revised list adds embedded floor, identity flow, bidirectional sync, mailbox, federation as separately deployable.

## v1 decisions preserved

CF substrate, hash-as-cache-key, MCP `prompts`+`resources` surface, composition with #739 SQLite-WAL / #740 Worker DO / #784 RAG MCP / #788 capability probe — unchallenged.

*Source: raw/articles/fleet-harness-awareness-v2-2026-05-04.md*

See: [[fleet-architecture]], [[cascade-dispatch]], [[free-router]], [[ticket-audit-pattern]]
