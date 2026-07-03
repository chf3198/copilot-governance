---
title: "Anthropic Batch Routing"
type: concept
created: 2026-05-16
updated: 2026-05-16
tags: [anthropic, batch, routing, hamr]
sources: ["scripts/global/anthropic-batch-router.js", "instructions/hamr-routing.instructions.md"]
related: ["[[header-spillover]]", "[[hamr-core-worker]]", "[[token-provider-adapters]]"]
status: stub
confidence: medium
last_verified: 2026-05-16
sources_count: 2
---

# Anthropic Batch Routing

## Summary

Time-elastic Anthropic work is routed through a batch path so immediate
interactive lanes are not blocked by long-running requests.

## Notes

- Batch routing is for deferred workloads with explicit SLA tolerance.
- Routing policy should preserve governance metadata and cost telemetry.
- Spillover and fallback controls remain active during batch execution.

Primary references: [[header-spillover]], [[token-provider-adapters]], and
[[hamr-core-worker]].
