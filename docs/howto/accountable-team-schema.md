# How-to: the `accountable-team:*` ownership schema

> Epic #2345 · design synthesis: `wiki/wisdom/project/research/ownership-model-synthesis-2346.md` (#2346)
> Referenced from `instructions/role-baton-routing.instructions.md` § *Explicit accountable-team schema*.

## Why this exists

A ticket has **two** kinds of ownership, and they must not share one label namespace:

| Concept | Question it answers | Label | Lifetime |
|---------|--------------------|-------|----------|
| **Accountability** (team-of-record) | "Who is answerable for this ticket?" | `accountable-team:<team>` | **Persists across all states, including terminal** |
| **Baton execution role** | "Who holds the baton *right now*?" | `role:<role>` | **Only on active, role-owned states** |

Overloading `role:*` for both makes a closed ticket look active and tempts re-adding an
execution role to a terminal issue just to record ownership. The `accountable-team:*` label
keeps the two disjoint.

## The schema

- **Label:** `accountable-team:<team>` where `<team>` is one of
  `claude-code | copilot | codex | antigravity`.
- **At most one** `accountable-team:*` label per ticket.
- **Distinct namespace:** it never overlaps `role:*`. A terminal ticket carries an
  `accountable-team:*` but **no** `role:*`.

## Resolution order (who owns a ticket?)

`resolveAccountableTeam(labels, comments)` in `scripts/global/accountable-team.js` resolves in order:

1. an explicit `accountable-team:*` label; else
2. the team on the **most recent** baton/closeout signing block (`Team&Model:` line); else
3. the default manager team-of-record (`claude-code`).

## Authority (who may set it?)

- Only the **Manager** or **Admin** role may set or change `accountable-team:*`
  (`ACCOUNTABLE_TEAM_AUTHORITY`).
- It is **never** changed as a side effect of a baton transition — assigning ownership is a
  separate, explicit, authorized act.

## Backfilling existing tickets

`scripts/global/accountable-team-backfill.js` assigns the label to tickets lacking one:

```bash
# DRY-RUN (default) — prints the plan, writes nothing:
node scripts/global/accountable-team-backfill.js --repo=chf3198/megingjord-harness

# APPLY — writes the labels (idempotent; already-tagged tickets skipped):
node scripts/global/accountable-team-backfill.js --repo=chf3198/megingjord-harness --apply
```

- **Idempotent:** a ticket already carrying `accountable-team:*` is skipped.
- **Rollback:** the change is purely additive — undo by removing the `accountable-team:*`
  labels the run added (the applied set is printed in the plan).

## Verifying the invariants (advisory)

`scripts/global/accountable-team-verify.js` scans tickets and emits **advisory warnings**
(it always exits 0 — it never parks a ticket):

```bash
node scripts/global/accountable-team-verify.js
# also runs, non-blocking, inside governance-verify.js (ACCOUNTABLE_TEAM_ADVISORY=1 default)
```

Checks:

| Code | Meaning |
|------|---------|
| `AT1_malformed_accountable_team` | `accountable-team:*` value is not a known team |
| `AT2_multiple_accountable_team` | more than one `accountable-team:*` label on a ticket |
| `AT3_role_on_terminal` | a terminal/backlog non-epic ticket carries an execution `role:*` label |

### Promotion to a hard gate

Enforcement is intentionally advisory in this phase. Promote to a blocking check only after a
shadow period demonstrating a low false-positive rate (target **< 2%** over the ticket corpus),
consistent with the harness's advisory-then-promote pattern (cf. Epic #3026).
