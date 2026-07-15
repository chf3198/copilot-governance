#!/usr/bin/env node
'use strict';
// harness-parity-replay-eval-score.js — scoreCorpus + detectDrift helpers (#3454, Epic #3411 T3.4)
// Imported by harness-parity-replay-eval.js. Pure functions of their inputs (auto-revoking).

const { probeCell, VERDICT } = require('./harness-parity-matrix');

const PROMOTION_PRECISION = 0.85;
const EXCLUDED_LABEL = 'legit-waiver-excluded';
const POSITIVE_VERDICTS = new Set([VERDICT.DECLARED_FULL_BUT_MISSING, VERDICT.NA_WITHOUT_SUBSTITUTE]);

// Build a synthetic feature + runtime pair from a corpus cell descriptor.
function buildProbeArgs(cell) {
  const ssotFiles = Array.isArray(cell.ssotFiles) ? cell.ssotFiles : [];
  const perRuntime = {};
  const runtimeName = cell.runtime || 'claude-code';
  const cellEntry = { status: cell.declaredStatus || 'unverified' };
  if (cell.hasSubstituteTest && cell.substituteTest) cellEntry.substituteTest = cell.substituteTest;
  perRuntime[runtimeName] = cellEntry;
  return [
    { id: cell.featureId || 'unknown', name: cell.featureId || 'unknown',
      layer: 'L1-identity-signing', parity: 'yes', ssotFiles, perRuntime },
    runtimeName,
  ];
}

// Flag a sample: true when the probe verdict is a FAIL verdict.
function probeFlags(sample, repoRoot) {
  const [feature, runtime] = buildProbeArgs(sample.cell || {});
  try { return POSITIVE_VERDICTS.has(probeCell(feature, runtime, repoRoot).verdict); }
  catch (_err) { return false; }
}

/**
 * Score the corpus. Excludes legit-waiver-excluded samples from precision denominator.
 * "Positive" = the probe flags the cell (verdict is a FAIL verdict).
 * "genuine-lowering" samples are the true positives we want to catch.
 * @param {object[]} corpus array of labeled sample objects.
 * @param {string} [repoRoot] optional repo root for ssotFile resolution.
 * @returns {{precision, recall, truePositives, falsePositives, falseNegatives, excludedCount, promotionEligible}}
 */
function scoreCorpus(corpus, repoRoot) {
  const samples = Array.isArray(corpus) ? corpus : [];
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  let excludedCount = 0;
  for (const sample of samples) {
    if (sample.label === EXCLUDED_LABEL) { excludedCount += 1; continue; }
    const flagged = probeFlags(sample, repoRoot);
    const isRealGap = sample.label === 'genuine-lowering';
    if (flagged && isRealGap) truePositives += 1;
    else if (flagged && !isRealGap) falsePositives += 1;
    else if (!flagged && isRealGap) falseNegatives += 1;
  }
  const precisionDenom = truePositives + falsePositives;
  const recallDenom = truePositives + falseNegatives;
  const precision = precisionDenom ? Number((truePositives / precisionDenom).toFixed(4)) : 1;
  const recall = recallDenom ? Number((truePositives / recallDenom).toFixed(4)) : 1;
  return { precision, recall, truePositives, falsePositives, falseNegatives,
    excludedCount, promotionEligible: precision >= PROMOTION_PRECISION };
}

/**
 * Detect under-flagging drift across a sample set (unlabeled PRs or cells).
 * @param {object[]} samples array of {cell} objects (no label needed).
 * @param {string} [repoRoot] optional repo root for ssotFile resolution.
 * @returns {{total, underFlagged, driftRate, items}}
 */
function detectDrift(samples, repoRoot) {
  const items = [];
  for (const sample of samples || []) {
    if (probeFlags(sample, repoRoot)) items.push(sample);
  }
  const total = (samples || []).length;
  return { total, underFlagged: items.length,
    driftRate: total ? Number((items.length / total).toFixed(4)) : 0, items };
}

module.exports = { scoreCorpus, detectDrift, PROMOTION_PRECISION, EXCLUDED_LABEL, probeFlags };
