---
title: "Epic-state truthfulness R&D — Claude Code Team plan"
type: source
created: 2026-05-09
updated: 2026-05-09
tags: [governance, epic-governance, ac-reconciliation, four-eyes, drift-detection]
sources: ["research/epic-1271-cc-rd-plan-2026-05-09.md"]
related: ["[[epic-governance]]", "[[ticket-audit-pattern]]", "[[epic-ac-reconciliation]]", "[[harness-goal-controls]]"]
status: draft
---

# Epic-state truthfulness R&D — Claude Code Team plan

## Summary

Phase-0 R&D plan for Epic #1271 ("Epic-state truthfulness — close Manager-narrative-vs-AC-state drift loop"). Identifies 7 governance gaps across 3 layers (label state, Manager narrative, AC checkboxes); proposes 7 fixes (F1–F7) prioritized by goal-lens. Highest-impact fix: formal `EPIC_RESCOPE` artifact + closeout-schema gate (F2). Based on 12 web sources (Atlassian, OneUptime, IEEE, arXiv, GitHub Marketplace, regulatory four-eyes literature).

## Key concepts

- **Three-layer drift impedance**: label state (honest) vs Manager narrative (drifting) vs AC checkboxes (decorative). Reconciliation between layers is the fix surface.
- **Four-eyes for AC verification**: Manager scopes ACs, Consultant verifies. Regulatory baseline (SOX/DORA/ISO 27001).
- **EPIC_RESCOPE artifact**: deferred-AC declaration with category enum, re-evaluation dates, follow-on tickets, Consultant signature.
- **Time-windowed AC handling**: `status:awaiting-measurement` label + `re-evaluation-by:` body field disambiguates "in-progress because work is happening" vs "in-progress because we're waiting for SLO window."
- **Cross-Epic dependency resolver**: topological cycle detection on Epic close attempt.

## Implementation order

F2 → F1 → F7 → F3 → F6 → F4 → F5 (per goal-lens prioritization). Total estimated effort ~6 days across 7 implementation children.

## See also

- `[[epic-governance]]` — current Epic lifecycle rules; F1/F2 extend
- `[[ticket-audit-pattern]]` — existing Manager-side audit; complements F6 GHS sensor
- `[[harness-goal-controls]]` — G1..G9 priority order used in F-prioritization
- `[[epic-ac-reconciliation]]` — concept page born of this R&D

*Source: research/epic-1271-cc-rd-plan-2026-05-09.md*
