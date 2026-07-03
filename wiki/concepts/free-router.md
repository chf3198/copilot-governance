---
title: "Free Router"
type: concept
created: 2026-05-11
updated: 2026-05-11
tags: [routing, governance]
sources: []
related: ["[[cascade-dispatch]]", "[[model-routing]]", "[[harness-goals]]", "[[fleet-architecture]]"]
status: draft
---

# Free Router

Lane-selection layer that determines which cost tier a task should target
*before* the work begins. Distinct from `[[cascade-dispatch]]`, which executes
the chosen tier and escalates on failure.

## Purpose

Implements the harness Goal Constitution priority order:
**G1 Governance > G2 Quality > G3 Zero Cost** by classifying tasks into the
lowest-adequate-cost lane up front, rather than running expensive tiers
speculatively.

## Lanes (cost-ascending)

| Lane | Substrate | Use |
|---|---|---|
| **Free** | Auto-tier / lookup | Q&A, docs, boilerplate; zero tokens |
| **Fleet** | Ollama via `[[cascade-dispatch]]` | Known-pattern coding, config gen, log analysis |
| **Haiku** | claude-haiku-4-5 | Single-file refactors, test gen, code review |
| **Premium** | claude-sonnet-4-6 | Multi-file architecture, security, ambiguous debugging |

## Direct-to-premium

Bypasses the cascade for: security review, vulnerability audit, architecture
design, incident response, cross-system tradeoff analysis, concurrency analysis.

## Policy source

Same as cascade-dispatch: `scripts/global/model-routing-policy.json`.
Authoritative instruction: `instructions/global-task-router.instructions.md`.

## Telemetry

Lane decisions are recorded so the routing engine can force fleet-lane usage
when premium share exceeds 20% over 7 days (`npm run routing:report`).

## See also

- `[[cascade-dispatch]]` — execution layer below the router
- `[[model-routing]]` — overarching strategy
- `[[harness-goals]]` — G3 Zero Cost rationale
