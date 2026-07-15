# HAMR Reliability Runbook (#3015 · Epic #3008 Phase D)

Operator runbook for HAMR fleet-offload reliability. The machine-readable source of truth is
`scripts/hamr-reliability.js` (`RELIABILITY_SLO`); this page is the human companion referenced by the
`runbook` field of every reliability decision (canary/rollback/precedence-violation).

## Service-Level Objectives (RELIABILITY_SLO)
| SLO | Value | Meaning |
|---|---|---|
| `probe_timeout_ms` | 5000 | health-probe abort budget (hamr-probes S2, #877) |
| `breaker_failure_threshold` | 5 (circuit-breaker default) | consecutive availability failures → breaker opens |
| `breaker_cool_off_ms` | 30000 | open → half-open cool-off |
| `half_open_trial` | 1 | trial calls allowed while half-open |
| `canary_max_error_rate` | 0.10 | a canary above this rolls back |
| `canary_min_samples` | 20 | minimum canary observations before a promote/rollback decision |
| `offload_coverage_target` | 0.80 | ≥80% of eligible calls served at $0 (G3) |

The breaker numbers are anchored to `circuit-breaker.js` defaults so the SLO and the primitive never
drift (asserted by `hamr-reliability.spec.js`).

## Escalation ladder (AC2 — free-cloud precedence)
`fleet-local → free-cloud → paid-premium`

- **Availability-only failure** (fleet unreachable/timeout): try `free-cloud` FIRST
  (`review-dispatch-failover` #2646 / `free-cloud-dispatch` #2621). `paid-premium` is permitted ONLY
  after free-cloud is exhausted. Paid-before-free on an availability failure is a detectable violation
  (`assertFreeCloudPrecedence` → `paid-before-free-on-availability`) — treat it as a G3 incident.
- **Capability failure** (fleet answered but quality/judge inadequate): paid escalation is permitted
  immediately — free tiers cannot satisfy a capability gap — but the decision is logged with
  `escalation_reason: capability`.

## Breaker calibration (AC1)
`calibrateHealth(window)` classifies a probe window: `healthy` (no failures), `degraded` (some failures,
below threshold), `open` (≥ threshold consecutive failures). When `open`, fail fast and route to the next
ladder tier; recovery follows the circuit-breaker half-open trial.

## Canary + rollback (AC3)
1. Route a small cohort to the new tier; collect ≥ `canary_min_samples`.
2. `evaluateCanary(canary, baseline)` → `promote` (healthy) / `hold` (too few samples) /
   `rollback` (error > SLO, or a ≥1.5× regression vs baseline).
3. On `rollback`, execute `rollbackPlan(...).steps`:
   1. Freeze the canary cohort (route 100% back to last-known-good tier).
   2. Re-open the breaker for the failing provider to fail fast.
   3. Confirm free-cloud precedence still holds for availability failures.
   4. Record an incident row and re-run `hamr-offload-kpi` to confirm recovery.

## KPIs (AC4)
`hamr-offload-kpi.js` → `offload_coverage_7d`, `gate_quality_7d`, `incident_rate_7d`,
`top_escalation_reasons`. `reliabilityReport()` flags when `offload_coverage_7d` is below
`offload_coverage_target`. Surface on the HAMR dashboard offload panel.
