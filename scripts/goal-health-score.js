#!/usr/bin/env node
'use strict';
// goal-health-score (#1253 / Epic #1113 AC2) — pure-function Goal Health Score.
// Per research/epic-1113-phase-0-design-2026-05-09.md §1, §2.

const DEFAULT_WEIGHTS = {
  ga: 0.25, // governance-audit violations
  ll: 0.15, // label-lint failures
  cf: 0.20, // Consultant goal-misorder findings
  pr: 0.10, // PR review goal-mentions
  rp: 0.20, // Reopened-with-priority-cause
  oo: 0.10, // Operator override flag
};
const MIN_ACTIVE_WEIGHT_FLOOR = 0.5;

function clamp01(value) { return Math.max(0, Math.min(1, value)); }

function aggregate(activeKeys, weights, sensorValues, sumActiveWeight) {
  const renormalizedWeights = {};
  const contributing = {};
  let weightedFailureSum = 0;
  for (const key of activeKeys) {
    const renormWeight = weights[key] / sumActiveWeight;
    renormalizedWeights[key] = renormWeight;
    const failureRate = clamp01(sensorValues[key]);
    contributing[key] = { value: sensorValues[key], clamped: failureRate, weight: renormWeight };
    weightedFailureSum += renormWeight * failureRate;
  }
  return { renormalizedWeights, contributing, weightedFailureSum };
}

function computeGHS({ sensorValues = {}, weights = DEFAULT_WEIGHTS } = {}) {
  const computed_utc = new Date().toISOString();
  const activeKeys = Object.keys(weights).filter(key => sensorValues[key] !== null && sensorValues[key] !== undefined);
  const sumActiveWeight = activeKeys.reduce((sum, key) => sum + weights[key], 0);
  if (sumActiveWeight < MIN_ACTIVE_WEIGHT_FLOOR) {
    return { score: null, stale: true,
      reason: `active sensor weight ${sumActiveWeight.toFixed(2)} < floor ${MIN_ACTIVE_WEIGHT_FLOOR}`,
      contributing: {}, weights_used: {}, computed_utc };
  }
  const agg = aggregate(activeKeys, weights, sensorValues, sumActiveWeight);
  return { score: clamp01(1 - agg.weightedFailureSum), stale: false,
    contributing: agg.contributing, weights_used: agg.renormalizedWeights, computed_utc };
}

if (require.main === module) {
  const fs = require('node:fs');
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : null; };
  const sensorValues = arg('sensors')
    ? JSON.parse(fs.readFileSync(arg('sensors'), 'utf8'))
    : { ga: null, ll: null, cf: null, pr: null, rp: null, oo: null };
  const result = computeGHS({ sensorValues });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.stale ? 2 : 0);
}

module.exports = { computeGHS, DEFAULT_WEIGHTS, MIN_ACTIVE_WEIGHT_FLOOR };
