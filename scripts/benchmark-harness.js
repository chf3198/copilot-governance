#!/usr/bin/env node
'use strict';
// benchmark-harness.js (#3149, Epic #3147 S3): a thin workflow-benchmark harness. runBenchmark()
// captures an IMPROVABLE metric for a workflow, compares it to a stored golden baseline, and flags a
// regression when the metric worsens beyond budget (direction-aware). Seeds on first run (never
// fails). p99() + runConcurrent() are the load/chaos facet for state-mutating/concurrent surfaces.
// Deterministic-first; fleet only for LLM-in-the-loop metrics; premium never. Local, $0.
const fs = require('fs');
const path = require('path');

const PERCENTILE = 0.99;

/** Load the baseline store (resilient: absent/corrupt -> {}). @param {string} file @returns {object} */
function loadBaselines(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

/** Persist the baseline store. @param {string} file @param {object} store @returns {void} */
function saveBaselines(file, store) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(store, null, 2));
}

/** True when `value` is worse than `baseline` by more than `budget` (fractional), given direction.
 * @param {number} value @param {number} baseline @param {number} budget @param {string} direction @returns {boolean} */
function isRegressed(value, baseline, budget, direction) {
  if (direction === 'higher-better') return value < baseline * (1 - budget);
  return value > baseline * (1 + budget); // default lower-better
}

/** Run a workflow benchmark: capture metric, compare to the golden baseline, flag regression (seed
 * on first run). @param {object} opts {name, metric, baselineFile, budget, direction}. @returns {Promise<object>} */
async function runBenchmark(opts) {
  const { name, metric, baselineFile, budget = 0.1, direction = 'lower-better' } = opts;
  const value = await metric();
  const store = loadBaselines(baselineFile);
  if (!(name in store)) {
    store[name] = value;
    saveBaselines(baselineFile, store);
    return {
      name,
      value,
      baseline: value,
      delta: 0,
      budget,
      direction,
      seeded: true,
      regressed: false,
    };
  }
  const baseline = store[name];
  return {
    name,
    value,
    baseline,
    delta: value - baseline,
    budget,
    direction,
    seeded: false,
    regressed: isRegressed(value, baseline, budget, direction),
  };
}

/** 99th-percentile of numeric samples (load/latency facet). @param {number[]} samples @returns {number} */
function p99(samples) {
  if (!samples.length) return 0;
  const sorted = [...samples].sort((first, second) => first - second);
  return sorted[Math.min(sorted.length - 1, Math.ceil(PERCENTILE * sorted.length) - 1)];
}

/** Run fn count times concurrently (chaos/load facet). @param {Function} fn @param {number} count @returns {Promise<any[]>} */
function runConcurrent(fn, count) {
  return Promise.all(Array.from({ length: count }, (_unused, index) => fn(index)));
}

module.exports = { runBenchmark, p99, runConcurrent, isRegressed, loadBaselines };
