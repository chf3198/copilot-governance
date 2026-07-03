---
title: "Dashboard layout density 2026-05-04"
type: source
created: 2026-05-04
updated: 2026-05-04
tags: [dashboard, layout, viewport, sizing]
sources: [raw/articles/dashboard-layout-density-2026-05-04.md]
related: ["[[baton-protocol]]", "[[governance-enforcement]]"]
status: draft
---

# Dashboard layout density 2026-05-04

## Summary

Research deliverable for #854 (child of EPIC #850). Recommends Grid `minmax()+fr` panel sizing with viewport-specific height envelopes, consolidation of Wiki Metrics into Insights, and mobile progressive disclosure. Includes desktop/laptop/mobile wireframe baselines and follow-up implementation checklist.

## Key findings

- Default to Grid track sizing, not nested fixed `vh` panel bodies.
- Prefer collapse/drilldown before fullscreen for dense dashboard content.
- Remove a panel only if its value is fully derivable in one click elsewhere.
- 36gbwinresource benchmark confirms strongest local fleet throughput for synthesis-heavy research support.

## Implementation follow-ups (NOT spawned)

1. Panel size tokens and overflow guardrails.
2. Wiki Metrics consolidation into Insights.
3. Playwright viewport baselines.

Source: raw/articles/dashboard-layout-density-2026-05-04.md
