---
title: "Dashboard live-data methodology 2026-05-05"
type: source
created: 2026-05-05
updated: 2026-05-05
tags: [dashboard, liveness, sse, polling, staleness]
sources: [raw/articles/dashboard-live-data-methodology-2026-05-05.md]
related: ["[[context-flow]]", "[[github-integration]]"]
status: draft
---

# Dashboard live-data methodology 2026-05-05

## Summary
Epic #849 uses a hybrid liveness model: SSE for event-flow signaling and polling for aggregate panels. Every target panel exposes a visible timestamp so staleness is operator-visible.

## Design contract

- Event streams: Context Flow via SSE event mapping.
- Polling snapshots: GitHub, Quotas, Wiki Metrics, Cost+Token, Agents.
- Staleness UX: per-panel `last updated` text.
- View-switch freshness: force refresh on Wiki/Cost/Agents mount.

## Validation

Playwright coverage asserts timestamp updates for all six target panels and context-flow event response.

Source: raw/articles/dashboard-live-data-methodology-2026-05-05.md
