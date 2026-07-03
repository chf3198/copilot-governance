---
title: "Andon-Pull Protocol"
type: concept
created: 2026-05-10
updated: 2026-05-10
tags: [governance, anneal, baton, multi-agent]
sources: []
related: ["[[distributed-self-anneal]]", "[[self-annealing]]", "[[baton-protocol]]", "[[governance-enforcement]]", "[[agent-drift]]"]
status: draft
---

# Andon-Pull Protocol

Any-role mechanism for flagging drift mid-baton-execution, modeled on Toyota's Andon cord (any worker can stop the line for a defect). The pull is distinct from Tier-3 Consultant escalation — Andon is about *raising signals*; Tier-3 is about *forcing reopen authority*.

## Trigger phrases

The `anneal-trigger-router` skill auto-discovers via its `description:` frontmatter field (per Agent Skills Open Standard, agentskills.io). Trigger phrases:

- `pull anneal`
- `andon`
- `drift anneal #N` (with ticket reference)
- `report drift`

## Authority matrix

| Role | What they can pull | Cost | Notes |
|---|---|---|---|
| Manager | Any tier | normal | Full authority — also files Tier-2 auto-tickets |
| Collaborator | Tier 1, request Tier 2 | normal | Router classifies whether request actually escalates |
| Admin | Tier 1 (post-merge / build issues) | normal | Mostly observation; rare Tier-2 requests |
| Consultant | Tier 1, Tier 2, **Tier 3** | privileged | Only role that can invoke Tier-3 goal-failure escalation |

## Event schema v2

```
{
  "version": 2,
  "timestamp": "<ISO-8601 UTC>",
  "tier": 1 | 2 | 3,
  "trigger_role": "manager|collaborator|admin|consultant|system",
  "trigger_type": "pattern-recurrence|manual-pull|goal-failure|sensor-driven",
  "pattern_id": "<string-or-null>",
  "severity": "low|medium|high|critical",
  "evidence": ["<url-or-file-ref>", "..."],
  "ticket_ref": "<#N-or-null>",
  "epic_ref": "<#N-or-null>",
  "session_id": "<string>",
  "schema_compat": "<v1-readers-must-ignore-fields-not-in-v1>"
}
```

Backward-compatible: missing `version` field → treated as v1. v1-aware readers (`anneal-goal-sensor.js`, `anneal-review.js`) ignore new fields. Expand-contract pattern (Confluent staff-eng best practice).

## Severity classification

| Severity | Examples | Tier-2 trigger? |
|---|---|---|
| critical | governance-rule violation, data loss, security gate bypass | yes — immediate, bypasses recurrence threshold |
| high | repeated CI failure, drift from documented protocol | yes after 2 occurrences in 7d |
| medium | minor process gap, single instance of inefficiency | yes after 2 occurrences in 7d |
| low | typo, single observation, cosmetic | no — Tier 1 trend capture only |

Misclassification target: <5% on the 50-event golden-file fixture (Epic #1308 AC3).

## Pivot semantics (Tier 2)

When Tier-2 triggers mid-flight, the baton orchestrator:

1. **Snapshot** current state: `{role, ticket_ref, baton_phase, last_event_id, timestamp}`
2. **Emit** `event:pivot-start` with snapshot
3. **Assume** Manager role temporarily (transient)
4. **Run** `workflow-self-anneal` (bounded: max 3 doc proposals, max 50 step counter)
5. **File** Manager ticket(s) per anneal output (docs to anneal scope; code goes to standard baton — never bypass)
6. **Emit** `event:pivot-end` with files-created list
7. **Assert** `current_role == snapshot.role`; restore baton to `snapshot.ticket_ref` at `snapshot.baton_phase`

Kill-switch trips during pivot **abort cleanly** — original baton state is preserved (no partial restoration).

## Anti-patterns

- Pulling Andon for a single low-severity typo (use Tier 1 observation, not Tier 2 pull)
- Bypassing baton via anneal channel for code work (only docs/process route through anneal)
- Nested pivots within pivots (single-flight rule blocks; queue but don't fire)
- Treating Tier 2 as a fast-path for ordinary Manager tickets (use the standard Manager-creation flow)

## See also

- `[[distributed-self-anneal]]` — three-tier model overview
- `[[self-annealing]]` — base protocol
- `[[baton-protocol]]` — baton handoff fundamentals
- `[[agent-drift]]` — root causes that justify pulling
- Epic #1308 — implementing Epic
