---
title: "Ticket Lifecycle v1.0 — Agent-Typed Model"
type: concept
created: 2026-04-21
updated: 2026-04-21
tags: [governance, tickets, agile, lifecycle]
sources: ["[[agile-roles-analysis]]"]
related: ["[[baton-protocol]]", "[[governance-enforcement]]"]
status: stable
---

# Ticket Lifecycle v1.0 — Agent-Typed Model

Canonical ticket governance model for a fleet of typed AI agents.
Designed so dashboard status = active agent type, no translation needed.

## Status → Agent → Artifact Chain

```
backlog → triage(manager) → ready → in-progress(collaborator)
       → testing(admin) → review(consultant) → done+closed
```

## Constraint Adjacency Map

Each status value enforces permitted sibling field values:

| Status | role | resolution |
|---|---|---|
| backlog | null | null |
| triage | manager | null |
| ready | null | null |
| in-progress | collaborator | null |
| testing | admin | null |
| review | consultant | null |
| done | null | null |
| cancelled | null | null |

`state=closed` requires `resolution` ∈ {released, cancelled,
duplicate, obsolete, wont-fix, by-design}.

## Governance Artifacts

- `research/ticket-validator.json` — machine-executable constraint map
- `research/ticket-schema-v1.json` — human-readable field glossary
- `scripts/ticket-normalizer.js` — GitHub API → validator-ready object

## Design Rationale

Status encodes "who owns it" because:
1. Fleet dashboard reads one field → instant ownership signal
2. Agent pickup condition is unambiguous (is this my status?)
3. No parallel ID schemes or secondary ownership fields needed

Industry basis: GitHub Projects v2 (Todo/In Progress/Done default),
Linear (Backlog→Todo→In Progress→In Review→Done→Cancelled).
No published standard exists for multi-agent handoff — this is custom.

See: [[baton-protocol]], [[governance-enforcement]]
