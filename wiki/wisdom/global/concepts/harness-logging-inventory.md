---
title: "Harness + HAMR Logging Surface Inventory"
type: concept
created: 2026-05-11
updated: 2026-05-11
tags: [observability, logging, governance, hamr, anneal]
sources: ["research/harness-logging-rd-2026-05-11.md"]
related: ["[[harness-goals]]", "[[harness-goal-controls]]", "[[self-annealing]]", "[[distributed-self-anneal]]", "[[andon-pull-protocol]]", "[[governance-enforcement]]"]
status: draft
---

# Harness + HAMR Logging Surface Inventory

Canonical map of every logging surface in the harness — producer, consumer, schema,
retention, ingestion path. Goal-lens mapping (G1..G9) per surface. Foundation
for Epic #1339 and the implementation children C2–C10.

Derived from Phase-0 R&D (research/harness-logging-rd-2026-05-11.md).

## Surface inventory

| Surface | Producer(s) | Consumer(s) | Schema | Path |
|---|---|---|---|---|
| `~/.megingjord/incidents.jsonl` | `anneal-trigger-router`, drift sensors (#1308 Tier-1 aggregator), `governance-drift-classifier.js` | `anneal-goal-sensor.js`, `anneal-review.js`, Tier-2 auto-file workflow (#1314) | v2 (Epic #1308 — `anneal-event-schema.js`) | local file, append-only |
| `~/.megingjord/cache-stats.jsonl` | `hamr-provider-wrapper` (`appendCacheStat`) | `cache-hit-gate.runGate()`, dashboard panel | unversioned | local file, append-only |
| `dashboard/events.jsonl` | baton role transitions, hook emissions (`emit-event.js`) | dashboard panels, drift-detection workflow | unversioned | local file, append-only |
| KV `substrate-health:latest` | `npm run hamr:health-push` | HAMR `/mcp doctor:probe` | KV string (JSON) | Cloudflare KV |
| KV `cache-stats:hit-rate-7d` | `npm run hamr:cache-push` | HAMR `/quota.hit_rate_7d` | KV string | Cloudflare KV |
| `generated/anneal-sensor.json` | `anneal-goal-sensor.js` 6h cron | Goal Health Score (#1113 actuator path) | JSON snapshot | local file, replace-on-write |
| `/tmp/governance-audit.json` | `npm run governance:audit` | grooming sweep, audit report | JSON snapshot | local file, replace-on-write |
| HAMR Worker logs | Cloudflare runtime (`console.log` calls in Worker) | `wrangler tail`, ops investigation | unstructured | Cloudflare-managed (7d retention) |

## Goal-lens mapping (G1..G9 → surface)

| Goal | Primary signals | Surfaces emitting | Coverage |
|---|---|---|---|
| **G1 Governance** | rule-violation count; baton-handoff completeness; AC-checkbox accuracy | `events.jsonl` baton transitions; label-rules output (not currently logged); `governance-audit.json` | partial — label-rules output not persisted |
| **G2 Quality** | test-pass rate; consultant-rubric scores; reopen rate | `events.jsonl` baton:consultant; closeout-lint output (not jsonl) | partial — closeout signals not in jsonl |
| **G3 Zero Cost** | tokens/event; cache-hit-rate; tier-downgrade rate | `cache-stats.jsonl`; `substrate-health:latest`; HAMR `/quota` | **full** |
| **G4 Privacy** | secret-scan hits; redaction events; PII matches | detect-secrets workflow (not jsonl); no redaction-event surface | **gap — no jsonl emission** |
| **G5 Portability** | substrate-mix balance; per-team failures | `incidents.jsonl` `trigger_role`; team-model-signatures (registry, not log) | partial — registry is config, not signal |
| **G6 Resilience** | kill-switch trips; retry rate; pivot-restore success | `incidents.jsonl` `event:kill-switch-trip`, `event:pivot-end` | **full** (post-#1308) |
| **G7 Throughput** | events/min; baton-lane velocity; queue depth | dashboard panels (snapshot only); no jsonl emission of derived metrics | partial — snapshot, not streaming |
| **G8 Observability** | log-coverage %; orphan-log %; signal-to-noise ratio | **gap — no current measure** | **gap** |
| **G9 Interoperability** | schema-version distribution; reader compatibility errors | **gap — no current measure** | **gap** |

## Coverage gaps (zero-signal goals)

These goals have no current sensor emitting to any logging surface:

1. **G4 Privacy** — no `event:redaction-applied` or `event:pii-pattern-match` emission. detect-secrets runs but its output isn't structured-logged. **Recommended fix: C7 emits redaction-event records to a new `redactions.jsonl` or shared `events.jsonl`.**
2. **G8 Observability** — self-reference: we don't measure our own log coverage. **Recommended fix: C8 (goal-coverage dashboard panel) consumes this inventory and reports live coverage strength.**
3. **G9 Interoperability** — we don't track schema-version distribution across surfaces. **Recommended fix: C2's schema v3 emits a per-event `version` field; C8 panel aggregates distribution.**

## Excess / dead-log candidates

Identified by walking each surface's consumer list:

- `dashboard/events.jsonl` — multiple historical event types may have no current dashboard consumer (full audit deferred to C1 follow-up sweep)
- `generated/anneal-sensor.json` — current consumer is Goal Health Score; if #1113 children deprecate, this becomes orphan
- HAMR Worker `console.log` calls — typically debug-only; production retention is Cloudflare's 7d default; we should not mirror unless we have a named consumer
- `~/.megingjord/cache-stats.jsonl` fields that don't appear in `/quota` view — pending audit

No surfaces are recommended for retirement yet; the audit needs C1 follow-up.

## Schema versioning state

| Surface | Current version | Backward-compat concern |
|---|---|---|
| `incidents.jsonl` | v2 (Epic #1308) | v1 readers (`anneal-goal-sensor`, `anneal-review`) handle v2 ✅ |
| `cache-stats.jsonl` | unversioned | C2 must add `version: 1` marker without breaking `cache-hit-gate` |
| `dashboard/events.jsonl` | unversioned | C2 must add `version: 1` marker without breaking dashboard panels |
| KV values | per-key | KV is current-state, not log — version concern lower |
| Snapshot files | n/a | each emission overwrites; no version drift accumulation |

**Migration plan**: C2 unified schema v3 introduces a single canonical shape;
backward-compat shim accepts v1/v2/unversioned and upgrades on read.

## Retention defaults (proposed by C6)

| Surface | Hot retention | Archive | Rationale |
|---|---|---|---|
| `incidents.jsonl` | 90d | gzip>90d to `~/.megingjord/archive/` | 7d window for sensor; 90d for trend |
| `cache-stats.jsonl` | 30d | drop | only 7d window matters for /quota |
| `dashboard/events.jsonl` | 14d | drop | dashboard shows recent state |
| HAMR KV state | replace-on-write | n/a | current-state, not log |
| Snapshot JSON files | replace-on-write | n/a | snapshot, not log |
| HAMR Worker logs | 7d (CF default) | n/a | ops investigation only |

## Ingestion paths (for live-streaming pipeline in C3)

Surfaces that benefit from SSE live-streaming → dashboard panels:

- `incidents.jsonl` → anneal queue panel (#1316) + Context Flow + Baton flow
- `dashboard/events.jsonl` → Context Flow + Baton flow (live baton transitions)
- `cache-stats.jsonl` → HAMR coverage panel (P3 #1159)

Surfaces that don't need streaming (snapshot-replace surfaces):

- `generated/anneal-sensor.json` — re-render on 6h cron snapshot
- `/tmp/governance-audit.json` — re-render on audit-run snapshot
- KV state — re-render on HAMR query

## See also

- research/harness-logging-rd-2026-05-11.md — source R&D
- [[harness-goals]], [[harness-goal-controls]] — goal definitions + enforcement
- [[self-annealing]], [[distributed-self-anneal]], [[andon-pull-protocol]] — schema v2 precedent
- [[governance-enforcement]] — 4-layer enforcement model
- Epic #1339 — parent
- Child tickets: C1 (this page) → C2 (schema v3) → C3 (SSE) → C4/C5 (animation) → C6 (retention) → C7 (redaction) → C8 (goal-coverage panel) → C9 (instructions) → C10 (benchmark)
