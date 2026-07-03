#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { run } = require('./anneal-tier1-aggregator');

const FIXTURE = path.join(__dirname, '../../tests/fixtures/anneal-tier1-sensors.json');
const EXPECTED = path.join(__dirname, '../../tests/fixtures/anneal-tier1-expected.json');
const OUTPUT = path.join(os.tmpdir(), `anneal-tier1-${Date.now()}.json`);

function normalize(items) {
  return items.map((item) => ({ pattern_id: item.pattern_id, severity: item.severity }));
}

function testGoldenFixture() {
  const result = run(['--fixture', FIXTURE, '--dry-run']);
  const expected = JSON.parse(fs.readFileSync(EXPECTED, 'utf8')).events;
  assert.deepStrictEqual(normalize(result.events), normalize(expected));
}

function testOutFile() {
  run(['--fixture', FIXTURE, '--dry-run', '--out', OUTPUT]);
  const payload = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
  assert.ok(Array.isArray(payload.events));
  fs.unlinkSync(OUTPUT);
}

testGoldenFixture();
testOutFile();
process.stdout.write('anneal-tier1-aggregator.spec: PASS\n');
