#!/usr/bin/env node
// provider-price-cap-gate (#1796) — per-request max-price ceiling for paid routes.
// Closes Epic #1792 child. Composes with #1797 escalation_reason taxonomy (uses "price-cap").
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const POLICY_PATH = path.join(__dirname, 'model-routing-policy.json');

const DEFAULT_CAPS_USD = {
  free:    Infinity,
  fleet:   Infinity,
  haiku:   Number(process.env.MEGINGJORD_PRICE_CAP_HAIKU || '0.05'),
  premium: Number(process.env.MEGINGJORD_PRICE_CAP_PREMIUM || '0.25'),
};

function loadPolicy() {
  try { return JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8')); } catch { return null; }
}

function capForLane(lane) {
  const v = DEFAULT_CAPS_USD[lane];
  return (typeof v === 'number') ? v : DEFAULT_CAPS_USD.premium;
}

function evaluate(opts = {}) {
  const lane = String(opts.lane || 'free');
  const model = String(opts.model || 'unknown');
  const estimatedCostUsd = Number(opts.estimatedCostUsd ?? 0);
  const override = !!opts.override;
  const cap = capForLane(lane);
  const overCap = estimatedCostUsd > cap && Number.isFinite(cap);
  const allow = !overCap || override;
  return {
    allow, lane, model,
    estimated_cost_usd: estimatedCostUsd,
    cap_usd: Number.isFinite(cap) ? cap : null,
    over_cap: overCap,
    override_used: overCap && override,
    escalation_reason: overCap ? (override ? 'price-cap-override' : 'price-cap') : null,
    policy_version: '2026-05-17',
  };
}

function recordTelemetry(decision) {
  // Lazy require to keep this module fast when used as pure fn.
  if (!decision.over_cap) return;
  try {
    const { recordCostEvent } = require('./cost-telemetry');
    recordCostEvent(decision.lane, decision.model, {
      outcome: decision.allow ? 'ok' : 'fail',
      escalation_reason: decision.escalation_reason,
      costUsd: decision.estimated_cost_usd,
    });
  } catch { /* no-op if cost-telemetry missing */ }
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

if (require.main === module) {
  const decision = evaluate({
    lane: arg('--lane') || 'free',
    model: arg('--model') || 'unknown',
    estimatedCostUsd: Number(arg('--cost') || '0'),
    override: process.argv.includes('--override'),
  });
  recordTelemetry(decision);
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(decision, null, 2) + '\n');
  } else if (!decision.allow) {
    process.stderr.write(`✗ price-cap blocked: lane=${decision.lane} cost=$${decision.estimated_cost_usd.toFixed(4)} > cap=$${decision.cap_usd.toFixed(4)}\n`);
  } else if (decision.override_used) {
    process.stdout.write(`⚠ price-cap override: lane=${decision.lane} cost=$${decision.estimated_cost_usd.toFixed(4)} > cap=$${decision.cap_usd.toFixed(4)}\n`);
  } else {
    process.stdout.write(`✓ price-cap ok: lane=${decision.lane} cost=$${decision.estimated_cost_usd.toFixed(4)}\n`);
  }
  process.exit(decision.allow ? 0 : 1);
}

module.exports = { evaluate, recordTelemetry, capForLane, loadPolicy, DEFAULT_CAPS_USD };
