# #3821 — Validation

**Branch:** fix/3821-detect-uncommitted-firstline-parse · **Base:** origin/main
**Files:** hooks/scripts/git_checks.py (1-line parse fix), hooks/scripts/git_checks_test.py (new, 4 tests),
inventory/harness-self-test-registry.json (git-checks-porcelain entry).

## Result
- py_compile clean; registry JSON valid.
- Regression test 4/4 pass (first-path-not-corrupted, all-paths-intact, matches-snapshot-parsing, empty/failure-safe).
- Verified vs REAL drift: first item .gitignore (was gitignore); detect set == snapshot set; ticket-3820
  session-attributable subset -> 0 -> conflict none (the Stop false-block is gone at the parse level).
- governance-verify PASS; validator-discipline OK; baseline-drift-sentinel spec still green.
- Cross-family consensus PASS -- receipt 00d0bf0e22583c55 (meta+mistral).

## AC status
AC1 [x] AC2 [x] AC3 [x] AC4 [x] (00d0bf0e22583c55)

## Deploy
Live deploy of hooks/scripts/git_checks.py follows merge (completes the ticket-3820 Stop-fix live activation).
