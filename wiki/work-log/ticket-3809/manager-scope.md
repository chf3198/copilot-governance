# Ticket #3809 — Manager Scope 🎯

**Title:** Land goal-lens free-fleet-first clause into tracked hooks/scripts (durability + operator directive)
**Type:** task · **Area:** hooks · **Priority:** P2 · **Points:** 2
**Parent:** operator directive 2026-07-15 (free-fleet-first as always-on session goal); relates to Epic #3391 (operator-autonomy injection)

## Objective

Make "prefer free fleet resources wherever one applies" an explicit, always-on part of
the per-prompt goal lens — **strictly subordinate to G1 Governance and G2 Quality** — and
make that behavior **durable and reviewable** by committing the hook to the tracked tree.

Operator chose the lightweight injection route (strengthen the `UserPromptSubmit` goal-lens
hook) over a hard enforcement gate. Manager research found the real gap: `goal_lens.py` — the
hook that already injects the goal lens on every prompt — and its import `goal_tier_resolver.py`
are **untracked in `origin/main`** (they run only as live-harness state). So the durable route
necessarily lands these two files into tracked `hooks/scripts/`, carrying the new clause.

## Scope (in)

1. Add a `FREE_FIRST` clause to `hooks/scripts/goal_lens.py`, appended after the existing
   `AUTONOMY` line, explicitly marked subordinate to G1/G2.
2. Commit `hooks/scripts/goal_lens.py` + `hooks/scripts/goal_tier_resolver.py` (its sole
   internal import) into the tracked tree, alongside the 4 already-tracked sibling hooks.

## Scope (out — logged as follow-up, not this ticket)

- The other ~8 untracked live hooks (`manager_ticket_gate.py`, `userprompt_gate.py`,
  `hamr_activation_check.py`, `canonical_main_wip_check.py`, `runtime_session_register.py`,
  `prune_file_history.py`, `commit_ticket_gate.py`, `stuck_state_gate.py`) have the same
  tracking gap → separate follow-up ticket. Do NOT expand this ticket to cover them.
- No hard enforcement (PreToolUse/Stop) gate. Injection only — advisory nudge.
- No change to goal ranking; G3 stays #3, below G1/G2.

## Acceptance criteria

- [ ] AC1: `goal_lens.py` emits the free-first clause in `additionalContext`, and the clause
      text explicitly states subordination to G1 Governance and G2 Quality.
- [ ] AC2: Clause does NOT alter the `GOALS` ordering string (G3 stays rank 3).
- [ ] AC3: `goal_lens.py` + `goal_tier_resolver.py` are tracked in the merge to `origin/main`;
      hook imports resolve with no runtime `goal-tier-state.json` present (graceful default).
- [ ] AC4: `python3 goal_lens.py` on a sample payload returns valid JSON (schema unchanged:
      `hookSpecificOutput.additionalContext` + `goalLensTier`).
- [ ] AC5: All required CI workflows green on the PR (validate-pr, governance-verify,
      validator-discipline, enforcement-wiring-audit, global-governance-presence).
- [ ] AC6: Cross-family $0 review consensus receipt recorded (advisory, per G3/no-cost).

## Constraints / gates

- G1 > G2 > G3: the clause must never imply trading correctness/governance for cost.
- Branch off `origin/main` only (not the parked feat/3026 drift checkout). Branch:
  `feat/3809-goal-lens-free-first`. Commits reference `#3809`. PR body `Closes #3809`.
- Read-only-mirror rule: no direct commit to local main; land via PR (sanctioned flow).
- DoD per manager-ticket-lifecycle: ACs checked, CI green, PR merged Closes #3809,
  Consultant CLOSEOUT posted, mirror status → done.

**Baton → Collaborator**
