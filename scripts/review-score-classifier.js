#!/usr/bin/env node
// review-score-classifier (#1749) — wraps rubric-score.js mean output in the
// 5-band tier system specified by docs/design/review-score-contract-v1.md (#1748).
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { scoreRubric, DEFAULT_RUBRIC } = require('./rubric-score');

const POLICY_VERSION = process.env.MEGINGJORD_REVIEW_SCORE_POLICY_VERSION || '2026-05-17';
const DEFAULT_CONF_THRESHOLD = Number(process.env.MEGINGJORD_REVIEW_SCORE_CONF_MIN || '0.85');
const DEFAULT_AGREE_THRESHOLD = Number(process.env.MEGINGJORD_REVIEW_SCORE_AGREE_MIN || '0.85');

const BANDS = [
  { letter: 'A', minScore: 90, tier: 0, action: 'none' },
  { letter: 'B', minScore: 80, tier: 1, action: 'log-tier1-event' },
  { letter: 'C', minScore: 70, tier: 2, action: 'file-tier2-followon-p3' },
  { letter: 'D', minScore: 60, tier: 2, action: 'file-tier2-followon-p2' },
  { letter: 'F', minScore: 0,  tier: 3, action: 'file-tier3-self-anneal-p1' },
];

function meanToScore100(mean) {
  return Math.round(Number(mean) * 10);
}

function bandFor(score) {
  return BANDS.find(b => score >= b.minScore) || BANDS[BANDS.length - 1];
}

function classify(mean, opts = {}) {
  const { confidence = null, agreement = null, llmJudgeScore = null } = opts;
  const score = meanToScore100(mean);
  const band = bandFor(score);
  const requiresHighConfidence = band.tier === 3;
  const confidenceOk = !requiresHighConfidence
    || (confidence !== null && confidence >= DEFAULT_CONF_THRESHOLD);
  const agreementOk = !requiresHighConfidence
    || agreement === null
    || agreement >= DEFAULT_AGREE_THRESHOLD;
  const action = (confidenceOk && agreementOk) ? band.action : 'log-tier1-event-low-confidence';
  return {
    score, mean: Number(mean), band: band.letter, tier: band.tier, action,
    policy_version: POLICY_VERSION,
    rubric_version: 'g1-g9-v2',
    confidence, agreement, llm_judge_score: llmJudgeScore, provisional: false,
  };
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

function readText(file) { return file && fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''; }

function cli() {
  const rubricPath = arg('--rubric') || DEFAULT_RUBRIC;
  const rubric = JSON.parse(readText(rubricPath));
  const ctx = {
    trail: readText(arg('--trail')),
    diff: readText(arg('--diff')),
    closeout: readText(arg('--closeout')),
  };
  const rubricResult = scoreRubric(rubric, ctx);
  const conf = arg('--confidence'); const agree = arg('--agreement');
  const classification = classify(rubricResult.mean, {
    confidence: conf !== null ? Number(conf) : null,
    agreement: agree !== null ? Number(agree) : null,
  });
  const out = { classification, rubric: rubricResult };
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  } else {
    const c = classification;
    process.stdout.write(`band=${c.band} score=${c.score}/100 tier=${c.tier} action=${c.action}\n`);
    process.stdout.write(`rubric_version=${c.rubric_version} policy_version=${c.policy_version}\n`);
  }
  return 0;
}

if (require.main === module) process.exit(cli());

module.exports = {
  classify, meanToScore100, bandFor, BANDS, POLICY_VERSION,
  DEFAULT_CONF_THRESHOLD, DEFAULT_AGREE_THRESHOLD,
};
