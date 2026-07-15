---
title: "#3800-AC5 Collaborator — dry-run historical backfill plan (execution + evidence)"
type: work-log
role: COLLABORATOR
ticket: 3800
ac: 5
created: "2026-07-15"
status: VALIDATED
---
# #3800-AC5 — Collaborator execution

## Change (NEW advisory validator — dry-run planner, fabricates nothing)
`scripts/epic-baton-backfill-plan.js` (new):
- Pure `classifyInstance(ticket, cutoffISO)` → `grandfather` (pre-cutoff, no evidence) / `hasEvidence`
  (real sibling artifact) / `mustRemediate` (post-cutoff un-evidenced; missing-date ⇒ fail-safe
  mustRemediate). Cutoff = `2026-07-14` (the #3800 guard introduction date).
- Pure `backfillPlan(flaggedTickets, {cutoffISO})` → partitioned + sorted groups + summary with the
  hard invariants `dryRun:true`, `fabricates:false`.
- CLI `scanFlagged(root)` derives the flagged children (reuse `auditEpics`), reads each child's
  `created` date + a real sibling-evidence signal (`wiki/work-log/ticket-<N>/*closeout|consultant|
  evidence|admin*`). CLI is dry-run only; exits 0.

**Integrity**: NO write path. It never emits `CONSULTANT_CLOSEOUT` / `GitHub Evidence Block` prose onto
any historical ticket (1893.md MC3 precedent). Grandfathered instances are EXEMPTED from a future
blocking gate but STILL reported by the advisory — no silencing, no whitewash.

Wiring: `governance-verify.js` gains a default-on `EPIC_BATON_BACKFILL_ADVISORY` block (try/catch,
never touches `issues`) recording `epicBatonBackfillPlan` + a non-blocking hint when `mustRemediate`
is non-empty, plus a CLI print line. Registry entry + baseline bump 26→27.

## Validation evidence
- Unit: `node scripts/epic-baton-backfill-plan.spec.js` → **11/11 passed**.
- CLI (clean checkout): 0 flagged → 0/0/0 (nothing to plan).
- Real-corpus demo (canonical dev checkout): **327 flagged → 327 grandfather / 0 has-evidence /
  0 must-remediate**, `fabricates=false`. All historical instances predate the guard cutoff ⇒ a
  `(tracked ∧ post-cutoff ∧ ¬grandfather)`-scoped blocking gate sees **zero** → promotion unblocked.
- Enforcement: `enforcement-wiring-audit` → **27/27 enforced, 0 UNWIRED**; `validator-discipline` OK
  (sibling spec + registry entry present). Baseline updated 26→27 (`enforcement-telemetry
  --update-baseline`).
- `governance-verify` → **PASS** (verdict unchanged); the backfill-plan advisory line prints.
- Hermetic: clean `.git`-less archive → `epic-baton-backfill-plan.spec` 11/11 + `governance-verify.spec`
  7/7 green (post-commit run).
- Cross-family consensus: **PASS**, receipt `64b8a3eaf5d40710` (meta[groq] + mistral).

## Epic close
All six ACs (AC1–AC6) are now resolved. Parent #3800 flips to `status: DONE` with the Epic-completion
CONSULTANT_CLOSEOUT (C1/C2/C3) + `accountable-team:claude-code` label. The EB1/EB2/EB3 → blocking
promotion is a deliberately-separate, now-unblocked follow-up child (not an AC of this Epic).

Autonomy-Decision: reversible (advisory-only, dry-run, no mutation; feature push + PR + squash-merge).
