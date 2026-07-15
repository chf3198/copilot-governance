#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { normalizeTokenRecord } = require('./token-ledger-schema');

const FILE = path.join(__dirname, '..', '..', 'logs', 'model-routing-telemetry.jsonl');
const DAY_MS = 86400000;
const MAX_ENTRIES = 100;

function ensureDir() { fs.mkdirSync(path.dirname(FILE), { recursive: true }); }

function pctMap(counts, sampleCount) {
  return Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, +(value / sampleCount).toFixed(3)]));
}

function buildLegacy(entry = {}) {
  const routeLabel = entry.routeLabel || entry.tavily_route || null;
  return {
    ts: new Date().toISOString(), lane: entry.lane || 'free', model: entry.model || 'unknown', multiplier: entry.multiplier ?? 0,
    taskClass: entry.taskClass || 'routine', complexityScore: entry.complexityScore ?? entry.complexity ?? null,
    latencyMs: entry.latency_ms || entry.latencyMs || null, outcome: entry.outcome || 'ok', rollbackApplied: entry.rollbackApplied || false,
    execute: entry.execute || false, tavily_route: routeLabel, budget_decision: entry.budgetDecision || null,
  };
}

function recordTelemetry(entry) {
  ensureDir();
  const legacy = buildLegacy(entry);
  const canonical = normalizeTokenRecord({
    ...entry, lane: legacy.lane, model: legacy.model, timestamp: legacy.ts,
    provider: entry.provider || legacy.lane, source_kind: entry.source_kind || 'routing_telemetry',
  });
  const row = { ...legacy, ...canonical };
  const existing = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean) : [];
  fs.writeFileSync(FILE, [...existing.slice(-(MAX_ENTRIES - 1)), JSON.stringify(row)].join('\n') + '\n');
  return row;
}

function readTelemetry(days = 30) {
  if (!fs.existsSync(FILE)) return [];
  const cutoff = Date.now() - days * DAY_MS;
  return fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean)
    .map(l => { try { return JSON.parse(l); } catch { return null; } })
    .filter(r => r && new Date(r.ts).getTime() >= cutoff);
}

function accumulateSummary(entry, byLane, byConfidence, escalations) {
  byLane[entry.lane] = (byLane[entry.lane] || 0) + 1;
  const confidenceLevel = entry.confidence_level;
  if (confidenceLevel && String(confidenceLevel).startsWith('exact')) byConfidence.exact += 1;
  else if (confidenceLevel === 'estimated') byConfidence.estimated += 1;
  else byConfidence.other += 1;
  if (entry.escalation) escalations[entry.escalation] = (escalations[entry.escalation] || 0) + 1;
}

function summarize(entries) {
  const sampleCount = entries.length || 1;
  const byLane = { free: 0, fleet: 0, haiku: 0, premium: 0 };
  const byConfidence = { exact: 0, estimated: 0, other: 0 };
  const escalations = { haiku: 0, premium: 0 };
  entries.forEach((entry) => accumulateSummary(entry, byLane, byConfidence, escalations));
  const premium = entries.filter(e => e.lane === 'premium').length;
  const ok = entries.filter(e => e.outcome === 'ok').length;
  const rollback = entries.filter(e => e.rollbackApplied).length;
  const mult = entries.reduce((s, e) => s + (Number(e.multiplier) || 0), 0);
  return {
    samples: entries.length,
    laneDistribution: pctMap(byLane, sampleCount),
    confidenceDistribution: pctMap(byConfidence, sampleCount),
    escalationCounts: escalations,
    premiumShare: +(premium / sampleCount).toFixed(3),
    successRate: +(ok / sampleCount).toFixed(3),
    failRate: +((sampleCount - ok) / sampleCount).toFixed(3),
    rollbackRate: +(rollback / sampleCount).toFixed(3),
    avgMultiplier: +(mult / sampleCount).toFixed(3),
  };
}

module.exports = { recordTelemetry, readTelemetry, summarize, FILE };
