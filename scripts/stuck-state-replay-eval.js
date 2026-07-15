#!/usr/bin/env node
'use strict';
// stuck-state-replay-eval.js — #3748. Calibrates the stuck-state-detector (#3748) against a LABELED
// corpus to gate its advisory→blocking promotion (replay-eval over calendar, per #1771/#1827) and to
// bound the false-positive rate. Pure functions of their inputs; the CLI is a thin wrapper.
const fs = require('node:fs');
const path = require('node:path');
const { detectStuckState } = require('./stuck-state-detector');

// The detector may flip advisory→blocking only when precision against the corpus reaches this floor.
const PROMOTION_PRECISION = 0.85;
const DEFAULT_CORPUS = path.join(__dirname, '..', '..', 'tests', 'fixtures', 'stuck-state-corpus.json');

/**
 * Score the detector over a labeled corpus. Positive = detector fires (stuck===true); label 'stuck'
 * = it should fire. The confusion cell is selected without a 4-way branch (keeps complexity low).
 * @param {Array} samples corpus rows ({signals, label})
 * @param {object} [opts] threshold overrides forwarded to detectStuckState
 * @returns {object} {total, tp, fp, fn, tn, precision, recall, falsePositiveRate, promotionEligible}
 */
function scoreCorpus(samples, opts = {}) {
  const cells = { tp: 0, fp: 0, fn: 0, tn: 0 };
  for (const row of samples || []) {
    const fired = detectStuckState(row.signals || {}, opts).stuck;
    const should = row.label === 'stuck';
    cells[fired ? (should ? 'tp' : 'fp') : (should ? 'fn' : 'tn')] += 1;
  }
  const div = (numer, denom, dflt) => (denom ? numer / denom : dflt);
  const precision = div(cells.tp, cells.tp + cells.fp, 1);
  return {
    total: (samples || []).length, ...cells,
    precision, recall: div(cells.tp, cells.tp + cells.fn, 1), falsePositiveRate: div(cells.fp, cells.fp + cells.tn, 0),
    promotionEligible: precision >= PROMOTION_PRECISION,
  };
}

/**
 * Load a corpus file (array form or {samples:[...]}).
 * @param {string} [file] corpus path; defaults to DEFAULT_CORPUS
 * @returns {Array} corpus rows
 */
function loadCorpus(file) {
  const parsed = JSON.parse(fs.readFileSync(file || DEFAULT_CORPUS, 'utf8'));
  return Array.isArray(parsed) ? parsed : parsed.samples || [];
}

module.exports = { scoreCorpus, loadCorpus, PROMOTION_PRECISION, DEFAULT_CORPUS };

if (require.main === module) {
  const file = process.argv.includes('--corpus') ? process.argv[process.argv.indexOf('--corpus') + 1] : DEFAULT_CORPUS;
  const result = scoreCorpus(loadCorpus(file));
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.promotionEligible ? 0 : 2);
}
