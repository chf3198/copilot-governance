#!/usr/bin/env node
// tier: 4
// anthropic-batch-router.js — HAMR Wave 4 child 9 (#927).
// Routes non-time-critical work (research, wiki anneal) to Anthropic Batch API
// (50% off + bypasses online quotas) per v3.2 §R5 + v3.2.1.
'use strict';
require('./load-local-env').loadLocalEnvOnce();

const ANTHROPIC_BATCH_URL = 'https://api.anthropic.com/v1/messages/batches';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_BATCH_REQUESTS = 100000; // Anthropic Batch API limit per batch
const POLL_DEFAULT_MS = 30_000;
const ERR_BODY_TRIM = 200;
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

function authHeaders(apiKey) {
  return {
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    'content-type': 'application/json',
  };
}

/** Submit a Batch API request. Each item: { custom_id, params }.
 * @param {Array<{custom_id: string, params: object}>} requests - Batch requests.
 * @param {object} [opts] - { apiKey }.
 * @returns {Promise<{batch_id: string, status: string, request_counts: object}>} Batch handle.
 */
async function submitBatch(requests, opts = {}) {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  if (!Array.isArray(requests) || requests.length === 0) throw new Error('requests must be non-empty array');
  if (requests.length > MAX_BATCH_REQUESTS) throw new Error(`max ${MAX_BATCH_REQUESTS} requests per batch`);
  const body = { requests };
  const resp = await fetch(ANTHROPIC_BATCH_URL, { method: 'POST', headers: authHeaders(apiKey), body: JSON.stringify(body) });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`batch submit ${resp.status}: ${JSON.stringify(data).slice(0, ERR_BODY_TRIM)}`);
  return { batch_id: data.id, status: data.processing_status, request_counts: data.request_counts };
}

/** Poll batch status until terminal (ended/canceled/expired/failed).
 * @param {string} batchId - Batch ID from submitBatch.
 * @param {object} [opts] - { apiKey, intervalMs, maxWaitMs }.
 * @returns {Promise<{batch_id: string, status: string, results_url?: string}>} Batch state.
 */
async function pollBatch(batchId, opts = {}) {
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  const interval = opts.intervalMs ?? POLL_DEFAULT_MS;
  const deadline = Date.now() + (opts.maxWaitMs ?? 24 * 60 * 60 * 1000);
  while (Date.now() < deadline) {
    const resp = await fetch(`${ANTHROPIC_BATCH_URL}/${batchId}`, { headers: authHeaders(apiKey) });
    const data = await resp.json();
    if (!resp.ok) throw new Error(`batch poll ${resp.status}: ${JSON.stringify(data).slice(0, ERR_BODY_TRIM)}`);
    if (data.processing_status === 'ended') return { batch_id: batchId, status: 'ended', results_url: data.results_url };
    if (['canceled', 'expired', 'failed'].includes(data.processing_status)) {
      return { batch_id: batchId, status: data.processing_status };
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
  return { batch_id: batchId, status: 'timeout' };
}

/** Decide whether work is batch-eligible. Non-time-critical = wiki anneal,
 * research summaries, periodic compression-quality re-evaluation.
 * @param {{kind: string, deadlineMs?: number}} workItem - Work descriptor.
 * @returns {{eligible: boolean, reason: string}} Decision.
 */
function isBatchEligible(workItem) {
  const eligibleKinds = new Set(['wiki-anneal', 'research-summary', 'rule-coverage-stage2b', 'bundle-rebuild']);
  if (!eligibleKinds.has(workItem.kind)) return { eligible: false, reason: 'kind_not_eligible' };
  // Batch SLA is up to 24 h; only route when deadline is at least 6 h out.
  if (workItem.deadlineMs && workItem.deadlineMs < 6 * 60 * 60 * 1000) {
    return { eligible: false, reason: 'deadline_too_close' };
  }
  return { eligible: true, reason: 'time-elastic' };
}

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'eligible') {
    const work = { kind: process.argv[3], deadlineMs: parseInt(process.argv[4] || '0', 10) || undefined };
    console.log(JSON.stringify(isBatchEligible(work)));
  } else if (cmd === 'submit-test') {
    const requests = [{ custom_id: 'test-1', params: { model: HAIKU_MODEL, max_tokens: 32, messages: [{ role: 'user', content: 'hi' }] } }];
    submitBatch(requests).then((r) => console.log(JSON.stringify(r, null, 2))).catch((e) => { console.error(e.message); process.exit(1); });
  } else {
    console.error('usage: anthropic-batch-router.js <eligible|submit-test> [...]');
    process.exit(1);
  }
}

module.exports = { submitBatch, pollBatch, isBatchEligible, MAX_BATCH_REQUESTS, ANTHROPIC_BATCH_URL };
