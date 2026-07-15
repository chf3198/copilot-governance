# #3820 — Manager Scope: session-attributable classify_internal_conflict (Stop-hook)

**Type:** bug/hardening · **Area:** hooks/stop-hook · **Priority:** P2
**Refs (bare to satisfy one-ticket-per-branch gate):** parent ticket-3810 (this is its residual);
ticket-3801/ticket-3818 closeout support; ticket-3054 override parity; ticket-3789 advisory-first precedent.

## Problem
The Stop hook's classify_internal_conflict "worktree-drift" catch-all (client_arbitration_guard.py)
blocks on ANY dirty tree — evaluated on the full uncommitted set in stop_reminder.py, ignoring the
SessionStart baseline that ticket-3810 already built for check_uncommitted. On the parked feat/3026
canonical checkout (standing ticket-3801 baseline drift), this false-positive-blocks session end with
"unresolved internal conflict requires deterministic operator resolution." Observed live 2026-07-15.

## Fix (minimal; reuse ticket-3810 substrate; no weakening)
Route the classifier input through the session-attributable filter before classification:
- New tested helper session_baseline.session_attributable_subset(uncommitted, baseline_record,
  current_branch, admin_ops) — reuses resolve_baseline + attributable_delta; FAIL-SAFE to the full set
  when the baseline is unresolved (real session conflicts still classify); documented override
  (ticket-3054) suppresses; an expected-mutation allowlist removes ephemeral runtime files.
- stop_reminder.py classifies the attributable subset, not the raw uncommitted set.
- classify_internal_conflict stays pure (classifies whatever list it is handed) — single responsibility.

## Acceptance criteria
- [ ] AC1 standing baseline drift (all in SessionStart snapshot) -> conflict type none -> NO block.
- [ ] AC2 a NEW session-created conflicting file -> still classified (no weakening).
- [ ] AC3 documented override / expected-mutation ephemeral files -> not classified.
- [ ] AC4 baseline unresolved/branch-changed -> fail-safe to full set (legacy classify).
- [ ] AC5 sibling spec update + session_baseline_test.py unit tests + registry entry; py_compile clean.
- [ ] AC6 free >=2-family cross-model consensus; receipt recorded.

## Rails
Content-only behavior refinement; makes the guard MORE precise (removes a false positive) while
preserving all true positives via fail-safe. Reversible (git-tracked). Live-install propagation to the
canonical checkout is a SEPARATE downstream deploy (not in this reversible origin/main PR).
