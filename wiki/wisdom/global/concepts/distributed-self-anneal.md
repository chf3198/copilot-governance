---
title: "Distributed Self-Anneal"
type: concept
created: 2026-05-10
updated: 2026-05-10
tags: [governance, anneal, multi-agent, baton]
sources: []
related: ["[[self-annealing]]", "[[andon-pull-protocol]]", "[[agent-drift]]", "[[governance-enforcement]]", "[[baton-protocol]]", "[[ticket-audit-pattern]]"]
status: draft
---

# Distributed Self-Anneal

Three-tier escalation model that extends pattern-based self-anneal (Epic #1133) with **distributed any-role pull** and **mid-flight pivot orchestration**.

## Why three tiers

Single-agent self-reflection systematically repeats its own reasoning errors (Multi-Agent Reflexion, Shinn 2025; arxiv 2512.20845). Anneal limited to pattern-recurrence misses Collaborator-observed and Consultant-observed drift. The Toyota Andon principle: any worker can stop the line — adapted to the baton, any role can flag.

Two triggers (Manager pivot + Consultant escalation) are still too few. Lightweight observations from Collaborator and Admin get lost without an explicit channel. Three tiers separates trend capture (low cost) from action (high cost).

## Tier definitions

| Tier | Trigger | Authority | Cost |
|---|---|---|---|
| **1 — Observation** | Any role appends event to `~/.megingjord/incidents.jsonl` | All roles | Zero — passive logging |
| **2 — Mid-flight pivot** | `severity ≥ medium` AND (recurrence ≥ 2 in 7d window OR `trigger_type == manual-pull`) AND no active session-pivot AND no matching suppression entry | Any role requests; orchestrator executes | One pivot/session, rate-limited 3/24h |
| **3 — Consultant escalation** | Consultant rubric finds G1–G9 goal violation post-implementation | Consultant only (privileged) | High-blast — reopens tickets, can file new Epic |

## Event schema v2

Tier-aware extension of v1 incidents.jsonl. Backward-compatible (v1 readers ignore new fields; missing `version` field treated as v1). Field-by-field contract lives in `[[andon-pull-protocol]]`.

## Bounded-loop guards

- Single-flight per session — only one pivot active at a time (Reflexion runaway protection)
- Max 3 pivots per 24h per session (rate-limit)
- Max 5 anneal tickets per 7-day window per `pattern_id` (suppression cooperation with [#1220](https://github.com/chf3198/megingjord-harness/issues/1220))
- Anneal protocol step counter — abort with `decision: defer` if >50 tool calls (silent-bad-assumption protection per ICML 2026 FMAI workshop)
- All trips emit `event:kill-switch-trip` (dashboard-observable per AC9 of Epic #1308)

## Relationship to Epic #1133

Epic #1133 builds the *pattern-detection* leg — sensors (`anneal-goal-sensor.js`), recurring-patterns catalog, suppression-registry ([#1220](https://github.com/chf3198/megingjord-harness/issues/1220)), auto-file proposals ([#1219](https://github.com/chf3198/megingjord-harness/issues/1219)), governance-audit integration ([#1222](https://github.com/chf3198/megingjord-harness/issues/1222)).

This concept extends with: any-role pull, severity classifier, mid-flight pivot, Consultant escalation. Both layers share the same `incidents.jsonl` event log via schema v2 (backward-compatible).

## See also

- `[[andon-pull-protocol]]` — any-role pull semantics, trigger phrases, pivot mechanics
- `[[self-annealing]]` — base protocol (Tier-2 mid-flight pivot phase)
- `[[agent-drift]]` — root-cause taxonomy for what triggers the pull
- `[[governance-enforcement]]` — 4-layer enforcement architecture
- `[[ticket-audit-pattern]]` — Manager-side audit pattern (related — bottom-up audit; this is top-down distributed pull)
- Epic #1308 — implementing Epic for this concept
- Epic #1133 — parent infrastructure (pattern-detection leg)
