#!/usr/bin/env node
// scripts/global/matrix-freshness.js — fail when the LLM matrix's "Last refreshed:" header is too old (#833)
// Usage:
//   node scripts/global/matrix-freshness.js                  # default 60-day window
//   node scripts/global/matrix-freshness.js --max-days=30
'use strict';
const fs = require('fs');
const path = require('path');

const MATRIX = path.resolve(__dirname, '..', '..', 'research', 'model-compare', 'design-analysis', 'LLM-EVALUATION-MATRIX.md');
const DEFAULT_MAX_DAYS = 60;
const DAY_MS = 86400000;

function parseMaxDays(argv) {
  const arg = argv.find(a => a.startsWith('--max-days='));
  if (!arg) return DEFAULT_MAX_DAYS;
  const parsed = parseInt(arg.split('=')[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_DAYS;
}

function check(matrixPath = MATRIX, maxDays = DEFAULT_MAX_DAYS, now = Date.now()) {
  if (!fs.existsSync(matrixPath)) {
    return { ok: false, reason: `matrix file missing: ${matrixPath}` };
  }
  const txt = fs.readFileSync(matrixPath, 'utf-8');
  const m = txt.match(/^\*\*Last refreshed:\*\*\s*(\d{4}-\d{2}-\d{2})/m);
  if (!m) return { ok: false, reason: '`Last refreshed:` header missing — run `npm run routing:refresh -- --update-matrix`' };
  const refreshedAt = Date.parse(m[1] + 'T00:00:00Z');
  if (!Number.isFinite(refreshedAt)) return { ok: false, reason: `unparseable date: ${m[1]}` };
  const ageDays = Math.floor((now - refreshedAt) / DAY_MS);
  if (ageDays > maxDays) {
    return { ok: false, reason: `matrix is ${ageDays} days old — exceeds ${maxDays}-day freshness window`, ageDays };
  }
  return { ok: true, ageDays };
}

if (require.main === module) {
  const maxDays = parseMaxDays(process.argv);
  const result = check(MATRIX, maxDays);
  if (!result.ok) {
    process.stderr.write(`❌ matrix-freshness FAILED: ${result.reason}\n`);
    process.exit(1);
  }
  process.stdout.write(`✅ matrix-freshness OK (${result.ageDays} days old, limit ${maxDays})\n`);
}

module.exports = { check };
