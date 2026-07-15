#!/usr/bin/env node
'use strict';
// anneal-audit-sensor.spec.js — unit tests for AC9 anneal sensor
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { compute, readLines } = require('./anneal-audit-sensor');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'anneal-sensor-'));
const FIXTURE = path.join(TMP, 'incidents.jsonl');

const now = new Date().toISOString();

function writeFixture(lines) {
  fs.writeFileSync(FIXTURE, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
}

function test(name, fn) {
  try { fn(); console.log(`  PASS ${name}`); }
  catch (e) { console.error(`  FAIL ${name}: ${e.message}`); process.exitCode = 1; }
}

writeFixture([
  { pattern_id: 'changelog-conflict', status: 'pending',  timestamp: now },
  { pattern_id: 'changelog-conflict', status: 'proposed', timestamp: now },
  { pattern_id: 'branch-name-rejection', status: 'resolved', timestamp: now },
]);

test('pending count', () => {
  const r = compute({ incidentsFile: FIXTURE });
  assert.equal(r.pending, 1);
});

test('proposed count', () => {
  const r = compute({ incidentsFile: FIXTURE });
  assert.equal(r.proposed, 1);
});

test('resolved count', () => {
  const r = compute({ incidentsFile: FIXTURE });
  assert.equal(r.resolved, 1);
});

test('top_pattern is changelog-conflict', () => {
  const r = compute({ incidentsFile: FIXTURE });
  assert.equal(r.top_pattern.pattern_id, 'changelog-conflict');
  assert.equal(r.top_pattern.count, 2);
});

test('empty file returns zeros', () => {
  const empty = path.join(TMP, 'empty.jsonl');
  fs.writeFileSync(empty, '');
  const r = compute({ incidentsFile: empty });
  assert.equal(r.pending, 0);
  assert.equal(r.total_events, 0);
});

test('missing file returns zeros', () => {
  const r = compute({ incidentsFile: path.join(TMP, 'nonexistent.jsonl') });
  assert.equal(r.total_events, 0);
});

fs.rmSync(TMP, { recursive: true });
console.log('anneal-audit-sensor.spec: done');
