# hamr-reliability — spec (#3015 · Epic #3008 Phase D)

Reliability calibration for HAMR fleet-offload: documented SLOs + breaker calibration (AC1), a
free-cloud-precedence escalation ladder for availability-only failures (AC2), canary/rollback decisions
with an operator runbook (AC3), and a regression-locked KPI passthrough (AC4). It **composes** the
existing primitives — `circuit-breaker` (#1279), `review-dispatch-failover` (#2646),
`free-cloud-dispatch` (#2621), `hamr-offload-kpi` (#3015/AC-E5) — and duplicates none of them. This is a
direct G3 mechanism: it makes "paid before free on an availability failure" an assertable violation.

## API
- `RELIABILITY_SLO` — the documented SLOs (probe timeout, breaker threshold/cool-off anchored to
  circuit-breaker defaults, canary max-error/min-samples, offload-coverage target, runbook path).
- `calibrateHealth(window, slo?) → {state: healthy|degraded|open, failureRate, maxConsecutiveFailures, breach}`.
- `ESCALATION_LADDER = ['fleet-local','free-cloud','paid-premium']`.
- `nextEscalation(failure, {triedFree}) → {tier, reason, allowedPaid, escalation_reason}` — availability
  failures go to free-cloud before paid; capability failures may reach paid immediately.
- `assertFreeCloudPrecedence(plan, failure) → {ok, violation?, runbook?}` — the G3 guarantee.
- `evaluateCanary(canary, baseline, slo?) → {decision: promote|hold|rollback, reason, runbook}`.
- `rollbackPlan(reason, slo?) → {action, reason, steps[], runbook}`.
- `reliabilityReport(nowMs?)` — SLO + KPI + `offload_coverage_meets_slo`. `--report` CLI (advisory, hermetic).

## Invariants (proved by hamr-reliability.spec.js + hamr-offload-kpi.spec.js)
1. **Breaker calibration:** ≥ threshold consecutive probe failures ⇒ `open`; some failures ⇒ `degraded`;
   none ⇒ `healthy`.
2. **No drift:** SLO breaker threshold/cool-off equal the circuit-breaker defaults.
3. **Free-cloud precedence (AC2):** availability failure ⇒ free-cloud first, paid only after free
   exhausted; capability failure may reach paid; paid-before-free on availability is a detectable violation.
4. **Canary (AC3):** promote when samples ≥ min and error ≤ SLO; hold on too few samples; rollback on SLO
   breach or a ≥1.5× regression; rollbackPlan references the operator runbook.
5. **KPI (AC4):** coverage/gate-quality/incident-rate/escalation-reasons over a 7d window; stale rows
   excluded; empty telemetry is safe.

## Enforced root
`.github/workflows/hamr-reliability.yml` runs both specs as a hard gate, making
`scripts/hamr-reliability.js` + `scripts/hamr-offload-kpi.js` ENFORCED (enforcement-wiring-audit) with
sibling specs + registry entries (validator-discipline #1893). Pure/hermetic — Node built-ins only.

## Not in scope
No change to the dispatch primitives' behavior; this layer only calibrates + decides. Live canary
cutover/rollback execution is operational (runbook-driven), out of this pure-decision module.
