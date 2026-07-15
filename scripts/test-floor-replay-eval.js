#!/usr/bin/env node
// test-floor-replay-eval (#3105, Epic #1948 Phase-1 P1.3+P1.4). Calibrates the
// test-floor-classifier (#3098) against a LABELED corpus to gate its advisory→blocking
// promotion (replay-eval over calendar, per #1771/#1827), and detects systemic
// under-declaration drift across a sample set. Pure functions of their inputs.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { reconcile } = require('./test-floor-classifier');

// Promotion threshold: the classifier may flip advisory→blocking only when its precision
// against the historical corpus reaches this floor (Epic #1875 replay-eval-gated model).
const PROMOTION_PRECISION = 0.85;
const DEFAULT_CORPUS = path.join(__dirname, '..', '..', 'tests', 'fixtures', 'test-floor-corpus.json');

/** "Positive" = the classifier flags a floor gap (meetsFloor === false). */
function flagsGap(declared, paths) { return !reconcile(declared, paths || []).meetsFloor; }

/**
 * Replay the classifier over a labeled corpus and score precision/recall.
 * Each item: { paths: string[], declared: string, expectedMeetsFloor: boolean }.
 * @param {object[]} corpus labeled cases.
 * @returns {{n, truePos, falsePos, trueNeg, falseNeg, precision, recall, promotionEligible}}
 */
function replayEval(corpus) {
  const counts = { truePos: 0, falsePos: 0, trueNeg: 0, falseNeg: 0 };
  for (const item of corpus || []) {
    const predictedGap = flagsGap(item.declared, item.paths);
    const actualGap = item.expectedMeetsFloor === false;
    if (predictedGap && actualGap) counts.truePos += 1;
    else if (predictedGap && !actualGap) counts.falsePos += 1;
    else if (!predictedGap && !actualGap) counts.trueNeg += 1;
    else counts.falseNeg += 1;
  }
  const precisionDenom = counts.truePos + counts.falsePos;
  const recallDenom = counts.truePos + counts.falseNeg;
  const precision = precisionDenom ? counts.truePos / precisionDenom : 1;
  const recall = recallDenom ? counts.truePos / recallDenom : 1;
  return {
    n: (corpus || []).length, ...counts,
    precision: Number(precision.toFixed(4)), recall: Number(recall.toFixed(4)),
    promotionEligible: precision >= PROMOTION_PRECISION,
  };
}

/**
 * Detect under-declaration drift across a set of {paths, declared} samples.
 * @param {object[]} samples unlabeled samples (e.g. recent PRs).
 * @returns {{total, belowFloor, driftRate, items}}
 */
function detectDrift(samples) {
  const items = [];
  for (const sample of samples || []) {
    const result = reconcile(sample.declared, sample.paths || []);
    if (!result.meetsFloor) items.push({ ...sample, gaps: result.gaps });
  }
  const total = (samples || []).length;
  return { total, belowFloor: items.length, driftRate: total ? Number((items.length / total).toFixed(4)) : 0, items };
}

function loadCorpus(file = DEFAULT_CORPUS) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function runCli(argv) {
  const file = (argv.find((a) => a.startsWith('--corpus=')) || '').split('=')[1] || DEFAULT_CORPUS;
  const result = replayEval(loadCorpus(file));
  if (argv.includes('--json')) { process.stdout.write(JSON.stringify(result, null, 2) + '\n'); return 0; }
  process.stdout.write(`replay-eval over ${result.n} cases: precision=${result.precision} recall=${result.recall}\n`);
  process.stdout.write(result.promotionEligible
    ? `✓ promotion-eligible (precision >= ${PROMOTION_PRECISION})\n`
    : `⚠ not promotion-eligible (precision < ${PROMOTION_PRECISION}) — stay advisory\n`);
  return 0;
}

if (require.main === module) { process.exit(runCli(process.argv.slice(2))); }

module.exports = { PROMOTION_PRECISION, DEFAULT_CORPUS, flagsGap, replayEval, detectDrift, loadCorpus, runCli };
