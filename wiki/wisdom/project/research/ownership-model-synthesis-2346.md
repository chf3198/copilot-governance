---
title: "Ownership-model design synthesis (#2346 / Epic #2345)"
type: research
scope: project
content_trust_score: 0.9
created: "2026-07-14"
updated: "2026-07-14"
tags: [synthesis, governance, baton, ownership, epic-2345, ticket-2346]
related: [[baton-protocol]] [[ticket-lifecycle-v1]] [[epic-state-truthfulness]]
status: COMPLETE
authored_by: claude-code
---

# Ownership-model design synthesis — separating accountability from baton role

> **Parent**: Epic #2345 · **Child (AC1)**: #2346 · **Cited by**: `scripts/global/accountable-team.js`,
> `scripts/global/accountable-team-backfill.js`, `scripts/global/accountable-team-verify.js`,
> `instructions/role-baton-routing.instructions.md` (§ *Explicit accountable-team schema*),
> `docs/howto/accountable-team-schema.md`.
>
> **Provenance note (research-first reconciliation):** the implementation modules were
> authored ahead of this synthesis and cited it by number before it existed (an
> out-of-order research-first-gate violation logged against this Epic). Per the
> 2026-07-14 cross-family disposition panel (D3 = author-retroactively, unanimous
> 3-family $0 consensus), this document is authored to capture the **as-built** model
> plus the alternatives that were implicitly rejected, so every citation resolves and
> the design is reviewable. It is a faithful reconstruction, not a post-hoc rationalization:
> where the code and a cleaner design diverge, this document says so (see § 6, Known gaps).

## 1. Problem

The `role:*` label carried **two incompatible meanings** at once:

1. **Persistent accountability** — "which team is answerable for this ticket," a fact that
   must survive into terminal states (a closed ticket still has an owner of record for audit).
2. **Transient baton execution ownership** — "which role is *actively holding the baton right
   now*," valid only while the ticket is in an active, role-owned state
   (`triage`/`in-progress`/`testing`/`review`, plus Epic-only `dormant`/`deferred`).

Overloading one label namespace for both produced: board/filter ambiguity (a `role:*` on a
closed ticket reads as "work is active"), audit confusion (terminal tickets appearing role-owned),
and a structural temptation to re-add an execution role to a terminal issue just to record ownership.

## 2. Requirements the model must satisfy

- **R1** Accountability persists across *all* states, including terminal, without re-introducing
  an execution `role:*` label on a terminal ticket.
- **R2** Accountability and baton-role occupy **disjoint namespaces** — never the same label.
- **R3** A closed ticket can answer "who owns this?" deterministically, with no live baton.
- **R4** Changing accountability is **decoupled** from baton transitions: a role flip must never
  silently reassign ownership, and ownership assignment must be an explicit, authorized act.
- **R5** Existing tickets (including already-closed ones) are migratable deterministically, additively,
  and reversibly.
- **R6** Validators/automation can check the invariants without new false-positive parks.

## 3. Options considered

| # | Option | Verdict |
|---|--------|---------|
| A | **`accountable-team:<team>` label** — a second, disjoint label namespace holding the team-of-record; resolves from label → most-recent signing block → default. | **CHOSEN.** Satisfies R1–R6 with the least new surface; additive so migration is a pure backfill; GitHub-native (a label, filterable on the board). |
| B | GitHub issue **assignee** field as owner-of-record. | Rejected: assignee is per-*user* not per-*team*, is frequently empty/churned by automation, and is not reliably present on the local mirror; fails R3 determinism. |
| C | Encode ownership inside the `role:*` label with a suffix (e.g. `role:manager@copilot`). | Rejected: keeps the two concepts in one namespace (violates R2) and still leaves a `role:*` on terminal tickets (violates R1). |
| D | Ownership only in the baton **signing block** (no label). | Rejected as the *primary* store: not filterable on the board and requires parsing every comment to answer R3; **retained as the fallback resolution source** in Option A. |

## 4. Chosen model — resolution order (as-built)

Persistent accountability is recorded as an **`accountable-team:<team>`** label where
`<team> ∈ { claude-code, copilot, codex, antigravity }`. The team-of-record for a ticket
resolves **deterministically** in this order (implemented by
`resolveAccountableTeam(labels, comments)`):

1. an explicit `accountable-team:*` label, else
2. the team parsed from the **most recent** baton/closeout signing block
   (`Team&Model:` line; comments scanned newest-first), else
3. the default manager team-of-record (`claude-code`).

**Authority (R4):** only the **Manager** or **Admin** role may set or change the
`accountable-team:*` label (`ACCOUNTABLE_TEAM_AUTHORITY = ['manager','admin']`), and it is
**never** written as a side effect of a baton transition — it is an explicit, separately
authorized act. The label and the `role:*` label never share a namespace (R2), and the
`accountable-team:*` label persists across terminal states (R1) while `role:*` does not.

## 5. Validator & board impact

- **Advisory-first enforcement (per D2 consensus).** `scripts/global/accountable-team-verify.js`
  scans tickets and emits **warnings** (never a hard park) for: (a) a malformed
  `accountable-team:*` value, (b) more than one `accountable-team:*` label on a ticket, and
  (c) a terminal/backlog non-Epic ticket that carries an execution `role:*` label (the invariant
  this Epic protects). It is wired into `governance-verify.js` behind an **advisory** section
  (`ACCOUNTABLE_TEAM_ADVISORY=1`, default) that prints hints and does **not** fail the run.
- **Promotion path.** Promote to a hard gate only after a shadow period showing a
  low false-positive rate (target < 2% over the observed ticket corpus), matching the harness's
  established advisory-then-promote pattern (cf. Epic #3026 advisory-first guardrails).
- **Board/filter.** `accountable-team:*` is a normal GitHub label, so board columns filter on
  execution `role:*`/`status:*` for *active* work while ownership attribution is preserved as a
  separate facet — exactly the split the Epic's Outcomes require.

## 6. Migration, rollback, and known gaps

- **Migration (R5).** `scripts/global/accountable-team-backfill.js` derives an
  `accountable-team:*` label for every ticket lacking one (using the § 4 resolution order),
  **dry-run by default**, `--apply` required to write, **idempotent** (already-tagged tickets are
  skipped), and **rollback = removing the labels this run added** (the additive-only property makes
  rollback trivial; the applied set is printed in the plan).
- **Post-migration audit.** After `--apply`, `accountable-team-verify.js` must report zero invariant
  violations (the AC4 exit check).
- **Known gaps (honest as-built notes):**
  - Enforcement is intentionally advisory in this phase; the hard-gate promotion is future work
    gated on the shadow metric above.
  - `accountable-team.js` is a pure library; wiring is via `accountable-team-verify.js`. Prior to
    this synthesis the library was present but *unwired* — that gap is closed here.

## 7. Acceptance mapping (Epic #2345)

- **AC1** — this synthesis (options, trade-offs, recommended schema, migration & validator impact, risks/rollback). ✔
- **AC2** — `accountable-team.js` schema + field/label mapping (§ 4). ✔
- **AC3** — `accountable-team-verify.js` advisory validator wired into `governance-verify.js` (§ 5). ✔
- **AC4** — `accountable-team-backfill.js` deterministic, reversible migration (§ 6). ✔
- **AC5** — `docs/howto/accountable-team-schema.md` + routing-instruction section (§ 4). ✔
- **AC6** — `accountable-team.spec.js` regression suite over schema, resolution order, and invariants. ✔
