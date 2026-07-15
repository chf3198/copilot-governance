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

## Close-time remediation hint (AC3)

Before closing an Epic, ask the detector for an epic-scoped, actionable hint that names the specific
children still missing their own baton evidence:

```
node scripts/epic-child-baton-traceability.js --epic <N>
```

- If the Epic has un-evidenced or still-open children, it prints a `CLOSE-TIME HINT` naming each
  blocking child and the invariant codes (`EB1`/`EB2`/`EB3`) blocking it — remediate those first.
- If the Epic is clean (or is not an actually-closing Epic), it prints `clear to close` and does
  nothing else. The hint reuses the same validated `auditEpics()` predicate, so it is low-false-
  positive by construction and **never** fires on an open/non-epic ticket.

This is a HINT for the Manager/Admin baton path, not a blocking gate (advisory-first, always exit 0).
Programmatic callers can use the exported `epicCloseHint(tickets, epicNumber)` →
`{ epic, blockers:[{child, codes}], hint }` (`hint` is `null` when clear).

## Promotion path (not yet blocking)

Promotion of any invariant from advisory to a hard Epic-close gate requires the AC4 shadow metric
(false-positive rate < 2% over the corpus) **and** a ≥2-distinct-family free-cloud cross-model
consensus on the FP analysis. Tracked as Phase-1 (#3800 AC3/AC4/AC5).

### AC4 shadow-period metric

`scripts/epic-baton-shadow-metric.js` measures the EB1/EB2/EB3 finding-rate over the corpus a gate
would scan and emits a data-driven `promotionReadiness` verdict:

```
node scripts/epic-baton-shadow-metric.js
```

- **tracked corpus** (git-committed subset) = what a CI-wired gate actually sees. Its finding-rate is
  a sound upper bound on the gate's block-rate there. On the current tracked tree this is **0%**.
- **worktree corpus** (on-disk mirror, incl. untracked) = the historical **backlog** — pre-existing
  TRUE positives (real bundling drift), NOT false positives. On the canonical dev checkout this is
  ~327 flagged children (~98%). A true FP-rate needs a labeled corpus.

`promotionReadiness.ready` is true only when the tracked finding-rate is < 2% **and** there is no
working-tree backlog a naively-wired gate would brick on. Because the current advisory `main()` scans
the working-tree wiki dir, promoting EB1/EB2/EB3 to blocking today would brick every commit on the
~327 historical instances — so **promotion is DEFERRED** pending **AC5** (historical backfill /
grandfathering) and a tracked-tree-scoped gate wiring. The shadow metric is wired into
`governance-verify` as a default-on, non-blocking advisory (`EPIC_BATON_SHADOW_ADVISORY=0` silences).

### AC5 historical backfill plan (dry-run exemption manifest)

`scripts/epic-baton-backfill-plan.js` produces the deterministic classification a future
promotion-to-blocking needs — **without fabricating any evidence** (it never writes a
`CONSULTANT_CLOSEOUT` / `GitHub Evidence Block`; the 1893.md MC3 precedent — leave long-merged
closeouts alone):

```
node scripts/epic-baton-backfill-plan.js
```

Each flagged historical child is classified:
- **grandfather** — created before the guard cutoff (`2026-07-14`) → EXEMPT from a future blocking
  gate. The advisory still reports it (transparency preserved — nothing is silenced or fabricated).
- **has-evidence** — a real sibling evidence artifact (`wiki/work-log/ticket-<N>/*closeout*` …) exists
  → record a POINTER to real evidence, no new prose.
- **must-remediate** — post-cutoff and genuinely un-evidenced → needs a real per-child baton; never
  auto-backfilled.

On the canonical corpus all **327** flagged children classify as **grandfather** (0 must-remediate),
so a blocking Epic-close gate scoped to `(tracked ∧ post-cutoff ∧ not-grandfathered)` sees **zero**
historical instances and is safe to promote. That promotion (the actual flip of EB1/EB2/EB3 to
blocking) is a well-defined, now-unblocked follow-up child — it is deliberately NOT part of Epic #3800
(whose ACs deliver the guard, the metric, and this manifest). The plan is wired into
`governance-verify` as a default-on dry-run advisory (`EPIC_BATON_BACKFILL_ADVISORY=0` silences).

See also: `role-baton-routing.instructions.md` (per-child evidence requirement), Epic #2345
(the completion review that surfaced this defect).
