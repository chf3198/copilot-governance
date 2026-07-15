'use strict';
// backlog-drift-replay-eval (#3423, Epic #3398 C5) — the REPLAY-EVAL promotion gate
// for the backlog-drift guardrail (C2 #3420 supersession detection + C3 #3421
// routing). Scores supersession precision + false-supersede-rate against a labeled
// corpus and reports `promotionEligible`, so the advisory→blocking flip is gated on
// measured accuracy — NEVER a calendar threshold (Epic #1771/#1827 lesson). $0 and
// deterministic: the predictor is an evidence-coverage proxy, no model call. Counsel
// R4: a wrong cancel is the costly error, so false-supersede-rate is tracked and
// bounded explicitly. Human-in-loop for P1/Epic cancels holds until the margin is met.
const fs = require('node:fs');
const path = require('node:path');

const CORPUS_FILE = path.join(__dirname, '..', '..', 'tests', 'fixtures', 'backlog-drift-corpus.jsonl');
const COVERAGE_THRESHOLD = 0.4; // goal-coverage needed before a superseded prediction
const PRECISION_FLOOR = 0.85; // AC2 promotion floor
const FALSE_SUPERSEDE_CEIL = 0.05; // AC2 costly-error ceiling
const STOPWORDS = new Set(['the', 'and', 'for', 'into', 'with', 'from', 'that', 'this', 'per']);

function tokenize(text) {
  return new Set(String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter((tok) => tok.length >= 3 && !STOPWORDS.has(tok)));
}

// Fraction of the goal's content tokens that appear in the shipped-artifact evidence.
function goalCoverage(sample) {
  const goal = tokenize(sample && sample.goal_text);
  if (!goal.size) return 0;
  const artifacts = tokenize((Array.isArray(sample.shipped_artifacts) ? sample.shipped_artifacts : []).map((art) => art && art.summary).join(' '));
  let hit = 0;
  for (const tok of goal) if (artifacts.has(tok)) hit += 1;
  return hit / goal.size;
}

// Deterministic supersession prediction: shipped evidence exists AND it covers the goal.
function predict(sample, threshold = COVERAGE_THRESHOLD) {
  const hasEvidence = Array.isArray(sample && sample.shipped_artifacts) && sample.shipped_artifacts.length > 0;
  const coverage = goalCoverage(sample);
  return { superseded: hasEvidence && coverage >= threshold, coverage, confidence: coverage };
}

// Precision + false-supersede-rate over the labeled corpus.
function evaluate(samples, opts = {}) {
  const threshold = typeof opts.threshold === 'number' ? opts.threshold : COVERAGE_THRESHOLD;
  const rows = Array.isArray(samples) ? samples : [];
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const sample of rows) {
    const pred = predict(sample, threshold).superseded;
    const truth = sample.ground_truth_superseded === true;
    if (pred && truth) tp += 1;
    else if (pred && !truth) fp += 1;
    else if (!pred && truth) fn += 1;
    else tn += 1;
  }
  const total = rows.length || 1;
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const falseSupersedeRate = fp / total; // costly-error rate (counsel R4)
  return { n: rows.length, tp, fp, fn, tn, precision, recall, falseSupersedeRate };
}

// AC2 promotion decision — precision floor AND false-supersede ceiling. No calendar.
function promotionDecision(result) {
  const eligible = result.precision >= PRECISION_FLOOR && result.falseSupersedeRate <= FALSE_SUPERSEDE_CEIL;
  return {
    eligible,
    reason: eligible
      ? `precision ${result.precision.toFixed(3)} ≥ ${PRECISION_FLOOR} AND false-supersede ${result.falseSupersedeRate.toFixed(3)} ≤ ${FALSE_SUPERSEDE_CEIL}`
      : `not eligible: precision ${result.precision.toFixed(3)} / false-supersede ${result.falseSupersedeRate.toFixed(3)} vs floor ${PRECISION_FLOOR} / ceil ${FALSE_SUPERSEDE_CEIL}`,
    precision: result.precision, falseSupersedeRate: result.falseSupersedeRate,
  };
}

// AC3: a flagged P1/Epic cancel needs human review UNTIL the safety margin is met.
function humanGateRequired(result, item = {}) {
  const marginMet = promotionDecision(result).eligible;
  const irreversibleClass = item.priority === 'P1' || item.isEpic === true;
  return !marginMet && irreversibleClass ? true : !marginMet ? 'advisory-until-margin' : false;
}

// AC3 optional: conformal-style uncertainty demotion — low-confidence → advisory.
function conformalDemote(confidence, tau = COVERAGE_THRESHOLD) {
  return typeof confidence === 'number' && confidence < tau ? 'advisory' : 'apply';
}

function auditRecord(result, opts = {}) {
  const decision = promotionDecision(result);
  return {
    ts: opts.ts || null, version: 3, service: 'backlog-drift-replay-eval', env: opts.env || 'ci',
    event: 'replay-eval', schema: 'backlog-drift-replay-eval-v1',
    n: result.n, precision: result.precision, recall: result.recall,
    false_supersede_rate: result.falseSupersedeRate, promotion_eligible: decision.eligible,
    _summary: `replay-eval n=${result.n} precision=${result.precision.toFixed(3)} eligible=${decision.eligible}`,
  };
}

function loadCorpus(file = CORPUS_FILE) {
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function run() {
  const result = evaluate(loadCorpus());
  const report = { ...result, promotion: promotionDecision(result) };
  console.log(JSON.stringify(report, null, 2));
  return report;
}

module.exports = {
  CORPUS_FILE, COVERAGE_THRESHOLD, PRECISION_FLOOR, FALSE_SUPERSEDE_CEIL,
  tokenize, goalCoverage, predict, evaluate, promotionDecision, humanGateRequired,
  conformalDemote, auditRecord, loadCorpus, run,
};

if (require.main === module) run();
