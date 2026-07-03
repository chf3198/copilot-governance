#!/usr/bin/env node
// tier: 3
// fleet-hamr-weekly-report — aggregate cache-stats.jsonl + override-events into weekly compliance report.
// Refs Epic #2150 #2202 AC6. Consumes ~/.megingjord/cache-stats.jsonl (#1339).

'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_STATS_PATH = path.join(os.homedir(), '.megingjord', 'cache-stats.jsonl');
const WINDOW_DAYS = 7;
const MS_PER_DAY = 86400000;

function loadStats(statsPath = DEFAULT_STATS_PATH) {
  if (!fs.existsSync(statsPath)) return [];
  return fs.readFileSync(statsPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function withinWindow(stats, windowDays = WINDOW_DAYS) {
  const cutoff = Date.now() - (windowDays * MS_PER_DAY);
  return stats.filter((entry) => Number(entry.ts) >= cutoff);
}

function aggregate(stats) {
  const byProvider = {};
  const byTier = {};
  for (const entry of stats) {
    const provider = entry.provider || 'unknown';
    const tier = entry.tier || 'unknown';
    byProvider[provider] = (byProvider[provider] || 0) + 1;
    byTier[tier] = (byTier[tier] || 0) + 1;
  }
  const fleetCalls = byProvider['ollama'] || 0;
  const totalCalls = stats.length;
  const fleetRatio = totalCalls > 0 ? fleetCalls / totalCalls : 0;
  return { totalCalls, fleetCalls, fleetRatio, byProvider, byTier };
}

function renderReport({ window, aggregate: agg, generatedAt }) {
  const lines = [`# Fleet+HAMR Weekly Compliance Report`, '', `Window: last ${window} days. Generated: ${generatedAt}.`, ''];
  lines.push('## Summary', '', `- Total HAMR-wrapped calls: ${agg.totalCalls}`, `- Fleet (ollama) calls: ${agg.fleetCalls}`,
    `- Fleet utilization ratio: ${(agg.fleetRatio * 100).toFixed(1)}%`, '');
  lines.push('## By provider', '');
  for (const [p, n] of Object.entries(agg.byProvider).sort((a, b) => b[1] - a[1])) lines.push(`- ${p}: ${n}`);
  lines.push('', '## By tier', '');
  for (const [t, n] of Object.entries(agg.byTier).sort((a, b) => b[1] - a[1])) lines.push(`- ${t}: ${n}`);
  return lines.join('\n');
}

function generateReport({ statsPath, windowDays } = {}) {
  const stats = loadStats(statsPath);
  const windowed = withinWindow(stats, windowDays);
  const agg = aggregate(windowed);
  return renderReport({ window: windowDays || WINDOW_DAYS, aggregate: agg, generatedAt: new Date().toISOString() });
}

if (require.main === module) process.stdout.write(generateReport());

module.exports = { loadStats, withinWindow, aggregate, renderReport, generateReport, DEFAULT_STATS_PATH };
