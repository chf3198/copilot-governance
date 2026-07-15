# #3015 — Manager Scope: Phase D — Calibrate HAMR reliability, failover, and rollout safeguards

**Type:** feature/guardrail · **Area:** governance/scripts · **Priority:** P2
**Parent:** Epic #3008 · **Refs (bare):** Epic #3008, #3013 (Phase B, merged PR#54), #3014 (Phase C,
merged PR#56), #1279 circuit-breaker, #2646 review-dispatch free-cloud failover, #2621 free-cloud-dispatch,
hamr-offload-kpi (#3015/AC-E5), validator-discipline #1893, #3818 L6 capture.

## Context (drift finding)
Of #3015's four ACs, only AC4 (KPI dashboard metrics) shipped — `scripts/hamr-offload-kpi.js` reached
main via the #3818 L6 capture (PR#45), untested. AC1 (probe/breaker SLOs), AC2 (free-cloud precedence
before paid on availability-only failures), and AC3 (canary + rollback automation) have no #3015
deliverable. The reliability PRIMITIVES already exist and must be reused, not duplicated (Epic mandate):
circuit-breaker (#1279), review-dispatch-failover (#2646), free-cloud-dispatch (#2621).

## Objective
Ship a thin reliability-calibration layer that COMPOSES the existing primitives into: documented SLOs +
breaker calibration (AC1), a free-cloud-precedence escalation ladder for availability-only failures
(AC2), and canary/rollback decisions with an operator runbook reference (AC3); regression-lock the KPI
(AC4). Add fault-injection + telemetry specs, an enforced CI root, and the runbook doc.

## Design
`scripts/hamr-reliability.js`:
- `RELIABILITY_SLO` — single source of truth: probe timeout, breaker failure-threshold + cool-off (from
  circuit-breaker defaults), half-open trial, canary max-error-rate + min-samples, offload-coverage
  target, runbook path (AC1).
- `calibrateHealth(window, slo?) → {state: healthy|degraded|open, failureRate, breach}` — classify a
  probe/health window against the SLO, driving the reused circuit-breaker (AC1).
- `ESCALATION_LADDER = ['fleet-local','free-cloud','paid-premium']` +
  `nextEscalation(failure, {triedFree}) → {tier, reason, allowedPaid}` — an AVAILABILITY-only failure
  must exhaust free-cloud before paid; a CAPABILITY failure may escalate to paid (free can't fix it).
- `assertFreeCloudPrecedence(plan) → {ok, violation?}` — guarantee no paid tier precedes a free-cloud
  attempt for an availability failure (AC2, the G3 guarantee).
- `evaluateCanary(canary, baseline, slo?) → {decision: promote|hold|rollback, reason, runbook}` and
  `rollbackPlan(reason, slo?) → {action:'rollback', steps, runbook}` (AC3).
- Re-export `computeOffloadKpi` (AC4 regression-lock).
- `--report` CLI (advisory, hermetic).
Runbook: `wiki/runbooks/hamr-reliability.md` (operator SLOs + failover ladder + rollback steps).

## Acceptance criteria (maps to #3015)
- [ ] AC1 calibrate probes + breaker thresholds with documented SLOs (RELIABILITY_SLO + calibrateHealth).
- [ ] AC2 guarantee free-cloud precedence before paid escalation for availability-only failures.
- [ ] AC3 canary + rollback automation with operator runbook references.
- [ ] AC4 publish KPI dashboard metrics (offload coverage, gate quality, incident rate) — regression-locked.
- [ ] AC5 fault-injection + telemetry specs + registry entry + CI enforced root; validator-discipline OK.
- [ ] AC6 free ≥2-family cross-model consensus; receipt recorded.

## Rails
Reversible, autonomous (feature branch; pure decision functions + docs; the escalation ladder HARDENS
G3 by making paid-before-free an assertable violation; no protected-main direct write). No carve-out.

Signed-by: Orla Mason
Team&Model: claude-code:opus@local
Role: manager
