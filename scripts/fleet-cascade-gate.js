#!/usr/bin/env node
// fleet-cascade-gate (#1790) — G3 Zero-Cost enforcement.
// Reads routing telemetry; computes fleet/free utilization share over rolling window.
// Fails CI when production fleet utilization < minFleetUtilizationShare (default 85%).
// Composes with #1797 escalation taxonomy via "fleet-bypass" reason on violations.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readTelemetry } = require('./model-routing-telemetry');

const POLICY_FILE = path.join(__dirname, 'model-routing-policy.json');
const DEFAULT_MIN_FLEET_SHARE = 0.85;
const DEFAULT_WINDOW_DAYS = 7;
const HAIKU_FALLBACK_CEILING = 0.03;

function loadCascadeConfig() {
  try {
    const policy = JSON.parse(fs.readFileSync(POLICY_FILE, 'utf8'));
    return policy.cascadeEnforcement || {};
  } catch { return {}; }
}

function classifyLane(record) {
  const lane = String(record.lane || record.tier || '').toLowerCase();
  if (lane === 'free' || lane === 'fleet') return 'fleetFree';
  if (lane === 'haiku') return 'haiku';
  if (lane === 'premium') return 'premium';
  return 'other';
}

function summarizeCascade(records) {
  const counts = { fleetFree: 0, haiku: 0, premium: 0, other: 0, total: 0 };
  for (const record of records) {
    counts[classifyLane(record)] += 1;
    counts.total += 1;
  }
  const total = counts.total || 1;
  return {
    samples: counts.total,
    fleetFreeShare: +(counts.fleetFree / total).toFixed(4),
    haikuShare: +(counts.haiku / total).toFixed(4),
    premiumShare: +(counts.premium / total).toFixed(4),
    counts,
  };
}

function evaluateCascade(records, opts = {}) {
  const config = { ...loadCascadeConfig(), ...opts };
  const minFleetShare = config.minFleetUtilizationShare ?? DEFAULT_MIN_FLEET_SHARE;
  const summary = summarizeCascade(records);
  if (summary.samples < 5) {
    return { passed: true, reason: 'insufficient_samples', summary, minFleetShare };
  }
  const fleetOk = summary.fleetFreeShare >= minFleetShare;
  const haikuOk = summary.haikuShare <= HAIKU_FALLBACK_CEILING;
  const passed = fleetOk && haikuOk;
  const violations = [];
  if (!fleetOk) {
    violations.push(`fleet_share=${summary.fleetFreeShare} below floor=${minFleetShare}`);
  }
  if (!haikuOk) {
    violations.push(`haiku_share=${summary.haikuShare} above ceiling=${HAIKU_FALLBACK_CEILING}`);
  }
  return {
    passed, summary, minFleetShare, haikuCeiling: HAIKU_FALLBACK_CEILING,
    escalationReason: passed ? null : (config.violationEscalationReason || 'fleet-bypass'),
    violations,
  };
}

function runGate(opts = {}) {
  const config = { ...loadCascadeConfig(), ...opts };
  const windowDays = config.windowDays ?? DEFAULT_WINDOW_DAYS;
  const records = readTelemetry(windowDays);
  return evaluateCascade(records, opts);
}

if (require.main === module) {
  const result = runGate();
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.passed ? 0 : 1);
}

module.exports = { evaluateCascade, summarizeCascade, classifyLane, runGate,
  DEFAULT_MIN_FLEET_SHARE, HAIKU_FALLBACK_CEILING };
