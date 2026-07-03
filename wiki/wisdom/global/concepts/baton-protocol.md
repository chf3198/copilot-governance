---
title: "Baton Protocol (Role Handoff)"
type: concept
created: 2026-04-14
updated: 2026-04-21
tags: [governance, workflow, agile]
sources: []
related: ["[[ticket-lifecycle-v1]]", "[[agent-drift-governance]]", "[[self-annealing]]"]
status: stable
---

# Baton Protocol (Role Handoff)

Single-thread role handoff model for agent task execution.
The GitHub issue IS the baton — one agent holds it at a time.

## Agent-Typed Status Vocabulary (v1.0)

Each status name = the active agent type. Dashboard reads = instant ownership signal.

| Status | Active Agent | Handoff Artifact |
|---|---|---|
| `backlog` | — | none |
| `triage` | **Manager** | → emits `MANAGER_HANDOFF` |
| `ready` | — | waiting for Collaborator pickup |
| `in-progress` | **Collaborator** | → emits `COLLABORATOR_HANDOFF` |
| `testing` | **Admin** | → emits `ADMIN_HANDOFF` |
| `review` | **Consultant** | → emits `CONSULTANT_CLOSEOUT` |
| `done` | — | issue closes atomically |
| `cancelled` | — | Manager authority only |

## Sequence

Manager → Collaborator → Admin → Consultant

## Role Responsibilities

| Role | Agile Equivalent | Primary Duty |
|---|---|---|
| Manager | Product Owner | Scope, AC, gates |
| Collaborator | Developer | Implementation, evidence |
| Admin | QA / DevOps | CI, merge, deploy |
| Consultant | Architect / Reviewer | Critique, CLOSEOUT |

## Rules

- Only one role active at a time
- Each role posts a named handoff artifact as a GitHub comment
- `done` and issue `closed` are atomic — no open-done state
- All roles are AI agents; human = design decisions + UAT only

See: [[ticket-lifecycle-v1]], [[agile-roles-analysis]]

See: [[sandbox-worktree-governance-pack]]
