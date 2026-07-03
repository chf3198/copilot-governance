#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const { run, PARITY_FLOOR } = require('./ide-proxy-quality-parity');

const REPORT_FILE = path.join(__dirname, '..', '..', 'logs', 'quality-parity-summary.json');

function summarizeLaneCounts(results) {
  return Object.values(results.reduce((map, row) => {
    const lane = row.lane || 'unknown';
    map[lane] = map[lane] || { lane, turns: 0, mean_parity: 0 };
    map[lane].turns += 1;
    map[lane].mean_parity += row.parity || 0;
    return map;
  }, {})).map(row => ({ lane: row.lane, turns: row.turns, mean_parity: +(row.mean_parity / row.turns).toFixed(3) }))
    .sort((a, b) => b.turns - a.turns || b.mean_parity - a.mean_parity);
}

function topRegressions(results) {
  return [...results].sort((a, b) => a.parity - b.parity || a.id - b.id).slice(0, 3)
    .map(row => ({ id: row.id, lane: row.lane, parity: row.parity, jaccard: row.jaccard, length_ratio: row.length_ratio }));
}

async function buildQualityParityReport(options = {}) {
  const mode = options.mode || (process.env.QUALITY_PARITY_LIVE === '1' ? 'live' : 'dry-run');
  const base = await run({ mode });
  const floorDelta = +(base.meanParity - base.parityFloor).toFixed(3);
  return {
    generated_at: new Date().toISOString(),
    mode,
    calibrated_floor: PARITY_FLOOR,
    floorDelta,
    laneDistribution: summarizeLaneCounts(base.results || []),
    regressions: topRegressions(base.results || []),
    readiness: { status: base.gate, liveMode: mode === 'live', operatorApprovalRequired: mode === 'live' },
    ...base,
  };
}

async function writeQualityParityReport(options = {}) {
  fs.mkdirSync(path.dirname(REPORT_FILE), { recursive: true });
  const report = await buildQualityParityReport(options);
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2) + '\n');
  return report;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const live = args.includes('--live');
  const json = args.includes('--json');
  writeQualityParityReport({ mode: live ? 'live' : 'dry-run' })
    .then(report => console.log(json ? JSON.stringify(report, null, 2) : `Wrote ${REPORT_FILE}`))
    .catch(error => { console.error(error.message); process.exit(1); });
}

module.exports = { buildQualityParityReport, writeQualityParityReport, REPORT_FILE };