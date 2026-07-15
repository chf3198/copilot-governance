#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readCostEvents, summarizeCost } = require('./cost-telemetry');
const { runGate } = require('./cache-hit-gate');
const { writeQualityParityReport } = require('./quality-parity-report');

const OUT = path.join(__dirname, '..', '..', 'logs', 'token-spend-report.json');
const OVERRIDES = path.join(os.homedir(), '.megingjord', 'cascade-policy-overrides.json');

function print(summary, cacheGate, parity) {
  console.log(`Token report: $${summary.projectedMonthlyUsd}/mo (${summary.budgetPct}% budget)`);
  console.log(`Prompt reduction: ${summary.promptReductionPct}% | Cache-hit: ${summary.cacheHitPct}%`);
  console.log(`Cache gate: ${cacheGate.passed ? 'PASS' : 'FAIL'} | Quality parity: ${parity.gate}`);
  Object.entries(summary.bySessionClass || {}).forEach(([k, v]) => console.log(`  ${k}: ${v.count} (${v.pct}%)`));
}

async function run(opts = {}) {
  const summary = summarizeCost(readCostEvents(opts.days || 30));
  const cacheGate = runGate();
  const parity = await writeQualityParityReport({ mode: opts.live ? 'live' : 'dry-run' });
  const alerts = {
    budget: summary.budgetAlert,
    cache: !cacheGate.passed,
    quality: parity.gate !== 'PASS',
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ ts: new Date().toISOString(), summary, cacheGate, parity: {
    mode: parity.mode, meanParity: parity.meanParity, parityFloor: parity.parityFloor, gate: parity.gate,
  }, alerts }, null, 2) + '\n');
  if (alerts.quality && opts.rollback !== false) {
    fs.mkdirSync(path.dirname(OVERRIDES), { recursive: true });
    fs.writeFileSync(OVERRIDES, JSON.stringify({ force_lane: 'premium', stale: false, reason: 'quality_parity_fail' }, null, 2) + '\n');
  }
  return { summary, cacheGate, parity, alerts };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  run({ live: args.includes('--live'), rollback: !args.includes('--no-rollback') })
    .then(({ summary, cacheGate, parity, alerts }) => {
      print(summary, cacheGate, parity);
      process.exit(alerts.budget || !cacheGate.passed || parity.gate !== 'PASS' ? 1 : 0);
    }).catch(e => { console.error(e.message); process.exit(1); });
}

module.exports = { run, OUT, OVERRIDES };
