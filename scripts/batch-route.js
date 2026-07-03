#!/usr/bin/env node
// batch-route.js — Stage 4 (#1067). One-call Batch routing helper.
// Pattern: routeWithBatch(opts, syncFn, batchRequests) — if eligible by
// isBatchEligible({kind, deadlineMs}), submits via Anthropic Batch API
// (50% discount, async); else calls syncFn (sync provider call).
'use strict';

const { submitBatch, pollBatch, isBatchEligible } = require('./anthropic-batch-router');

const DEFAULT_DEADLINE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_POLL_MS = 30_000;
const DEFAULT_MAX_WAIT_MS = 30 * 60 * 1000;
const DEFAULT_BATCH_DISCOUNT = 0.5;

function isAsyncEligibleWorkItem(item) {
  const base = isBatchEligible({ kind: item.kind, deadlineMs: item.deadlineMs });
  if (!base.eligible) return { eligible: false, reason: base.reason };
  if (item.latencySensitive) return { eligible: false, reason: 'latency_sensitive' };
  return { eligible: true, reason: 'async_eligible' };
}

function summarizeAsyncBatchConversion(items = []) {
  const judged = items.map((item) => isAsyncEligibleWorkItem(item));
  const eligibleCount = judged.filter((r) => r.eligible).length;
  const total = items.length || 1;
  return { totalItems: items.length, eligibleCount,
    conversionRate: +(eligibleCount / total).toFixed(3) };
}

function estimateBlendedSavings(conversionRate, batchDiscount = DEFAULT_BATCH_DISCOUNT) {
  const rate = Math.max(0, Math.min(1, Number(conversionRate) || 0));
  const discount = Math.max(0, Math.min(1, Number(batchDiscount) || 0));
  return +(rate * discount).toFixed(3);
}

/** Route work through Anthropic Batch when eligible; else fall back to sync.
 * @param {object} opts - { kind, deadlineMs, pollIntervalMs, maxWaitMs }.
 * @param {Function} syncFn - Async function returning sync provider call result.
 * @param {Array} batchRequests - Anthropic Batch payload (only used if eligible).
 * @returns {Promise<{route, ok, ...result}>}
 */
async function routeWithBatch(opts, syncFn, batchRequests = null) {
  const eligible = isBatchEligible({
    kind: opts.kind,
    deadlineMs: opts.deadlineMs ?? DEFAULT_DEADLINE_MS,
  });
  if (!eligible.eligible || !batchRequests || batchRequests.length === 0) {
    const result = await syncFn();
    return { route: 'sync', ok: true, result, eligibility: eligible };
  }
  const submission = await submitBatch(batchRequests);
  if (!submission.batch_id) {
    const result = await syncFn();
    return { route: 'sync_after_batch_fail', ok: true, result,
      submission_error: submission };
  }
  const polled = await pollBatch(submission.batch_id, {
    intervalMs: opts.pollIntervalMs ?? DEFAULT_POLL_MS,
    maxWaitMs: opts.maxWaitMs ?? DEFAULT_MAX_WAIT_MS,
  });
  return { route: 'batch', ok: polled.status === 'ended',
    submission, polled, eligibility: eligible };
}

if (require.main === module) {
  // Smoke: route a wiki-anneal-shaped op (eligible) without batchRequests → sync fallback
  routeWithBatch({ kind: 'wiki-anneal', deadlineMs: 24 * 60 * 60 * 1000 },
    async () => ({ smoke: true })).then(r => console.log(JSON.stringify(r, null, 2)));
}

module.exports = { routeWithBatch, DEFAULT_DEADLINE_MS,
  isAsyncEligibleWorkItem, summarizeAsyncBatchConversion, estimateBlendedSavings };
