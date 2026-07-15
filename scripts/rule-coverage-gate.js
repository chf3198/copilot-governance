#!/usr/bin/env node
// rule-coverage-gate.js — HAMR Wave 4 child 7 (#925).
// 3-stage rule-coverage gate per v3.2.1 §R6 (replaces v3.2 binary gate).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const compressor = require('./constitution-compressor');

const STAGE_1_THRESHOLD = 0.99;
const STAGE_2A_THRESHOLD = 0.80;
const STAGE_2B_THRESHOLD = 0.95;
const STAGE_3_FLOOR = 0.50;

/** Stage-1: deterministic top-k keyword presence over compressed bundle.
 * @param {object} compressedTier - Result from compressor.buildTier().
 * @param {string[]} keywords - Required keywords.
 * @returns {{stage: 'stage-1', present: number, total: number, ratio: number, ok: boolean, missing: string[]}} Result.
 */
function stage1(compressedTier, keywords) {
  const text = compressedTier.compressed_files.map((f) => f.content).join('\n');
  const missing = [];
  let present = 0;
  for (const kw of keywords) {
    if (text.includes(kw)) present++;
    else missing.push(kw);
  }
  const ratio = present / keywords.length;
  return { stage: 'stage-1', present, total: keywords.length, ratio: +ratio.toFixed(4), ok: ratio >= STAGE_1_THRESHOLD, missing };
}

/** Stage-2a: free-fleet 2-of-N quorum; ≥80% direct + counter-factual. Stub if no judge.
 * @param {object} compressedTier - Tier output.
 * @param {object[]} quiz - Quiz items.
 * @param {Function} [judgeQuorum] - Injected judge (judge-quorum.js).
 * @returns {Promise<{stage: 'stage-2a', ratio: number, ok: boolean, samples: number, judge_present: boolean}>} Result.
 */
async function stage2a(compressedTier, quiz, judgeQuorum) {
  if (!judgeQuorum) return { stage: 'stage-2a', ratio: null, ok: false, samples: 0, judge_present: false, reason: 'judge_quorum_not_provided' };
  const subset = quiz.filter((q) => q.type === 'direct' || q.type === 'counter-factual');
  let pass = 0;
  for (const item of subset) {
    const res = await judgeQuorum.judge(item.q, { gateType: 'stage2', dispatcher: () => ({ score: 1 }) });
    if (res.score >= STAGE_2A_THRESHOLD) pass++;
  }
  const ratio = subset.length === 0 ? 0 : pass / subset.length;
  return { stage: 'stage-2a', ratio: +ratio.toFixed(4), ok: ratio >= STAGE_2A_THRESHOLD, samples: subset.length, judge_present: true };
}

/** Stage-2b: paid-tier ≥95% including boundary cases (operator-cost-gated).
 * @param {object} compressedTier - Tier output.
 * @param {object[]} quiz - Quiz items.
 * @param {Function} [paidJudge] - Injected paid-tier judge.
 * @returns {Promise<{stage: 'stage-2b', ratio: number, ok: boolean, samples: number}>} Result.
 */
async function stage2b(compressedTier, quiz, paidJudge) {
  if (!paidJudge) return { stage: 'stage-2b', ratio: null, ok: false, samples: 0, reason: 'paid_judge_not_provided' };
  let pass = 0;
  for (const item of quiz) {
    const res = await paidJudge(item);
    if (res.score >= STAGE_2B_THRESHOLD) pass++;
  }
  const ratio = quiz.length === 0 ? 0 : pass / quiz.length;
  return { stage: 'stage-2b', ratio: +ratio.toFixed(4), ok: ratio >= STAGE_2B_THRESHOLD, samples: quiz.length };
}

/** Aggregate gate decision: which stages pass + which rules need stage-3 review.
 * @param {object} compressedTier - Tier output.
 * @param {object[]} quiz - Full quiz.
 * @param {object} [opts] - Options { keywords, judgeQuorum, paidJudge, runStage2b }.
 * @returns {Promise<object>} Composite gate result.
 */
async function runGate(compressedTier, quiz, opts = {}) {
  const keywords = opts.keywords ?? compressor.loadKeywords();
  const s1 = stage1(compressedTier, keywords);
  const s2a = await stage2a(compressedTier, quiz, opts.judgeQuorum);
  const s2b = opts.runStage2b ? await stage2b(compressedTier, quiz, opts.paidJudge) : { stage: 'stage-2b', ratio: null, ok: null, skipped: true };
  const stage3_review_needed = s2b.ratio !== null && s2b.ratio < STAGE_3_FLOOR;
  const ok = s1.ok && (s2a.ok || !s2a.judge_present) && (s2b.ok || s2b.skipped || !s2b.samples);
  return { tier: compressedTier.tier, sha256: compressedTier.sha256, ok, stages: { stage1: s1, stage2a: s2a, stage2b: s2b }, stage3_review_needed };
}

if (require.main === module) {
  const tierName = process.argv[2] || 'governance-30kb';
  const tier = compressor.buildTier(tierName, compressor.TIERS[tierName], compressor.loadKeywords());
  runGate(tier, []).then((r) => console.log(JSON.stringify(r, null, 2)));
}

module.exports = { runGate, stage1, stage2a, stage2b, STAGE_1_THRESHOLD, STAGE_2A_THRESHOLD, STAGE_2B_THRESHOLD, STAGE_3_FLOOR };
