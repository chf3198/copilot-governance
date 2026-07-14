# How-to: per-child baton traceability (Epic-completion bundling drift)

**Ticket:** #3800 (self-anneal, Tier-3) · **Status:** advisory, default-on, non-blocking.

## The failure mode this guards

An Epic can be driven to CLOSED and its children marked closed **in one bundled step** — reconciled
together — **without each child carrying its own per-child baton evidence**. That violates the
*one branch = one ticket = one PR* contract and hides skipped role-workflow steps: a child reads as
"done" while never having independently traversed Manager→Collaborator→Admin→Consultant.

Per-child evidence = each closed child must carry, in its own mirror file:

- `## CONSULTANT_CLOSEOUT` — an independent Consultant critique for that child.
- `## GitHub Evidence Block` — that child's own PR/merge/CI evidence.

## Invariants (all emit `warning`; advisory-first, never fail a run)

| Code  | Condition |
|-------|-----------|
| `EB1_child_missing_closeout` | a CLOSED child of a CLOSED Epic lacks its own `## CONSULTANT_CLOSEOUT` |
| `EB2_child_missing_evidence` | a CLOSED child of a CLOSED Epic lacks its own `## GitHub Evidence Block` |
| `EB3_open_child_of_closed_epic` | a CLOSED Epic still has an OPEN child (open-child drift) |

## Running it

```bash
# Standalone advisory over the wiki mirror (always exits 0):
node scripts/epic-child-baton-traceability.js

# Wired into the aggregate governance verify (advisory section; pass/fail unchanged):
node scripts/governance-verify.js            # prints "Epic-child baton advisories (non-blocking): N"
EPIC_CHILD_BATON_ADVISORY=0 node scripts/governance-verify.js   # kill-switch to silence
```

The detector is a pure `auditEpics(tickets)` core (unit-tested) plus a thin mirror-parsing CLI. It is
wired into `scripts/governance-verify.js` the same way as `accountable-team-verify`: inside a
`try/catch`, env-gated, contributing only to `remediationHints` / `epicChildBatonAdvisories` — it
**never** adds to `issues`, so the verdict is unchanged.

## Remediating a warning

Give the flagged child its own `## CONSULTANT_CLOSEOUT` and `## GitHub Evidence Block` (do not bulk-close),
or reopen it and complete its baton. For a closed Epic with an open child (EB3), either close the child
with its own evidence or reopen the Epic.

## Promotion path (not yet blocking)

Promotion of any invariant from advisory to a hard Epic-close gate requires the AC4 shadow metric
(false-positive rate < 2% over the corpus) **and** a ≥2-distinct-family free-cloud cross-model
consensus on the FP analysis. Tracked as Phase-1 (#3800 AC3/AC4/AC5).

See also: `role-baton-routing.instructions.md` (per-child evidence requirement), Epic #2345
(the completion review that surfaced this defect).
