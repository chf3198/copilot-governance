---
title: "Fleet Portable Config"
type: skill
created: 2026-05-16
updated: 2026-05-16
tags: [fleet, portability, onboarding]
sources: ["[[fleet-cloud-optimization-2026-05-06]]", "[[fleet-config]]"]
related: ["[[devenv-fleet-topology]]", "[[fleet-config]]", "[[provider-adapter-matrix-2026-05-14]]"]
status: stub
confidence: medium
last_verified: 2026-05-16
sources_count: 2
---

# Fleet Portable Config

Portable fleet configuration defines how a new operator maps local hardware and
network endpoints into the harness without hand-editing runtime homes.

## Key rules

- Keep source-of-truth inventory in-repo and deploy outward.
- Resolve device addresses from `.env` overrides or mesh discovery.
- Preserve lane policy and governance constraints during fleet onboarding.

## Operational pattern

1. Inventory devices and service capabilities.
2. Resolve host endpoints through fleet config utilities.
3. Validate routing and health before enabling workload traffic.
4. Record topology updates in wiki + inventory for auditability.

See also [[fleet-cloud-optimization-2026-05-06]] and [[devenv-fleet-topology]].
