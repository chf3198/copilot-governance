#!/usr/bin/env node
'use strict';
// anneal-log-rotate.spec.js — unit tests for AC4
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { rotate, readLines, archivePath } = require('./anneal-log-rotate');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'anneal-rotate-'));
const FIXTURE = path.join(TMP, 'incidents.jsonl');
const ARCHIVE = path.join(TMP, 'incidents.test.jsonl.bak');

function writeLines(n) {
  const lines = Array.from({ length: n }, (_, i) => JSON.stringify({ idx: i }));
  fs.writeFileSync(FIXTURE, lines.join('\n') + '\n');
}

function test(name, fn) {
  try { fn(); console.log(`  PASS ${name}`); }
  catch (e) { console.error(`  FAIL ${name}: ${e.message}`); process.exitCode = 1; }
}

test('no rotation under maxLines', () => {
  writeLines(50);
  const r = rotate({ incidentsFile: FIXTURE, maxLines: 2000, dryRun: true });
  assert.equal(r.rotated, false);
});

test('rotation fires over maxLines', () => {
  writeLines(300);
  const r = rotate({ incidentsFile: FIXTURE, maxLines: 200, archivePath: ARCHIVE });
  assert.equal(r.rotated, true);
  assert.equal(r.kept, 200);
  assert.equal(r.archived, 100);
});

test('archive file contains rotated lines', () => {
  assert.ok(fs.existsSync(ARCHIVE));
  const lines = readLines(ARCHIVE);
  assert.equal(lines.length, 100);
});

test('incidents file trimmed to maxLines', () => {
  const lines = readLines(FIXTURE);
  assert.equal(lines.length, 200);
});

test('dry-run does not write files', () => {
  writeLines(300);
  const dryArchive = path.join(TMP, 'dry.jsonl.bak');
  rotate({ incidentsFile: FIXTURE, maxLines: 200, archivePath: dryArchive, dryRun: true });
  assert.ok(!fs.existsSync(dryArchive));
});

fs.rmSync(TMP, { recursive: true });
console.log('anneal-log-rotate.spec: done');
