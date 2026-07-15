# Ticket #3809 — Consultant CLOSEOUT 🔍

**Status:** DONE · **Confidence:** HIGH · **Merge:** squash `53287fb` (PR #30)

## Acceptance criteria — all met

- [x] AC1 — free-first clause present in `additionalContext`, explicitly subordinate to G1/G2.
- [x] AC2 — `GOALS` ordering string unchanged; G3 Zero Cost stays rank 3 below G1/G2.
- [x] AC3 — `goal_lens.py` + `goal_tier_resolver.py` tracked on origin/main; imports resolve
      with no runtime `goal-tier-state.json` (isolated-HOME test, clean stderr).
- [x] AC4 — hook returns valid JSON; schema (`additionalContext` + `goalLensTier`) unchanged.
- [x] AC5 — all 10 required CI checks green on PR #30.
- [x] AC6 — cross-family $0 consensus PASS (receipt `bf25c035c451e7f2`, meta + mistral).

## Independent assessment

The change does exactly what the operator directed (route #2: strengthen the always-on
injection), and no more. It does **not** add a hard enforcement gate, does **not** reorder the
goal lens, and keeps cost strictly below governance/quality — so it cannot pressure trading
correctness for a free-but-flaky model. Net governance posture improved twice over: (a) the
free-fleet preference is now explicit on every prompt; (b) a previously-untracked always-on
hook is now in the tracked, reviewable source of truth.

## Risks / limitations

- LOW: injection is advisory, not enforced — a session can still ignore it. Matches operator's
  explicit choice of #2 over a hard gate; acceptable.
- The clause fires for every harness that reads `~/.copilot/hooks/scripts/goal_lens.py`
  (Claude Code). Other harnesses (Cursor/Codex/devenv-ops variants/megingjord) read their own
  untracked copies and are unchanged by this PR.

## Follow-ups (filed as findings, not this ticket)

1. **Untracked-hook gap:** ~8 sibling live hooks (`manager_ticket_gate.py`, `userprompt_gate.py`,
   `hamr_activation_check.py`, `canonical_main_wip_check.py`, `runtime_session_register.py`,
   `prune_file_history.py`, `commit_ticket_gate.py`, `stuck_state_gate.py`) remain untracked in
   origin/main → recommend a follow-up ticket to converge them.
2. **Cross-harness propagation:** if the free-first clause should reach Cursor/Codex/etc., wire
   `install.sh` to regenerate all harness copies from the now-tracked source, or sync per-harness.

**Baton complete.** Mirror status → done.
