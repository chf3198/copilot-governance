# #3820 — Validation

**Branch:** fix/3820-classify-conflict-session-attributable · **Base:** origin/main
**Files (hooks-only):** session_baseline.py (+helper/allowlist), stop_reminder.py (wiring),
session_baseline_test.py (+7 tests), session_baseline.spec.md (+doc).

## Result
- py_compile clean (3 py files).
- Unit tests: 23/23 pass (16 existing + 7 new: AC1 standing-drift->[], AC2 new-conflict-surfaces,
  AC3 override + expected-mutation ignored, AC4 unresolved/branch-mismatch fail-safe full-set, empties,
  is_expected_mutation).
- Integration vs REAL 878-path drift: matching baseline -> subset [] -> classify type=none (NO block);
  new sync-residue file -> still type=sync-residue (fires; no weakening).
- governance-verify PASS; validator-discipline OK (hooks-only, no scripts/ validator); wiring-audit exit0 advisory.
- Registry already covers session_baseline test (harness-self-test-registry.json).
- Cross-family consensus PASS — receipt f8aa56324bfe1d8b (meta+mistral).

## AC status
AC1 [x] AC2 [x] AC3 [x] AC4 [x] AC5 [x] AC6 [x] (receipt f8aa56324bfe1d8b)

## Deploy note
Reversible origin/main source fix. Live-install propagation to the canonical checkout (~/.copilot/hooks
-> canonical) is a SEPARATE downstream deploy, not in this PR.
