# Programmatic Governance Contract (#1894)

Codifies when an instructional MUST is sufficient vs when a programmatic
validator is required. Driven by 2026-05 session evidence that less-capable
models (Copilot auto-mode routed to gpt-5.3-codex variants) cannot reliably
honor instructional governance alone.

## Two-tier governance model

### Tier 1 — Instructional (free-form, prose contracts)

Sufficient when:
- The expected behavior is unambiguous from natural language
- Failures are self-evident (e.g. visible in commit subject, immediately obvious in next role's review)
- The cost of violation is low-impact and quickly self-correcting
- The audience is humans or high-capability LLMs with full reasoning context

Examples: commit subject style preferences, prose voice/tone, optional
fields in artifacts.

### Tier 2 — Programmatic (validator + CI gate)

Required when ANY of:
- Less-capable models (Copilot auto-mode, free-tier routings) must comply
- Failures are silent or only detectable downstream (e.g. retroactive-planting traps, prose-collision regex misses)
- Recurrence in a 7-day window ≥3 from independent operators
- The violation creates auto-reopen / rollback work for other teams
- Cross-team session contamination is possible (lease/worktree path mismatch)
- Field is consumed by other validators (signer aliases, ticket references)

Examples: signer-alias canonicalization, baton-temporal-ordering, Closes-keyword
presence in PR body, predate-window enforcement, label cardinality.

## Promotion criteria (instructional → programmatic)

When an instructional contract recurs ≥3 times in a 7-day window from
independent operators, file a Tier-2 anneal ticket under the
programmatic-governance Epic (#1894 successor or per-validator standalone).

Per Epic #1612 replay-eval-gated promotion model:
1. **Day-0**: ship validator in advisory mode; emits structured advisory
   comment on violation without blocking merge.
2. **Replay-eval window**: ≥30 PRs processed; FP-rate measured against
   historical corpus.
3. **Promotion gate**: FP-rate ≤10% AND coverage-rate ≥85% advances
   advisory → required (CI-blocking).
4. **Rollback path**: required → advisory via `<validator-name>:waived`
   label + rationale comment on the issue.

## What this Epic shipped (Phase 1)

- `scripts/global/pre-pr-gate.js` — covers #1896 (baton-completeness),
  #1897 (Refs + Closes keywords), #1902 (COLLAB temporal-ordering predate
  window). Lefthook pre-push hook entry.
- `scripts/global/instructional-coverage-audit.js` — AC4 meta-audit;
  scans `instructions/*.md` for MUST/SHALL/REQUIRED statements; emits
  inventory of statements lacking corresponding programmatic validator.

## Auto-mode governance parity (#2957)

Auto model selection (Copilot Auto-mode routed to lower-capability models) MUST NOT
reduce governance discipline relative to frontier routing. The enforcement principle is
**route-invariance**: governance gates read no model/route/auto-mode signal, so the
decision is identical regardless of which model is driving the baton. A gate that relaxes
on a routing hint is the exact bug class this rule forbids.

- `scripts/global/baton-progression-parity.js` (wired into `pre-pr-gate.js`) enforces
  baton-progression **continuity**: the artifacts present on the linked issue must form a
  contiguous, time-ordered prefix of MANAGER → COLLABORATOR → ADMIN → CONSULTANT. A
  skipped role or out-of-order post is denied (fail-fast) before a privileged push/merge.
  This is the programmatic backstop for the instructional "post all four artifacts, in
  order, before the PR" contract — which a less-capable model cannot be trusted to honor
  on prose alone.

### Auto-mode implementation-time checklist (Copilot runtime)

When executing under Auto-mode, before any privileged admin action (push, `gh pr merge`):

1. Confirm the linked issue carries the prior baton artifacts **in role order** — do not
   post a later-stage artifact before its predecessors exist and predate it.
2. Do not present a preflight/gate fallback in a way that looks like a bypass — when a
   gate blocks, treat the block as redirect guidance, fix the cause, and re-run. Never
   route around it.
3. **Tier-2 emission rule**: when a progression gap or bypass-looking attempt is observed
   during implementation, an `auto-mode-baton-progression-gap` incident is emitted to
   `~/.megingjord/incidents.jsonl` for the recurrence detector. Emission is observability,
   never a substitute for fixing the gap.

## Phase 2 (deferred to standalone tickets)

The 8 detached siblings from Epic #1894 remain as P2 backlog work:
- #1889 completion-claim-vs-merge-truth (post-comment validator)
- #1890 signer-alias-canonical extended to all comments
- #1891 lease-worktree-path-consistency
- #1892 commit-message-ticket-consistency
- #1893 validator-discipline (meta-validator for new validators)
- #1898 pre-commit docs:compile gate
- #1903 goal-failure-emission CI-accessibility
- #1911 post-merge-sweep (force-close drifters)

Each shipped as separate validator per the promotion model above.

## Anti-pattern: instructional-with-no-enforcement

Documented in `feedback_epic_ac_wording_vs_shipped_behavior.md`:
adding words to an instruction file is not the same as enforcing them.
If a MUST in an instruction has no corresponding validator, it's
**advisory in practice regardless of the MUST wording**. The instructional
coverage audit (AC4) surfaces this gap inventory.

## Composition

- Epic #1612 (replay-eval promotion model)
- Epic #1771 (velocity-relative metrics, no calendar thresholds)
- Epic #1826 (harness:self-test registry)
- Epic #1875 (stress-test as required strategy)
- Epic #1876 (role-baton-linter)
- Epic #1308 (Tier-3 escalation contract)
- Memory: `feedback_calendar_thresholds_in_agentic_systems`,
  `feedback_all_baton_artifacts_before_pr`, `feedback_signer_alias_derivation`,
  `feedback_prose_collision_non_baton_comments`
