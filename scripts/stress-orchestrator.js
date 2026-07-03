#!/usr/bin/env node
// stress-orchestrator.js — Tier-aware stress test entry point. Epic #1398.
// Tiers: A=mock ($0), B=free-quota ($0+gh-rate), C=bounded-real ($0.05/run), D=full-real ($2/run).
// Usage: MEGINGJORD_STRESS_TIER=A node scripts/global/stress-orchestrator.js
'use strict';

const fs = require('fs');
const path = require('path');

const TIERS = ['A', 'B', 'C', 'D'];
const DEFAULT_TIER = 'A';
const FIXTURES_DIR = path.join(__dirname, '..', '..', 'tests', 'fixtures', 'stress');

function readTier() {
  const tier = (process.env.MEGINGJORD_STRESS_TIER || DEFAULT_TIER).toUpperCase();
  if (!TIERS.includes(tier)) throw new Error(`Invalid tier "${tier}"; valid: ${TIERS.join(', ')}`);
  return tier;
}

function loadFixture(name, opts = {}) {
  const dir = opts.fixturesDir || FIXTURES_DIR;
  const fixturePath = path.join(dir, `${name}.json`);
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Fixture missing: ${name}.json (looked in ${dir})`);
  }
  return JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
}

function tierAllowsRealProvider(tier) { return tier === 'C' || tier === 'D'; }
function tierAllowsRealGitHub(tier) { return tier !== 'A'; }
function tierAllowsCostBudget(tier) {
  return { A: 0, B: 0, C: 0.05, D: 2.00 }[tier];
}

function emitRunStart(tier, runId) {
  return {
    event: 'stress.run.start',
    tier, run_id: runId,
    ts: new Date().toISOString(),
    cost_budget_usd: tierAllowsCostBudget(tier),
    allows_real_provider: tierAllowsRealProvider(tier),
    allows_real_github: tierAllowsRealGitHub(tier),
  };
}

function emitRunEnd(tier, runId, summary = {}) {
  return {
    event: 'stress.run.end',
    tier, run_id: runId,
    ts: new Date().toISOString(),
    ...summary,
  };
}

async function run(opts = {}) {
  const tier = opts.tier || readTier();
  const runId = opts.runId || `stress-${Date.now()}`;
  const start = emitRunStart(tier, runId);
  if (!opts.silent) console.log(JSON.stringify(start));
  // Per #1396 Option A: load fixtures unless caller provides a runner.
  const tickets = loadFixture('tickets', opts);
  const summary = { tickets: tickets.length, completed: 0, failed: 0 };
  for (const ticket of tickets) {
    try {
      if (opts.onTicket) await opts.onTicket(ticket, { tier, runId });
      summary.completed += 1;
    } catch (err) {
      summary.failed += 1;
      summary.last_error = err.message;
    }
  }
  const end = emitRunEnd(tier, runId, summary);
  if (!opts.silent) console.log(JSON.stringify(end));
  return { start, end, summary };
}

if (require.main === module) {
  run().catch(e => { console.error(`stress-orchestrator: ${e.message}`); process.exit(1); });
}

module.exports = {
  run, readTier, loadFixture, emitRunStart, emitRunEnd,
  tierAllowsRealProvider, tierAllowsRealGitHub, tierAllowsCostBudget,
  TIERS, DEFAULT_TIER, FIXTURES_DIR,
};
