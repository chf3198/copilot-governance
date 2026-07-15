'use strict';
// Refs #3329 / Epic #1299 — replay-eval for the ac-suggest measurability backstop (AC5).
// Scores classifyMeasurability against a labeled corpus. NOT calendar-gated: the advisory→blocking
// promotion is precision/FP-rate-gated against the corpus (per test-methodology-matrix, Epic
// #1771/#1827 — replay-eval over calendar waits). Cross-family review (#1302) asked for recall and
// true-negative-rate alongside FP-rate; all four are reported.

const fs = require('fs');
const path = require('path');
const { classifyMeasurability } = require('./ac-suggest');

const CORPUS = process.env.AC_SUGGEST_CORPUS ||
  path.join(__dirname, '..', '..', 'tests', 'fixtures', 'ac-suggest-corpus.json');

const FP_RATE_BAR = 0.05; // AC5: <5% false-positive rate

function score(samples) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  const errors = [];
  for (const sample of samples) {
    const predicted = classifyMeasurability(sample.text).measurable;
    const actual = !!sample.measurable;
    if (predicted && actual) tp++;
    else if (predicted && !actual) { fp++; errors.push({ type: 'FP', text: sample.text }); }
    else if (!predicted && !actual) tn++;
    else { fn++; errors.push({ type: 'FN', text: sample.text }); }
  }
  const predictedPositive = tp + fp;
  const fpRate = predictedPositive ? fp / predictedPositive : 0; // FP among accepted (AC5 metric)
  const precision = predictedPositive ? tp / predictedPositive : 1;
  const recall = (tp + fn) ? tp / (tp + fn) : 1;
  const tnRate = (tn + fp) ? tn / (tn + fp) : 1;
  return {
    total: samples.length, tp, fp, tn, fn,
    fpRate: +fpRate.toFixed(4), precision: +precision.toFixed(4),
    recall: +recall.toFixed(4), trueNegativeRate: +tnRate.toFixed(4),
    fpRateBar: FP_RATE_BAR, meetsBar: fpRate < FP_RATE_BAR, errors,
  };
}

function loadCorpus(file) {
  const data = JSON.parse(fs.readFileSync(file || CORPUS, 'utf8'));
  return Array.isArray(data) ? data : data.samples || [];
}

function run(file) { return score(loadCorpus(file)); }

module.exports = { score, run, loadCorpus, FP_RATE_BAR, CORPUS };

if (require.main === module) {
  const json = process.argv.includes('--json');
  const result = run();
  if (json) { process.stdout.write(JSON.stringify(result, null, 2) + '\n'); }
  else {
    process.stdout.write(`ac-suggest replay-eval: ${result.total} samples\n` +
      `  precision=${result.precision} recall=${result.recall} TN-rate=${result.trueNegativeRate}\n` +
      `  FP-rate=${result.fpRate} (bar <${result.fpRateBar}) → ${result.meetsBar ? 'PASS' : 'FAIL'}\n`);
    if (result.errors.length) process.stdout.write('  misses: ' + JSON.stringify(result.errors) + '\n');
  }
  process.exit(result.meetsBar ? 0 : 1);
}
