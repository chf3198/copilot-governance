#!/usr/bin/env node
'use strict';
/*
 * Regression spec for baseline-cutover (#3822) — hard gate (harness:self-test ticket-1893).
 * Node built-ins only; hermetic (no network, no gh, no live checkout mutation). Exits non-zero on any
 * failure. The module never mutates a checkout, so these tests exercise the pure classifier, the
 * strings-only recipe, and the CI-safe plan/verify paths.
 */
const assert = require('assert');
const c = require('./baseline-cutover');

let n = 0;
const it = (name, fn) => { fn(); n += 1; console.log(`  PASS ${name}`); };

it('module selfTest() passes', () => { assert.strictEqual(c.selfTest(), true); });

it('classifyCutover buckets safe / blocker / hold / absent', () => {
  const r = c.classifyCutover([
    { path: 'x.js', existsOnOrigin: true, workingEqualsOrigin: true },
    { path: 'y.js', existsOnOrigin: true, workingEqualsOrigin: false },
    { path: 'h.js', existsOnOrigin: true, workingEqualsOrigin: false, hold: true },
    { path: 'n.js', existsOnOrigin: false, workingEqualsOrigin: false },
  ]);
  assert.deepStrictEqual(r.safe, ['x.js']);
  assert.deepStrictEqual(r.blockers.map((b) => b.path), ['y.js']);
  assert.deepStrictEqual(r.holds, ['h.js']);
  assert.deepStrictEqual(r.absent, ['n.js']);
});

it('a hold is never a blocker (kept dirty by design)', () => {
  const r = c.classifyCutover([{ path: 'gv.js', existsOnOrigin: true, workingEqualsOrigin: false, hold: true }]);
  assert.strictEqual(r.blockers.length, 0);
  assert.deepStrictEqual(r.holds, ['gv.js']);
});

it('recipe is strings-only and contains invariant/health-gate/rollback (never executes git)', () => {
  const r = c.recipe('/repo');
  assert.ok(Array.isArray(r.reparkRecipe) && r.reparkRecipe.every((s) => typeof s === 'string'));
  const joined = (r.reparkRecipe.concat(r.rollbackRecipe)).join('\n');
  assert.ok(/HEALTH GATE/.test(joined), 'health gate present');
  assert.ok(/rollback|restore/i.test(joined), 'rollback present');
  assert.ok(!/execFileSync|spawn/.test(joined), 'recipe carries no executable calls');
});

it('empty entry set is ready with invariant held', () => {
  const r = c.classifyCutover([]);
  assert.strictEqual(r.blockers.length, 0);
  assert.strictEqual(r.absent.length, 0);
});

it('verifyClean holds-out documented holds (pure over an injected status is not needed; shape check)', () => {
  // verifyClean runs git; here we assert its contract shape on the current (possibly clean) cwd.
  const v = c.verifyClean(process.cwd(), { holds: [] });
  assert.ok(typeof v.clean === 'boolean' && Array.isArray(v.dirty));
});

console.log(`baseline-cutover.spec: ${n} passed, 0 failed`);
