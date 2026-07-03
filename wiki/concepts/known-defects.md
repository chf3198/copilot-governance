---
title: Known defects
slug: known-defects
type: concept
date: 2026-05-07
---

# Known defects

This page centralizes known governance and tooling defects identified across the harness. Each entry has a reproduction trigger, severity, and resolution status.

## Active

| Defect | First observed | Severity | Reproduction trigger | Status |
|---|---|---|---|---|
| Synthetic-floor placeholder hides regression | 2026-05-06 (#1067) | MEDIUM | Stage 4 quality-parity returned 0.457 vs synthetic 1.0 floor | RESOLVED via #1069 (floor recalibrated 0.65→0.40) |
| Epic auto-reopen on cross-references | 2026-05-06 | MEDIUM | Closed Epic body contains `#NNN` to active downstream Epic; Close-Readiness Gate auto-reopens | OPEN — gate over-fires; future child to differentiate child vs cross-ref |
| Shipped without governance closeout | 2026-05-06 | HIGH | Code merged to main + CHANGELOG entry exists, but Issue ticket remains `status:backlog`, no role removal at close | RESOLVED via Stage A/B/C/D cleanup (36 closeouts) |
| Operator-cost gate bypass risk | 2026-05-06 | LOW | Live Anthropic Batch / quality-parity require `--live --operator-approved` double-flag | RESOLVED via existing double-gate in #944 + #1067 |
| status:dormant + status:deferred missing for Epic lifecycle | 2026-05-06 | HIGH | Epic with completed R&D + no immediate next step had no documented state | RESOLVED via Epic #1074 |

## Resolution patterns

- **Synthetic placeholders** → must be replaced with empirical measurements before merge of measurement infrastructure.
- **Cross-reference vs parent-child** → Close-Readiness Gate cannot distinguish; Epic body must explicitly mark `Refs (sibling)` vs unmarked children.
- **Closeout drift** → operators must apply `status:done` AND remove `role:*` AND close in the same step. Pre-merge hook candidate.

## Cross-links

Cross-link from `wiki/log.md` entries when a defect is found. See pattern:
> [2026-MM-DD] defect | <name> — see [[known-defects]]
