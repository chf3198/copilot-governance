#!/usr/bin/env node
'use strict';
// Baseline routing report: reads telemetry and outputs tier distribution + cost analysis.
// Usage: node scripts/global/routing-baseline-report.js [--days N] [--json]

const { readTelemetry, summarize } = require('./model-routing-telemetry');

// Approximate $/1K tokens (input+output blended) at 2026 pricing
const COST_PER_1K = { free: 0, fleet: 0, haiku: 0.00088, premium: 0.009 };
const AVG_TOKENS_PER_QUERY = 1500; // 1K input + 500 output average

const args = process.argv.slice(2);
const days = Number(args[args.indexOf('--days') + 1] || 30);
const json = args.includes('--json');

const entries = readTelemetry(days);
if (entries.length === 0) {
  const msg = `No telemetry data for last ${days} days. Run routed queries to populate.`;
  console.log(json ? JSON.stringify({ error: msg }) : msg);
  process.exit(0);
}

const summary = summarize(entries);
const n = entries.length;

// Cost calculations
const frontierOnlyCost = n * AVG_TOKENS_PER_QUERY * COST_PER_1K.premium / 1000;
const actualCost = Object.entries(summary.laneDistribution).reduce((total, [lane, share]) => {
  return total + share * n * AVG_TOKENS_PER_QUERY * (COST_PER_1K[lane] || COST_PER_1K.premium) / 1000;
}, 0);
const savingsPct = frontierOnlyCost > 0
  ? (((frontierOnlyCost - actualCost) / frontierOnlyCost) * 100).toFixed(1)
  : '0.0';

// Top escalation reasons
const reasons = {};
entries.filter(e => e.qualityReason).forEach(e => {
  reasons[e.qualityReason] = (reasons[e.qualityReason] || 0) + 1;
});

const report = {
  period_days: days, samples: n, summary,
  cost_analysis: {
    frontier_only_usd: +frontierOnlyCost.toFixed(4),
    actual_usd: +actualCost.toFixed(4),
    savings_pct: savingsPct,
    avg_tokens_assumption: AVG_TOKENS_PER_QUERY,
  },
  top_escalation_reasons: Object.entries(reasons)
    .sort(([, a], [, b]) => b - a).slice(0, 5)
    .map(([reason, count]) => ({ reason, count })),
};

if (json) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }

console.log(`\n=== Routing Baseline Report (last ${days} days) ===`);
console.log(`Samples: ${n}`);
console.log(`\nTier distribution:`);
Object.entries(summary.laneDistribution).forEach(([k, v]) =>
  console.log(`  ${k.padEnd(9)} ${(v * 100).toFixed(1)}%`));
console.log(`\nCost (est. at ${AVG_TOKENS_PER_QUERY} tok/query):`);
console.log(`  Frontier-only: $${frontierOnlyCost.toFixed(4)}`);
console.log(`  Actual:        $${actualCost.toFixed(4)}  (${savingsPct}% savings)`);
console.log(`\nPremium share: ${(summary.premiumShare * 100).toFixed(1)}%  Target: ≤15%`);
console.log(`Success rate:  ${(summary.successRate * 100).toFixed(1)}%`);
if (report.top_escalation_reasons.length)
  console.log(`\nTop escalation reasons: ${report.top_escalation_reasons.map(r => r.reason).join(', ')}`);
