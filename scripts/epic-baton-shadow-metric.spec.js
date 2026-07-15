#!/usr/bin/env node
// epic-baton-shadow-metric.spec.js — #3800 AC4 (Phase-1). Node built-in assert; self-executing.
'use strict';

const assert = require('assert');
const {
  corpusMetric, promotionReadiness, shadowMetric, scanCorpora, PROMOTION_THRESHOLD,
} = require('./epic-baton-shadow-metric');

let passed = 0; let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n      ${e.message}`); failed++; }
}

const epic = (n, status) => ({ number: n, file: `${n}.md`, type: 'epic', status, refsEpic: null });
const child = (n, e, status, opts = {}) => ({
  number: n, file: `${n}.md`, type: 'task', status, refsEpic: e,
  hasCloseout: opts.closeout !== false, hasEvidence: opts.evidence !== false,
});

test('corpusMetric: clean closed-epic family → 0 findings, 0% finding-rate', () => {
  const m = corpusMetric([epic(100, 'CLOSED'), child(101, 100, 'CLOSED'), child(102, 100, 'done')]);
  assert.strictEqual(m.auditableChildren, 2);
  assert.strictEqual(m.flaggedChildren, 0);
  assert.strictEqual(m.totalWarnings, 0);
  assert.strictEqual(m.findingRate, 0);
});

test('corpusMetric: finding-rate = flaggedChildren / auditableChildren', () => {
  const m = corpusMetric([
    epic(200, 'CLOSED'),
    child(201, 200, 'CLOSED', { closeout: false, evidence: false }), // flagged (EB1+EB2)
    child(202, 200, 'CLOSED'), // clean
    child(203, 200, 'CLOSED'), // clean
    child(204, 200, 'CLOSED'), // clean
  ]);
  assert.strictEqual(m.auditableChildren, 4);
  assert.strictEqual(m.flaggedChildren, 1); // one distinct child flagged, though 2 warnings
  assert.strictEqual(m.totalWarnings, 2);
  assert.strictEqual(m.byCode.EB1_child_missing_closeout, 1);
  assert.strictEqual(m.byCode.EB2_child_missing_evidence, 1);
  assert.strictEqual(m.findingRate, 0.25);
});

test('corpusMetric: open epic contributes no auditable children (rate 0, no div-by-zero)', () => {
  const m = corpusMetric([epic(300, 'OPEN'), child(301, 300, 'CLOSED', { closeout: false })]);
  assert.strictEqual(m.auditableChildren, 0);
  assert.strictEqual(m.findingRate, 0);
});

test('promotionReadiness: tracked clean + no backlog → READY', () => {
  const tracked = corpusMetric([epic(400, 'CLOSED'), child(401, 400, 'CLOSED')]);
  const r = promotionReadiness(tracked, corpusMetric([epic(400, 'CLOSED'), child(401, 400, 'CLOSED')]));
  assert.strictEqual(r.ready, true);
  assert.strictEqual(r.backlog, 0);
  assert.ok(/safe to promote/i.test(r.reason));
});

test('promotionReadiness: tracked clean but worktree backlog > 0 → DEFER', () => {
  const tracked = corpusMetric([epic(500, 'CLOSED'), child(501, 500, 'CLOSED')]);
  const worktree = corpusMetric([
    epic(500, 'CLOSED'),
    child(501, 500, 'CLOSED'),
    child(599, 500, 'CLOSED', { closeout: false, evidence: false }), // historical backlog
  ]);
  const r = promotionReadiness(tracked, worktree);
  assert.strictEqual(r.trackedUnderThreshold, true);
  assert.strictEqual(r.backlog, 1);
  assert.strictEqual(r.ready, false, 'a working-tree backlog must DEFER promotion');
  assert.ok(/DEFER promotion pending AC5/i.test(r.reason));
});

test('promotionReadiness: tracked finding-rate ≥ 2% → NOT ready', () => {
  // 1 flagged of 1 auditable = 100% ≥ 2%.
  const tracked = corpusMetric([epic(600, 'CLOSED'), child(601, 600, 'CLOSED', { closeout: false })]);
  const r = promotionReadiness(tracked, corpusMetric([epic(600, 'CLOSED')]));
  assert.strictEqual(r.trackedUnderThreshold, false);
  assert.strictEqual(r.ready, false);
  assert.ok(/NOT ready/i.test(r.reason));
});

test('promotionReadiness: no worktree metric (null) → keys on tracked only', () => {
  const tracked = corpusMetric([epic(700, 'CLOSED'), child(701, 700, 'CLOSED')]);
  const r = promotionReadiness(tracked, null);
  assert.strictEqual(r.backlog, null);
  assert.strictEqual(r.ready, true);
});

test('shadowMetric: combines both corpora + readiness; threshold surfaced', () => {
  const m = shadowMetric({
    trackedTickets: [epic(800, 'CLOSED'), child(801, 800, 'CLOSED')],
    worktreeTickets: [epic(800, 'CLOSED'), child(801, 800, 'CLOSED'), child(899, 800, 'CLOSED', { evidence: false })],
  });
  assert.strictEqual(m.threshold, PROMOTION_THRESHOLD);
  assert.strictEqual(m.tracked.flaggedChildren, 0);
  assert.strictEqual(m.worktree.flaggedChildren, 1);
  assert.strictEqual(m.promotionReadiness.ready, false); // backlog defers
});

test('shadowMetric: default args are safe (empty tracked, null worktree)', () => {
  const m = shadowMetric();
  assert.strictEqual(m.tracked.auditableChildren, 0);
  assert.strictEqual(m.worktree, null);
  assert.strictEqual(m.promotionReadiness.ready, true); // vacuously: 0% < 2%, no backlog signal
});

test('threshold is 2% (AC4 promotion bar)', () => {
  assert.strictEqual(PROMOTION_THRESHOLD, 0.02);
});

test('scanCorpora: missing wiki dir → both corpora empty, no throw (advisory-safe)', () => {
  const c = scanCorpora('/no/such/repo/root/xyz');
  assert.deepStrictEqual(c.worktreeTickets, []);
  assert.deepStrictEqual(c.trackedTickets, []);
});

console.log(`\nepic-baton-shadow-metric.spec: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
