---
name: Role Baton Routing
description: "v2.0 — Single-thread role handoff with GitHub Projects integration, typed collaborators, zero null-role states."
applyTo: "**"
---

# Role Baton Routing (v2.0)

The GitHub issue **is** the baton. One active role at a time. Every state carries exactly one
`role:*` label — no exceptions, including closed tickets.

Authoritative board: **Megingjord Harness Board** (GitHub Projects).
Baton view filter: `status:triage,ready,in-progress,testing,review` (backlog/done/cancelled/dormant/deferred hidden from active baton view).

## Status Workflow (11-state taxonomy v1.2, Epic #1828)

```
Status         Role Label                       Gate / Trigger
──────────────────────────────────────────────────────────────────────
backlog        — (Epic: manager)                Created; Epic untouched; child has no parent context yet
queued         —                                Child of active Epic; awaiting Manager pickup (#1828)
triage         role:manager                     Manager actively scoping AC + gates
ready          —                                MANAGER_HANDOFF emitted; awaiting Collaborator pickup
in-progress    role:collaborator                Implementation active (Epic: role:manager per Rule E3)
testing        role:admin                       COLLABORATOR_HANDOFF emitted; CI gates running
review         role:consultant                  ADMIN_HANDOFF emitted; critique + closeout active
                                                (Epic: role:consultant transient — Rule E2 v2, #1828)
done           — (terminal)                     CONSULTANT_CLOSEOUT emitted; issue closed
cancelled      — (terminal)                     Goal invalidated; Manager authority
dormant        role:manager                     Epic-only: paused; 90d EPIC_REVIEW (Rule E5)
deferred       role:manager                     Epic-only: blocked, no ETA (Rule E5)
```

**Single-status invariant**: at any time, a ticket carries **exactly one** `status:*` label. Multi-status carriage is a Rule 1 violation, enforced by label-lint (Epic #1828 AC6).

**Status sub-flow for child tickets of an active Epic**:
- Independent ticket: `backlog → triage → ready → in-progress → testing → review → done`
- Child of Epic at `status:backlog`: child stays at `backlog`
- Child of Epic at `status:in-progress | dormant | deferred`: child progresses `backlog → queued → triage → ready → in-progress → testing → review → done`
- Transition `backlog → queued` is Manager-initiated when the parent Epic moves out of `status:backlog`. Label-lint emits an advisory comment when this transition is pending.

## Transition Guards

- `backlog → triage`: Manager picks up; applies `role:manager`.
- `triage → ready`: MANAGER_HANDOFF posted; remove `role:manager` (no role on `ready`).
- `ready → in-progress`: Collaborator picks up; applies `role:collaborator`.
- `in-progress → testing`: COLLABORATOR_HANDOFF; all ACs ✅; swap to `role:admin`.
- `testing → review`: ADMIN_HANDOFF; all gates pass; swap to `role:consultant`.
- `review → done`: CONSULTANT_CLOSEOUT; remove `role:consultant`; close issue (atomic). Must declare `anneal_tickets_filed: [#N,...] | none` and `mid_flight_flaws:` accounting.
- `any → cancelled`: Manager authority — remove current `role:*`; post `CANCELLATION: <reason>`; close as "not planned".
- `in-progress ↔ dormant` (Epic-only): Manager pauses; carries `role:manager` per Rule E2.
- `in-progress ↔ deferred` (Epic-only): Manager flags external blocker; carries `role:manager`.
- Manager ticket-health checks, AC edits, and label fixes are out-of-band; no handoff required.

## Collaborator role

Per v1.1 taxonomy, the active label is `role:collaborator` (not the older `role:collab-{type}` form). Capability profile is reflected in ticket area labels (`area:scripts`, `area:hooks`, `area:dashboard`, etc.) rather than role-suffix typing. Each Collaborator may have only **1 `in-progress` ticket at a time** (enforced by baton-gates Action).

## Multi-Lane Definition of Done

| Lane         | Work type                      | Role sequence                     | N/A markers                    |
|--------------|--------------------------------|-----------------------------------|--------------------------------|
| code-change  | Code, infra, deploy (default)  | Manager→Collab→Admin→Consultant   | none                           |
| research     | Analysis, wiki — no git branch | Manager→Collab(analyst)→Admin→Consultant | Admin = doc reviewer, not CI |
| config-only  | Single-value config, no design | Manager→Admin→Consultant          | COLLABORATOR_HANDOFF: N/A      |

Lane set at ticket creation via `lane:*` label and `Lane` Project field. Default: **code-change**.

## Archival

Closed tickets retain `role:manager`. A nightly Action swaps `role:manager` → `role:archived`
on issues closed >30 days. Archived tickets are excluded from all dashboard and baton queries.

## Hard Rules

- `role:*` is never null — exactly one present at all times.
- No concurrent role execution on a single ticket.
- Emit the named handoff artifact before transitioning to the next role.
- `ADMIN_HANDOFF` signer identity must differ from `COLLABORATOR_HANDOFF`.
- All governed work requires a GitHub issue and `Refs #N` in the PR body; workflow identity resolution follows `instructions/team-model-in-workflows.instructions.md`.
- Skip baton only for: single Q&A, read-only lookup, no file edits, no state-changing tool calls.

## Flaw-recognition anneal decision (required)

When any active role recognizes a flaw/error during execution, it must record one explicit decision:
- `file-ticket` — structural/repeatable gap; include `#N`
- `log-incident-only` — one-off operational event; include `incidents.jsonl`/`pattern_id`
- `memory-note-only` — judgment/process note with no immediate code/process delta; include memory path
- `no-action-justified` — include a short rationale

This decision must be cited in baton artifacts and summarized in `CONSULTANT_CLOSEOUT` under:
- `mid_flight_flaws: [<flaw>, decision=<...>, artifact=<...>]`

## Enforcement Points

| Rule | Enforcement |
|------|-------------|
| Collaborator/Admin signer independence | `baton-gates.yml` admin-gate blocks identical signer identity |
| Test strategy declared per matrix | `test-evidence.yml` gate consumes `test_strategy` from `MANAGER_HANDOFF` |

## MANAGER_HANDOFF schema (with test_strategy)

Required fields on every `MANAGER_HANDOFF` comment:
- `scope:` — what changes
- `lane:` — `lane:code-change | lane:docs-research | lane:config-only | lane:trivial`
- `test_strategy:` — one of `tdd-pyramid | tdd-trophy | contract-test | golden-file | eval-harness | visual-regression | drift-lint | peer-review | manual-verify | none`
- `acceptance:` — AC checklist
- `gates:` — CI/governance gates that must pass
- `anneal_tier:` (optional) — `tier-1 | tier-2 | tier-3 | null`; populate when ticket originated from a Tier-2 anneal auto-file event per Epic #1308. Default `null` / omitted for non-anneal tickets.

`test_strategy` selected per `instructions/test-methodology-matrix.instructions.md`; missing on legacy tickets defaults to `none` (advisory). New tickets with `none` on non-permitted lane fail `test-evidence`.

## Parent/child relationships (Sub-issues primitive)

The canonical parent/child relationship uses GitHub's native **Sub-issues**
primitive (up to 100 children per parent, 8 levels deep). The legacy prose
`Refs Epic #N` convention remains supported for backward compatibility but
is deprecated for new tickets. See `docs/howto/sub-issues-migration.md` for
the migration plan and #1631 follow-on children for the helper, validator,
and test-suite implementation.

## Multi-Close PR batching (formalized #1714)

A single PR MAY close multiple related tickets via multiple `Closes #N` lines, subject to all conditions below. **Historic batches before this contract landed are grandfathered**; this rule applies to PRs opened on or after 2026-05-16.

### When batching is allowed

All of the following must hold:

- **Related ACs**: the closing tickets are children of the same parent Epic or share an `area:*` label, AND their ACs share an obvious deliverable surface (same diff, same test suite, same area).
- **Single diff**: one branch, one diff, one PR. No squash of independent commits across siblings.
- **Single test surface**: tests added/modified cover all closing tickets' ACs collectively (not one-test-per-ticket spread across PRs).
- **One lead + N siblings**: the lead ticket is the lowest issue number in the batch; the branch name uses `fix/<lead-N>-...`; siblings are explicitly named in the PR body and lead ticket.

### Required artifacts on the lead ticket

The lead ticket receives the full 4-role baton artifact set (MANAGER_HANDOFF, COLLABORATOR_HANDOFF, ADMIN_HANDOFF, CONSULTANT_CLOSEOUT) per the standard contract.

### Required artifacts on sibling tickets

Each sibling ticket receives a **brief-evidence comment** with the structured fields:

```
## CONSULTANT_CLOSEOUT
ticket: #<sibling-N> (resolved as part of batch with #<lead-N>)
status: review
verdict: approve_for_merge
verification-timestamp: <ISO8601>

rubric_rating: <int>/10. Full evidence on #<lead-N>.

Signed-by: <human-alias>
Team&Model: <team:model@substrate>
Role: consultant
```

The brief evidence MUST include the 4 structured fields: `Signed-by`, `Team&Model`, `Role`, `verification-timestamp`, plus `rubric_rating`. These satisfy the `closeout-schema` signer-alias-fidelity check.

### Validator recognition

`scripts/global/megalint/consultant-closeout.js` recognizes the phrase "resolved as part of batch with #<N>" as a valid closeout-evidence marker (in addition to the standard substantive evidence). See `scripts/global/megalint/batch-evidence.js`.

### What batching does NOT change

- Each closing ticket still requires a status:done label flip at merge (auto-transitioner handles this via the `Closes #N` line).
- Each closing ticket's labels must be advanced through the baton states (status:triage → status:ready → status:in-progress → status:testing → status:review) per the standard contract before close. Siblings can advance via the lead's MANAGER_HANDOFF; their own MANAGER_HANDOFF is NOT required.
- Auto-escalate triggers (Epic #1736 #1743) apply per-PR regardless of batching.

### Anti-pattern: when batching is NOT allowed

- Tickets from different parent Epics.
- Tickets touching different test surfaces (e.g., one is unit tests, other is integration; would force two PRs anyway).
- Tickets where one is `lane:trivial` and another is `lane:code-change` (different validator paths).
- Tickets where one sibling has `merge-evidence-override:approved` and another does not.

## Local Override

A repo may override via `.github/copilot-instructions.md`; local wins on conflict.

## Skill Mapping

Manager: `role-manager-execution` | Collaborator: `role-collaborator-execution`
Admin: `role-admin-execution` | Consultant: `role-consultant-critique`
Orchestration: `role-baton-orchestrator`
