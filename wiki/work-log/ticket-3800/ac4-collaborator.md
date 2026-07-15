---
title: "#3800-AC4 Collaborator — shadow-period FP-metric (execution + evidence)"
type: work-log
role: COLLABORATOR
ticket: 3800
ac: 4
created: "2026-07-15"
status: VALIDATED
---
# #3800-AC4 — Collaborator execution

## Change (NEW advisory validator, reuse-first core)
`scripts/epic-baton-shadow-metric.js` (new):
- Pure `corpusMetric(tickets)` → `{ auditableChildren, flaggedChildren, totalWarnings, byCode,
  findingRate }`. `auditableChildren` = children of CLOSED epics (the population a close-gate judges);
  `flaggedChildren` = distinct children with ≥1 EB warning (reuses `auditEpics()`);
  `findingRate = flaggedChildren / auditableChildren`.
- Pure `promotionReadiness(tracked, worktree)` → ready ONLY when tracked finding-rate < 2% AND no
  working-tree backlog; else DEFER with a reason.
- Pure `shadowMetric({trackedTickets, worktreeTickets})` combines both + readiness.
- CLI `scanCorpora(root)` acquires worktree = on-disk scan, tracked = git-committed subset (guarded
  `git ls-tree`, stderr suppressed; falls back to worktree scan when git is unavailable, e.g. a clean
  archive — identical in a clean checkout). CLI exits 0 (advisory-first).

Wiring: `governance-verify.js` gains a default-on `EPIC_BATON_SHADOW_ADVISORY` block (try/catch, never
touches `issues`) recording `epicBatonShadowMetric` + a non-blocking hint when promotion is not ready,
plus a `<result>`/CLI print line. Registry entry + baseline bump 25→26.

## FP analysis + promotion decision (AC4's measure-then-conditionally-promote mandate)
- **Tracked (committed) corpus**: finding-rate **0.00%** (< 2%) — a CI-wired gate sees a clean tree.
- **Working-tree canonical corpus**: **327 flagged / 332 auditable = 98.49%** — pre-existing TRUE
  positives (real historical bundling drift), NOT false positives. (~640 = warning count; distinct
  flagged children = 327.)
- A true FALSE-positive rate needs a labeled corpus (stated openly; #1948 precedent).
- **Decision: DEFER promotion.** The current advisory `main()` scans the working-tree wiki dir, so
  promoting EB1/EB2/EB3 to blocking today would brick every commit on the 327 historical instances.
  Promotion requires **AC5** (historical backfill/grandfathering) + a tracked-tree-scoped gate wiring.
  This is the correct data-driven outcome of AC4's `< 2% FP` conditional.

## Validation evidence
- Unit: `node scripts/epic-baton-shadow-metric.spec.js` → **11/11 passed**.
- CLI (clean checkout): tracked 0/0, worktree 0/0 → promotion **READY** (nothing to defer).
- Real-corpus demo (canonical dev checkout): worktree **327/332 (98.49%)** → promotion **DEFER**
  ("327 historical working-tree instance(s) remain … pending AC5 backfill").
- Enforcement: `enforcement-wiring-audit` → **26/26 enforced, 0 UNWIRED**; `validator-discipline` OK
  (sibling spec + registry entry present). Baseline updated 25→26 (`enforcement-telemetry
  --update-baseline`; also reconciled the pre-existing stale committed `enforcedCount: 24`).
- `governance-verify` → **PASS** (verdict unchanged); the shadow-metric advisory line prints.
- Hermetic: clean `.git`-less archive → `epic-baton-shadow-metric.spec` 11/11 +
  `governance-verify.spec` 7/7 green (post-commit run).
- Cross-family consensus on the FP analysis: **PASS**, receipt `8c933723dbf5a046` (meta[groq] +
  mistral — satisfies the Epic hard-gate consensus requirement).

Autonomy-Decision: reversible (advisory-only; feature push + PR + squash-merge to unprotected main).
