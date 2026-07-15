#!/usr/bin/env node
'use strict';
// Routing calibration: detect threshold drift and emit adjustment recommendations.
// Usage: node scripts/global/cascade-calibrate.js [--days N] [--json]

const { readTelemetry, summarize } = require('./model-routing-telemetry');
const { loadPolicy } = require('./model-routing-engine');

const TARGETS = { localShare: 0.60, premiumCeiling: 0.15, haikuShare: 0.25 };
const ALERT_THRESHOLD = 0.10; // drift > 10% from target triggers recommendation

const args = process.argv.slice(2);
const days = Number(args[args.indexOf('--days') + 1] || 7);
const json = args.includes('--json');

const entries = readTelemetry(days);
if (entries.length < 10) {
  const msg = `Insufficient data (${entries.length} samples). Need ≥10 for calibration.`;
  console.log(json ? JSON.stringify({ status: 'insufficient_data', samples: entries.length }) : msg);
  process.exit(0);
}

const summary = summarize(entries);
const policy = loadPolicy();
const dist = summary.laneDistribution;

const recs = [];

// Check local (fleet) tier share
const localShare = (dist.fleet || 0) + (dist.free || 0);
if (localShare < TARGETS.localShare - ALERT_THRESHOLD) {
  recs.push({
    dimension: 'local_share',
    current: localShare,
    target: TARGETS.localShare,
    action: 'LOWER_QUALITY_THRESHOLD',
    detail: `Local tier at ${(localShare * 100).toFixed(1)}% vs target ≥${TARGETS.localShare * 100}%. ` +
      `Reduce cascade-dispatch minLength or relax structural checks.`,
  });
}

// Check premium ceiling
const premiumShare = dist.premium || 0;
if (premiumShare > TARGETS.premiumCeiling + ALERT_THRESHOLD) {
  recs.push({
    dimension: 'premium_ceiling',
    current: premiumShare,
    target: TARGETS.premiumCeiling,
    action: 'ESCALATION_GATE_TOO_PERMISSIVE',
    detail: `Premium at ${(premiumShare * 100).toFixed(1)}% vs target ≤${TARGETS.premiumCeiling * 100}%. ` +
      `Review direct-to-premium bypass list; consider haiku as intermediate.`,
  });
}

// Check haiku utilization
const haikuShare = dist.haiku || 0;
if (haikuShare < 0.05 && premiumShare > 0.20) {
  recs.push({
    dimension: 'haiku_bypass',
    current: haikuShare,
    action: 'HAIKU_UNDERUTILIZED',
    detail: `Haiku at ${(haikuShare * 100).toFixed(1)}% with premium at ${(premiumShare * 100).toFixed(1)}%. ` +
      `Tasks may be skipping haiku tier. Verify escalation chain: fleet→haiku→premium.`,
  });
}

// Top escalation reasons — data for manual threshold tuning
const reasons = {};
entries.filter(e => e.qualityReason).forEach(e => {
  reasons[e.qualityReason] = (reasons[e.qualityReason] || 0) + 1;
});
const topReasons = Object.entries(reasons).sort(([, a], [, b]) => b - a).slice(0, 3);

const report = {
  status: recs.length === 0 ? 'CALIBRATED' : 'DRIFT_DETECTED',
  period_days: days, samples: entries.length,
  distribution: dist,
  targets: TARGETS,
  recommendations: recs,
  top_escalation_reasons: topReasons.map(([r, c]) => ({ reason: r, count: c })),
  rollback_policy: { enabled: policy.rollback?.enabled, maxPremiumShare: policy.rollback?.maxPremiumShare },
};

if (json) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }

console.log(`\n=== Routing Calibration Report (last ${days} days, ${entries.length} samples) ===`);
console.log(`Status: ${report.status}`);
console.log(`\nTier distribution vs targets:`);
[['fleet+free (local)', localShare, TARGETS.localShare, '≥'],
 ['haiku', haikuShare, TARGETS.haikuShare, '~'],
 ['premium', premiumShare, TARGETS.premiumCeiling, '≤']].forEach(([label, cur, tgt, op]) => {
  const flag = (op === '≥' && cur < tgt - ALERT_THRESHOLD) ||
               (op === '≤' && cur > tgt + ALERT_THRESHOLD) ? ' ⚠️' : ' ✅';
  console.log(`  ${label.padEnd(16)} ${(cur * 100).toFixed(1)}%  (target ${op}${tgt * 100}%)${flag}`);
});
if (recs.length) { console.log('\nRecommendations:'); recs.forEach(r => console.log(`  [${r.action}] ${r.detail}`)); }
