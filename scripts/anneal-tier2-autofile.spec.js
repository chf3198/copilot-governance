#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildCandidates, proposalMeta, isSuppressed } = require('./anneal-tier2-autofile');

const FIXTURE = path.join(__dirname, '../../tests/fixtures/anneal-tier2-events.json');
const EXPECTED = path.join(__dirname, '../../tests/fixtures/anneal-tier2-expected.json');
const TMP = path.join(os.tmpdir(), `tier2-${Date.now()}.json`);

function testCandidates() {
  const events = JSON.parse(fs.readFileSync(FIXTURE, 'utf8')).events;
  const expected = JSON.parse(fs.readFileSync(EXPECTED, 'utf8')).records;
  const got = buildCandidates(events).map((item) => ({ pattern_id: item.pattern_id, severity: item.severity }));
  assert.deepStrictEqual(got, expected);
}

function testFixtureReadable() {
  fs.writeFileSync(TMP, fs.readFileSync(FIXTURE, 'utf8'));
  assert.ok(fs.existsSync(TMP));
  fs.unlinkSync(TMP);
}

function testProposalMetaDeterministic() {
  const nowIso = '2026-05-11T00:00:00.000Z';
  const meta = proposalMeta({ pattern_id: 'changelog-conflict', severity: 'high' }, nowIso);
  assert.strictEqual(meta.dedupe_key, 'anneal:changelog-conflict:high');
  assert.strictEqual(meta.proposal_id, 'anneal:changelog-conflict:high:2026-05-11');
}

function testSuppressionMatch() {
  const rows = [{ pattern_id: 'x' }, { pattern_id: 'y' }];
  assert.strictEqual(isSuppressed('x', rows), true);
  assert.strictEqual(isSuppressed('z', rows), false);
}

testCandidates();
testFixtureReadable();
testProposalMetaDeterministic();
testSuppressionMatch();
process.stdout.write('anneal-tier2-autofile.spec: PASS\n');
