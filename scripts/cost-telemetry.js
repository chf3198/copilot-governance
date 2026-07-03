#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '..', 'logs', 'cost-telemetry.jsonl');
const MAX_ENTRIES = 500;

const COST_PER_REQ = {
  free: 0,
  fleet: 0,
  haiku: 0.00264,  // 3K * $0.00088/1K
  premium: 0.027,  // 3K * $0.009/1K
};

const MONTHLY_BUDGET_USD = 10;

function ensureDir() { fs.mkdirSync(path.dirname(FILE), { recursive: true }); }

function recordCostEvent(lane, model, opts = {}) {
  ensureDir();
  const baseCost = COST_PER_REQ[lane] ?? COST_PER_REQ.premium;
  const cost = opts.cacheHit ? 0 : (opts.costUsd ?? baseCost);
  const row = {
    ts: new Date().toISOString(),
    lane: lane || 'free',
    model: model || 'unknown',
    cost_usd: cost,
    service: opts.service || 'orchestrator',
    session_class: opts.sessionClass || 'default',
    outcome: opts.outcome || 'ok',
    escalation_reason: opts.escalation_reason || null,
    rate_limit: opts.rate_limit || false,
    cache_hit: !!opts.cacheHit,
    scope_tier: opts.scopeTier || null,
    prompt_chars_raw: Number(opts.promptCharsRaw ?? 0),
    prompt_chars_sent: Number(opts.promptCharsSent ?? 0),
  };
  const existing = fs.existsSync(FILE)
    ? fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean) : [];
  const lines = [...existing.slice(-(MAX_ENTRIES - 1)), JSON.stringify(row)];
  fs.writeFileSync(FILE, lines.join('\n') + '\n');
  return row;
}

function readCostEvents(days = 30) {
  if (!fs.existsSync(FILE)) return [];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(r => r && new Date(r.ts).getTime() >= cutoff);
}

function summarizeCost(entries) {
  const total = entries.length || 1;
  const byLane = {};
  const bySessionClass = {};
  let totalCost = 0;
  let cacheHits = 0;
  let rawChars = 0;
  let sentChars = 0;
  entries.forEach(e => {
    byLane[e.lane] = (byLane[e.lane] || 0) + 1;
    const key = `${e.service || 'orchestrator'}:${e.session_class || 'default'}`;
    bySessionClass[key] = (bySessionClass[key] || 0) + 1;
    totalCost += e.cost_usd || 0;
    if (e.cache_hit) cacheHits += 1;
    rawChars += Number(e.prompt_chars_raw || 0);
    sentChars += Number(e.prompt_chars_sent || 0);
  });
  const daysInWindow = 30;
  const projectedMonthly = entries.length ? (totalCost / daysInWindow) * 30 : 0;
  const budgetPct = (projectedMonthly / MONTHLY_BUDGET_USD * 100).toFixed(1);
  return {
    samples: entries.length,
    totalCostUsd: +totalCost.toFixed(4),
    projectedMonthlyUsd: +projectedMonthly.toFixed(2),
    budgetPct: +budgetPct,
    budgetAlert: projectedMonthly > MONTHLY_BUDGET_USD * 0.8,
    cacheHitPct: +((cacheHits / total) * 100).toFixed(1),
    promptReductionPct: rawChars > 0 ? +(((rawChars - sentChars) / rawChars) * 100).toFixed(1) : 0,
    byLane: Object.fromEntries(
      Object.entries(byLane).map(([k, v]) => [k, { count: v, pct: +((v / total) * 100).toFixed(1) }])
    ),
    bySessionClass: Object.fromEntries(
      Object.entries(bySessionClass).map(([k, v]) => [k, { count: v, pct: +((v / total) * 100).toFixed(1) }])
    )
  };
}

if (require.main === module) {
  const events = readCostEvents(30);
  const summary = summarizeCost(events);
  console.log(`Cost baseline (last 30d): $${summary.totalCostUsd} actual`);
  console.log(`Projected monthly: $${summary.projectedMonthlyUsd} / $${MONTHLY_BUDGET_USD} budget`);
  console.log(`Budget used: ${summary.budgetPct}%${summary.budgetAlert ? ' ⚠ ALERT' : ''}`);
  Object.entries(summary.byLane).forEach(([k, v]) => console.log(`  ${k.padEnd(8)} ${v.count} req (${v.pct}%)`));
}

module.exports = { recordCostEvent, readCostEvents, summarizeCost, MONTHLY_BUDGET_USD };
