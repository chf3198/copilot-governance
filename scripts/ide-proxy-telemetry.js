#!/usr/bin/env node
// ide-proxy-telemetry.js — Phase 2 D3 (#1033).
// Per-call telemetry emit to ~/.megingjord/ide-proxy-decisions.jsonl.
// No body content. No API keys. Append-only.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const LOG_FILE = path.join(os.homedir(), '.megingjord', 'ide-proxy-decisions.jsonl');

function ensureDir() {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const PRICING_PER_M = {
  'claude-opus-4-7': { input: 15.00, output: 75.00 },
  'opus': { input: 15.00, output: 75.00 },
  'claude-sonnet-4-6': { input: 3.00, output: 15.00 },
  'sonnet': { input: 3.00, output: 15.00 },
  'claude-haiku-4-5': { input: 0.80, output: 4.00 },
  'haiku': { input: 0.80, output: 4.00 },
  'cloud-fleet-primary': { input: 0, output: 0 },
  'cloud-fleet-quality': { input: 0, output: 0 },
  'cloud-fleet-fast': { input: 0, output: 0 },
  'fleet-primary': { input: 0, output: 0 },
  'fleet-fast': { input: 0, output: 0 },
  'fleet-quality': { input: 0, output: 0 },
};

function estimateCost(model, tokensIn, tokensOut) {
  const p = PRICING_PER_M[model] || { input: 0, output: 0 };
  return (tokensIn / 1e6) * p.input + (tokensOut / 1e6) * p.output;
}

/** Append a routing decision record. Never logs body content or API keys.
 * @param {object} rec - { complexity, lane, model_group, model, est_tokens_in, est_tokens_out }.
 * @returns {{ok:boolean, file:string}} Outcome.
 */
function recordDecision(rec) {
  ensureDir();
  const tIn = Number(rec.est_tokens_in || 0);
  const tOut = Number(rec.est_tokens_out || 0);
  const out = {
    ts: typeof rec.ts === 'number' ? rec.ts : Date.now(),
    complexity: rec.complexity ?? null,
    lane: rec.lane || 'unknown',
    model_group: rec.model_group || null,
    model: rec.model || null,
    est_tokens_in: tIn,
    est_tokens_out: tOut,
    est_cost_usd: estimateCost(rec.model || rec.model_group, tIn, tOut),
  };
  fs.appendFileSync(LOG_FILE, JSON.stringify(out) + '\n', { encoding: 'utf8' });
  return { ok: true, file: LOG_FILE };
}

function readAll(opts = {}) {
  const file = opts.file ?? LOG_FILE;
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

function summarize(records) {
  const byLane = {};
  let totalCost = 0;
  for (const r of records) {
    byLane[r.lane] = (byLane[r.lane] || 0) + 1;
    totalCost += Number(r.est_cost_usd || 0);
  }
  return { count: records.length, byLane, totalCostUsd: totalCost };
}

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'summary') {
    console.log(JSON.stringify(summarize(readAll()), null, 2));
  } else {
    console.log(JSON.stringify({ log_file: LOG_FILE, exists: fs.existsSync(LOG_FILE) }));
  }
}

module.exports = { recordDecision, readAll, summarize, estimateCost, LOG_FILE };
