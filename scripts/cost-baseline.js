#!/usr/bin/env node
'use strict';
// Cost baseline report: current vs. pre-optimization baseline.
// Pre-opt (April baseline): $60.38/mo, ~1090 requests, 100% premium.

const fs = require('fs');
const path = require('path');

const LOG = path.join(__dirname, '..', '..', 'logs', 'cost-telemetry.jsonl');
const BUDGET = 10;
const RATES = { free: 0, fleet: 0, haiku: 0.00264, premium: 0.027 };
const PRE_OPT = { monthlyUsd: 60.38, requests: 1000 + 90, tier: '100% premium' };

const args = process.argv.slice(2);
const days = Number(args[args.indexOf('--days') + 1] || 30);
const json = args.includes('--json');

function readEvents() {
  if (!fs.existsSync(LOG)) return [];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(r => r && new Date(r.ts).getTime() >= cutoff);
}

function summarize(entries) {
  const oldest = entries.reduce((mn, e) => Math.min(mn, new Date(e.ts).getTime()), Date.now());
  const spanDays = Math.max(1, (Date.now() - oldest) / (24 * 60 * 60 * 1000));
  const total = entries.reduce((s, e) => s + (RATES[e.lane] || 0), 0);
  const proj = +(total * (30 / spanDays)).toFixed(2);
  const byLane = {};
  entries.forEach(e => { byLane[e.lane] = (byLane[e.lane] || 0) + 1; });
  return { proj, byLane, count: entries.length };
}

const events = readEvents();

if (json) {
  const cur = events.length ? summarize(events) : null;
  console.log(JSON.stringify({ preOpt: PRE_OPT, current: cur, days }));
  process.exit(0);
}

console.log(`\n=== Cost Baseline (last ${days}d) ===\n`);
console.log(`Pre-opt:  $${PRE_OPT.monthlyUsd}/mo | ${PRE_OPT.requests} req | ${PRE_OPT.tier}`);

if (!events.length) {
  console.log('Current:  no telemetry — run routed queries to populate log.\n');
  process.exit(0);
}

const cur = summarize(events);
const saving = PRE_OPT.monthlyUsd - cur.proj;
const pct = (saving / PRE_OPT.monthlyUsd * 100).toFixed(1);
const budgetPct = (cur.proj / BUDGET * 100).toFixed(1);

console.log(`Current:  $${cur.proj}/mo | ${cur.count} req | budget: ${budgetPct}%`);
Object.entries(cur.byLane).forEach(([lane, n]) =>
  console.log(`  ${lane.padEnd(8)}: ${n} req`));
console.log(`\nSavings vs pre-opt: $${saving.toFixed(2)}/mo (${pct}%)\n`);
