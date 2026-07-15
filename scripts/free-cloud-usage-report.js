#!/usr/bin/env node
'use strict';
// free-cloud-usage-report.js (#2624): surface lane:free-cloud usage + estimated paid-spend avoided.
// Aggregates the telemetry emitted by #2621 (cascade-dispatch free-cloud executions) so the G3
// savings are operator-visible + auditable against the premium-share governor. Read-only report.
const { readTelemetry } = require('./model-routing-telemetry');
const policy = require('./model-routing-policy.json');

const DEFAULT_DAYS = 7;
// Documented estimate for a routing-lane task: ~1k input + ~0.5k output tokens.
const ASSUMED_TOKENS_PER_CALL = 1500;
const DEFAULT_HAIKU_COST_PER_1K = 0.00088;

/** Build the free-cloud usage report. @param {number} days @param {object[]|null} entries (test inject) */
function buildReport(days = DEFAULT_DAYS, entries = null) {
  const rows = (entries || readTelemetry(days)).filter((r) => r && r.lane === 'free-cloud');
  const byProvider = {};
  let latencySum = 0;
  let latencyCount = 0;
  for (const row of rows) {
    const provider = row.model || 'unknown';
    byProvider[provider] = (byProvider[provider] || 0) + 1;
    const lat = row.latencyMs ?? row.latency_ms;
    if (typeof lat === 'number') { latencySum += lat; latencyCount += 1; }
  }
  const executions = rows.length;
  const haikuCostPer1k = policy?.models?.haiku?.costPer1kTokens ?? DEFAULT_HAIKU_COST_PER_1K;
  const estPaidUsdAvoided = +(executions * (ASSUMED_TOKENS_PER_CALL / 1000) * haikuCostPer1k).toFixed(4);
  return {
    window_days: days,
    free_cloud_executions: executions,
    paid_haiku_calls_avoided: executions,
    per_provider: byProvider,
    avg_latency_ms: latencyCount ? Math.round(latencySum / latencyCount) : null,
    est_paid_usd_avoided: estPaidUsdAvoided,
    assumptions: { assumed_tokens_per_call: ASSUMED_TOKENS_PER_CALL, haiku_cost_per_1k: haikuCostPer1k },
  };
}

/** Render a report object as human-readable text. @param {object} report */
function formatReport(report) {
  return [
    `Free-cloud usage (last ${report.window_days}d):`,
    `  executions: ${report.free_cloud_executions} (= paid-Haiku calls avoided)`,
    `  per-provider: ${JSON.stringify(report.per_provider)}`,
    `  avg latency: ${report.avg_latency_ms ?? 'n/a'} ms`,
    `  est. paid $ avoided: $${report.est_paid_usd_avoided} ` +
      `(@ ${report.assumptions.assumed_tokens_per_call} tok/call, $${report.assumptions.haiku_cost_per_1k}/1k)`,
  ].join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const dayArg = args.indexOf('--days');
  const days = dayArg >= 0 ? Number(args[dayArg + 1]) || DEFAULT_DAYS : DEFAULT_DAYS;
  const report = buildReport(days);
  console.log(args.includes('--json') ? JSON.stringify(report, null, 2) : formatReport(report));
}

if (require.main === module) main();
module.exports = { buildReport, formatReport };
