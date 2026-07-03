#!/usr/bin/env node
// anneal-event-schema.spec.js — Contract tests for event schema v2 / backward compat
// Epic #1308 — Workstream B / #1315
// Test runner: Node built-in assert (no external deps required).
// Run: node scripts/global/anneal-event-schema.spec.js
'use strict';

const assert = require('assert');
const os = require('os');
const fs = require('fs');
const path = require('path');

const {
  isValidV1, isValidV2, upgradeV1ToV2, detectVersion, normalise,
  emitEvent, readEvents,
  VALID_TIERS, VALID_ROLES, VALID_TRIGGERS, VALID_SEVERITIES,
} = require('./anneal-event-schema');

// ─── Test helpers ─────────────────────────────────────────────────────────────
let passed = 0; let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n      ${e.message}`); failed++; }
}

// Shared timestamp fixture (avoids magic-number warnings)
const TS_FIXTURE = '2026-01-01T00:00:00Z';

// Minimal valid v1 event (matches fields used by anneal-goal-sensor.js)
const V1_MIN = { timestamp: TS_FIXTURE, status: 'proposed',
  pattern_id: 'p-001', count: 3, window_start: TS_FIXTURE,
  evidence: ['#100'], suppression_until: null };

// Minimal valid v2 event
const V2_MIN = {
  version: 2, timestamp: TS_FIXTURE, tier: 1,
  trigger_role: 'collaborator', trigger_type: 'manual-pull',
  pattern_id: 'p-001', severity: 'medium', evidence: ['#100'],
  ticket_ref: '#100', epic_ref: '#1308', session_id: 'ses-abc',
  schema_compat: 'v1-readers-must-ignore-fields-not-in-v1',
};

// ─── isValidV1 ───────────────────────────────────────────────────────────────
console.log('\n[isValidV1]');
test('accepts minimal v1 event', () => {
  assert.deepStrictEqual(isValidV1(V1_MIN).ok, true);
});
test('accepts v2 event as v1 (unknown fields ignored)', () => {
  assert.deepStrictEqual(isValidV1(V2_MIN).ok, true);
});
test('rejects null', () => {
  assert.deepStrictEqual(isValidV1(null).ok, false);
});
test('rejects event missing timestamp', () => {
  const e = { ...V1_MIN }; delete e.timestamp;
  assert.deepStrictEqual(isValidV1(e).ok, false);
});
test('accepts event with only timestamp (absolute minimum)', () => {
  assert.deepStrictEqual(isValidV1({ timestamp: TS_FIXTURE }).ok, true);
});

// ─── isValidV2 ───────────────────────────────────────────────────────────────
console.log('\n[isValidV2]');
test('accepts valid v2 event', () => {
  assert.deepStrictEqual(isValidV2(V2_MIN).ok, true);
});
test('rejects event without version field', () => {
  const e = { ...V2_MIN }; delete e.version;
  assert.deepStrictEqual(isValidV2(e).ok, false);
});
test('rejects wrong version number', () => {
  assert.deepStrictEqual(isValidV2({ ...V2_MIN, version: 1 }).ok, false);
});
test('rejects invalid tier', () => {
  assert.deepStrictEqual(isValidV2({ ...V2_MIN, tier: 9 }).ok, false);
});
test('rejects invalid trigger_role', () => {
  assert.deepStrictEqual(isValidV2({ ...V2_MIN, trigger_role: 'robot' }).ok, false);
});
test('rejects invalid trigger_type', () => {
  assert.deepStrictEqual(isValidV2({ ...V2_MIN, trigger_type: 'unknown' }).ok, false);
});
test('rejects invalid severity', () => {
  assert.deepStrictEqual(isValidV2({ ...V2_MIN, severity: 'extreme' }).ok, false);
});
test('accepts unknown extra fields (forward-compat)', () => {
  assert.deepStrictEqual(isValidV2({ ...V2_MIN, future_field: 'x' }).ok, true);
});
test('accepts all valid tier values', () => {
  for (const tierVal of VALID_TIERS) {
    assert.ok(isValidV2({ ...V2_MIN, tier: tierVal }).ok, `tier ${tierVal} should be valid`);
  }
});
test('accepts all valid severities', () => {
  for (const sevVal of VALID_SEVERITIES) {
    assert.ok(isValidV2({ ...V2_MIN, severity: sevVal }).ok, `severity ${sevVal} should be valid`);
  }
});

// ─── upgradeV1ToV2 ───────────────────────────────────────────────────────────
console.log('\n[upgradeV1ToV2]');
test('preserves all v1 fields', () => {
  const up = upgradeV1ToV2(V1_MIN);
  for (const [k, v] of Object.entries(V1_MIN)) {
    assert.deepStrictEqual(up[k], v, `field ${k} should be preserved`);
  }
});
test('upgraded event passes isValidV2', () => {
  const up = upgradeV1ToV2(V1_MIN);
  const { ok, errors } = isValidV2(up);
  assert.ok(ok, `validation errors: ${errors.join(', ')}`);
});
test('overrides take effect', () => {
  const up = upgradeV1ToV2(V1_MIN, { tier: 2, severity: 'high' });
  assert.strictEqual(up.tier, 2);
  assert.strictEqual(up.severity, 'high');
});
test('version is always 2 regardless of override attempt', () => {
  const up = upgradeV1ToV2({ ...V1_MIN, version: 1 });
  assert.strictEqual(up.version, 2);
});

// ─── detectVersion ───────────────────────────────────────────────────────────
console.log('\n[detectVersion]');
test('v1 event returns 1', () => assert.strictEqual(detectVersion(V1_MIN), 1));
test('v2 event returns 2', () => assert.strictEqual(detectVersion(V2_MIN), 2));
test('undefined event returns 1', () => assert.strictEqual(detectVersion(undefined), 1));

// ─── normalise ───────────────────────────────────────────────────────────────
console.log('\n[normalise]');
test('v2 event passes through unchanged', () => {
  assert.deepStrictEqual(normalise(V2_MIN), V2_MIN);
});
test('v1 event is upgraded to v2', () => {
  const normalised = normalise(V1_MIN);
  assert.strictEqual(normalised.version, 2);
  assert.deepStrictEqual(isValidV2(normalised).ok, true);
});

// ─── emitEvent + readEvents (file I/O integration) ───────────────────────────
console.log('\n[emitEvent / readEvents]');
const TMP = path.join(os.tmpdir(), `anneal-schema-test-${Date.now()}.jsonl`);
test('emitEvent writes a v2 event to file', () => {
  emitEvent(V2_MIN, TMP);
  const lines = fs.readFileSync(TMP, 'utf8').split('\n').filter(Boolean);
  assert.strictEqual(lines.length, 1);
  assert.deepStrictEqual(JSON.parse(lines[0]).version, 2);
});
test('emitEvent rejects invalid v2 event', () => {
  assert.throws(() => emitEvent({ timestamp: TS_FIXTURE }, TMP));
});
test('readEvents returns empty array for non-existent file', () => {
  assert.deepStrictEqual(readEvents('/tmp/no-such-file-' + Date.now()), []);
});
test('readEvents normalises v1 events to v2', () => {
  const tmp2 = TMP + '.v1';
  fs.writeFileSync(tmp2, JSON.stringify(V1_MIN) + '\n', 'utf8');
  const events = readEvents(tmp2);
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].version, 2);
  fs.unlinkSync(tmp2);
});
test('readEvents handles mixed v1/v2 feed', () => {
  const tmp3 = TMP + '.mixed';
  fs.writeFileSync(tmp3, [
    JSON.stringify(V1_MIN),
    JSON.stringify(V2_MIN),
  ].join('\n') + '\n', 'utf8');
  const events = readEvents(tmp3);
  assert.strictEqual(events.length, 2);
  assert.ok(events.every(e => e.version === 2));
  fs.unlinkSync(tmp3);
});
test('readEvents skips unparseable lines', () => {
  const tmp4 = TMP + '.bad';
  fs.writeFileSync(tmp4, 'not-json\n' + JSON.stringify(V2_MIN) + '\n', 'utf8');
  const events = readEvents(tmp4);
  assert.strictEqual(events.length, 1);
  fs.unlinkSync(tmp4);
});

// ─── Contract: anneal-goal-sensor.js v1 reader compatibility ─────────────────
// anneal-goal-sensor.js reads: timestamp, status
// It filters events by timestamp > cutoff and status === 'resolved'|'suppressed'
console.log('\n[contract: anneal-goal-sensor.js compatibility]');
test('v2 event has timestamp and status fields (v1 reader can read)', () => {
  const up = upgradeV1ToV2({ ...V1_MIN, status: 'resolved' });
  assert.ok(up.timestamp, 'timestamp present');
  assert.strictEqual(up.status, 'resolved');
});
test('v2 event without status field does not break v1 reader (status is optional in v1)', () => {
  const up = upgradeV1ToV2({ timestamp: TS_FIXTURE });
  // v1 reader filters on status; undefined is not === 'resolved' — safe.
  assert.ok(!['resolved', 'suppressed'].includes(up.status));
});

// ─── Contract: anneal-review.js v1 reader compatibility ──────────────────────
// anneal-review.js reads: status, pattern_id, count, window_start, evidence
console.log('\n[contract: anneal-review.js compatibility]');
test('v2-upgraded event preserves pattern_id, count, window_start, evidence', () => {
  const up = upgradeV1ToV2(V1_MIN);
  assert.strictEqual(up.pattern_id, V1_MIN.pattern_id);
  assert.strictEqual(up.count, V1_MIN.count);
  assert.strictEqual(up.window_start, V1_MIN.window_start);
  assert.deepStrictEqual(up.evidence, V1_MIN.evidence);
});

// ─── Cleanup + summary ────────────────────────────────────────────────────────
if (fs.existsSync(TMP)) fs.unlinkSync(TMP);
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) { console.error('FAIL'); process.exit(1); }
console.log('PASS');
