#!/usr/bin/env node
'use strict';

// Regression spec for enforcement-telemetry (#3804). Self-executing; exit 1 on any failure.
// Hermetic: Node built-ins only; no network, no `gh`, no untracked deps. Covers the module's own
// logic — the pure `compareBaseline` regression detector (exhaustively, with synthetic records) and
// `collect` invariants over the real repo tree. The underlying reachability audit is already proven
// by enforcement-wiring-audit.spec.js (#3802), so this spec does not re-test it.

const assert = require('assert');
const path = require('path');

const { collect, compareBaseline, SCHEMA_VERSION } = require('./enforcement-telemetry');

let passed = 0;
const ok = (name, fn) => {
  fn();
  passed++;
  console.log(`ok - ${name}`);
};

// ---- collect() invariants over the real tree (the archive root under clean-tree CI) ----
const repoRoot = path.resolve(__dirname, '..');

ok('collect returns a well-formed, versioned record', () => {
  const rec = collect(repoRoot);
  assert.strictEqual(rec.schemaVersion, SCHEMA_VERSION);
  assert.strictEqual(typeof rec.checkedValidators, 'number');
  assert.ok(rec.checkedValidators > 0, 'expected at least one validator on the real tree');
  assert.ok(Array.isArray(rec.unwired));
});

ok('collect is internally consistent: enforced + unwired === checked', () => {
  const rec = collect(repoRoot);
  assert.strictEqual(rec.enforcedCount + rec.unwiredCount, rec.checkedValidators);
  assert.strictEqual(rec.unwired.length, rec.unwiredCount);
});

ok('collect ratio is in [0,1] and matches counts', () => {
  const rec = collect(repoRoot);
  assert.ok(rec.enforcedRatio >= 0 && rec.enforcedRatio <= 1);
  const expected = Math.round((rec.enforcedCount / rec.checkedValidators) * 1e4) / 1e4;
  assert.strictEqual(rec.enforcedRatio, expected);
});

ok('collect returns the unwired list sorted (deterministic/diffable)', () => {
  const rec = collect(repoRoot);
  const sorted = [...rec.unwired].sort();
  assert.deepStrictEqual(rec.unwired, sorted);
});

ok('this repo has a fully wired enforcement surface (0 unwired incl. this validator)', () => {
  const rec = collect(repoRoot);
  // The wiring of enforcement-telemetry into governance-verify + the registry entry must keep the
  // surface fully enforced — a self-check that this ticket did not itself introduce an unwired guard.
  assert.strictEqual(rec.unwiredCount, 0, `unexpected unwired: ${rec.unwired.join(', ')}`);
  assert.ok(rec.unwired.every(n => n !== 'enforcement-telemetry'));
});

// ---- compareBaseline() — the pure regression detector ----
const base = { schemaVersion: SCHEMA_VERSION, checkedValidators: 20, enforcedCount: 20, unwiredCount: 0, unwired: [] };

ok('no regression when current equals baseline', () => {
  const r = compareBaseline({ ...base }, base);
  assert.strictEqual(r.regressed, false);
  assert.deepStrictEqual(r.newlyUnwired, []);
});

ok('regression flagged when unwired count rises', () => {
  const cur = { ...base, enforcedCount: 19, unwiredCount: 1, unwired: ['new-guard'] };
  const r = compareBaseline(cur, base);
  assert.strictEqual(r.regressed, true);
  assert.deepStrictEqual(r.newlyUnwired, ['new-guard']);
  assert.ok(r.warnings.some(w => /0 → 1/.test(w)));
  assert.ok(r.warnings.some(w => /new-guard/.test(w)));
});

ok('same-count swap (one wired, another orphaned) is still a regression', () => {
  const b = { ...base, unwiredCount: 1, unwired: ['old-guard'], enforcedCount: 19 };
  const cur = { ...base, unwiredCount: 1, unwired: ['other-guard'], enforcedCount: 19 };
  const r = compareBaseline(cur, b);
  assert.strictEqual(r.regressed, true, 'count unchanged but a different validator is now unwired');
  assert.deepStrictEqual(r.newlyUnwired, ['other-guard']);
});

ok('improvement (unwired count drops) is NOT a regression', () => {
  const b = { ...base, unwiredCount: 2, unwired: ['a', 'b'], enforcedCount: 18 };
  const cur = { ...base, unwiredCount: 0, unwired: [], enforcedCount: 20 };
  const r = compareBaseline(cur, b);
  assert.strictEqual(r.regressed, false);
  assert.deepStrictEqual(r.newlyUnwired, []);
});

ok('missing/invalid baseline yields advisory, not a crash or false regression', () => {
  const r = compareBaseline({ ...base }, null);
  assert.strictEqual(r.regressed, false);
  assert.ok(r.warnings.some(w => /no baseline/.test(w)));
});

console.log(`\n${passed} checks passed.`);
