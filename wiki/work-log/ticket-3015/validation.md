# #3015 — Validation (HAMR reliability calibration, Phase D)

**Branch:** feat/3015-hamr-reliability · **Base:** origin/main · **Parent:** Epic #3008
**Files:** scripts/hamr-reliability.js (+.spec.js +.spec.md), scripts/hamr-offload-kpi.spec.js,
inventory/harness-self-test-registry.json (+2), .github/workflows/hamr-reliability.yml,
wiki/runbooks/hamr-reliability.md.

## Result
- node --check clean. Registry JSON valid.
- Specs: **10/10 pass** — hamr-reliability 7/7 (calibration, free-cloud precedence, canary/rollback),
  hamr-offload-kpi 3/3 (coverage/gate-quality/incident/escalation, window, empty-safe). Hermetic
  (fault-injection + telemetry; temp-HOME for KPI).
- Composes existing primitives (circuit-breaker #1279, review-dispatch-failover #2646,
  free-cloud-dispatch #2621) — no duplication (Epic mandate).
- AC1 proved: SLO breaker numbers anchored to circuit-breaker defaults (no drift); calibrateHealth
  healthy/degraded/open under injected probe failures.
- AC2 proved: availability failure → free-cloud before paid; capability → paid allowed;
  paid-before-free-on-availability is a detectable violation (the G3 guarantee), with escalation_reason telemetry.
- AC3 proved: canary promote/hold/rollback + rollbackPlan referencing wiki/runbooks/hamr-reliability.md.
- AC4 proved: KPI shape regression-locked (7d window, stale exclusion, empty-safe).
- validator-discipline OK; enforcement-wiring-audit: hamr-reliability + hamr-offload-kpi both **ENFORCED**.
- Content-only changeset (ticket-3015 files + shared registry line + runbook).
- Cross-family consensus **PASS** — receipt `d7c7b1e685b43629` (meta+mistral, $0 free-cloud).

## AC status (maps to #3015)
- AC1 [x] calibrate probes + breaker thresholds with documented SLOs.
- AC2 [x] guarantee free-cloud precedence before paid escalation for availability-only failures.
- AC3 [x] canary + rollback automation with operator runbook references.
- AC4 [x] publish KPI dashboard metrics (coverage, gate quality, incident rate) — regression-locked.
- AC5 [x] fault-injection + telemetry specs + registry entries + CI enforced root; validator-discipline OK.
- AC6 [x] free ≥2-family cross-model consensus PASS — d7c7b1e685b43629.

## Scope note
Completes #3015: AC4 (offload-kpi) shipped untested via the #3818 capture; AC1-AC3 are new calibration
composed over existing primitives. Pure decision functions + runbook; live canary cutover/rollback
execution is operational (runbook-driven), out of this module.
