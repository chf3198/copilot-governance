#!/usr/bin/env node
'use strict';

// Regression spec for hamr-reliability (#3015 Phase D, Epic #3008). Self-executing; exit 1 on failure.
// Hermetic: Node built-ins only; no network. Fault-injection + telemetry coverage of the four ACs:
//   AC1 calibrateHealth classifies healthy/degraded/open windows against the documented SLO;
//   AC2 nextEscalation + assertFreeCloudPrecedence guarantee free-cloud precedes paid on availability
//       failures (and paid is reachable on capability failures), with escalation_reason telemetry;
//   AC3 evaluateCanary promotes/holds/rolls-back and rollbackPlan references the operator runbook;
//   AC4 RELIABILITY_SLO breaker numbers stay anchored to circuit-breaker defaults (no drift).

const assert = require('node:assert');
const test = require('node:test');

const {
  RELIABILITY_SLO, ESCALATION_LADDER,
  calibrateHealth, nextEscalation, assertFreeCloudPrecedence,
  evaluateCanary, rollbackPlan,
} = require('./hamr-reliability');
const { DEFAULT_THRESHOLD, DEFAULT_COOL_OFF_MS } = require('./circuit-breaker');

const ok = () => ({ ok: true });
const fail = () => ({ ok: false });

test('AC1: calibrateHealth classifies healthy / degraded / open windows', () => {
  assert.strictEqual(calibrateHealth([ok(), ok(), ok()]).state, 'healthy');
  const degraded = calibrateHealth([ok(), fail(), ok(), fail()]);
  assert.strictEqual(degraded.state, 'degraded');
  assert.ok(degraded.failureRate > 0 && !degraded.breach);
  // threshold consecutive failures => open (fault injection)
  const window = Array.from({ length: DEFAULT_THRESHOLD }, fail);
  const open = calibrateHealth(window);
  assert.strictEqual(open.state, 'open');
  assert.strictEqual(open.breach, true);
  assert.strictEqual(open.maxConsecutiveFailures, DEFAULT_THRESHOLD);
});

test('AC4: SLO breaker numbers are anchored to circuit-breaker defaults (no drift)', () => {
  assert.strictEqual(RELIABILITY_SLO.breaker_failure_threshold, DEFAULT_THRESHOLD);
  assert.strictEqual(RELIABILITY_SLO.breaker_cool_off_ms, DEFAULT_COOL_OFF_MS);
  assert.deepStrictEqual(ESCALATION_LADDER, ['fleet-local', 'free-cloud', 'paid-premium']);
});

test('AC2: availability failure tries free-cloud before paid; paid only after free exhausted', () => {
  const first = nextEscalation({ kind: 'availability' }, { triedFree: false });
  assert.strictEqual(first.tier, 'free-cloud');
  assert.strictEqual(first.allowedPaid, false);
  assert.match(first.escalation_reason, /free-first/);

  const after = nextEscalation({ kind: 'availability' }, { triedFree: true });
  assert.strictEqual(after.tier, 'paid-premium');
  assert.strictEqual(after.allowedPaid, true);
  assert.match(after.escalation_reason, /free-exhausted/);
});

test('AC2: a capability failure may escalate to paid immediately (free cannot satisfy it)', () => {
  const cap = nextEscalation({ kind: 'capability' }, { triedFree: false });
  assert.strictEqual(cap.tier, 'paid-premium');
  assert.strictEqual(cap.allowedPaid, true);
  assert.strictEqual(cap.escalation_reason, 'capability');
});

test('AC2 guarantee: paid-before-free on an availability failure is a detectable violation', () => {
  // compliant ladder
  assert.strictEqual(assertFreeCloudPrecedence(['fleet-local', 'free-cloud', 'paid-premium'], { kind: 'availability' }).ok, true);
  // violation: paid before free on availability
  const bad = assertFreeCloudPrecedence(['fleet-local', 'paid-premium'], { kind: 'availability' });
  assert.strictEqual(bad.ok, false);
  assert.strictEqual(bad.violation, 'paid-before-free-on-availability');
  assert.strictEqual(bad.runbook, RELIABILITY_SLO.runbook);
  // capability failure is exempt (free can't fix a capability gap)
  assert.strictEqual(assertFreeCloudPrecedence(['fleet-local', 'paid-premium'], { kind: 'capability' }).ok, true);
});

test('AC3: canary promote / hold / rollback decisions', () => {
  // too few samples => hold
  assert.strictEqual(evaluateCanary({ samples: 5, errorRate: 0 }, { errorRate: 0 }).decision, 'hold');
  // healthy => promote
  assert.strictEqual(evaluateCanary({ samples: 50, errorRate: 0.02 }, { errorRate: 0.02 }).decision, 'promote');
  // SLO breach => rollback (fault injection)
  const breach = evaluateCanary({ samples: 50, errorRate: 0.25 }, { errorRate: 0.02 });
  assert.strictEqual(breach.decision, 'rollback');
  assert.strictEqual(breach.runbook, RELIABILITY_SLO.runbook);
  // regression vs baseline => rollback
  assert.strictEqual(evaluateCanary({ samples: 50, errorRate: 0.06 }, { errorRate: 0.01 }).decision, 'rollback');
});

test('AC3: rollbackPlan is deterministic and references the operator runbook', () => {
  const plan = rollbackPlan('canary SLO breach');
  assert.strictEqual(plan.action, 'rollback');
  assert.ok(Array.isArray(plan.steps) && plan.steps.length >= 3);
  assert.strictEqual(plan.runbook, RELIABILITY_SLO.runbook);
  assert.match(plan.reason, /breach/);
});
