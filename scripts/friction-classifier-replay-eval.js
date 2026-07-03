"use strict";
// friction-classifier-replay-eval (Epic #3380 / #3382): score the classifier against a labeled
// corpus. Promotion advisory->blocking is gated on precision >= 0.85 (NOT a calendar threshold),
// per Phase-0 #3381 Q6. Auto-revoking: precision below 0.85 reverts to advisory.
const fs = require("fs");
const path = require("path");
const { classifyFriction } = require("./friction-classifier");

const PRECISION_GATE = 0.85;
const DEFAULT_CORPUS = path.join(__dirname, "..", "..", "tests", "fixtures", "friction-corpus.json");

function evaluate(corpus, opts) {
  const samples = Array.isArray(corpus) ? corpus : (corpus.samples || []);
  let correct = 0;
  const target = "guardrail-candidate";
  let tp = 0, fp = 0, fn = 0;
  const misses = [];
  for (const sample of samples) {
    const got = classifyFriction(sample.record, opts).destination;
    const want = sample.expected;
    if (got === want) correct += 1;
    else misses.push({ id: sample.id, want, got });
    if (got === target && want === target) tp += 1;
    else if (got === target && want !== target) fp += 1;
    else if (got !== target && want === target) fn += 1;
  }
  const precision = tp + fp === 0 ? 1 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 1 : tp / (tp + fn);
  const accuracy = samples.length ? correct / samples.length : 0;
  return {
    n: samples.length, accuracy, precision, recall,
    guardrail_tp: tp, guardrail_fp: fp, guardrail_fn: fn,
    promotionEligible: precision >= PRECISION_GATE && accuracy >= PRECISION_GATE,
    promotion_state: precision >= PRECISION_GATE && accuracy >= PRECISION_GATE ? "blocking-eligible" : "advisory",
    misses,
  };
}

function loadCorpus(corpusPath) {
  return JSON.parse(fs.readFileSync(corpusPath || DEFAULT_CORPUS, "utf8"));
}

module.exports = { evaluate, loadCorpus, PRECISION_GATE };

if (require.main === module) {
  const result = evaluate(loadCorpus());
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.promotionEligible || process.argv.includes("--report") ? 0 : 1;
}
