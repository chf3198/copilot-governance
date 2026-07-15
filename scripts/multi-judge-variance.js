#!/usr/bin/env node
// multi-judge-variance (#1814 AC3) — pure aggregation of N-judge results.
// Computes mean, stdev, agreement-coefficient, adversarial-dissent flag.
// Output shape feeds review-score-classifier.classify({confidence, agreement}).
'use strict';

const POSSIBLE_RANGE = 1.0;
const ADVERSARIAL_DISSENT_DELTA = 0.25;

function meanOf(scores) {
  if (!scores.length) return 0;
  return scores.reduce((sum, n) => sum + n, 0) / scores.length;
}

function stdevOf(scores) {
  if (scores.length < 2) return 0;
  const avg = meanOf(scores);
  const variance = scores.reduce((sum, n) => sum + (n - avg) ** 2, 0) / scores.length;
  return Math.sqrt(variance);
}

function agreementCoefficient(scores) {
  if (scores.length < 2) return 1.0;
  const stdev = stdevOf(scores);
  return Math.max(0, Math.min(1, 1 - stdev / POSSIBLE_RANGE));
}

function detectAdversarialDissent(judges) {
  const adv = judges.find(j => j.persona === 'adversarial');
  const consensus = judges.filter(j => j.persona !== 'adversarial');
  if (!adv || !consensus.length) return false;
  const consensusMean = meanOf(consensus.map(j => Number(j.score) || 0));
  const advScore = Number(adv.score) || 0;
  return (consensusMean - advScore) >= ADVERSARIAL_DISSENT_DELTA;
}

function aggregate(judges) {
  if (!Array.isArray(judges) || judges.length === 0) {
    return { mean: 0, stdev: 0, agreement: 1, judges: [], adversarial_dissent: false,
      family_count: 0, n: 0 };
  }
  const scores = judges.map(j => Number(j.score) || 0);
  const families = new Set(judges.map(j => j.family).filter(Boolean));
  return {
    mean: +meanOf(scores).toFixed(4),
    stdev: +stdevOf(scores).toFixed(4),
    agreement: +agreementCoefficient(scores).toFixed(4),
    n: judges.length,
    family_count: families.size,
    judges: judges.map(j => ({ family: j.family, persona: j.persona, score: j.score,
      model: j.model || null, rationale: j.rationale || null })),
    adversarial_dissent: detectAdversarialDissent(judges),
  };
}

function classifierInputsFromAggregate(agg) {
  return {
    mean: agg.mean,
    confidence: agg.agreement,
    agreement: agg.agreement,
    llmJudgeScore: agg.mean,
  };
}

module.exports = { aggregate, classifierInputsFromAggregate, meanOf, stdevOf,
  agreementCoefficient, detectAdversarialDissent, POSSIBLE_RANGE,
  ADVERSARIAL_DISSENT_DELTA };
