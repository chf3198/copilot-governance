#!/usr/bin/env node
'use strict';
// harness-parity-replay-eval.js — replay-eval promotion gate for T3.1 parity matrix / T3.2 guardrail
// (#3454, Epic #3411 T3.4). Calibrates advisory→blocking promotion on PRECISION >= 0.85 (auto-revoking,
// NEVER calendar-gated — per #1771/#1827). Pure functions of corpus+classifier; re-computes every run.
// CLI: node scripts/global/harness-parity-replay-eval.js [--json] [--corpus=<path>]
// npm:  parity:replay-eval

const fs = require('node:fs');
const path = require('node:path');
const { scoreCorpus, detectDrift, PROMOTION_PRECISION } = require('./harness-parity-replay-eval-score');
const { auditRecord, isDisabled } = require('./harness-parity-replay-eval-audit');

const DEFAULT_CORPUS = path.join(__dirname, '..', '..', 'tests', 'eval', 'parity-matrix-corpus.json');
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function loadCorpus(filePath) {
  return JSON.parse(fs.readFileSync(filePath || DEFAULT_CORPUS, 'utf8'));
}

function printReport(result) {
  process.stdout.write(`parity-replay-eval: precision=${result.precision} recall=${result.recall}\n`);
  process.stdout.write(`  truePositives=${result.truePositives} falsePositives=${result.falsePositives}`);
  process.stdout.write(` falseNegatives=${result.falseNegatives} excluded=${result.excludedCount}\n`);
  process.stdout.write(result.promotionEligible
    ? `✓ promotion-eligible (precision >= ${PROMOTION_PRECISION})\n`
    : `⚠ not promotion-eligible (precision < ${PROMOTION_PRECISION}) — stay advisory\n`);
}

function runCli(argv, env) {
  if (isDisabled(env)) {
    process.stdout.write('parity-replay-eval: disabled (PARITY_REPLAY_DISABLED=1)\n');
    return 0;
  }
  const corpusArg = (argv.find((arg) => arg.startsWith('--corpus=')) || '').split('=')[1] || DEFAULT_CORPUS;
  const corpus = loadCorpus(corpusArg);
  const result = scoreCorpus(corpus, REPO_ROOT);
  if (argv.includes('--json')) {
    process.stdout.write(JSON.stringify(auditRecord(result, { ts: new Date().toISOString() }), null, 2) + '\n');
    return 0;
  }
  printReport(result);
  return 0;
}

if (require.main === module) { process.exit(runCli(process.argv.slice(2), process.env)); }

module.exports = {
  scoreCorpus, detectDrift, auditRecord, isDisabled, loadCorpus, runCli,
  DEFAULT_CORPUS, PROMOTION_PRECISION,
};
