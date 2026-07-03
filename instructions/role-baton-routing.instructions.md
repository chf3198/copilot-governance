---
name: Role Baton Routing
description: "v2.0 — Single-thread role handoff with GitHub Projects integration, typed collaborators, zero null-role states."
applyTo: "**"
---

# Role Baton Routing (v2.0)

The GitHub issue **is** the baton. One active role at a time.
Execution `role:*` labels are present only on active, role-owned states.
Terminal states do not carry execution roles.

Authoritative board: **Megingjord Harness Board** (GitHub Projects).
Baton view filter: `status:triage,ready,in-progress,testing,review` (backlog/done/cancelled/dormant/deferred hidden from active baton view).

## Role Taxonomy (7-role canonical set, Epic #2299)

The harness recognizes seven named roles. Operator is a meta-term (see
`instructions/operator-identity-context.instructions.md`), not an eighth role.

| Role | Scope | GitHub baton label |
|---|---|---|
| Manager | Scope, AC authoring, baton routing, Epic oversight | `role:manager` |
| Collaborator | Implementation, deliverable production, test authoring | `role:collaborator` |
| Admin | Git/release ops, merge, runtime sync, publish | `role:admin` |
| Consultant | Independent critique, rubric scoring, closeout authority | `role:consultant` |
| IT | Fleet hardware + service setup/config (no GitHub workflow) | `role:it` |
| Red-Team | Adversarial cross-family review; structured hallucination audit | `role:red-team` |
| Client | Design direction + UAT confirmation; overrides Consultant carve-outs | `role:client` |

**Guest-Collaborator (RESERVED)**: placeholder for non-adversarial external
contributions (fleet-coding-local dispatch, cross-team feature contributions,
external human wiki-ingest) that are NOT adversarial/critique-class. Not
currently active; use Red-Team for all adversarial/review dispatches (D1,
Epic #2299). Reserved to prevent taxonomy namespace collision.

IT role note: IT scope covers fleet hardware (hosts, Tailscale mesh, Ollama
models, MCP provisioning) and services (HAMR activation, cron, hook install).
IT does NOT create tickets, push branches, commit, or comment on issues. The
`[it-ops]` / `MEGINGJORD_IT_OPS=1` / `chore(it-ops):` bypass markers are the
documented IT-role escape hatch for the rare tracked-file edit that does not
warrant a full baton cycle.

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

## Gate entry conditions — Admin and Consultant (Refs #1944)

The two most-failure-prone transitions in the baton are `in-progress → testing` (Collaborator → Admin) and `testing → review` (Admin → Consultant). Both gates carry four facets that ALL must hold before the next role may pick up.

### Admin gate (entry to `status:testing`)

| Facet | Requirement |
|---|---|
| Trigger artifact | `COLLABORATOR_HANDOFF` comment posted on the linked issue. The comment must carry the four signing fields (`Signed-by`, `Team&Model`, `Role: collaborator`, plus `test_strategy:`) and the per-AC verification block. Validator: `scripts/global/megalint/collaborator-handoff.js`. |
| Role-label transition | Remove `role:collaborator`; add `role:admin`. Single-role invariant holds at every instant per Rule 1. |
| Status-label transition | Remove `status:in-progress`; add `status:testing`. Single-status invariant per the §"Single-status invariant" rule above. |
| Preconditions | (a) ALL declared ACs verified PASS in the COLLABORATOR_HANDOFF per-AC block. (b) `test_strategy` evidence present per `instructions/test-methodology-matrix.instructions.md` — validator `scripts/global/megalint/test-discoverability.js`. (c) Lint clean for the lane (lane:code-change requires `npm run lint` green; lane:docs-research requires `wiki-lint` if wiki touched). |

### Tech-Writer sub-phase (mandatory before posting the-collaborator-handoff per Epic #2148 / #2154)

Before the role-collaborator-label holder posts the-collaborator-handoff, the comment MUST include a doc-coverage block per applicable surface in [config/doc-coverage-matrix.yml](../config/doc-coverage-matrix.yml). For each required + suggested surface the area-label maps to, declare one of:

```
doc-coverage:
  UPDATED: <path-or-link> — <one-line summary of update>
  N/A: <surface> — <reason: out-of-scope | covered-by-sibling-pr | docs-only-no-functional-change>
```

ADVISORY in first ship (Epic #2148 C1 #2154); the-collaborator-handoff validator (`scripts/global/megalint/collaborator-handoff.js`) parses the block when present and emits an advisory; missing block on lane:code-change emits a warning. Promotion to BLOCKING happens after Epic #2148 close, tracked as a follow-on.

### Consultant gate (entry to `status:review`)

| Facet | Requirement |
|---|---|
| Trigger artifact | `ADMIN_HANDOFF` comment posted on the linked issue. Must carry signing fields with `Role: admin`, plus `branch:`, `commit:`, `signer-independence-check: PASS`, and `deploy-runtime-impact:` (or `sync-verification: N/A` per `feature-completion-governance.instructions.md`). Validator: `scripts/global/megalint/admin-handoff.js`. |
| Role-label transition | Remove `role:admin`; add `role:consultant`. |
| Status-label transition | Remove `status:testing`; add `status:review`. |
| Preconditions | (a) Signer-independence: Admin signer alias MUST differ from Collaborator signer alias — validator `scripts/global/megalint/signer-fidelity.js`. (b) ALL required CI checks PASS on the linked PR — observed via `gh pr checks <PR#>` or `live_checks.ci_all_pass()`; pre-merge gate `merge-evidence-pr-gate.js` enforces. (c) PR merged OR merge-evidence-override-approved label present on the linked issue per the merge-evidence batch contract. (d) For lane:code-change touching deployed runtime artifacts: `npm run sync:codex` + `npm run sync:claude` + `npm run hamr:sync-verify` outputs cited per `feature-completion-governance.instructions.md`. |

### Validation evidence — recent practice (memory-codified)

The gates above match observed practice in: PR #2045 (Epic #2038 ship; three iterations of cross-family rater + four baton artifacts before PR), PR #2047 (#1943 Three-Wiki synthesis; cross-team file bundling with explicit attribution). Memory anchors: `feedback-all-baton-artifacts-before-pr` (post all four before `gh pr create`; seven consecutive clean ships once applied), `feedback-admin-ci-gate` (Admin verifies ALL required checks green before merge), `feedback-baton-artifacts-in-pr` (PR body must include handoff strings).

## Collaborator role

Per v1.1 taxonomy, the active label is `role:collaborator` (not the older `role:collab-{type}` form). Capability profile is reflected in ticket area labels (`area:scripts`, `area:hooks`, `area:dashboard`, etc.) rather than role-suffix typing. Each Collaborator may have only **1 `in-progress` ticket at a time** (enforced by baton-gates Action).

## Multi-Lane Definition of Done

| Lane         | Work type                      | Role sequence                     | N/A markers                    |
|--------------|--------------------------------|-----------------------------------|--------------------------------|
| code-change  | Code, infra, deploy (default)  | Manager→Collab→Admin→Consultant   | none                           |
| research     | Analysis, wiki — no git branch | Manager→Collab(analyst)→Admin→Consultant | Admin = doc reviewer, not CI |
| config-only  | Single-value config, no design | Manager→Admin→Consultant          | COLLABORATOR_HANDOFF: N/A      |
| no-code-remediation | Issue-only drift normalization (no repo edits) | Manager→Consultant | COLLABORATOR_HANDOFF: N/A, ADMIN_HANDOFF: N/A |

Lane set at ticket creation via `lane:*` label and `Lane` Project field. Default: **code-change**.

### No-code remediation lane contract (Refs #2258 #2268)

Eligibility:
- Ticket drift is limited to issue metadata/evidence normalization (labels, stale advisories, baton artifacts, or closeout evidence) with no source changes.
- Corrective action is issue/thread state only; no PR diff is needed.
- Runtime-deploy sync verification is `N/A` because deployed runtime artifacts are untouched.

Exclusions (must escalate to normal baton lane):
- Any tracked file edit, generated artifact edit, workflow/config change, or test change.
- Any required CI or validator remediation that needs code/doc changes.
- Any ambiguity about whether the incident is issue-only versus implementation drift.

Required evidence blocks:
- `MANAGER_HANDOFF` must state `lane: lane:no-code-remediation`, explicit eligibility rationale, and the exact issue-only actions.
- `CONSULTANT_CLOSEOUT` must verify each issue-only action completed and include flaw-accounting (`mid_flight_flaws`) plus `verdict` and `rubric_rating`.

False positives and escalation path:
- If a no-code run reveals required repository edits, Manager posts a correction comment and routes to `lane:code-change` with the standard four-role baton.
- If stale advisory labels conflict with merged evidence, clear the stale label as issue-only remediation; if merge evidence is absent, escalate to normal baton.

Examples:
- Valid: remove stale `governance:close-without-merge` on an already-merged closed ticket.
- Invalid: changing `instructions/**` to satisfy a validator; this is `lane:code-change` (docs/code diff exists).

Operator runbook: `docs/howto/no-code-remediation-workflow.md`.

## Closed-ticket ownership model

Closed tickets do not carry execution `role:*` labels.
Accountability ownership is historical metadata, not an execution-role label.
Dashboard/audit views may resolve historical ownership to manager for reporting,
but this must not re-add a `role:*` label to terminal issues.

### Explicit accountable-team schema (Epic #2345 / design #2346)

Persistent accountability is recorded as an `accountable-team:<team>` label
(`claude-code | copilot | codex | antigravity`) that is **distinct** from, and
never shares a namespace with, the transient `role:*` baton label. Unlike
`role:*`, it persists across **all** states including terminal — so a closed
ticket answers "who owns this?" without an execution-role label. The team-of-
record resolves in order: (1) the `accountable-team:*` label, else (2) the team
in the most recent baton/closeout signing block, else (3) the default manager
team. Authority: only the Manager or Admin role may set or change it, and never
as a side effect of a baton transition. Helper: `scripts/global/accountable-team.js`;
backfill: `scripts/global/accountable-team-backfill.js` (dry-run default).
See `docs/howto/accountable-team-schema.md`.

## Hard Rules

- Execution `role:*` labels are required for active role-owned states only (`triage`, `in-progress`, `testing`, `review`, and Epic-only `dormant`/`deferred`).
- Terminal and waiting states (`backlog`, `queued`, `ready`, `done`, `cancelled`) carry no execution `role:*` label, except Epic role exceptions documented in this file.
- No concurrent role execution on a single ticket.
- Emit the named handoff artifact before transitioning to the next role.
- `ADMIN_HANDOFF` must be **independent** of `COLLABORATOR_HANDOFF` (#3532, Client design decision): independence PASSES iff EITHER (a) the two sign under different `Team&Model` **TEAM segments** (genuine cross-team signing), OR (b) the `ADMIN_HANDOFF` cites a **VERIFIED cross-family consensus receipt** (`cross_family_receipt:`). A same-team persona-split (differing surnames, one agent) with **no** valid receipt **FAILS** — persona-surname difference alone is no longer independence. Enforced by `baton-independence.checkAdminIndependence`, `baton-authority/evidence-loader.checkSignerIndependence`, and the `consensus-receipt-check` CI validator (receipt = sha256 over provider responses in the append-only hash-chained ledger `governance/cross-family-consensus.jsonl`; panel ≥2 families distinct from the authoring family, each able to REJECT). See `docs/howto/cross-family-consensus-independence.md`.
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

### `flaws_recognized:` block — per review-point (Epic #3425 P1-a, #3428)

The discretion-dependent prose contract above is being made programmatic. Every baton artifact
(MANAGER / COLLABORATOR / ADMIN / CONSULTANT) now carries a `flaws_recognized:` block — either a
bare `none` or one entry per disposed candidate:

```
flaws_recognized:
  - flaw: <short description>
    detected_by: <F1..F8 | manual>
    decision: file-ticket | log-incident-only | memory-note-only | no-action-justified
    artifact: #<N> | incidents.jsonl:<pattern_id> | <memory-path> | <rationale>
```

`decision` reuses the `judgment-gate.js` `FLAW_DECISIONS` enum; `artifact` is decision-typed. The
Consultant's `mid_flight_flaws` + `anneal_tickets_filed` remain the required closeout-aggregation
fields; `flaws_recognized` is the per-review-point superset the other three roles gain. Validator:
`scripts/global/megalint/flaws-recognized.js` — **ADVISORY** (warns, never blocks) until the
replay-eval promotion gate (#3434) flips it. The field is `block` (not required) in
`baton-artifact-schema.js` so the historical replay corpus and cross-runtime invariant are preserved.

## Enforcement Points

| Rule | Enforcement |
|------|-------------|
| Collaborator/Admin signer independence (#3532) | `baton-gates.yml` admin-gate + `baton-authority/merge` (`SIGNER_INDEPENDENT` bit) require a different `Team&Model` TEAM segment OR a verified `cross_family_receipt`; `consensus-receipt-check.yml` step re-verifies the receipt from the committed ledger. Persona-surname difference alone no longer passes. |
| Test strategy declared per matrix | `test-evidence.yml` gate consumes `test_strategy` from `MANAGER_HANDOFF` |
| `roles.admin` auto-emission on full baton (#2444) | `hooks/scripts/tool_activity.py` `mark_tool_activity` flips `roles["admin"] = True` when every key returned by `admin_patterns.required_admin_ops(flags, repo_type)` is set in `admin_ops`. Stop-hook `check_admin_ops` consumes the same helper. No manual state patching required. |

## MANAGER_HANDOFF schema (with test_strategy)

Required fields on every `MANAGER_HANDOFF` comment:
- `scope:` — what changes
- `lane:` — `lane:code-change | lane:docs-research | lane:config-only | lane:no-code-remediation | lane:trivial`
- `test_strategy:` — one of `tdd-pyramid | tdd-trophy | contract-test | golden-file | eval-harness | visual-regression | drift-lint | peer-review | manual-verify | none`
- `acceptance:` — AC checklist
- `gates:` — CI/governance gates that must pass
- `anneal_tier:` (optional) — `tier-1 | tier-2 | tier-3 | null`; populate when ticket originated from a Tier-2 anneal auto-file event per Epic #1308. Default `null` / omitted for non-anneal tickets.

Conditional required fields:
- Tickets labeled `phase-gate:phase-1` MUST include `phase_gate_satisfied: yes`.
- Tickets labeled `phase-gate:phase-1` MUST include `phase_0_sources: [#N, #N, ...]` with one or more source research-child references.

`test_strategy` selected per `instructions/test-methodology-matrix.instructions.md`; missing on legacy tickets defaults to `none` (advisory). New tickets with `none` on non-permitted lane fail `test-evidence`.

**Cross-family preflight requirement** (lane:code-change, Refs #2439): Before posting `COLLABORATOR_HANDOFF`, run `npm run collaborator:preflight --ticket=N`. The handoff MUST include `cross_family_rating:`, `cross_family_reviewer:`, and `cross_family_findings:` from the preflight output. The reviewer model family MUST differ from the Collaborator's `Team&Model` family.

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

## Cross-Team Artifact-Write Gate

When a MANAGER_HANDOFF involves writing files consumed by another team's runtime,
the `cross_runtime_writes` field is required and must include `target_team_sign_off`
before the baton advances. See `instructions/cross-team-artifact-write.instructions.md`.

## Offline contract for derive_roles_from_github (#2460, Epic #2451 Move 5)

When the GitHub-derived role resolver (#2456, feature-flagged via `MEGINGJORD_DERIVE_ROLES_FROM_GH`) cannot reach GitHub:

| Condition | Behavior | Operator-visible signal |
|---|---|---|
| First call (cold-miss): gh CLI unreachable or returns non-zero | Returns `None`; callers fall back to local-state | stderr: `[role-resolver] degraded: cold-miss for #N; falling back to local-state` |
| Subsequent call (warm cache + gh fail) within 300s MAX_STALE | Returns last-cached value | stderr: `[role-resolver] degraded: gh-fetch-failed-using-stale for #N; falling back to stale cache` |
| Subsequent call beyond MAX_STALE_SECONDS | Returns `None`; callers fall back to local-state | stderr: cold-miss line |
| `gh` CLI absent (FileNotFoundError) | Same as above per cache state | same stderr lines |
| Subprocess timeout (10s default) | Same as above per cache state | same stderr lines |

**Quiet mode** for CI/cron contexts: set `MEGINGJORD_QUIET_RESOLVER=1` to suppress stderr output.

**Goal-lens justification**:
- **G6 resilience**: G6 is preserved via stale-cache fallback bounded by MAX_STALE_SECONDS=300; legacy `roles{}` continues to function when feature flag off
- **G8 observability**: each degraded path emits a labeled stderr line so operators can diagnose; not silent
- **G3 zero-cost in CI**: quiet-mode env flag suppresses noise without disabling the fallback path

## Skill Mapping

Manager: `role-manager-execution` | Collaborator: `role-collaborator-execution`
Admin: `role-admin-execution` | Consultant: `role-consultant-critique`
Orchestration: `role-baton-orchestrator`

## Operator decision routing (#2509)

When the operator (the AI agent running the baton) faces a routine yes/no dev decision (file follow-on ticket Y/N? two-ticket-or-one? accept fleet-rater verdict?), the DEFAULT routing is:

1. Route to fleet decision oracle: `node scripts/global/fleet-decision-oracle.js` via `decideOnce(question, opts)`
2. Fleet returns `{verdict: approve|reject|partial|inconclusive, rationale, model_used, escalate_to_client: bool}`
3. If `escalate_to_client` is true (verdict inconclusive OR fleet unreachable) → THEN ask client
4. Otherwise → operator executes per verdict; no client touch needed

**Why:** per the harness's operator-identity contract (`instructions/operator-identity-context.instructions.md`), the client is design + UAT only. Asking the client to adjudicate routine dev decisions is governance-misalignment. The fleet rater (free, qwen-7b at ~30s) is the correct decision substrate.

**When NOT to use fleet:**
- Design direction (new architecture, scope expansion)
- UAT confirmation (does the shipped behavior match user expectation)
- Budget decisions (paid-provider lane authorization)
- Memory has prior client preference on the specific class

**Memory anchor:** `feedback_route_decisions_to_fleet_not_client` (operator-personal).
