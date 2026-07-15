#!/usr/bin/env node
'use strict';

// Regression spec for hamr-tool-audit (#3013 Phase B, Epic #3008). Self-executing; exit 1 on failure.
// Hermetic: writes to a tmp log. Proves the audited-invocation-log AC (#3013 AC "audited invocation
// logs with policy decision reason fields"): append stamps a timestamp + preserves the decision
// fields, read tails to the limit, and complianceRate windows on ts and reports allowed-fraction.

const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { appendAudit, readAudit, complianceRate } = require('./hamr-tool-audit');

let seq = 0;
const freshLog = () => {
  const p = path.join(os.tmpdir(), `hamr-audit-${process.pid}-${seq++}.jsonl`);
  if (fs.existsSync(p)) fs.rmSync(p);
  return p;
};

test('append stamps ts and preserves policy decision fields; read round-trips', () => {
  const log = freshLog();
  const row = appendAudit({ tool: 'github_read', role: 'collaborator', allowed: true, reason: 'ok', stage: 'policy' }, log);
  assert.ok(typeof row.ts === 'string' && !Number.isNaN(Date.parse(row.ts)));
  const back = readAudit(log, 10);
  assert.strictEqual(back.length, 1);
  assert.strictEqual(back[0].tool, 'github_read');
  assert.strictEqual(back[0].allowed, true);
  assert.strictEqual(back[0].reason, 'ok');
  assert.strictEqual(back[0].stage, 'policy');
  fs.rmSync(log);
});

test('readAudit returns [] for an absent log and tails to the limit', () => {
  assert.deepStrictEqual(readAudit(path.join(os.tmpdir(), `nope-${process.pid}.jsonl`)), []);
  const log = freshLog();
  for (let i = 0; i < 5; i += 1) appendAudit({ tool: 't', role: 'r', allowed: true, reason: String(i), stage: 'policy' }, log);
  const tail = readAudit(log, 2);
  assert.strictEqual(tail.length, 2);
  assert.strictEqual(tail[1].reason, '4'); // most recent last
  fs.rmSync(log);
});

test('readAudit skips corrupt lines without throwing', () => {
  const log = freshLog();
  appendAudit({ tool: 'a', role: 'r', allowed: true, reason: 'ok', stage: 'policy' }, log);
  fs.appendFileSync(log, 'this is not json\n');
  appendAudit({ tool: 'b', role: 'r', allowed: false, reason: 'deny', stage: 'role' }, log);
  const rows = readAudit(log, 10);
  assert.strictEqual(rows.length, 2);
  assert.deepStrictEqual(rows.map((r) => r.tool), ['a', 'b']);
  fs.rmSync(log);
});

test('complianceRate windows on ts and reports allowed fraction', () => {
  const log = freshLog();
  // 3 allowed, 1 denied -> rate 0.75 within the window.
  appendAudit({ tool: 'a', role: 'r', allowed: true, reason: 'ok', stage: 'policy' }, log);
  appendAudit({ tool: 'b', role: 'r', allowed: true, reason: 'ok', stage: 'policy' }, log);
  appendAudit({ tool: 'c', role: 'r', allowed: true, reason: 'ok', stage: 'policy' }, log);
  appendAudit({ tool: 'd', role: 'r', allowed: false, reason: 'deny', stage: 'role' }, log);
  const c = complianceRate(log, 0); // since epoch -> all rows in window
  assert.strictEqual(c.total, 4);
  assert.strictEqual(c.allowed, 3);
  assert.ok(Math.abs(c.rate - 0.75) < 1e-9);
  // empty window -> rate defaults to 1 (nothing denied)
  const empty = complianceRate(log, Date.now() + 60000);
  assert.strictEqual(empty.total, 0);
  assert.strictEqual(empty.rate, 1);
  fs.rmSync(log);
});
