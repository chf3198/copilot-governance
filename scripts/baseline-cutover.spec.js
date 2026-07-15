#!/usr/bin/env node
'use strict';
/*
 * Regression spec for baseline-cutover (#3822, mode-aware #3823) — hard gate (harness:self-test #1893).
 * Node built-ins only; hermetic (no network, no gh, no live-checkout mutation). Exits non-zero on any
 * failure. The module never mutates a checkout; the temp-index divergence oracle uses os.tmpdir().
 */
const assert = require('assert');
const c = require('./baseline-cutover');

let n = 0;
const it = (name, fn) => { fn(); n += 1; console.log(`  PASS ${name}`); };

it('module selfTest() passes', () => { assert.strictEqual(c.selfTest(), true); });

it('classifyCutover buckets safe / modeDrift / content / originAhead / untracked / hold (#3823)', () => {
  const r = c.classifyCutover([
    { path: 'a.js', kind: 'safe' },
    { path: 'm.js', kind: 'modeDrift' },
    { path: 'x.js', kind: 'content' },
    { path: 'o.js', kind: 'originAhead' },
    { path: 'u.js', kind: 'untracked' },
    { path: 'h.js', kind: 'content', hold: true },
  ]);
  assert.deepStrictEqual(r.safe, ['a.js']);
  assert.deepStrictEqual(r.modeDrift, ['m.js']);
  assert.deepStrictEqual(r.contentBlockers.map((b) => b.path), ['x.js']);
  assert.deepStrictEqual(r.originAhead, ['o.js']);
  assert.deepStrictEqual(r.untracked, ['u.js']);
  assert.deepStrictEqual(r.holds, ['h.js']);
});

it('mode drift and origin-ahead are NOT content blockers (the #3823 truthfulness fix)', () => {
  const r = c.classifyCutover([{ path: 'm.js', kind: 'modeDrift' }, { path: 'o.js', kind: 'originAhead' }]);
  assert.strictEqual(r.contentBlockers.length, 0);
  assert.strictEqual(r.modeDrift.length, 1);
  assert.strictEqual(r.originAhead.length, 1);
});

it('an undocumented content divergence IS a blocker; a documented hold is not', () => {
  const r = c.classifyCutover([
    { path: 'drift.js', kind: 'content' },
    { path: 'held.js', kind: 'content', hold: true },
  ]);
  assert.deepStrictEqual(r.contentBlockers.map((b) => b.path), ['drift.js']);
  assert.deepStrictEqual(r.holds, ['held.js']);
});

it('recipe (strings-only) normalizes modes, warns on moving target, includes rollback, runs no git', () => {
  const r = c.recipe('/repo');
  const joined = r.preconditions.concat(r.reparkRecipe, r.rollbackRecipe).join('\n');
  assert.ok(/checkout -- \./.test(joined), 'mode-normalize / adopt-origin step present');
  assert.ok(/moving target|must not advance|freeze/i.test(joined), 'moving-target warning present');
  assert.ok(/rollback|restore/i.test(joined), 'rollback present');
  assert.ok(!/execFileSync|spawn/.test(joined), 'no executable calls embedded');
});

it('plan discloses scale and is CI-safe (content-ready + shape) on the current cwd', () => {
  const p = c.plan(process.cwd(), { holds: [] });
  assert.ok(typeof p.ready === 'boolean');
  assert.ok(typeof p.fullyClean === 'boolean');
  assert.ok(typeof p.modeDriftCount === 'number' && typeof p.originAheadCount === 'number');
  assert.ok(Array.isArray(p.contentBlockers));
});

it('divergence returns an array and never throws on the current cwd (temp-index, non-mutating)', () => {
  const d = c.divergence(process.cwd(), []);
  assert.ok(Array.isArray(d));
  for (const e of d) assert.ok(typeof e.path === 'string' && typeof e.kind === 'string');
});

console.log(`baseline-cutover.spec: ${n} passed, 0 failed`);
