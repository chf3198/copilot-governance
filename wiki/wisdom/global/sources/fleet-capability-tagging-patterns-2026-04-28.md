---
title: "Fleet Capability Tagging Patterns"
type: source
created: 2026-04-28
updated: 2026-04-28
tags: [fleet, routing, metadata]
sources: [raw/articles/fleet-capability-tagging-patterns-2026-04-28.md]
related: ["[[model-routing]]", "[[devenv-fleet-topology]]"]
status: draft
---

# Fleet Capability Tagging Patterns

## Summary

Capability-aware routing is most stable when device metadata is separated from
model dispatch logic. DevEnv Ops now uses this pattern via `routing` tags in
`inventory/devices.json`, allowing deterministic fleet target selection.

## Key Points

- Use normalized enums for `tier` and `inferenceClass`.
- Use `priority` for deterministic tie-breaks.
- Keep `preferredFor` task hints close to device records.
- Route to device first, then select model/runtime endpoint.

*Source: raw/articles/fleet-capability-tagging-patterns-2026-04-28.md*