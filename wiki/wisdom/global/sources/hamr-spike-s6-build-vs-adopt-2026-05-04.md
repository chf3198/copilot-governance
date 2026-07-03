---
title: "HAMR Spike S6 — Build-vs-Adopt Matrix 2026-05-04"
type: source
created: 2026-05-04
updated: 2026-05-04
tags: [hamr, build-vs-adopt, slsa, oidc, cosign, llmlingua, mcp, oauth, fleet, supply-chain]
sources: [raw/articles/hamr-spike-s6-build-vs-adopt-2026-05-04.md]
related: ["[[hamr-v3-2026-05-04]]", "[[hamr-spike-s1-code-audit-2026-05-04]]", "[[fleet-architecture]]", "[[cascade-dispatch]]"]
status: draft
---

# HAMR Spike S6 — Build-vs-Adopt Matrix 2026-05-04

## Summary

Covers the 9 surviving HAMR MVP children from S1 audit (#876). For each child
assigns one of: ADOPT, BUILD, HYBRID, REUSE. Evaluates named library candidates
from the HAMR v3 spec for license compatibility (PolyForm-Noncommercial) and
maturity signals.

Decision counts: ADOPT 2, BUILD 3, HYBRID 3, REUSE 1.
License-incompatible libraries flagged: 1 (TruffleHog — AGPL-3.0; mitigated by
subprocess-only invocation).

## Per-Child Decisions

| Child | Decision | Key library or reason |
|---|---|---|
| HAMR core Cloudflare Worker | HYBRID | `workers-oauth-provider` (Apache-2.0, beta, Cloudflare-backed) for OAuth 2.1 + DPoP; Worker routing is BUILD |
| Substrate-health probe | BUILD | Orchestration of existing probe modules; no library covers schema-merge-and-write pattern |
| Provider caching adapters + sticky-route | BUILD | Extends `token-provider-adapters.js` and `litellm-client.js`; no library covers HAMR-specific cache-name routing |
| JIT wiki retrieval + bidirectional ingest | HYBRID | `@modelcontextprotocol/sdk` (MIT) for MCP `resources/read`; R2 queue + TruffleHog gate are BUILD |
| R2 JSONL mailbox + A2A envelope | BUILD | No library covers R2-backed JSONL mailbox with A2A envelope protocol layer |
| SLSA-L3 + OIDC publishing + Cosign Bundle 1.0 | ADOPT | `slsa-github-generator` (Apache-2.0) + `sigstore/cosign` (Apache-2.0) + `wrangler-action@v3` (MIT) |
| Constitution compressor (LLMLingua-2) | HYBRID | `microsoft/LLMLingua` (MIT) for offline compression; 100-prompt coverage-gate harness is BUILD |
| `hamr:status` + `hamr:quota` CLIs | BUILD | No library covers HAMR-specific substrate/provider status aggregation |
| Header-driven spillover + Batch router | HYBRID | `@anthropic-ai/sdk` (MIT) + `openai` (Apache-2.0) + `@google/generative-ai` (Apache-2.0); spillover orchestration is BUILD |

## Library Risks

- `workers-oauth-provider` is beta; pin to named release tag; review before
  each redeploy.
- `microsoft/LLMLingua` requires PyTorch (~2–4 GB); offline CI job only; never
  bundled in Worker.
- TruffleHog is AGPL-3.0; invoke as subprocess binary only; never import as
  npm dependency.
- `@modelcontextprotocol/sdk` may change with MCP specification revisions; pin
  to minor version.

## Adoption Sequencing

Phase 1: SLSA + OIDC + wrangler-action (unblock Worker deployment).
Phase 2: `workers-oauth-provider` integration.
Phase 3: Provider SDKs + `@modelcontextprotocol/sdk`.
Phase 4: `microsoft/LLMLingua` offline pipeline.
Phase 5: BUILD children (no library adoption risk).

*Source: raw/articles/hamr-spike-s6-build-vs-adopt-2026-05-04.md*

See: [[hamr-v3-2026-05-04]], [[hamr-spike-s1-code-audit-2026-05-04]],
[[fleet-architecture]], [[cascade-dispatch]]
