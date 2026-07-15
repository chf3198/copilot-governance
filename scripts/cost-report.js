#!/usr/bin/env node
'use strict';
// Cost report — reads routing telemetry and prints tier distribution + estimated cost.
const { readTelemetry, summarize } = require('./model-routing-telemetry');
const MONTHLY_REQS_ESTIMATE = 1090; // from logs/copilot-usage.json baseline

const COST_PER_REQ = {
  free: 0,
  fleet: 0,
  haiku: 0.00264, // ~3K tokens avg * $0.00088/1K
  premium: 0.027,  // ~3K tokens avg * $0.009/1K
};

function report() {
  const entries = readTelemetry(30);
  if (!entries.length) {
    console.log('No telemetry data found. Run task-router-dispatch.js to generate entries.');
    return;
  }
  const stats = summarize(entries);
  const dist = stats.laneDistribution;

  console.log(`\n=== Routing Cost Report ===`);
  console.log(`Samples (last 30 days): ${stats.samples}`);
  console.log(`\nTier distribution:`);
  for (const [lane, share] of Object.entries(dist)) {
    const pct = (share * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(share * 20));
    console.log(`  ${lane.padEnd(8)} ${bar.padEnd(20)} ${pct}%`);
  }

  const estMonthly = Object.entries(dist).reduce((total, [lane, share]) => {
    return total + share * MONTHLY_REQS_ESTIMATE * (COST_PER_REQ[lane] ?? 0.027);
  }, 0);

  console.log(`\nEstimated monthly cost: $${estMonthly.toFixed(2)}`);
  console.log(`  (based on ${MONTHLY_REQS_ESTIMATE} req/mo baseline)`);
  console.log(`Premium share: ${(stats.premiumShare * 100).toFixed(1)}%`);
  console.log(`Avg multiplier: ${stats.avgMultiplier}`);
  console.log(`Success rate: ${(stats.successRate * 100).toFixed(1)}%`);
  const conf = stats.confidenceDistribution || { exact: 0, estimated: 0, other: 0 };
  console.log('\nConfidence split (exact vs estimated):');
  console.log(`  exact: ${(conf.exact * 100).toFixed(1)}%`);
  console.log(`  estimated: ${(conf.estimated * 100).toFixed(1)}%`);
  console.log(`  other: ${(conf.other * 100).toFixed(1)}%`);
  if (conf.estimated > 0) {
    console.log('  caveat: estimated entries are non-exact and may include manual Copilot sync data.');
  }

  if (stats.premiumShare > 0.2) {
    console.log(`\n⚠  Premium share ${(stats.premiumShare * 100).toFixed(0)}% exceeds 20% target.`);
    console.log('   Check routing policy — tasks may be over-escalating to Sonnet.');
  }
  if (entries.some(e => e.rollbackApplied)) {
    const rb = entries.filter(e => e.rollbackApplied).length;
    console.log(`\nRollback applied: ${rb}/${entries.length} entries — fleet quality may be degraded.`);
  }
}

if (require.main === module) report();
module.exports = { report };
