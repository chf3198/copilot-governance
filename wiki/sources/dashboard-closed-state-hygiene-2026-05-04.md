---
title: "Dashboard closed-state hygiene 2026-05-04"
type: source
created: 2026-05-04
updated: 2026-05-04
tags: [dashboard, governance, adr-010, closed-state, baton]
sources: [raw/articles/dashboard-closed-state-hygiene-2026-05-04.md]
related: ["[[baton-protocol]]", "[[governance-enforcement]]", "[[ticket-audit-pattern]]"]
status: draft
---

# Dashboard closed-state hygiene 2026-05-04

## Summary

Research deliverable for #852 (child of EPIC #848). Surveys 2026-Q2 patterns for terminal-state filtering and post-close role attribution across Linear, Height, GitHub Projects v2, and Anthropic Claude Code Console. Decision: **Linear-style default-hide + toggle** with **Height-style condensed historical attribution**, implemented as dashboard-side defense-in-depth without removing the existing upstream label-lint gate.

## Key findings

- Hide-by-default with explicit toggle is the dominant 2026-Q2 pattern.
- ADR-010's "historical ownership resolves to manager after close" matches Height's condensed audit field, not full role-chain retention.
- Hybrid (upstream gate + dashboard lint) is the right defense-in-depth posture; dashboard must never render a label combination ADR-010 forbids even during upstream race windows.

## Implementation follow-ups (NOT spawned)

1. `baton-flow.js` strip `role:*` for `state == 'closed'`.
2. Default-hide + toggle; condensed history renderer.
3. Playwright spec.

*Source: raw/articles/dashboard-closed-state-hygiene-2026-05-04.md*

See: [[baton-protocol]], [[governance-enforcement]], [[ticket-audit-pattern]]
