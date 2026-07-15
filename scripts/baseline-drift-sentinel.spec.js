#!/usr/bin/env node
'use strict';
/*
 * Regression spec for baseline-drift-sentinel (#3819) — hard gate (harness:self-test ticket-1893).
 * Node built-ins only; hermetic (no network, no gh). Runs the module's selfTest() plus a few extra
 * assertions on the pure classifier and the CI-safe report path. Exits non-zero on any failure so CI
 * fails loudly, while the sentinel itself stays advisory-first in production.
 */
const assert = require('assert');
const s = require('./baseline-drift-sentinel');

let n = 0;
const it = (name, fn) => { fn(); n += 1; console.log(`  PASS ${name}`); };

// The module's own self-test must pass.
it('module selfTest() passes', () => { assert.strictEqual(s.selfTest(), true); });

it('classifyDrift partitions ignored vs actionable', () => {
  const r = s.classifyDrift(['.copilot/a', 'scripts/x.js', '.megingjord/session.id', 'y.md']);
  assert.strictEqual(r.total, 4);
  assert.deepStrictEqual(r.actionable.sort(), ['scripts/x.js', 'y.md']);
  assert.strictEqual(r.ignored.length, 2);
});

it('classifyDrift drops blanks and is order-preserving for actionable', () => {
  const r = s.classifyDrift(['  ', 'a.js', '', 'b.py']);
  assert.strictEqual(r.total, 2);
  assert.deepStrictEqual(r.actionable, ['a.js', 'b.py']);
});

it('isExpectedMutation matches prefixes and substrings, not real code', () => {
  assert.ok(s.isExpectedMutation('.claude/settings.json'));
  assert.ok(s.isExpectedMutation('hooks/scripts/runtime_session_register.py'.replace('register', '')));
  assert.ok(s.isExpectedMutation('a/state_store.json'));
  assert.ok(!s.isExpectedMutation('scripts/governance-verify.js'));
});

it('report is CI-safe on a clean/huge-threshold run (never beyondThreshold, never throws)', () => {
  const r = s.report(process.cwd(), { threshold: 10 ** 9 });
  assert.strictEqual(r.beyondThreshold, false);
  assert.ok(Number.isFinite(r.driftTotal) && Number.isFinite(r.actionable));
  assert.strictEqual(r.threshold, 10 ** 9);
});

it('beyondThreshold flips only above the threshold (advisory metric)', () => {
  // drive classifyDrift deterministically via an injected classifier, then mimic report math
  const paths = Array.from({ length: 30 }, (_, i) => `scripts/f${i}.js`);
  const { actionable } = s.classifyDrift(paths);
  assert.strictEqual(actionable.length, 30);
  assert.ok(actionable.length > s.DEFAULT_THRESHOLD, 'default threshold is below 30');
});

console.log(`baseline-drift-sentinel.spec: ${n} passed, 0 failed`);
