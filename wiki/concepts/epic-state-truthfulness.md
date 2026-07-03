---
title: "Epic-State Truthfulness"
type: concept
created: 2026-05-09
updated: 2026-05-09
tags: [governance, epic, acceptance-criteria, drift]
sources: ["[[epic-1271-cx-rd-plan-2026-05-09]]", "[[epic-1271-cp-rd-plan-2026-05-09]]"]
related: ["[[epic-governance]]", "[[governance-enforcement]]", "[[baton-protocol]]", "[[self-annealing]]", "[[harness-goal-controls]]"]
status: draft
---

# Epic-State Truthfulness

## Summary

Epic-state truthfulness is the property that an Epic's narrative, labels,
checkboxes, child-ticket graph, dependencies, and closeout evidence all describe
the same state. The failure mode is a Manager narrative declaring completion
while AC checkboxes or blocking dependencies still prove otherwise.

## Details

The Codex #1274 plan recommends seven controls:

1. Deterministic AC reconciliation table.
2. Epic close-readiness gate that fails narrative/AC mismatch.
3. `EPIC_RESCOPE` artifact for changed or waived ACs.
4. `status:measuring` plus `Recheck-after` for time-windowed ACs.
5. Cross-Epic dependency graph with cycle detection.
6. Consultant-only final Epic verification.
7. GHS sensor for declared-complete-but-unmet-AC drift.

The Copilot #1273 plan corroborates the same seven-control shape with newer
2026 GitHub issue/project/ruleset capability references and adds explicit
narrative-state lint as an implementation gate.

The design follows the Karpathy wiki pattern by storing raw research, a source
summary, and this distilled concept separately, then cross-linking the concept
to existing governance pages.

## Related

[[epic-1271-cx-rd-plan-2026-05-09]], [[epic-1271-cp-rd-plan-2026-05-09]], [[epic-governance]],
[[governance-enforcement]], [[baton-protocol]], [[self-annealing]],
[[harness-goal-controls]]
