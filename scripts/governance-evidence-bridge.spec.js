#!/usr/bin/env node
'use strict';

// Regression spec for governance-evidence-bridge (#3014 Phase C, Epic #3008). Self-executing; exit 1
// on failure. Hermetic: Node built-ins only; no network, no gh. Proves the four ACs:
//   AC1 bridgeFromComments extracts per-role governance fields from baton artifacts into a
//       governance-fields/v2 snapshot (regression-lock on the pre-existing capture);
//   AC2 verifyParity recomputes the content hash (ok on a clean snapshot, fails on a tampered one) and
//       isStale enforces the freshness TTL;
//   AC3 evaluateCompleteness reports per-role required-field coverage across gates;
//   AC4 diagnose emits actionable EB_PARITY / EB_STALE / EB_MISSING_FIELD findings.

const assert = require('node:assert');
const test = require('node:test');

const {
  bridgeFromComments,
  verifyParity,
  isStale,
  evaluateCompleteness,
  diagnose,
  computeContentHash,
} = require('./governance-evidence-bridge');

const FIXED = Date.parse('2026-07-15T00:00:00.000Z');

// A full collaborator handoff — all four collaborator ROLE_FIELD_KEYS have extractor regexes.
const collabFull = {
  body: '**COLLABORATOR_HANDOFF**\nchecks_run: 12\nchecks_failed: 0\ntest_strategy: unit\ncross_family_rating: 93\n',
};
const adminHandoff = {
  body: '**ADMIN_HANDOFF**\nbranch: feat/3014-evidence-bridge\ncommit: abc1234def\npr_url: https://x/pr/1\nci_green: true\n',
};

test('AC1: bridgeFromComments extracts per-role fields into a governance-fields/v2 snapshot', () => {
  const snap = bridgeFromComments(3014, [collabFull, adminHandoff], FIXED);
  assert.strictEqual(snap.schema, 'governance-fields/v2');
  assert.strictEqual(snap.issue, 3014);
  assert.strictEqual(snap.roles.collaborator.checks_run, 12);
  assert.strictEqual(snap.roles.collaborator.checks_failed, 0);
  assert.strictEqual(snap.roles.collaborator.test_strategy, 'unit');
  assert.strictEqual(snap.roles.collaborator.cross_family_rating, 93);
  assert.strictEqual(snap.roles.admin.ci_green, true);
  assert.strictEqual(snap.roles.admin.commit, 'abc1234def');
  assert.ok(/^[0-9a-f]{64}$/.test(snap.content_hash));
});

test('AC2 parity: a clean snapshot verifies; a tampered snapshot fails', () => {
  const snap = bridgeFromComments(3014, [collabFull], FIXED);
  assert.strictEqual(verifyParity(snap).ok, true);
  // tamper a field after the hash was stamped
  const tampered = JSON.parse(JSON.stringify(snap));
  tampered.fields.checks_failed = 99;
  const v = verifyParity(tampered);
  assert.strictEqual(v.ok, false);
  assert.strictEqual(v.expected, computeContentHash(tampered));
  assert.notStrictEqual(v.expected, v.actual);
});

test('AC2 freshness: within TTL is fresh; beyond TTL (or unparseable ts) is stale', () => {
  const snap = bridgeFromComments(3014, [collabFull], FIXED);
  assert.strictEqual(isStale(snap, { ttlMs: 3600000, nowMs: FIXED + 1000 }), false);
  assert.strictEqual(isStale(snap, { ttlMs: 3600000, nowMs: FIXED + 7200000 }), true);
  assert.strictEqual(isStale({ generated_at: 'not-a-date' }, { nowMs: FIXED }), true);
});

test('AC3 completeness: full collaborator gate is complete; a missing field is reported', () => {
  const full = bridgeFromComments(3014, [collabFull], FIXED);
  const cFull = evaluateCompleteness(full, { requiredRoles: ['collaborator'] });
  assert.strictEqual(cFull.complete, true);
  assert.deepStrictEqual(cFull.roles.collaborator.missing, []);

  const partial = bridgeFromComments(3014, [{
    body: '**COLLABORATOR_HANDOFF**\nchecks_run: 5\nchecks_failed: 0\ntest_strategy: unit\n', // no cross_family_rating
  }], FIXED);
  const cPart = evaluateCompleteness(partial, { requiredRoles: ['collaborator'] });
  assert.strictEqual(cPart.complete, false);
  assert.deepStrictEqual(cPart.roles.collaborator.missing, ['cross_family_rating']);

  // a required role that never reported shows all fields missing
  const cGate = evaluateCompleteness(full, { requiredRoles: ['collaborator', 'admin'] });
  assert.strictEqual(cGate.complete, false);
  assert.ok(cGate.roles.admin.missing.length > 0);
});

test('AC4 diagnostics: clean+fresh+complete is ok; issues yield actionable findings', () => {
  const snap = bridgeFromComments(3014, [collabFull], FIXED);
  const clean = diagnose(snap, { ttlMs: 3600000, nowMs: FIXED + 1000, requiredRoles: ['collaborator'] });
  assert.strictEqual(clean.ok, true);
  assert.deepStrictEqual(clean.findings, []);

  // stale + missing role => EB_STALE + EB_MISSING_FIELD, each with remediation text
  const d = diagnose(snap, { ttlMs: 1, nowMs: FIXED + 10, requiredRoles: ['collaborator', 'consultant'] });
  assert.strictEqual(d.ok, false);
  const codes = new Set(d.findings.map((f) => f.code));
  assert.ok(codes.has('EB_STALE'));
  assert.ok(codes.has('EB_MISSING_FIELD'));
  assert.ok(d.findings.every((f) => typeof f.remediation === 'string' && f.remediation.length > 0));

  // tamper => EB_PARITY high severity
  const tampered = JSON.parse(JSON.stringify(snap));
  tampered.fields.checks_run = 999;
  const dp = diagnose(tampered, { ttlMs: 3600000, nowMs: FIXED + 1000, requiredRoles: ['collaborator'] });
  assert.ok(dp.findings.some((f) => f.code === 'EB_PARITY' && f.severity === 'high'));
});
