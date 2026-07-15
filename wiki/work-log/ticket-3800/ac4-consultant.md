---
title: "#3800-AC4 Consultant — independent critique"
type: work-log
role: CONSULTANT
ticket: 3800
ac: 4
created: "2026-07-15"
status: ACCEPT
---
# #3800-AC4 — Consultant critique

## Verdict: ACCEPT — risk LOW

### Does AC4 meet its criterion?
Yes. AC4 = "Shadow-period metric (FP-rate over the corpus); promote EB1/EB2/EB3 to a hard gate ONLY at
< 2% FP." The mandate is measure-then-*conditionally*-promote — it does not require promotion to occur.
`epic-baton-shadow-metric.js` delivers the metric, and the promotion decision is data-driven: tracked
corpus 0.00% (< 2%) but a 327-instance working-tree backlog ⇒ **DEFER**. That is the literally-correct
outcome of the conditional, not an evasion.

### Integrity of the FP analysis (the crux)
The single biggest hazard here would be relabeling the ~327 historical findings as "false positives"
to manufacture a clean < 2% and justify flipping the gate. The implementation does the honest thing:
it names them TRUE positives (real historical bundling drift), keeps them as the AC5 backlog, and
states plainly that a real FP-rate needs a labeled corpus (consistent with the #1948 precedent). The
tracked-corpus finding-rate is used correctly as an upper bound on a CI gate's block-rate. No
manufactured evidence; C-G1 respected.

### Promotion safety
The decision NOT to flip EB1/EB2/EB3 to blocking is correct and important: the advisory scans the
working-tree wiki dir, so a blocking flip today would brick every commit on 327 historical instances.
Deferring to AC5 (backfill/grandfathering) + a tracked-tree-scoped wiring is the safe, reversible path.
The delivered change is advisory-only (governance-verify verdict provably unchanged: PASS).

### Enforcement discipline
New validator, correctly handled: sibling spec (11/11), self-test registry entry, wired non-bypassable
advisory reachable from an enforced root ⇒ 26/26 enforced, 0 unwired; baseline moved 25→26 (and the
pre-existing stale committed baseline of 24 was reconciled in the same bump). Hermetic clean-tree specs
green.

### Metric correctness (spot-check)
`findingRate = flaggedChildren / auditableChildren`, auditable scoped to children of CLOSED epics,
distinct-child dedupe (2 warnings on one child = 1 flagged child) — verified by test
`finding-rate = flaggedChildren / auditableChildren` (0.25 for 1-of-4). Div-by-zero guarded (open epic
→ 0 auditable → rate 0). `scanCorpora` degrades safely with no git / missing dir.

### Consensus
Cross-family panel PASS on the FP analysis, receipt `8c933723dbf5a046` (meta[groq] + mistral — 2
distinct families) — satisfies the Epic's Phase-1 hard-gate consensus requirement for the FP analysis.

## Recommendation
Merge. AC4 is complete (metric delivered; promotion correctly deferred with consensus). Parent #3800
stays OPEN for AC5 (optional historical backfill) — which is now the concrete unblocker for a future
promotion to a blocking Epic-close gate.
