---
title: "Cascade Dispatch"
type: concept
created: 2026-05-11
updated: 2026-05-11
tags: [routing, fleet, governance]
sources: []
related: ["[[free-router]]", "[[fleet-architecture]]", "[[model-routing]]", "[[harness-goals]]"]
status: draft
---

# Cascade Dispatch

Bounded escalation pattern that routes a prompt through cost-ascending tiers
(Free → Fleet → Haiku → Premium) and stops at the first tier that produces a
sufficient response.

## Purpose

Enforces the harness Goal Constitution priority **G3 Zero Cost** without
sacrificing **G2 Quality**: avoid paying premium-tier tokens when a free or
fleet tier can answer adequately.

## Implementation

`scripts/global/cascade-dispatch.js` orchestrates the escalation chain:

1. **Ollama (Fleet)** — first attempt via `litellm-client` against fleet
   hardware (qwen2.5-coder, starcoder2, etc.).
2. **Heuristic gate** — `assessQuality(content, hints)` checks whether the
   response satisfies basic shape requirements (code present when expected,
   JSON parseable when expected, minimum length).
3. **Judge gate** — `judgeResponse(content)` for nuanced quality checks via
   `local-judge` when heuristic gate is ambiguous.
4. **Escalation signal** — if both gates fail, return `escalate=true` with a
   `suggested_tier` (haiku before premium per policy).

## Policy source

`scripts/global/model-routing-policy.json` defines the capability matrix and
tier ordering. The router never skips haiku to reach premium.

## Observability

Each dispatch records telemetry via `model-routing-telemetry` for downstream
analysis (`dashboard/js/cost-monitor.js`).

## See also

- `[[free-router]]` — the higher-level lane selector that invokes cascade
- `[[fleet-architecture]]` — physical substrate the cascade dispatches to
- `[[model-routing]]` — overall routing strategy
