---
title: "Fleet harness-awareness 2026-05-04"
type: source
created: 2026-05-04
updated: 2026-05-04
tags: [fleet, governance, context, cloudflare-r2, mcp, prompt-cache, anthropic, free-tier]
sources: [raw/articles/fleet-harness-awareness-2026-05-04.md]
related: ["[[fleet-architecture]]", "[[cascade-dispatch]]", "[[free-router]]", "[[ticket-audit-pattern]]"]
status: draft
---

# Fleet harness-awareness 2026-05-04

## Summary

Research deliverable for #861 (child of EPIC #860). Surveys 2026-Q2 free-tier substrates for centrally hosting harness governance + wiki + tools so every fleet model can pull them on demand. Decision: **Cloudflare Worker + R2 (bundle bodies) + KV (index/identity), fronted by an MCP `prompts`/`resources` server**. R2's free-egress moat absorbs the working-set; Anthropic prompt caching amortizes 90% of cloud-tier cost; content-addressed bundle hash is the single cache key across substrates.

## Substrates surveyed

Cloudflare Workers + KV + R2; GitHub raw / Pages / Gist; Anthropic Files API + prompt caching; hosted MCP (Smithery / Pulse); Hugging Face datasets / spaces; Vercel Blob + Netlify Blobs; Google Drive / Docs API; Litestream-replicated SQLite to S3/R2.

## Key 2026-Q2 findings

- R2 free egress (10 GB-month + 1M Class A + 10M Class B + free egress) is the decisive moat over Vercel/Netlify Hobby tiers (egress capped or billed).
- Anthropic prompt caching (5-min default; 1-hour ext via 2× write multiplier; 0.1× cache reads = 90% savings) is the production "shared system prompt" pattern; min cacheable 4096 tok on Opus 4.5–4.7 / Haiku 4.5.
- MCP streamable-HTTP transport + `prompts`/`resources` primitives are the canonical 2026 path for one-server-many-clients harness governance.
- "Rules-as-a-Service" isn't a standardized term yet; closest analogues are Continue Hub, Smithery (managed MCP), and Anthropic Skills (workspace-scoped, doesn't auto-sync across surfaces).
- CLAUDE.md `@import` does NOT support HTTP URLs — only local paths.
- Ollama `keep_alive` keeps weights loaded but does NOT persist a system prompt — re-tokenized per request.

## Decision (winner)

**Cloudflare Worker + R2 + KV + MCP front-end.**

## MVP child scope (5 components)

1. Worker `harness-context-worker` + R2 `megingjord-bundles` + KV `megingjord-bundle-index`; endpoints `/bundle/<sha256>` and `/bundle/latest?profile=<role>`.
2. `scripts/global/harness-bundler.js` (~100 LOC) producing canonical 30–60 KB JSON with deterministic `sha256`.
3. Bundle hash as single cache key (Anthropic `cache_control`, R2 ETag, #739 SQLite cache row).
4. Vendor wiring: Ollama (`keep_alive=30m`), Groq/Cerebras/OpenRouter/Google (prepend to `system`), Anthropic (`ephemeral` block), MCP `prompts`/`resources` for MCP-aware hosts.
5. Fallback chain: Worker → authenticated `gh api` raw mirror → #739 SQLite → embedded last-good bundle.

## Composition with shipped primitives

- #739 SQLite-WAL local cache returns 304 on SHA match
- #740 Cloudflare Worker DO codebase reused; `wrangler` deploy
- #788 capability probe gates feature on `cloudflare.worker.available`
- #784 RAG MCP becomes a resource provider referenced via signed URL

## Identity / provenance

Edge-side HMAC stamping (server signs `bundle_sha256+agent_id+nonce+ts`); trailer attribution wrapped on the operator return path; content-addressed bundle hash prevents stale-content drift.

## Implementation children (NOT spawned)

Per Manager scope: 5 implementation children identified above will be created ONLY after client approves the research.

*Source: raw/articles/fleet-harness-awareness-2026-05-04.md*

See: [[fleet-architecture]], [[cascade-dispatch]], [[free-router]], [[ticket-audit-pattern]]
