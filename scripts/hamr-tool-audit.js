#!/usr/bin/env node
'use strict';
// #3013 — append-only audited tool-invocation log with policy decision reasons.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const DEFAULT_LOG = path.join(os.homedir(), '.megingjord', 'hamr-tool-audit.jsonl');
const DEFAULT_READ_LIMIT = 200;
const WEEK_MS = 604800000;
const MAX_COMPLIANCE_ROWS = 5000;

function appendAudit(entry, logPath = DEFAULT_LOG) {
  const row = { ts: new Date().toISOString(), ...entry };
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(row)}\n`, 'utf8');
  return row;
}

function readAudit(logPath = DEFAULT_LOG, limit = DEFAULT_READ_LIMIT) {
  if (!fs.existsSync(logPath)) return [];
  return fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean).slice(-limit)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
}

function complianceRate(logPath = DEFAULT_LOG, sinceMs = Date.now() - WEEK_MS) {
  const rows = readAudit(logPath, MAX_COMPLIANCE_ROWS).filter((r) => new Date(r.ts).getTime() >= sinceMs);
  if (!rows.length) return { total: 0, allowed: 0, rate: 1 };
  const allowed = rows.filter((r) => r.allowed).length;
  return { total: rows.length, allowed, rate: allowed / rows.length };
}

module.exports = { appendAudit, readAudit, complianceRate, DEFAULT_LOG };
