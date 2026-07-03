#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { readTelemetry, summarize } = require('./model-routing-telemetry');

const REPORT_FILE = path.join(__dirname, '..', '..', 'logs', 'token-telemetry-summary.json');
const TOKEN_KEYS = ['input_tokens', 'output_tokens', 'cache_read_tokens', 'cache_write_tokens', 'reasoning_tokens', 'total_tokens'];

function addRow(map, key, entry) {
  const row = map[key] || { key, samples: 0, total_tokens: 0 };
  row.samples += 1;
  row.total_tokens += Number(entry.total_tokens) || 0;
  map[key] = row;
}

function sortRows(map, label) {
  return Object.values(map).sort((a, b) => b.total_tokens - a.total_tokens || b.samples - a.samples)
    .map(row => ({ [label]: row.key, samples: row.samples, total_tokens: row.total_tokens }));
}

function buildTokenTelemetryReport(days = 30) {
  const entries = readTelemetry(days);
  const stats = summarize(entries);
  const totals = Object.fromEntries(TOKEN_KEYS.map(key => [key, 0]));
  const byProvider = {}, byModel = {}, byLane = {}, caveats = {};
  const nonFreeSamples = entries.filter(entry => ['haiku', 'premium'].includes(entry.lane)).length;
  entries.forEach(entry => {
    TOKEN_KEYS.forEach(key => { totals[key] += Number(entry[key]) || 0; });
    addRow(byProvider, entry.provider || 'unknown', entry);
    addRow(byModel, entry.model || 'unknown', entry);
    addRow(byLane, entry.lane || 'unknown', entry);
    if (entry.caveat_code) caveats[entry.caveat_code] = (caveats[entry.caveat_code] || 0) + 1;
  });
  return {
    generated_at: new Date().toISOString(),
    period_days: days,
    samples: entries.length,
    totals,
    confidence: stats.confidenceDistribution,
    lanes: sortRows(byLane, 'lane'),
    providers: sortRows(byProvider, 'provider'),
    models: sortRows(byModel, 'model').slice(0, 8),
    nonFreeCoverage: { samples: nonFreeSamples, share: +(nonFreeSamples / (entries.length || 1)).toFixed(3) },
    caveats: Object.entries(caveats).map(([code, count]) => ({ code, count }))
  };
}

function writeTokenTelemetryReport(days = 30) {
  fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  const report = buildTokenTelemetryReport(days);
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2) + '\n');
  return report;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const daysIdx = args.indexOf('--days');
  const days = Number(daysIdx >= 0 ? (args[daysIdx + 1] || 30) : 30);
  const json = args.includes('--json');
  const report = writeTokenTelemetryReport(days);
  console.log(json ? JSON.stringify(report, null, 2) : `Wrote ${REPORT_FILE}`);
}

module.exports = { buildTokenTelemetryReport, writeTokenTelemetryReport, REPORT_FILE };