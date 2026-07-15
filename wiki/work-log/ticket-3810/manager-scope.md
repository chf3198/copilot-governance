# Ticket #3810 — Manager Scope 🎯

**Title:** Stop hook: gate uncommitted-block on session-attributable code, not standing baseline drift
**Type:** bug · **Area:** hooks · **Priority:** P2 · **Points:** 3
**Parent:** operator directive 2026-07-15 · relates: #2005 (same bug class, detect_session_signals), #3054 (baseline_drift_override), #3801 (baseline capture)

## Problem (observed)

The `Stop` hook (`hooks/scripts/stop_reminder.py`) false-positive-blocks session end with
`"Stop blocked: uncommitted changes; Admin baton incomplete."` whenever the cwd is the parked
canonical checkout (`feat/3026`), which carries **standing multi-ticket baseline drift** (~40
modified tracked + ~724 untracked files) that is intentionally uncommitted and documented as
"capture-as-baseline, NEVER discard" (#3801, re-park pending).

### Root cause (traced)

1. `git_checks.detect_uncommitted_changes(cwd)` runs a **raw `git status --porcelain`** → returns
   the entire standing drift set.
2. `stop_checks.check_uncommitted(uncommitted, roles)` blocks whenever any of those files match
   `CODE_UNCOMMITTED_EXTS = (.sh,.js,.py,.ts,.json,.md)` **once `roles['collaborator']` is True** —
   with **no attribution** to whether the current session authored them.
3. Asymmetry: `check_admin_ops` already honors a `baseline_drift_override` (#3054), but
   `check_uncommitted` honors **no** such exception and has **no** session-delta awareness.
4. There is **no SessionStart baseline snapshot** of the uncommitted set anywhere
   (`governance_state.py` / `runtime_session_register.py` do not capture one).

This is the **same disease** already cured for `detect_session_signals` under #2005 ("Gap 2":
don't fire in every new session after a code-changing merge) — the uncommitted path never got
the equivalent session-scoping.

## Objective

Make the Stop uncommitted-block fire only on **session-attributable** uncommitted code — code the
current session left uncommitted — never on pre-existing baseline drift present at SessionStart.
Preserve the gate's real purpose (a session that writes code and forgets to commit STILL blocks).

## Recommended approach (Collaborator may refine; ratify via cross-family review)

**Primary — SessionStart baseline-delta (automatic, deterministic):**
- At SessionStart, snapshot the set of uncommitted paths (`git status --porcelain`) into
  `governance_state` (e.g. `baseline_uncommitted: [...]` or a stable hash+list). Reuse the existing
  `runtime_session_register.py` SessionStart hook + `governance_state.ensure_state/save_state`.
- At Stop, `check_uncommitted` blocks only on the **delta**: uncommitted code files NOT in the
  SessionStart baseline. Reset the baseline on branch change (reuse `reset_on_branch_change`).

**Complementary — override parity (#3054):** honor `baseline_drift_override` in `check_uncommitted`
too, so an explicit operator/labelled marker also suppresses the block (parity with check_admin_ops).

**Fail-safe direction:** if the baseline snapshot is missing/unreadable, fall back to the LEGACY
behavior (block) — never fail-open in a way that hides a genuine session gap. The SessionStart hook
must therefore write the snapshot reliably; document the missing-snapshot fallback explicitly.

## Acceptance criteria

- [ ] AC1: With a SessionStart baseline equal to current standing drift, Stop does NOT block on
      those pre-existing files (the reported false positive is gone).
- [ ] AC2: A NEW uncommitted code file created after SessionStart (not in baseline) STILL triggers
      the block — no weakening of the real Admin gate.
- [ ] AC3: `baseline_drift_override` honored by `check_uncommitted` (parity with `check_admin_ops`).
- [ ] AC4: SessionStart records the baseline set deterministically into `governance_state`;
      branch change resets it. Missing snapshot → legacy block (fail-safe), documented.
- [ ] AC5: Sibling spec + `inventory/harness-self-test-registry.json` entry (#1893 discipline);
      unit tests cover AC1/AC2/AC3/AC4; `py_compile` clean.
- [ ] AC6: All required CI green on the PR; cross-family $0 consensus PASS (receipt recorded).
- [ ] AC7: No change to unrelated Stop conditions (client-arbitration #3749, internal-conflict,
      admin-ops, wiki-pending); the other tracked hooks' behavior otherwise unchanged.

## Scope (out — do NOT do here)

- Re-parking / cleaning the actual `feat/3026` baseline drift — that is the separate #3801 re-park
  item. This ticket only fixes the GATE's false positive, not the drift itself.
- No change to `check_admin_ops` semantics beyond the override-parity reuse.
- No cross-harness propagation.

## Constraints / gates

- G1 > G2 > G3. Governance gate must not fail-open. Branch `feat/3810-stop-session-attributable`
  off `origin/main`; commits reference `#3810`; PR `Closes #3810`. Read-only-mirror: land via PR.
- Files: `wiki/` is gitignored → `git add -f` baton artifacts. Commit with `#3810` in the `-m`
  text (PreToolUse guard scans command text). Poll `gh pr checks --watch` before merge.
- DoD: all ACs checked, CI green, PR merged Closes #3810, Consultant CLOSEOUT posted, mirror
  status → done, worktree/branch cleaned.

**Baton → Collaborator** (next session)
