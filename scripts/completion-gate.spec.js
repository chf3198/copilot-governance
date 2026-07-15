#!/usr/bin/env node
'use strict';

// Regression spec for completion-gate (#3799 AC4). Self-executing; exit 1 on any failure.
// Hermetic: Node built-ins only. Proves (a) the corrected gate predicate treats untracked /
// unrelated working-tree drift as non-blocking while blocking only on a dirty committed
// deliverable or non-green CI, (b) the remaining-step message reuses the AC2 taxonomy to say
// reversible-remaining vs carve-out-remaining, and (c) the structured-marker advisory fires on
// malformed / untracked-cited markers and stays silent for markerless docs.

const assert = require('node:assert');

const {
  evaluateCompletion,
  verifyGateDocs,
  parseCompletionGate,
  parseCompletionBlocker,
  COMPLETE,
  BLOCKED,
} = require('./completion-gate');

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };

const done = (over = {}) => ({
  deliverable: { committedClean: true, ciStatus: 'green' },
  untrackedCount: 0,
  unrelatedModifiedCount: 0,
  remainingSteps: [],
  ...over,
});

// ---- evaluateCompletion(): the corrected gate predicate ----

ok('clean committed deliverable + green CI + 718 untracked ⇒ COMPLETE (drift ignored)', () => {
  const v = evaluateCompletion(done({ untrackedCount: 718, unrelatedModifiedCount: 39 }));
  assert.strictEqual(v.gate, COMPLETE);
  assert.deepStrictEqual(v.blockers, []);
  assert.strictEqual(v.ignoredDrift.untrackedCount, 718);
  assert.strictEqual(v.ignoredDrift.unrelatedModifiedCount, 39);
  assert.ok(/718 untracked/.test(v.message), 'message surfaces the ignored drift count');
  assert.ok(/not a completion blocker/i.test(v.message));
});

ok('dirty committed deliverable ⇒ BLOCKED with named blocker', () => {
  const v = evaluateCompletion(done({ deliverable: { committedClean: false, ciStatus: 'green' } }));
  assert.strictEqual(v.gate, BLOCKED);
  assert.strictEqual(v.blockers.length, 1);
  assert.ok(/committed deliverable is not clean/.test(v.blockers[0]));
});

ok('non-green CI ⇒ BLOCKED even with clean committed deliverable', () => {
  const v = evaluateCompletion(done({ deliverable: { committedClean: true, ciStatus: 'red' } }));
  assert.strictEqual(v.gate, BLOCKED);
  assert.ok(v.blockers.some(b => /CI is not green/.test(b)));
});

ok('untracked drift alone NEVER blocks (the annealed 718-untracked false positive)', () => {
  const v = evaluateCompletion(done({ untrackedCount: 718, deliverable: { committedClean: true, ciStatus: 'green' } }));
  assert.strictEqual(v.gate, COMPLETE);
  assert.deepStrictEqual(v.blockers, []);
});

// ---- remaining-step disposition reuses the AC2 taxonomy ----

ok('reversible-only remaining ⇒ COMPLETE / reversible-remaining message', () => {
  const v = evaluateCompletion(done({
    remainingSteps: [
      { action: 'push', target: 'feat/x' },
      { action: 'pr' },
      { action: 'squash-merge', target: 'main', protectedTarget: false },
    ],
  }));
  assert.strictEqual(v.gate, COMPLETE);
  assert.strictEqual(v.remaining.escalateRequired, false);
  assert.ok(/reversible-remaining/i.test(v.message), 'message says reversible-remaining');
  assert.ok(/COMPLETE autonomously/i.test(v.message));
});

ok('a protected-merge remaining step ⇒ carve-out-remaining / ESCALATE message', () => {
  const v = evaluateCompletion(done({
    remainingSteps: [
      { action: 'push', target: 'feat/x' },
      { action: 'merge', target: 'main', protectedTarget: true },
    ],
  }));
  assert.strictEqual(v.gate, COMPLETE);
  assert.strictEqual(v.remaining.escalateRequired, true);
  assert.ok(/carve-out-remaining/i.test(v.message), 'message says carve-out-remaining');
  assert.ok(/ESCALATE/i.test(v.message));
});

ok('security-weakening remaining step ⇒ carve-out-remaining (AC2 fail-safe honored)', () => {
  const v = evaluateCompletion(done({
    remainingSteps: [{ action: 'push', securityWeakening: true }],
  }));
  assert.strictEqual(v.remaining.escalateRequired, true);
  assert.ok(/carve-out-remaining/i.test(v.message));
});

ok('no remaining steps ⇒ plain COMPLETE (no reversible/carve-out clause)', () => {
  const v = evaluateCompletion(done());
  assert.strictEqual(v.gate, COMPLETE);
  assert.ok(/no steps remaining/i.test(v.message));
});

ok('empty / garbage ctx is safe (fail-closed to BLOCKED, no throw)', () => {
  const v = evaluateCompletion(undefined);
  assert.strictEqual(v.gate, BLOCKED); // missing deliverable ⇒ not committedClean ⇒ blocked
  assert.ok(Array.isArray(v.blockers) && v.blockers.length >= 1);
});

// ---- structured-marker advisory ----

ok('markerless doc ⇒ zero findings (present-marker-only, no prose scanning)', () => {
  const { warnings } = verifyGateDocs([{ file: 'a.md', text: 'discusses carve-out and untracked drift at length' }]);
  assert.deepStrictEqual(warnings, []);
});

ok('malformed marker ⇒ CG1', () => {
  const { warnings } = verifyGateDocs([{ file: 'b.md', text: 'Completion-Gate: donezo' }]);
  assert.deepStrictEqual(warnings.map(w => w.code), ['CG1_malformed_completion_gate']);
});

ok('each valid gate disposition ⇒ no CG1', () => {
  for (const g of ['complete', 'blocked', 'reversible-remaining', 'carve-out-remaining']) {
    const { warnings } = verifyGateDocs([{ file: `g-${g}.md`, text: `Completion-Gate: ${g}` }]);
    assert.strictEqual(warnings.filter(w => w.code === 'CG1_malformed_completion_gate').length, 0, `${g} should be valid`);
  }
});

ok('blocked + untracked-cited blocker ⇒ CG2 (the annealed false positive)', () => {
  const { warnings } = verifyGateDocs([{
    file: 'c.md',
    text: 'Completion-Gate: blocked\nCompletion-Blocker: 718 untracked files in working tree',
  }]);
  assert.deepStrictEqual(warnings.map(w => w.code), ['CG2_untracked_cited_as_blocker']);
});

ok('blocked + a legitimate (non-untracked) blocker ⇒ no CG2', () => {
  const { warnings } = verifyGateDocs([{
    file: 'd.md',
    text: 'Completion-Gate: blocked\nCompletion-Blocker: CI red on the deliverable',
  }]);
  assert.deepStrictEqual(warnings, []);
});

ok('backticked marker value parses', () => {
  assert.strictEqual(parseCompletionGate('Completion-Gate: `complete`'), 'complete');
  assert.strictEqual(parseCompletionBlocker('Completion-Blocker: `untracked drift`'), 'untracked drift');
});

console.log(`\n${passed} assertions passed.`);
process.exit(0);
