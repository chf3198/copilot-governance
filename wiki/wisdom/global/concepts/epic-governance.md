---
title: "Epic Governance"
type: concept
created: 2026-04-28
status: active
---
# Epic Governance

## Summary

Rules for epic ticket lifecycle: role ownership, status advancement, progress tracking,
and close conditions. Epics are parent containers; all active work happens in child tickets.

## Role Boundary

- Epic always carries `role:manager`. Never reassigned during active child work.
- Child tickets carry the active agent's role label (`role:collaborator`, etc.).
- The Agent Baton displayed on child tickets reflects current execution; epic label is constant.

## Status Advancement Table

| Epic Status     | Condition to Advance             |
|-----------------|----------------------------------|
| `backlog`       | Created; carries `role:manager` (Rule E2) |
| `triage`        | Scope defined, children created  |
| `in-progress`   | ≥1 child `in-progress`; carries `role:manager` (Rule E3) |
| `dormant`       | Active goal, no current work; 90d EPIC_REVIEW (Rule E5; #1074) |
| `deferred`      | Active goal, externally blocked; no ETA (Rule E5; #1074) |
| `review`        | All children `done` or terminal  |
| `done`/closed   | See close conditions below       |
| `cancelled`     | Goal invalidated (NOT for stalled work) |

## Progress Comment Protocol

Post a progress comment to the epic when:
1. A child ticket reaches `done` (closed)
2. A child ticket is cancelled (`status:cancelled`)
3. A new child is added after triage

Format: `Progress: #NNN <title> → done/cancelled. Children: X/Y complete.`

## Close Conditions (all required)

1. All child tickets are terminal (`done`, `cancelled`, or `wont-fix`)
2. CONSULTANT_CLOSEOUT comment posted on epic
3. Resolution label set (`resolution:completed` or appropriate variant)
4. Epic closed with `stateReason: COMPLETED`

## Branch Naming

- Child ticket work: `feat/<child-issue-number>-<slug>`
- **Never** name a branch after the epic number

## Related

- `instructions/epic-governance.instructions.md` — authoritative rule set
- `instructions/ticket-driven-work.instructions.md` — full ticket lifecycle
- `instructions/role-baton-routing.instructions.md` — baton handoff protocol
- `wiki/concepts/ticket-lifecycle-v1.md`
- `wiki/concepts/baton-protocol.md`

## Sources

- Epic #353: Ticket governance normalization (source task)
- ADR: Agent-typed status vocabulary v1.0
