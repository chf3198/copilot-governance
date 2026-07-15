# #3822 — Validation (baseline-cutover tooling, Mode C)

**Branch:** feat/3822-baseline-cutover · **Base:** origin/main
**Files:** scripts/baseline-cutover.js (+.spec.js +.spec.md), inventory/harness-self-test-registry.json,
.github/workflows/baseline-cutover.yml.

## Result
- node --check clean; registry JSON valid; all specs exist (validator-discipline AC7).
- Self-test 6/6 (classifier buckets, hold-never-blocker, strings-only recipe, empty-ready, verify shape).
- governance-verify PASS; validator-discipline OK; enforcement-wiring-audit 37/561 ENFORCED (baseline-cutover not UNWIRED).
- Cross-family consensus PASS -- receipt a95d78e4d907a249 (meta+mistral).

## LIVE DRY-RUN vs canonical checkout (the go/no-go evidence)
`ready=false, safe=876, holds=1, blockers=1`:
- HOLD: scripts/governance-verify.js (L7 documented "stale" hold).
- BLOCKER: scripts/hamr-tool-policy.js — untracked in canonical; origin/main version is 67 lines LONGER
  (parallel ticket-3013 merge). Canonical is BEHIND origin here, not ahead; the byte-identity invariant
  correctly refuses a silent cutover. Disposition (accept origin's newer version / capture / hold) is a
  gated decision, not auto-resolved.

## Scope
Tooling only. NEVER mutates the live checkout (no git checkout/reset/clean). The live re-park is a
retained carve-out (dry-run-ready + guard self-tests + human go/no-go). Does NOT Close ticket-3801/ticket-3818.

## AC status
AC1 [x] AC2 [x] AC3 [x] AC4 [x] (execute is emit-recipe-only, gated) AC5 [x] AC6 [x] (a95d78e4d907a249)
