---
title: "HAMR Spike S1 — Existing Code Audit 2026-05-04"
type: source
created: 2026-05-04
updated: 2026-05-04
tags: [hamr, audit, fleet, capability-probe, cascade-dispatch, wiki, cloudflare]
sources: [raw/articles/hamr-spike-s1-code-audit-2026-05-04.md]
related: ["[[hamr-v3-2026-05-04]]", "[[fleet-harness-awareness-v2-2026-05-04]]", "[[cascade-dispatch]]", "[[capability-probe]]"]
status: draft
---

# HAMR Spike S1 — Existing Code Audit 2026-05-04

## Summary

Audit of 20 existing harness modules against the 13-child HAMR v3 MVP plan
(#873). Deliverable for HAMR validation spike #876, gating MVP execution under
EPIC #860.

Decision counts: **REUSE 3, REFACTOR 11, REPLACE 3, MERGE 3**. Revised HAMR
child count: **9 (down from 13)** by absorbing four prospective children into
refactors of existing modules.

## Key findings

- `cascade-dispatch.js`, `model-routing-engine.js`, `litellm-client.js`, and
  `fleet-config.js` already implement the routing core that HAMR's spillover +
  per-tier-bundle child would otherwise duplicate.
- `state-offload-client.js` and the existing CF Worker pattern are reusable
  for HAMR substrate calls; the Worker entrypoint and Durable Object,
  however, are scoped to lease coordination and must be REPLACED by the new
  HAMR core Worker.
- `capability-probe.js` + `capability-show.js` cover the substrate-health
  scope; `capability-show` MERGES into a new `hamr:status` CLI.
- `wiki/{ingest,lint,anneal,search}` already covers most JIT wiki retrieval
  and bidirectional ingest scope; only `wiki/anneal` requires a new `--batch`
  mode for nightly Anthropic Batch jobs.
- `token-provider-adapters.js` already parses cache-read tokens for 6 of 9
  providers in the HAMR caching matrix; remaining gaps are Gemini
  `cachedContentTokenCount` and Groq header-based counting.

## Revised HAMR child list (9)

1. HAMR core Worker (`/bundle`, `/mcp`, `/mailbox`, `/quota`, `/healthz`).
2. Substrate-health probe + `~/.megingjord/substrate-health.json`.
3. Provider caching adapters + sticky-route + cache-hit-rate gate.
4. JIT wiki retrieval + bidirectional ingest.
5. R2 JSONL mailbox + Google A2A envelope.
6. SLSA-L3 + OIDC publishing + Cosign Bundle 1.0.
7. Constitution compressor (LLMLingua-2 distillation pipeline).
8. `hamr:status` + `hamr:quota` operator-UX CLIs.
9. Header-driven rate-limit spillover + Anthropic Batch router.

## Open questions

- `agent-coord-remote.js` REPLACE assumes the lease/heartbeat model has no
  HAMR analogue — confirm during S6 (build-vs-adopt #881) before deletion.
- `wiki/anneal --batch` mode design: confirm Anthropic Batch API accepts
  the exact request schema produced by current anneal logic.

## Wiki ingest plan

- raw/articles/hamr-spike-s1-code-audit-2026-05-04.md (this digest's source)
- entity candidates: [[capability-probe]] (extend), [[cascade-dispatch]]
  (extend), [[litellm-client]] (new), [[token-provider-adapters]] (new),
  [[fleet-config]] (new), [[model-routing-engine]] (new)
- concept candidates: [[hamr-mvp-revised-child-list]],
  [[reuse-refactor-replace-merge-rubric]]

## Citations

Primary source: `research/hamr-spike-s1-code-audit-2026-05-04.md` (this PR,
issue #876). Module evidence cites file paths + line ranges. Comparison
baseline: `research/hamr-v3-2026-05-04.md` (#873).
