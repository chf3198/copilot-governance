#!/usr/bin/env node
'use strict';
/* hamr-utilization-sensor — compute production_hamr_utilization_rate_7d.
 *
 * Per #1153 / Epic #1130 / D-1148-006. Reads cache-stats.jsonl for wrapped
 * production calls + bypass-lint output for unwrapped sites; emits the
 * canonical Goal Health Score sensor for HAMR coverage.
 *
 * Formula (operator-consensus from synthesis-1148):
 *   wrapped / (wrapped + detected_unwrapped)  excluding diagnostics
 *
 * Stale data degraded to null, not zero.
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync } = require('node:child_process');

const STATS_FILE = path.join(os.homedir(), '.megingjord', 'cache-stats.jsonl');
const ROOT = path.resolve(__dirname, '../..');
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const VIOLATION_THRESHOLD = 0.80;
const ESCALATION_THRESHOLD = 0.50;

function readStatsLines() {
  if (!fs.existsSync(STATS_FILE)) return [];
  const content = fs.readFileSync(STATS_FILE, 'utf8');
  return content.split('\n').filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function inWindow(record, now) {
  const ts = record.ts || record.timestamp || 0;
  if (typeof ts !== 'number') return false;
  return now - ts <= WINDOW_MS;
}

function isProduction(record) {
  return record.tier !== 'diagnostic' && record.diagnostic !== true;
}

function countWrapped(now) {
  return readStatsLines().filter((r) => inWindow(r, now) && isProduction(r)).length;
}

function countUnwrappedFromLint() {
  try {
    const out = execSync('node scripts/global/lint-hamr-bypass.js 2>&1 || true', { encoding: 'utf8', cwd: ROOT, timeout: 30000 });
    const match = out.match(/Detected (\d+) HAMR-bypass site/);
    return match ? Number(match[1]) : 0;
  } catch { return 0; }
}

function dataIsStale(now) {
  if (!fs.existsSync(STATS_FILE)) return true;
  const stat = fs.statSync(STATS_FILE);
  return now - stat.mtimeMs > STALE_THRESHOLD_MS;
}

function compute() {
  const now = Date.now();
  const stale = dataIsStale(now);
  const wrapped = countWrapped(now);
  const unwrapped = countUnwrappedFromLint();
  let rate = null;
  let status = 'ok';
  if (!stale && (wrapped > 0 || unwrapped > 0)) {
    rate = wrapped / (wrapped + unwrapped);
    if (rate < ESCALATION_THRESHOLD) status = 'escalation';
    else if (rate < VIOLATION_THRESHOLD) status = 'violation';
  } else if (stale) {
    status = 'stale';
  }
  return {
    metric: 'production_hamr_utilization_rate_7d',
    rate, status, stale,
    counts: { wrapped, unwrapped, total: wrapped + unwrapped },
    window_days: 7,
    thresholds: { violation: VIOLATION_THRESHOLD, escalation: ESCALATION_THRESHOLD },
    computed_utc: new Date(now).toISOString(),
  };
}

if (require.main === module) {
  const result = compute();
  console.log(JSON.stringify(result, null, 2));
}

module.exports = { compute };
