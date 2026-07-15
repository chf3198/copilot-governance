# Spec — `session_baseline` (#3810)

Sibling spec for `hooks/scripts/session_baseline.py` (self-test registry:
`inventory/harness-self-test-registry.json`). Executable unit tests:
`hooks/scripts/session_baseline_test.py` (`python3 hooks/scripts/session_baseline_test.py`, stdlib
`unittest`, 16 cases, no external deps).

## Purpose

Make the Stop hook's uncommitted-code gate (`stop_checks.check_uncommitted`) fire only on
**session-attributable** uncommitted code — code the current session left uncommitted — never on
pre-existing standing baseline drift present at SessionStart. Fixes the permanent false positive on
the parked `feat/3026` canonical checkout (~40 modified + ~724 untracked, intentionally uncommitted
per #3801). Same disease #2005 cured for `detect_session_signals`.

## Data contract

`governance_state["baseline_uncommitted"] = {"branch": <str|None>, "paths": [<str>, ...]}`

- Written at **SessionStart** by `session_context._record_uncommitted_baseline` (advisory; failure
  leaves the key absent).
- Read at **Stop** by `stop_reminder` → `stop_checks.check_uncommitted` →
  `session_baseline.should_block`.

## Public API (pure, stdlib-only)

- `snapshot_uncommitted(cwd) -> list[str] | None` — sorted `git status --porcelain` path set;
  `None` on any failure (so a failed snapshot is never persisted as an empty baseline).
- `build_baseline_record(branch, paths) -> dict` — the persisted record.
- `resolve_baseline(record, current_branch) -> list[str] | None` — the path list to subtract, or
  `None` (force legacy) when the record is missing/malformed **or** was captured on a different
  branch (branch-change reset).
- `is_override(admin_ops) -> bool` — `baseline_drift_override` / `merge_evidence_override` present
  (parity with `check_admin_ops`, #3054).
- `attributable_delta(uncommitted, baseline) -> list[str]` — uncommitted paths not in baseline.
- `should_block(uncommitted, roles, baseline_record, current_branch, admin_ops) -> (bool, list)` —
  the single source of truth for the gate decision.

## Invariants (map to acceptance criteria)

- **AC1** baseline == standing drift ⇒ `should_block` False (pre-existing files do NOT block).
- **AC2** a NEW post-SessionStart uncommitted code file (not in baseline) ⇒ `should_block` True.
  No weakening of the real Admin gate.
- **AC3** `baseline_drift_override` (or `merge_evidence_override`) ⇒ `should_block` False.
- **AC4** SessionStart records the baseline deterministically; a branch change (recorded branch ≠
  current) resets it via `resolve_baseline → None`; a missing/malformed/unreadable snapshot ⇒
  LEGACY full-set block.
- **Fail-safe (never fail-open):** every unresolved-baseline path falls back to legacy full-set
  evaluation. `should_block([], ...)` and pre-collaborator phase (#1798) never block.
- **AC7 (no regression):** `check_uncommitted(uncommitted, roles)` — the legacy 2-arg call — is
  behavior-identical to before (`baseline_record=None ⇒ legacy`).

## Precedence in `should_block`

1. empty tree → no block
2. pre-collaborator (`roles['collaborator']` falsey, roles not None) → no block (#1798)
3. documented override → no block (#3054)
4. baseline resolves → block only on the delta (AC1/AC2)
5. baseline unresolved → block on full set (LEGACY, fail-safe) (AC4)

## `session_attributable_subset` — scoping internal-conflict classification (#3820)

`classify_internal_conflict` (client_arbitration_guard.py) is a `worktree-drift` catch-all that
previously ran on the FULL `uncommitted` set in `stop_reminder.py`, so it false-positive-blocked
session end on the parked `feat/3026` canonical checkout's standing baseline drift (#3801) with
"unresolved internal conflict requires deterministic operator resolution."

`session_attributable_subset(uncommitted, baseline_record, current_branch, admin_ops)` reuses the same
#3810 substrate (`resolve_baseline` + `attributable_delta`) to return only the paths THIS session is
accountable for; `stop_reminder.py` classifies that subset instead of the raw set. Same precedence:

1. empty tree → `[]`
2. documented override (#3054) → `[]` (suppress)
3. baseline resolves → attributable delta (`uncommitted − baseline`)
4. baseline unresolved / branch-mismatch → FULL set (LEGACY, fail-safe — a real session conflict still classifies)

**Expected-mutation allowlist** (`is_expected_mutation`, `EXPECTED_MUTATION_PREFIXES/SUBSTRINGS`):
ephemeral runtime files (`.megingjord/`, `.copilot/`, `.claude/`, `session.id`, `session_baseline`,
`governance_state`, `state_store`, `runtime_session`, `tool_activity`, `incidents.log`,
`friction-events`) are always removed — the GitOps "ignore expected mutations" / helm-diff
"ignore auto-added annotations" pattern. Verified end-to-end: against the real 878-path standing drift
a matching baseline yields subset `[]` → conflict type `none` (no block), while a newly-created
`sync-residue` file still classifies (no weakening). `classify_internal_conflict` itself stays pure.
