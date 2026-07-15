#!/usr/bin/env node
'use strict';
// lint-coverage-metric — Epic #1510 Phase-1j. Reads the practice coverage
// manifest and emits {covered, uncovered, percent} stats. Manifest-driven
// for honest measurement: every documented coding practice gets an
// explicit mapping to a lint rule, an "instruction-only" deferral, or a
// "model-judgment"/"tool-enforced" classification.
//
// Pure-function core: takes the parsed manifest, returns the metric.
// CLI wrapper at bottom reads inventory/coding-practice-coverage.json.

const fs = require('fs');
const path = require('path');

const MANIFEST_PATH = path.resolve(__dirname, '..', '..', 'inventory', 'coding-practice-coverage.json');
const ENFORCED_STATUSES = ['lint-enforced', 'tool-enforced'];

function computeCoverage(manifest) {
  const practices = manifest.practices || [];
  const total = practices.length;
  const enforced = practices.filter((p) => ENFORCED_STATUSES.includes(p.status));
  const instructionOnly = practices.filter((p) => p.status === 'instruction-only');
  const modelJudgment = practices.filter((p) => p.status === 'model-judgment');

  const lintableTotal = total - modelJudgment.length;
  const coverageOfLintable = lintableTotal === 0
    ? 0 : (enforced.length / lintableTotal) * 100;
  const coverageOfAll = total === 0 ? 0 : (enforced.length / total) * 100;

  return {
    total,
    enforced: enforced.length,
    instructionOnly: instructionOnly.length,
    modelJudgment: modelJudgment.length,
    coverageOfLintablePercent: Number(coverageOfLintable.toFixed(1)),
    coverageOfAllPercent: Number(coverageOfAll.toFixed(1)),
    uncoveredPracticeIds: instructionOnly.map((p) => p.id),
  };
}

function loadManifest(manifestPath = MANIFEST_PATH) {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`manifest not found at ${manifestPath}`);
  }
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}

function main(targetPercent = 70) {
  const manifest = loadManifest();
  const metric = computeCoverage(manifest);
  console.log(`lint-coverage-metric (Epic #1510):`);
  console.log(`  total practices         : ${metric.total}`);
  console.log(`  lint-or-tool enforced   : ${metric.enforced}`);
  console.log(`  instruction-only        : ${metric.instructionOnly}`);
  console.log(`  model-judgment (excluded): ${metric.modelJudgment}`);
  console.log(`  coverage (of lintable)  : ${metric.coverageOfLintablePercent}%`);
  console.log(`  coverage (of all)       : ${metric.coverageOfAllPercent}%`);
  console.log(`  target                  : ≥ ${targetPercent}%`);
  const meets = metric.coverageOfLintablePercent >= targetPercent;
  console.log(`  status                  : ${meets ? 'MEETS' : 'BELOW'} target`);
  if (!meets) {
    console.log(`  uncovered ids           : ${metric.uncoveredPracticeIds.join(', ')}`);
  }
  return { ...metric, target: targetPercent, meets };
}

if (require.main === module) {
  const result = main();
  process.exit(result.meets ? 0 : 1);
}

module.exports = { computeCoverage, loadManifest, main, MANIFEST_PATH, ENFORCED_STATUSES };
