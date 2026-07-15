#!/usr/bin/env node
// epic-baton-backfill-plan.spec.js — #3800 AC5 (Phase-1). Node built-in assert; self-executing.
'use strict';

const assert = require('assert');
const { classifyInstance, backfillPlan, scanFlagged, GUARD_CUTOFF_ISO } = require('./epic-baton-backfill-plan');

let passed = 0; let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n      ${e.message}`); failed++; }
}

test('classifyInstance: real sibling evidence → hasEvidence (pointer, never fabricate)', () => {
  assert.strictEqual(classifyInstance({ number: 1, created: '2020-01-01', hasSiblingEvidence: true }), 'hasEvidence');
});

test('classifyInstance: pre-cutoff + no evidence → grandfather (exempt from future blocking gate)', () => {
  assert.strictEqual(classifyInstance({ number: 2, created: '2026-07-13', hasSiblingEvidence: false }), 'grandfather');
});

test('classifyInstance: post-cutoff + no evidence → mustRemediate (real baton required)', () => {
  assert.strictEqual(classifyInstance({ number: 3, created: '2026-07-15', hasSiblingEvidence: false }), 'mustRemediate');
});

test('classifyInstance: exactly the cutoff date is NOT pre-cutoff → mustRemediate', () => {
  assert.strictEqual(classifyInstance({ number: 4, created: GUARD_CUTOFF_ISO, hasSiblingEvidence: false }), 'mustRemediate');
});

test('classifyInstance: missing created date → mustRemediate (fail-safe, not silently grandfathered)', () => {
  assert.strictEqual(classifyInstance({ number: 5, created: null, hasSiblingEvidence: false }), 'mustRemediate');
});

test('classifyInstance: evidence wins even when post-cutoff', () => {
  assert.strictEqual(classifyInstance({ number: 6, created: '2026-07-20', hasSiblingEvidence: true }), 'hasEvidence');
});

test('backfillPlan: partitions + sorts + summarizes; dryRun + fabricates=false invariants', () => {
  const plan = backfillPlan([
    { number: 30, created: '2026-07-15', hasSiblingEvidence: false }, // mustRemediate
    { number: 10, created: '2026-01-01', hasSiblingEvidence: false }, // grandfather
    { number: 20, created: '2026-07-20', hasSiblingEvidence: true },  // hasEvidence
    { number: 5, created: '2025-12-31', hasSiblingEvidence: false },  // grandfather
  ]);
  assert.deepStrictEqual(plan.grandfather, [5, 10]);
  assert.deepStrictEqual(plan.hasEvidence, [20]);
  assert.deepStrictEqual(plan.mustRemediate, [30]);
  assert.strictEqual(plan.summary.total, 4);
  assert.strictEqual(plan.dryRun, true);
  assert.strictEqual(plan.fabricates, false, 'planner MUST never fabricate evidence');
  assert.strictEqual(plan.cutoffISO, GUARD_CUTOFF_ISO);
});

test('backfillPlan: custom cutoff honored', () => {
  const plan = backfillPlan(
    [{ number: 1, created: '2026-06-01', hasSiblingEvidence: false }],
    { cutoffISO: '2026-06-15' },
  );
  assert.deepStrictEqual(plan.grandfather, [1]);
  assert.strictEqual(plan.cutoffISO, '2026-06-15');
});

test('backfillPlan: empty input → zero summary, no throw', () => {
  const plan = backfillPlan([]);
  assert.strictEqual(plan.summary.total, 0);
  assert.deepStrictEqual([plan.grandfather, plan.hasEvidence, plan.mustRemediate], [[], [], []]);
});

test('scanFlagged: missing repo/wiki → [] (advisory-safe, no throw)', () => {
  assert.deepStrictEqual(scanFlagged('/no/such/repo/root/xyz'), []);
});

test('cutoff constant is the #3800 guard introduction date', () => {
  assert.strictEqual(GUARD_CUTOFF_ISO, '2026-07-14');
});

console.log(`\nepic-baton-backfill-plan.spec: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
