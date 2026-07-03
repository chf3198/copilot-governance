---
name: Breaking-Change Recovery Protocol
description: Six-phase workflow for detecting, reverting, triaging, fixing, re-merging, and re-authoring work after a breaking change lands on main.
applyTo: "**"
---

# Breaking-Change Recovery Protocol

A breaking change is any merged commit that causes a runtime, schema, or governance
failure blocking one or more teams from making forward progress. Recovery is a
governed workflow, not an ad-hoc hotfix.

## Phase 1 — Detect

**Signal sources** (any of these triggers recovery):
- CI gate failure on a previously green check after a merge
- Agent runtime crash or schema rejection on startup
- Governance hook fires unexpectedly on a clean branch
- Downstream team reports their branch no longer builds/runs

**Severity classification**:
- `P0`: blocks ALL teams; runtime crash; security regression
- `P1`: blocks ≥1 team; wrong output; data-loss risk
- `P2`: degrades behaviour; workaround exists; single team affected

**Authority**: any role may declare a breaking change. Post an `INCIDENT_OPEN`
comment on the causal issue with: `severity`, `blocked_teams`, `first_observed`.

## Phase 2 — Revert

**Authority**: Manager or Admin only.

**Criteria**: revert is required when the fix cannot land in < 30 minutes on
the same branch without risk of cascading further breakage.

**Procedure**:
1. `git revert <sha> --no-edit` on main (or PR revert via GitHub UI).
2. Merge the revert commit immediately; bypass branch protection only if needed.
3. Record `reverted_sha`, `revert_sha`, `revert_pr` in the `INCIDENT_OPEN` comment.
4. Preserve in-flight work: any open branch that depends on the reverted
   commit is flagged a **casualty** — list in `INCIDENT_OPEN`.

**Scope bound**: revert only the breaking commit; never revert unrelated work in
the same range.

## Phase 3 — Triage Ticket

File a new child ticket under the parent Epic **immediately** after reverting.

**Required schema**:
```
Title:  fix: [description of schema/runtime/governance failure from #<causal-issue>]
Labels: type:bug, priority:P0/P1, status:triage, role:manager
Refs:   causal issue #N in body
Body:   Problem, Root cause, Acceptance criteria, Fix plan
```

**MANAGER_HANDOFF** on the triage ticket must include:
- `reverted_sha`, `revert_sha`
- `blocked_teams` list
- `smoke_requirements` (what must pass before re-merge)
- `casualties` list (branches/tickets blocked by the revert)

## Phase 4 — Fix

**Branch convention**: `fix/<triage-ticket#>-<slug>` (never use the original
causal issue number; use the triage ticket number).

**Validation requirements** before push:
- All pre-commit hooks pass on the fix branch.
- Targeted unit/integration test for the regression scenario.
- At least one peer review comment (human alias; not same signer as author).

**Baton flow**: standard Manager → Collaborator → Admin → Consultant
(abbreviate only if `P0`; Admin may merge without Consultant when every smoke gate is green and severity ≥P0, but Consultant must close within 4 hours).

## Phase 5 — Re-merge with Smoke Evidence

**Smoke evidence requirements** (must appear in the PR body or Admin comment):

| Smoke Check | Required for |
|---|---|
| Agent/runtime starts without error | every fix |
| Targeted test for the regression scenario passes | every fix |
| Governance hook fires correctly on a test branch | schema/hook fixes |
| Affected team confirms branch is unblocked | P0 fixes |

Post smoke evidence as a structured `SMOKE_EVIDENCE` comment before merging.
Merge is blocked until at least the first two checks are verified.

## Phase 6 — Casualty Re-author

For each ticket or branch listed as a casualty in Phase 3:

1. **Refile**: close the original ticket with label `resolution:superseded`
   and a comment linking the new ticket.
2. **New ticket**: duplicate the original AC, add `Refs <original #N>` and
   `Reverted by <revert sha>` in the body.
3. **Rebase**: create a fresh branch from main (post-fix); cherry-pick or
   re-implement the original change on the clean base.
4. **Do NOT** re-open the original ticket; it is terminal.

## Worked Example — #1917 Chain

**Causal change (#1917)**: PR added a `hooks` block to `.claude/settings.json`
using the flat event format:

```json
"SessionStart": [{ "type": "command", "command": "..." }]
```

The Claude Code extension requires each array entry to be wrapped as
`{ "matcher": "...", "hooks": [...] }`. The flat format caused a schema
rejection and runtime crash for the Claude Code team.

**Recovery chain**:

| Step | Artifact | Action |
|---|---|---|
| Detect | PR #1917 merge | Claude Code startup crash on `settings.json` schema error |
| Triage | #1951 filed | `fix: repair .claude/settings.json hook schema regression from #1917` |
| Fix | #1952 + commit `c857ce8` | Corrected matcher-wrapped format; path fix in same PR |
| Re-merge | PR #1951 merged | Smoke: Claude Code started cleanly; hook fired on SessionStart |
| Casualty | #1953 closed `resolution:superseded` | In-flight work that depended on the broken settings block |
| Re-author | #1954 filed | Duplicate of #1953 AC on clean main base |

**Lesson captured**: schema tests for `.claude/settings.json` must be added to
pre-merge CI so the flat-format defect would have been caught before merge.

## Cross-References

- `instructions/workflow-resilience.instructions.md` — Tier-3 Consultant goal-failure
  escalation hands off to this protocol when a G1–G9 violation requires a breaking-change
  recovery cycle.
- `skills/breaking-change-recovery/SKILL.md` — runtime invocation guide.
