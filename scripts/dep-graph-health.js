#!/usr/bin/env node
'use strict';
/* eslint-disable jsdoc/require-jsdoc */
const fs = require('node:fs');
const path = require('node:path');
const Renderer = require('./dep-graph-render');

const ROOT = path.resolve(__dirname, '..', '..');
const DEFAULTS = {
  graph: path.join(ROOT, 'planning', 'dep-graph.json'),
  proposals: path.join(ROOT, 'planning', 'dep-proposals.json'),
  decisions: path.join(ROOT, 'planning', 'dep-decisions.json'),
};
const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_DAYS = 7;

function readJson(file, fallback, warnings, label) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch {
    warnings.push(`missing or unreadable ${label}: ${file}`); return fallback;
  }
}
function asList(items) { return Array.isArray(items) ? items : []; }
function keyOf(item) { return item.cache_key || [item.from, item.to, item.edge_type || item.type].join(':'); }
function ageDays(item, now) {
  const stamp = item.proposed_at || item.generated_at || item.decided_at || null;
  const time = stamp ? new Date(stamp).getTime() : Number.NaN;
  return Number.isFinite(time) ? Math.max(0, Math.floor((now - time) / DAY_MS)) : null;
}
function proposalState(proposals, decisions, now) {
  const decided = new Map(asList(decisions.decisions).map(item => [item.cache_key, item.status]));
  const pending = [], stale = [];
  for (const item of asList(proposals.proposals)) {
    const status = decided.get(keyOf(item)) || item.status || 'pending';
    if (status !== 'pending' && status !== 'proposed') continue;
    const age = ageDays(item, now);
    pending.push({ cache_key: keyOf(item), age_days: age });
    if (age !== null && age >= STALE_DAYS) stale.push({ cache_key: keyOf(item), age_days: age });
  }
  return { pending, stale, max_age_days: pending.reduce((m, item) => Math.max(m, item.age_days || 0), 0) };
}
function costCounters(proposals) {
  const items = [...asList(proposals.proposals), ...asList(proposals.skipped)];
  return items.reduce((totals, item) => {
    const lane = item.model?.lane || String(item.model?.id || '').split(':')[0] || 'unknown';
    totals.requests += 1;
    totals.tokens += item.token_usage?.total_tokens || item.usage?.total_tokens || 0;
    totals.cost_usd += item.cost_usd || item.model?.cost_usd || 0;
    if (item.status === 'fallback' || item.fallback) totals.fallbacks += 1;
    totals.by_lane[lane] = (totals.by_lane[lane] || 0) + 1;
    return totals;
  }, { requests: 0, tokens: 0, cost_usd: 0, fallbacks: 0, by_lane: {} });
}
function compute(opts = {}) {
  const warnings = [], now = opts.now ? new Date(opts.now).getTime() : Date.now();
  const graph = readJson(opts.graph || DEFAULTS.graph, { nodes: [], edges: [] }, warnings, 'dependency graph');
  const proposals = readJson(opts.proposals || DEFAULTS.proposals, { proposals: [], skipped: [] }, warnings, 'dependency proposals');
  const decisions = readJson(opts.decisions || DEFAULTS.decisions, { decisions: [] }, warnings, 'dependency decisions');
  const cycles = Renderer.cycles(graph), criticalPath = Renderer.criticalPath(graph);
  const proposal = proposalState(proposals, decisions, now);
  const cost = costCounters(proposals);
  cost.cost_usd = +cost.cost_usd.toFixed(6);
  return {
    schema_version: 1,
    warnings,
    cycles,
    cycle_count: cycles.length,
    critical_path: criticalPath,
    critical_path_length: criticalPath.length,
    unresolved_mismatch_count: asList(graph.edges).filter(edge => edge.mismatch).length,
    proposals: {
      pending_count: proposal.pending.length,
      stale_count: proposal.stale.length,
      max_pending_age_days: proposal.max_age_days,
      stale: proposal.stale,
    },
    cost,
    status: cycles.length ? 'violation' : 'ok',
  };
}

module.exports = { compute, DEFAULTS, STALE_DAYS };
