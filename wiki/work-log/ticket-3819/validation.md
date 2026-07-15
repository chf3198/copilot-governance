# #3819 — Validation (baseline-drift-sentinel, Mode A)

**Branch:** feat/3819-baseline-drift-sentinel · **Base:** origin/main
**Files:** scripts/baseline-drift-sentinel.js (+.spec.js +.spec.md), inventory/harness-self-test-registry.json,
.github/workflows/baseline-drift-sentinel.yml, scripts/governance-verify.js (advisory wiring).

## Result
- node --check clean (3 js); registry JSON valid.
- Self-test spec: 6/6 pass (classifier partition, blank-drop/order, allowlist, CI-safe report, threshold).
- governance-verify PASS — now prints "Baseline-drift sentinel (non-blocking, ticket-3801 AC5)" advisory; never an issue.
- validator-discipline OK (new scripts/ validator ships sibling spec + registry entry).
- enforcement-wiring-audit 28->29 ENFORCED; baseline-drift-sentinel NOT in UNWIRED list.
- Content-only changeset (only ticket-3819 files).
- Cross-family consensus PASS — receipt eb649d4d8c51a0e7 (meta+mistral).

## AC status
AC1 [x] AC2 [x] AC3 [x] AC4 [x] AC5 [x] (threshold+beyondThreshold; blocking deferred to soak) AC6 [x] (eb649d4d8c51a0e7)

## Scope note
Mode A (DETECT) only. Mode B (capture) + Mode C (cutover / ticket-3801 AC4) are separate later work; the
live cutover is a gated carve-out. This PR does NOT close ticket-3801/ticket-3818 (that is the Mode C child).
