#!/usr/bin/env node
// tier: 4
// batch-validator.js — HAMR Wave 6 child 4 (#944).
// Dry-run + opt-in live mode for Anthropic Batch API submission.
// Default: dry-run = $0 operator cost. Live mode requires --live --operator-approved.
'use strict';
require('./load-local-env').loadLocalEnvOnce();

const { submitBatch, pollBatch, isBatchEligible } = require('./anthropic-batch-router');

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const POLL_INTERVAL_MS = 30_000;
const MAX_WAIT_MS = 30 * 60 * 1000;

function buildSampleBatch() {
  return [{
    custom_id: `batch-validator-${Date.now()}`,
    params: {
      model: HAIKU_MODEL, max_tokens: 32,
      messages: [{ role: 'user', content: 'Say "ok" and stop.' }],
    },
  }];
}

function dryRun() {
  const requests = buildSampleBatch();
  const eligibility = isBatchEligible({ kind: 'wiki-anneal', deadlineMs: 24 * 60 * 60 * 1000 });
  return {
    mode: 'dry-run', operator_cost_usd: 0,
    requests, eligibility, would_submit_to: 'https://api.anthropic.com/v1/messages/batches',
    expected_request_count: requests.length, ok: eligibility.eligible,
  };
}

async function liveRun() {
  if (!process.env.ANTHROPIC_API_KEY) return { mode: 'live', ok: false, reason: 'ANTHROPIC_API_KEY not set' };
  const requests = buildSampleBatch();
  const submission = await submitBatch(requests);
  if (!submission.batch_id) return { mode: 'live', ok: false, reason: 'submit_returned_no_batch_id', submission };
  const polled = await pollBatch(submission.batch_id, { intervalMs: POLL_INTERVAL_MS, maxWaitMs: MAX_WAIT_MS });
  return {
    mode: 'live', operator_cost_usd_estimate: '<$0.0001 (1×32-token Haiku)',
    submission, polled, ok: polled.status === 'ended',
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--live') && !args.has('--operator-approved')) {
    console.error('--live requires --operator-approved (cost-gate enforced)');
    process.exit(1);
  }
  const result = args.has('--live') ? await liveRun() : dryRun();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

if (require.main === module) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}

module.exports = { dryRun, liveRun, buildSampleBatch };
