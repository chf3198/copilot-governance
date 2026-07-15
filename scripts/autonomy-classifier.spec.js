'use strict';

// Spec for autonomy-classifier (Epic #3799 AC2). Node built-ins only; self-executing;
// exits non-zero on the first assertion failure so CI treats it as a hard test.

const assert = require('node:assert');
const {
  REVERSIBLE,
  CARVE_OUT,
  classifyStep,
  classifySteps,
  parseAutonomyDecision,
  verifyAdminDocs,
} = require('./autonomy-classifier');

// ── Reversible steps ─────────────────────────────────────────────────────────
assert.strictEqual(classifyStep({ action: 'push', target: 'feature-branch' }).classification, REVERSIBLE, 'feature-branch push is reversible');
assert.strictEqual(classifyStep({ action: 'pr' }).classification, REVERSIBLE, 'opening a PR is reversible');
assert.strictEqual(classifyStep({ action: 'pr-update' }).classification, REVERSIBLE, 'updating a PR is reversible');
assert.strictEqual(
  classifyStep({ action: 'squash-merge', target: 'main', protectedTarget: false }).classification,
  REVERSIBLE,
  'squash-merge to an UNPROTECTED main is reversible',
);
assert.strictEqual(classifyStep({ action: 'push' }).escalate, false, 'reversible ⇒ no escalation');

// ── Carve-outs ───────────────────────────────────────────────────────────────
assert.strictEqual(
  classifyStep({ action: 'squash-merge', target: 'main', protectedTarget: true }).classification,
  CARVE_OUT,
  'merge to a PROTECTED main is a carve-out',
);
assert.strictEqual(classifyStep({ action: 'merge', production: true }).classification, CARVE_OUT, 'production merge is a carve-out');
assert.strictEqual(classifyStep({ action: 'push', securityWeakening: true }).classification, CARVE_OUT, 'security-weakening is always a carve-out');
assert.strictEqual(classifyStep({ action: 'tag', irreversible: true }).classification, CARVE_OUT, 'explicitly irreversible act is a carve-out');
assert.strictEqual(classifyStep({ action: 'squash-merge', target: 'main', protectedTarget: true }).escalate, true, 'carve-out ⇒ escalate');

// security-weakening dominates even a would-be-reversible action.
assert.strictEqual(
  classifyStep({ action: 'push', target: 'feature-branch', securityWeakening: true }).classification,
  CARVE_OUT,
  'security-weakening overrides an otherwise-reversible push',
);

// ── Fail-safe bias: unknown ⇒ carve-out ──────────────────────────────────────
assert.strictEqual(classifyStep({ action: 'merge', target: 'main' }).classification, CARVE_OUT, 'merge with UNKNOWN protection ⇒ fail-safe carve-out');
assert.strictEqual(classifyStep({ action: 'frobnicate' }).classification, CARVE_OUT, 'unrecognized action ⇒ fail-safe carve-out');
assert.strictEqual(classifyStep({}).classification, CARVE_OUT, 'empty step ⇒ fail-safe carve-out');
assert.strictEqual(classifyStep(null).classification, CARVE_OUT, 'null step ⇒ fail-safe carve-out (no throw)');

// ── classifySteps summary ────────────────────────────────────────────────────
const summary = classifySteps([
  { action: 'push', target: 'feature-branch' },
  { action: 'pr' },
  { action: 'squash-merge', target: 'main', protectedTarget: false },
  { action: 'merge', target: 'main', protectedTarget: true },
]);
assert.strictEqual(summary.reversible.length, 3, 'three reversible steps');
assert.strictEqual(summary.carveOuts.length, 1, 'one carve-out step');
assert.strictEqual(summary.escalateRequired, true, 'escalateRequired true when any carve-out present');
assert.strictEqual(classifySteps([{ action: 'push' }]).escalateRequired, false, 'no carve-out ⇒ no escalation');
assert.deepStrictEqual(classifySteps(null), { reversible: [], carveOuts: [], escalateRequired: false }, 'null steps tolerated');

// ── parseAutonomyDecision ────────────────────────────────────────────────────
assert.strictEqual(parseAutonomyDecision('Autonomy-Decision: reversible'), 'reversible', 'parse plain marker');
assert.strictEqual(parseAutonomyDecision('Autonomy-Decision: `carve-out`'), 'carve-out', 'parse backticked marker');
assert.strictEqual(parseAutonomyDecision('no marker here'), null, 'absent marker ⇒ null');

// ── verifyAdminDocs advisory ─────────────────────────────────────────────────
// No marker → no finding (silence is not punished).
assert.deepStrictEqual(
  verifyAdminDocs([{ file: 'a.md', text: 'squash-merge to main. Admin complete.' }]).warnings,
  [],
  'a doc with a merge but NO decision marker yields no finding',
);
// Valid reversible decision → no finding.
assert.deepStrictEqual(
  verifyAdminDocs([{ file: 'b.md', text: 'Autonomy-Decision: reversible\nautonomous squash-merge to main.' }]).warnings,
  [],
  'reversible decision with an autonomous merge is consistent',
);
// AUT1 malformed value.
assert.deepStrictEqual(
  verifyAdminDocs([{ file: 'c.md', text: 'Autonomy-Decision: maybe' }]).warnings.map((w) => w.code),
  ['AUT1_malformed_autonomy_decision'],
  'AUT1: non-taxonomy value flagged',
);
// AUT2 contradiction: carve-out yet autonomous merge.
assert.deepStrictEqual(
  verifyAdminDocs([{ file: 'd.md', text: 'Autonomy-Decision: carve-out\nautonomously merged to main.' }]).warnings.map((w) => w.code),
  ['AUT2_carveout_auto_merged'],
  'AUT2: carve-out decision + autonomous merge is a contradiction',
);
// carve-out WITHOUT an autonomous merge (properly escalated) → no finding.
assert.deepStrictEqual(
  verifyAdminDocs([{ file: 'e.md', text: 'Autonomy-Decision: carve-out\nEscalated to human; awaiting UAT.' }]).warnings,
  [],
  'a properly-escalated carve-out yields no finding',
);
assert.deepStrictEqual(verifyAdminDocs(null).warnings, [], 'null docs tolerated');

console.log('autonomy-classifier.spec: all assertions passed (taxonomy + AUT1/AUT2).');
