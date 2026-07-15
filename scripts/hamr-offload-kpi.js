#!/usr/bin/env node
'use strict';
// #3015 / AC-E5 — offload coverage, gate quality, escalation reasons, incident trends.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOME = os.homedir();
const CACHE = path.join(HOME, '.megingjord', 'cache-stats.jsonl');
const COST = path.join(HOME, '.megingjord', 'cost-telemetry.jsonl');
const INCIDENTS = path.join(HOME, '.megingjord', 'incidents.jsonl');
const WEEK = 604800000;
const FLEET_TIERS = new Set(['fleet', 'fleet-local', 'local', 'free-cloud']);

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

function computeOffloadKpi(nowMs = Date.now()) {
  const recent = readJsonl(CACHE).filter((r) => nowMs - Number(r.ts || 0) <= WEEK);
  const cost = readJsonl(COST).filter((r) => nowMs - Number(r.ts || 0) <= WEEK);
  const incidents = readJsonl(INCIDENTS).filter((r) => nowMs - Number(r.ts || 0) <= WEEK);
  const total = recent.length || 1;
  const fleetCalls = recent.filter((r) => FLEET_TIERS.has(r.tier)).length;
  const offload_coverage_7d = fleetCalls / total;
  const gate_pass = cost.filter((r) => r.outcome === 'ok').length;
  const gate_total = cost.length || 1;
  const gate_quality_7d = gate_pass / gate_total;
  const reasons = {};
  for (const row of cost) {
    const key = row.escalation_reason || row.reason || 'none';
    reasons[key] = (reasons[key] || 0) + 1;
  }
  const top_escalation_reasons = Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([reason, count]) => ({ reason, count }));
  return {
    generated_at: new Date(nowMs).toISOString(),
    offload_coverage_7d: Math.round(offload_coverage_7d * 1000) / 1000,
    gate_quality_7d: Math.round(gate_quality_7d * 1000) / 1000,
    incident_rate_7d: incidents.length,
    top_escalation_reasons,
    sample_size: { cache: recent.length, cost: cost.length, incidents: incidents.length },
  };
}

module.exports = { computeOffloadKpi, readJsonl };

if (require.main === module) process.stdout.write(JSON.stringify(computeOffloadKpi(), null, 2) + '\n');
