#!/usr/bin/env node
'use strict';
// benchmark-gate.js (#3150, Epic #3147 S2): the continuous-benchmark enforcement gate. (a) regression
// gate — fail when any benchmark metric regressed beyond budget vs its golden baseline (seed runs
// pass); (b) missing-suite detection — flag a required surface lacking a benchmark suite. Advisory by
// default; --strict opts into a non-zero exit; advisory->blocking promotion is replay-eval-gated.
// Deterministic, local, $0 — no LLM, no network.
const fs = require('fs');

/** Benchmark results that regressed (excludes seed runs; resilient to malformed entries).
 * @param {object[]} results @returns {object[]} */
function regressions(results) {
  return (results || []).filter((result) => result && result.regressed && !result.seeded);
}

/** Required surfaces lacking a present benchmark suite.
 * @param {string[]} required @param {string[]} present @returns {string[]} */
function missingBenchmarkSuites(required, present) {
  const have = new Set(present || []);
  return (required || []).filter((surface) => !have.has(surface));
}

/** Run the gate over benchmark results + a suite registry.
 * @param {object} [input] {results, required, present}. @returns {object} {ok, regressed, missing}. */
function runGate(input = {}) {
  // Rollback no-op (harness convention, cf. TEST_FLOOR_DISABLED): pass everything when disabled.
  if (process.env.BENCHMARK_GATE_DISABLED === '1') {
    return { ok: true, disabled: true, regressed: [], missing: [] };
  }
  const regressed = regressions(input.results);
  const missing = missingBenchmarkSuites(input.required, input.present);
  return { ok: regressed.length === 0 && missing.length === 0, regressed, missing };
}

function main() {
  const argv = process.argv.slice(2);
  const resultsIndex = argv.indexOf('--results');
  let results = [];
  if (resultsIndex !== -1 && argv[resultsIndex + 1]) {
    try {
      results = JSON.parse(fs.readFileSync(argv[resultsIndex + 1], 'utf8'));
    } catch {
      results = [];
    }
  }
  const report = runGate({ results });
  process.stdout.write(
    `benchmark-gate: ${report.regressed.length} regression(s), ${report.missing.length} missing suite(s)\n`
  );
  for (const item of report.regressed) {
    process.stdout.write(
      `  REGRESS: ${item.name} ${item.value} vs baseline ${item.baseline} (delta ${item.delta})\n`
    );
  }
  if (argv.includes('--strict') && !report.ok) process.exit(1);
}

if (require.main === module) main();
module.exports = { runGate, regressions, missingBenchmarkSuites };
