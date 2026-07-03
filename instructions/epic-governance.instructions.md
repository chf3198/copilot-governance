---
name: Epic Governance
description: Rules governing epic lifecycle — status advancement, role label, progress tracking, and close conditions.
applyTo: "**"
---

# Epic Governance

## Epic vs. Child Ticket — Role Boundary (Rule E2 v2 — Epic #1828)

- Epic carries `role:manager` (default, throughout `backlog | triage | in-progress | dormant | deferred`) OR `role:consultant` (transient, **only during `status:review`** phase preceding terminal close to compose the CONSULTANT_EPIC_CLOSEOUT artifact).
- Collaborator and Admin roles **never** apply to Epics — those roles act on child tickets, not the Epic itself. The orchestrator-worker contract holds: Manager (and during closeout-review, Consultant) own the Epic; workers own the children.
- At terminal (`status:done` / `status:cancelled`): role label removed.

## Epic Status Advancement Rules

| Epic Status | Condition to Enter | Allowed Role |
|---|---|---|
| `backlog` | Created; no children started | `role:manager` |
| `triage` | Manager scoping children; at least one child exists | `role:manager` |
| `in-progress` | First child ticket moves to `status:in-progress` | `role:manager` |
| `dormant` | Active goal; no current work; awaits external trigger or 90d review | `role:manager` |
| `deferred` | Active goal; externally blocked; no ETA | `role:manager` |
| `review` | All children are terminal (closed); epic-level closeout pending | `role:consultant` (transient) |
| `done` + closed | CONSULTANT_EPIC_CLOSEOUT emitted; all children confirmed terminal | (no role) |
| `cancelled` | Manager authority; **goal invalidated** (NOT used for stalled work) | (no role) |

Epic status is advanced by the Manager agent at each gate — it does **not** auto-advance.

### Epic-only states (dormant + deferred)

- `dormant`: Manager pauses an Epic when a milestone closes and no immediate next step exists. Comment must name the trigger that would resume work.
- `deferred`: Manager marks Epic blocked by external constraint (e.g., third-party beta, plan tier). Comment must name the blocker + ETA condition.
- Both require `role:manager` (Epic invariant).
- Both receive a 90-day review: Manager posts an `EPIC_REVIEW` comment with verdict (stay-dormant, reclassify, or cancel).
- Transitions: `in-progress ↔ dormant`, `in-progress ↔ deferred`, `dormant ↔ deferred`, `dormant → triage` on resume, `deferred → in-progress` when blocker clears, `dormant → cancelled` only after review affirms goal no longer applies.

### `status:in-progress → status:dormant` auto-transition (per #1342)

An Epic at `status:in-progress` auto-transitions to `status:dormant` when ALL of the following hold for ≥7 days:

1. No child ticket is at `status:in-progress` (or has had its status change in that window).
2. No linked PR has activity (commit, review, comment) in the last 7 days.
3. No Manager comment posted in the last 7 days containing the marker `EPIC_ACTIVE: <reason>` overriding the auto-transition.

Operator can tune the 7-day window via `EPIC_DORMANT_AFTER_DAYS` env var on the workflow. <!-- soak-language-override: pre-existing #1342 calendar threshold; velocity-relative translation tracked in Epic #1827 v2 -->

Auto-transition posts an `EPIC_AUTO_PAUSE` comment naming the implicit resume trigger (the next child action) and swaps `status:in-progress → status:dormant`. Idempotent.

**Inverse transition** (`dormant → in-progress`): triggered when a child ticket moves to `status:in-progress` OR a new PR is opened against any linked child. Mirrors the entry rule.

## Research-First Epic Phase Gate

A research-first Epic (label `type:epic` + `phase-gate:research-first`) MUST satisfy the following gate before any implementation child tickets or development ACs may be authored. Legacy detection (`AC-R*` in body) remains an advisory fallback for existing Epics.

1. All research children (`AC-R1` through `AC-Rn-1`) MUST be closed with Consultant peer-review rubric ≥ 7 across all G1-G9 goals.
2. The terminal research child (`AC-Rn`, this rule itself) MUST be closed with Consultant approval.
3. The Epic MUST receive a Manager `EPIC_RESCOPE` or equivalent comment summarizing Phase-0 outcomes before transitioning out of `status:in-progress`.
4. Phase-1 implementation child tickets MUST cite the Phase-0 research children they consume in their body (`Refs #N` per source child).
5. If any Phase-0 child is reopened, the gate re-arms and Phase-1 work is paused until the reopened child closes again.
6. A research-first Epic whose Phase-0 is **green-complete** (all Phase-0 children closed, at least one carrying a `CONSULTANT_CLOSEOUT`, and the Epic carrying an `EPIC_RESCOPE`) MUST have at least one `phase-gate:phase-1` child before it may close. A green Phase-0 with zero Phase-1 children auto-materializes a Phase-1 seed child and **blocks** Epic close until one exists (Epic #2678 — closes the #2661 silent-close gap).

### Operational semantics (normative)

- Clause 1 score rule: `across all G1-G9` means `min(G1..G9) ≥ 7`; mean/median pass is insufficient. <!-- pending-enforcement: #3321 clause-1 -->
- Clause 2 approval rule: `Consultant approval` means structured closeout fields include `verdict: approve_for_merge` and `rubric_rating: >=7`. <!-- pending-enforcement: #3321 clause-2 -->
- Clause 3 transition guard: on any Epic status leaving `status:in-progress`, absence of an `EPIC_RESCOPE` marker is a gate violation. <!-- enforced-by: scripts/global/megalint/research-first-phase-gate.js -->
- Clause 4 source citation: each Phase-1 child carries label `phase-gate:phase-1` and MUST include at least one `Refs #N` Phase-0 source child in body. <!-- enforced-by: scripts/global/megalint/manager-handoff.js -->
- Clause 5 re-arm trigger: a Phase-0 child `issues.reopened` event pauses Phase-1 by posting `EPIC_PHASE_GATE_PAUSE`; resumption requires child re-close plus Manager `EPIC_RESCOPE` refresh. <!-- pending-enforcement: #3321 clause-5 -->
- Clause 6 promotion gate: `phase0GreenComplete(epicNumber)` is the deterministic predicate; on a green Phase-0 with zero `phase-gate:phase-1` children it returns `missingPhase1Children: true`. `phase1-auto-materialize` then seeds one Phase-1 child, and `phase0-closure-guard` posts a structured `EPIC_PHASE_GATE_PAUSE` / `BLOCKER_NOTE`, emits an `incidents.jsonl` event (`pattern_id: phase0-complete-no-phase1`), reopens the Epic, and fails the run (non-zero exit). This is BLOCKING (per Epic #2678 AC3/AC6, not advisory); `PHASE0_GATE_BYPASS=1` downgrades to an advisory comment plus an audit warning (G6 escape hatch, never silent). The enforcement core is runtime-agnostic — one shared module set is the single path for Copilot / Codex / Claude Code / Antigravity. <!-- enforced-by: scripts/global/megalint/phase0-promotion-gate.js + scripts/global/phase0-closure-guard.js + scripts/global/phase1-auto-materialize.js + .github/workflows/phase0-promotion-gate.yml -->

## Epic Progress Comment Protocol

When any child ticket is closed, the Manager posts a progress update to the epic:

```
## Epic Progress Update — #<child-number> Complete

- Ticket: #N — <title>
- Closed: <date>
- Deliverables: <brief summary>
- Remaining children: #X, #Y, #Z
```

Evidence integrity: progress updates must cover every closed child exactly once; `CONSULTANT_CLOSEOUT` must reference the full linked-child set; any `PR #N` must resolve to a real PR.

## Epic Close Conditions

An epic may close **only when ALL of these are true**:

1. All child tickets are in terminal state (`done`/`cancelled`, issue `CLOSED`)
2. Epic is at `status:review` with `role:consultant`
3. CONSULTANT_CLOSEOUT comment posted on the epic
4. Epic-level resolution label applied (`resolution:released` or `resolution:cancelled`)
5. Evidence-integrity verification passes or has an explicit Manager-approved emergency override
6. Every AC containing enforcement wording (enforce / required / block / fail-the-gate) reflects the shipped artifact's actual disposition — the artifact enforces (required-blocking), OR the AC text is rescoped to `ship advisory; promotion deferred` before ticking (#1617)

### Close-time enforcement (#3350 — blocking, not advisory)

Condition 1 (all children terminal) is enforced at close time, not only by a
periodic advisory drift report:

- **Backstop (all surfaces, incl. GitHub UI / all four teams):** an
  `issues.closed` Action (`epic-close-readiness-check.js`) re-derives the open-
  child set as the **union** of {task-list edge, native Sub-issue parent,
  `Parent:` text, **and a cross-ref child whose own body asserts parentage**
  (`Refs Epic #N | Epic: #N | Parent: #N`)}. The cross-ref edge — added in
  #3350 — is the class that let #3021/#2891 close with open children; it is
  child-side and evaluated over live open issues only, so it does NOT
  reintroduce the #1306 epic-body prose false-positive class. On a violation the
  Epic is auto-reopened (once per close event, after an eventual-consistency
  re-check — no close↔reopen flapping), a structured blocker-note is posted, and
  a schema-v3 `incidents.jsonl` event is emitted
  (`pattern_id: epic-closed-with-open-children`).
- **Closeout reconciliation:** `epic-close-validator.js` compares the
  `CONSULTANT_CLOSEOUT` children-terminal assertion against live child state; a
  closeout present while any child is open fails (the #3021 false-claim class).
- **Local pre-close guard (prevention-first):** `hooks/scripts/epic_close_guard.py`
  blocks the operator close path on an Epic with open children before it reaches
  GitHub. Audited escape hatch for the children-already-re-homed case:
  `EPIC_CLOSE_OVERRIDE=1` or the literal `[epic-close-ok]` marker.

### AC wording vs shipped disposition (#1617 — advisory)

Path D (advisory-first, then replay-eval-gated promotion to required-blocking) is a
valid rollout, but it creates a closure-language trap: an Epic AC worded `enforce X`
ticked as shipped when only the advisory (non-blocking) phase landed. Before close,
for every AC containing enforce / required / block / fail-the-gate wording, the Manager
MUST verify the shipped artifact actually enforces, OR rescope the AC text to
`ship advisory; promotion deferred`. The advisory validator
`scripts/global/megalint/epic-ac-disposition-check.js` (workflow
`epic-ac-disposition-lint.yml`, on `issues.closed`) detects the mismatch and posts an
advisory comment; it never blocks (promotion is replay-eval-gated, not calendar-gated).
This is the wording-vs-disposition axis — distinct from `body-ac-truthfulness`
(checkbox state) and `epic-ac-traceability` (child refs).
<!-- enforced-by: scripts/global/megalint/epic-ac-disposition-check.js + .github/workflows/epic-ac-disposition-lint.yml -->

## Re-scope-before-close rule

- If original epic ACs cannot be completed, Manager must publish an explicit re-scope artifact (deferred scope + follow-on child tickets) before review/close.
- Post-hoc scope normalization at Consultant closeout is forbidden.

## Epic-child linkage (Sub-issues primitive)

New Epics SHOULD use GitHub's native **Sub-issues** primitive to link children
to the parent Epic. The legacy `Refs Epic #N` prose convention remains valid
for backward compatibility but is deprecated for new Epics. Sub-issues
provides:

- Native parent/child API (REST + GraphQL) and progress rollup.
- Eliminates prose-collision trap class at the relationship layer (see #1614
  for the legacy-regex hardening path and #1631 for the migration plan).
- Up to 100 children per parent, 8 levels of nesting.

Migration guide: `docs/howto/sub-issues-migration.md`. Validator behavior
follows #1631 AC5 follow-on (closeout-schema prefers Sub-issue link over
prose-scan; prose-scan fallback retained).

## Branch Naming

Branches are created for child tickets only: `<type>/<child-issue-number>-<slug>`

## Forbidden

- Epic carrying any role other than `role:manager`
- Epic closing while any child is still open
- Child ticket branch named after the epic number
