#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const FILE = path.join(os.homedir(), '.megingjord', 'suppression-registry.json');
const TWO = Number('2');

function readRows() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) || []; } catch { return []; } }
function writeRows(rows) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(rows, null, TWO));
}
function prune(rows, nowIso) {
  const now = Date.parse(nowIso);
  return rows.filter((r) => Date.parse(r.expires_utc || '') > now);
}
function rejectEntry(argv) {
  const nowIso = new Date().toISOString();
  const get = (k, d = '') => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
  const pattern_id = get('--pattern');
  const reason = get('--reason', 'unspecified');
  const reviewer = get('--reviewer', process.env.USER || 'unknown');
  const ttl_days = Number(get('--ttl', '7'));
  if (!pattern_id) throw new Error('missing --pattern');
  const created = nowIso;
  const expires = new Date(Date.parse(nowIso) + ttl_days * 86400000).toISOString();
  const row = { pattern_id, reason, ttl_days, reviewer, created_utc: created, expires_utc: expires };
  const rows = prune(readRows(), nowIso).filter((r) => r.pattern_id !== pattern_id);
  rows.push(row); writeRows(rows);
  process.stdout.write(JSON.stringify({ decision: 'rejected', suppression: row }, null, TWO) + '\n');
}
function listEntries() {
  const nowIso = new Date().toISOString();
  const rows = prune(readRows(), nowIso); writeRows(rows);
  process.stdout.write(JSON.stringify({ active: rows.length, suppressions: rows }, null, TWO) + '\n');
}

function main(argv) {
  if (argv[0] === 'reject') return rejectEntry(argv);
  return listEntries();
}

if (require.main === module) main(process.argv.slice(TWO));
module.exports = { main, rejectEntry, listEntries, prune, readRows, FILE };
