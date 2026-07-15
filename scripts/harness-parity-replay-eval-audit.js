#!/usr/bin/env node
'use strict';
// harness-parity-replay-eval-audit.js — auditRecord + rollback helpers (#3454, Epic #3411 T3.4).
// Imported by harness-parity-replay-eval.js. Mirrors test-floor-classifier.js auditRecord pattern.

const AUDIT_SCHEMA = 'parity-replay-audit-v1';

/**
 * Build a versioned audit record from a scoreCorpus() result.
 * The caller supplies `ts` so this module stays pure (no Date.now() inside).
 * @param {object} result output of scoreCorpus().
 * @param {{ts?: string, ticket?: number}} [meta] caller-supplied metadata.
 * @returns {object} stable-shape audit record (schema: parity-replay-audit-v1).
 */
function auditRecord(result, meta) {
  const safeMeta = meta && typeof meta === 'object' ? meta : {};
  return {
    schema: AUDIT_SCHEMA,
    ts: safeMeta.ts || null,
    ticket: safeMeta.ticket || null,
    precision: result.precision,
    recall: result.recall,
    truePositives: result.truePositives,
    falsePositives: result.falsePositives,
    falseNegatives: result.falseNegatives,
    excludedCount: result.excludedCount,
    promotionEligible: result.promotionEligible,
  };
}

/**
 * Rollback gate: PARITY_REPLAY_DISABLED=1 turns the advisory tool into a no-op.
 * @param {object} [env] environment object (defaults to process.env).
 * @returns {boolean} true when the tool is disabled.
 */
function isDisabled(env) {
  const safeEnv = env && typeof env === 'object' ? env : process.env;
  return safeEnv.PARITY_REPLAY_DISABLED === '1';
}

module.exports = { auditRecord, isDisabled, AUDIT_SCHEMA };
