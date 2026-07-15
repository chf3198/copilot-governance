---
name: Ticket-Driven Work Management
description: The GitHub issue is the baton. Every task is tracked by an issue with standardized labels and status transitions.
applyTo: "**"
---

# Ticket-Driven Work Management

**Requirement**: Every piece of work must have a GitHub issue ticket.

## Ticket Types

| Type | Purpose | Label |
|---|---|---|
| Epic | Major feature or initiative | `type:epic` |
| Story | User-facing feature | `type:story` |
| Task | Internal/technical work | `type:task` |
| Bug | Defect fix | `type:bug` |
| Doc | Documentation | `type:doc` |
| Research | Investigation/spike | `type:research` |

## Label taxonomy (v1.2 — agent-typed 11-status; 2 Epic-only; Epic #1828)

| Status | Active Agent | Gate Condition |
|---|---|---|
| `status:backlog` | — (Epic: `role:manager`) | Queued; unassigned; Epic untouched |
| `status:queued` | — | **Child of active Epic; awaiting Manager pickup** (Epic #1828, distinct from `backlog`) |
| `status:triage` | `role:manager` | Manager scoping AC + gates |
| `status:ready` | — | MANAGER_HANDOFF emitted; awaiting Collaborator pickup |
| `status:in-progress` | `role:collaborator` (Epic: `role:manager`) | Implementation active |
| `status:testing` | `role:admin` | COLLABORATOR_HANDOFF emitted; CI/gates running |
| `status:review` | `role:consultant` | ADMIN_HANDOFF emitted; critique + closeout active (Epic: `role:consultant` transient — Rule E2 v2) |
| `status:done` | — | CONSULTANT_CLOSEOUT emitted; issue closes |
| `status:cancelled` | — | Abandoned; Manager authority; **goal invalidated** |
| `status:dormant` | `role:manager` | **Epic-only**: paused; 90d review |
| `status:deferred` | `role:manager` | **Epic-only**: blocked, no ETA |

**Single-status invariant**: at any time, a ticket carries **exactly one** `status:*` label. Multi-status carriage is a Rule 1 violation, enforced by label-lint (Epic #1828 AC6).

- **Priority**: `priority:P1` (urgent) · `priority:P2` (normal) · `priority:P3` (low)
- **Area**: `area:dashboard` · `area:hooks` · `area:skills` · `area:instructions` · `area:agents` · `area:scripts` · `area:infra`
- **Role** (current baton holder): `role:manager` · `role:collaborator` · `role:admin` · `role:consultant`

## Closed ticket normalization

- `done` → `closed` is a single atomic step: emit `CONSULTANT_CLOSEOUT`, set `status:done`, remove all `role:*` labels, close issue.
- Closed tickets are terminal and must not re-enter active Baton views.
- Historical ownership in dashboard/audit views resolves to `manager` after close.

## Valid owner × work-type matrix

Default lanes use `role:collaborator`. Work types with CI gates (development, bug fix, infra/ops) include `testing`; docs/research may use reduced markers as defined in baton routing. Valid statuses: `triage` → `ready` → `in-progress` → [`testing`] → `review` → `done`.

No-code remediation lane (`lane:no-code-remediation`) is issue-only and manager/consultant scoped:
- Valid transitions: `triage` → `review` → `done`
- Required markers: `COLLABORATOR_HANDOFF: N/A` and `ADMIN_HANDOFF: N/A`
- Any repository diff, workflow edit, or validator fix requiring file changes must re-route to normal baton (`lane:code-change`).

## Forbidden combinations

- Closed issue + any execution `role:*` label.
- Multiple `status:*` labels on the same ticket (Rule 1, Epic #1828 AC6).
- `status:backlog`, `status:queued`, `status:ready`, `status:done`, or `status:cancelled` with any `role:*` label — **except Epics**, which carry `role:manager` throughout most of their lifecycle (per `epic-governance.instructions.md` Rule E2 v2 and label-lint).
- `status:triage` with non-manager role.
- `status:in-progress` with admin/consultant role — **except Epics**, which carry `role:manager` (Rule E3).
- `status:testing` with collaborator/consultant role.
- `status:review` with manager/collaborator/admin role — **except Epics**, which carry `role:consultant` transiently during review (Rule E2 v2).
- `status:done` on an open issue (done must coincide with issue close).
- `status:dormant` or `status:deferred` on non-Epic tickets (Rule E5).
- `status:queued` on non-child tickets (queued is only valid for children of an active Epic per Rule E6).

## Manager Responsibilities

1. **Create tickets before work starts** — never code first.
2. **Apply full label set** — type + status:backlog + priority + area.
3. **Write scope comment** — objective, AC, constraints.
4. **Link ticket to branch** — branch: `<type>/<issue#>-<slug>`.
5. **Link ticket to PR** — PR body includes `Refs #N` (not `Closes #N`). Issue close is Consultant authority after CONSULTANT_CLOSEOUT.
6. **Enforce ticket closure** — close only after merge + Consultant CLOSEOUT.
7. **One symptom per ticket** — never group multiple distinct symptoms under one issue.

## GitHub evidence block (required for closeout)

Before `status:done` + close, ticket artifacts must include a concise evidence block:
- Issue reference and terminal state
- Applied status/role/priority/area labels (or explicit N/A)
- Linked PR/merge evidence (or explicit N/A + reason)
- Validation evidence summary used by Admin/Consultant
- Verification timestamp and exact command/check outputs used for closure

If evidence is missing, Consultant must not close the ticket.

## Ready-SLA escalation contract (P0/P1)

- If a P0/P1 ticket remains `status:ready` for >24h, Manager must add one of:
	1) `BLOCKER_NOTE` with owner + unblock condition + ETA, or
	2) escalation comment linking a follow-up owner action.
- Tickets without blocker/escalation evidence are governance violations.

## Approved exception schema (closure evidence)

When PR/merge proof is unavailable, use explicit exception fields in evidence block:
- `exception_type`: `local-markdown-workflow` | `external-system-unavailable`
- `exception_reason`: concise rationale
- `exception_approver`: `manager|admin|consultant`
- `exception_time_utc`: ISO timestamp

## Epic Rules

See `epic-governance.instructions.md` for epic state diagram + close conditions.
