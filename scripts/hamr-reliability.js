#!/usr/bin/env node
'use strict';

// #3015 Phase D (Epic #3008) — HAMR reliability calibration. A thin layer that COMPOSES the existing
// primitives (circuit-breaker #1279, review-dispatch free-cloud failover #2646, free-cloud-dispatch
// #2621, hamr-offload-kpi #3015/AC-E5) into documented SLOs + breaker calibration (AC1), a
// free-cloud-precedence escalation ladder for availability-only failures (AC2), and canary/rollback
// decisions with an operator runbook (AC3). It duplicates none of them — pure decision functions only.

const { DEFAULT_THRESHOLD, DEFAULT_COOL_OFF_MS } = require('./circuit-breaker');
const { computeOffloadKpi } = require('./hamr-offload-kpi');

// AC1 — documented Service-Level Objectives. Single source of truth for probe + breaker calibration and
// canary gating. Breaker numbers are anchored to circuit-breaker's own defaults so the two never drift.
const RELIABILITY_SLO = Object.freeze({
  probe_timeout_ms: 5000,                        // hamr-probes S2 budget (#877)
  breaker_failure_threshold: DEFAULT_THRESHOLD,  // consecutive availability failures → open
  breaker_cool_off_ms: DEFAULT_COOL_OFF_MS,      // open → half-open
  half_open_trial: 1,
  canary_max_error_rate: 0.10,                   // a canary must stay ≤10% error to promote
  canary_min_samples: 20,                        // and observe at least this many calls
  offload_coverage_target: 0.80,                 // ≥80% of eligible calls served at $0 (G3)
  runbook: 'wiki/runbooks/hamr-reliability.md',
});

// AC1 — classify a probe/health window (array of {ok:boolean}) against the SLO. `state` mirrors the
// breaker: open once consecutive failures reach the threshold; degraded if any failed but not open;
// else healthy.
function calibrateHealth(window = [], slo = RELIABILITY_SLO) {
  const samples = Array.isArray(window) ? window : [];
  const total = samples.length;
  const failures = samples.filter((s) => !(s && s.ok)).length;
  let consec = 0;
  let maxConsec = 0;
  for (const s of samples) {
    if (s && s.ok) consec = 0;
    else { consec += 1; if (consec > maxConsec) maxConsec = consec; }
  }
  const failureRate = total ? failures / total : 0;
  const breach = maxConsec >= slo.breaker_failure_threshold;
  const state = breach ? 'open' : (failures > 0 ? 'degraded' : 'healthy');
  return { state, total, failures, failureRate: Math.round(failureRate * 1000) / 1000, maxConsecutiveFailures: maxConsec, breach };
}

// AC2 — the escalation ladder. Free tiers ALWAYS precede paid.
const ESCALATION_LADDER = Object.freeze(['fleet-local', 'free-cloud', 'paid-premium']);

// Given a failure and whether free-cloud has been tried, return the next tier + reason. An
// AVAILABILITY-only failure may only reach paid AFTER free-cloud was attempted (G3 guarantee). A
// CAPABILITY failure (fleet answered but quality inadequate) may escalate to paid — free can't fix it —
// but the decision is still logged with an explicit reason.
function nextEscalation(failure = {}, state = {}) {
  const kind = failure.kind === 'capability' ? 'capability' : 'availability';
  const triedFree = Boolean(state.triedFree);
  if (kind === 'capability') {
    return { tier: 'paid-premium', reason: 'capability-gap-free-cannot-satisfy', allowedPaid: true, escalation_reason: 'capability' };
  }
  if (!triedFree) {
    return { tier: 'free-cloud', reason: 'availability-failure-try-free-cloud-first', allowedPaid: false, escalation_reason: 'availability:free-first' };
  }
  return { tier: 'paid-premium', reason: 'availability-failure-free-cloud-exhausted', allowedPaid: true, escalation_reason: 'availability:free-exhausted' };
}

// AC2 — guarantee: for an availability failure, no paid tier may appear in the plan before free-cloud
// was attempted. `plan` is an ordered array of tier strings actually dispatched.
function assertFreeCloudPrecedence(plan = [], failure = {}) {
  const kind = failure.kind === 'capability' ? 'capability' : 'availability';
  if (kind === 'capability') return { ok: true };
  const tiers = Array.isArray(plan) ? plan : [];
  const paidIdx = tiers.findIndex((t) => t === 'paid-premium');
  const freeIdx = tiers.findIndex((t) => t === 'free-cloud');
  if (paidIdx !== -1 && (freeIdx === -1 || freeIdx > paidIdx)) {
    return { ok: false, violation: 'paid-before-free-on-availability', message: `paid-premium (idx ${paidIdx}) escalated before free-cloud on an availability failure`, runbook: RELIABILITY_SLO.runbook };
  }
  return { ok: true };
}

// AC3 — canary evaluation. Promote only when enough samples AND error rate within SLO; otherwise hold
// (too few samples) or rollback (SLO breach / worse than baseline).
function evaluateCanary(canary = {}, baseline = {}, slo = RELIABILITY_SLO) {
  const samples = Number(canary.samples || 0);
  const errorRate = Number(canary.errorRate != null ? canary.errorRate : 1);
  const baseErr = Number(baseline.errorRate != null ? baseline.errorRate : 0);
  if (samples < slo.canary_min_samples) {
    return { decision: 'hold', reason: `insufficient canary samples (${samples} < ${slo.canary_min_samples})`, runbook: slo.runbook };
  }
  if (errorRate > slo.canary_max_error_rate) {
    return { decision: 'rollback', reason: `canary error rate ${errorRate} exceeds SLO ${slo.canary_max_error_rate}`, runbook: slo.runbook };
  }
  if (errorRate > baseErr * 1.5 && errorRate > 0.02) {
    return { decision: 'rollback', reason: `canary error rate ${errorRate} regressed vs baseline ${baseErr}`, runbook: slo.runbook };
  }
  return { decision: 'promote', reason: `canary healthy (${samples} samples, error ${errorRate} ≤ SLO ${slo.canary_max_error_rate})`, runbook: slo.runbook };
}

// AC3 — the deterministic rollback plan (operator-runbook-referenced).
function rollbackPlan(reason = 'unspecified', slo = RELIABILITY_SLO) {
  return {
    action: 'rollback',
    reason,
    steps: [
      'Freeze the canary cohort (route 100% back to the last-known-good tier).',
      'Re-open the circuit breaker for the failing provider to fail fast.',
      'Confirm free-cloud precedence still holds for availability failures.',
      'Record an incident row and re-run hamr-offload-kpi to confirm recovery.',
    ],
    runbook: slo.runbook,
  };
}

// AC4 — regression-locked KPI passthrough.
function reliabilityReport(nowMs) {
  const kpi = computeOffloadKpi(nowMs);
  return {
    slo: RELIABILITY_SLO,
    kpi,
    offload_coverage_meets_slo: kpi.offload_coverage_7d >= RELIABILITY_SLO.offload_coverage_target,
  };
}

module.exports = {
  RELIABILITY_SLO, ESCALATION_LADDER,
  calibrateHealth, nextEscalation, assertFreeCloudPrecedence,
  evaluateCanary, rollbackPlan, reliabilityReport,
};

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(reliabilityReport(), null, 2)}\n`);
}
