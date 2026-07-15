'use strict';

// Spec for state-semantics (#3808, Epic 2632 Phase-1 P1-a). Node built-ins only; self-executing;
// exits non-zero on the first assertion failure so CI treats it as a hard test.

const assert = require('node:assert');
const {
  ACTIVE,
  EPIC_ONLY_ACTIVE,
  TERMINAL,
  ALIASES,
  AXIS_A,
  ACTIVE_KIND,
  TERMINAL_KIND,
  UNKNOWN_KIND,
  normalizeLabel,
  classify,
  axisAOf,
  isCanonicalStatus,
  isKnownLabel,
} = require('./state-semantics');

// ── Enum shape (synthesis §3.1–§3.2) ────────────────────────────────────────────────────────────────
assert.deepStrictEqual(
  ACTIVE,
  ['backlog', 'todo', 'queued', 'triage', 'ready', 'in-progress', 'testing', 'review', 'measuring'],
  'ACTIVE enum matches synthesis §3.1',
);
assert.deepStrictEqual(EPIC_ONLY_ACTIVE, ['deferred', 'dormant'], 'epic-only active holds');
assert.deepStrictEqual(TERMINAL, ['done', 'cancelled', 'archived'], 'TERMINAL enum matches §3.1');
assert.deepStrictEqual(AXIS_A, ['OPEN', 'CLOSED'], 'Axis-A existence enum is exactly {OPEN, CLOSED}');
assert.deepStrictEqual(ALIASES, { 'advisory-complete': 'done' }, 'advisory-complete folds into done');

// Enums are frozen (single source of truth cannot be mutated by a consumer).
assert.ok(Object.isFrozen(ACTIVE) && Object.isFrozen(TERMINAL) && Object.isFrozen(AXIS_A), 'enums frozen');

// Active and terminal partitions are disjoint (a label cannot be both).
for (const a of [...ACTIVE, ...EPIC_ONLY_ACTIVE]) {
  assert.ok(!TERMINAL.includes(a), `partition disjoint: ${a} not terminal`);
}

// ── classify() — every partition ────────────────────────────────────────────────────────────────────
for (const a of ACTIVE) assert.strictEqual(classify(a), ACTIVE_KIND, `${a} is active`);
for (const a of EPIC_ONLY_ACTIVE) assert.strictEqual(classify(a), ACTIVE_KIND, `${a} (epic-only) is active`);
for (const t of TERMINAL) assert.strictEqual(classify(t), TERMINAL_KIND, `${t} is terminal`);

// Alias fold: advisory-complete classifies as its target (done → terminal).
assert.strictEqual(classify('advisory-complete'), TERMINAL_KIND, 'advisory-complete → terminal (via done)');

// Unknown / drift / junk labels. NOTE Axis-B labels are case-folded (so 'DONE' → terminal); the
// unknowns here are genuinely-off-enum values: the underscore drift variant 'IN_PROGRESS' (canonical is
// hyphenated 'in-progress'), the Axis-A hand-edit 'PHASE-0-COMPLETE', and junk.
for (const u of ['IN_PROGRESS', 'PHASE-0-COMPLETE', 'wat', '', null, undefined, 42, {}]) {
  assert.strictEqual(classify(u), UNKNOWN_KIND, `${String(u)} is unknown to the canonical enum`);
}

// ── Case / whitespace insensitivity for lifecycle labels ────────────────────────────────────────────
assert.strictEqual(classify('  In-Progress '), ACTIVE_KIND, 'trim + case-fold on active label');
assert.strictEqual(classify('DONE'), TERMINAL_KIND, 'uppercase DONE case-folds to terminal (Axis-B)');
assert.strictEqual(normalizeLabel('  Advisory-Complete  '), 'done', 'normalizeLabel trims/folds/aliases');
assert.strictEqual(normalizeLabel(123), '', 'non-string normalizes to empty');

// ── axisAOf() — the I1 mapping as data ──────────────────────────────────────────────────────────────
for (const a of [...ACTIVE, ...EPIC_ONLY_ACTIVE]) assert.strictEqual(axisAOf(a), 'OPEN', `${a} ⇒ OPEN`);
for (const t of TERMINAL) assert.strictEqual(axisAOf(t), 'CLOSED', `${t} ⇒ CLOSED`);
assert.strictEqual(axisAOf('advisory-complete'), 'CLOSED', 'alias ⇒ CLOSED');
assert.strictEqual(axisAOf('nonsense'), null, 'unknown label ⇒ null (no implied existence bit)');

// classify ↔ axisAOf consistency (terminal ⟺ CLOSED, active ⟺ OPEN) — the invariant P1-b will assert.
for (const label of [...ACTIVE, ...EPIC_ONLY_ACTIVE, ...TERMINAL, 'advisory-complete', 'unknownX']) {
  const kind = classify(label);
  const a = axisAOf(label);
  if (kind === ACTIVE_KIND) assert.strictEqual(a, 'OPEN', `${label}: active ⟺ OPEN`);
  else if (kind === TERMINAL_KIND) assert.strictEqual(a, 'CLOSED', `${label}: terminal ⟺ CLOSED`);
  else assert.strictEqual(a, null, `${label}: unknown ⟺ null`);
}

// ── Enum-closure helpers (I5) ───────────────────────────────────────────────────────────────────────
assert.ok(isCanonicalStatus('OPEN') && isCanonicalStatus('CLOSED'), 'OPEN/CLOSED are canonical');
for (const bad of ['open', 'Closed', 'DONE', 'READY', '', null]) {
  assert.ok(!isCanonicalStatus(bad), `${String(bad)} is NOT a canonical Axis-A status`);
}
assert.ok(isKnownLabel('review') && isKnownLabel('done') && isKnownLabel('advisory-complete'), 'known labels');
assert.ok(isKnownLabel('DONE'), 'case-folded DONE is a known lifecycle label (Axis-B)');
for (const bad of ['IN_PROGRESS', 'frobnicate', '', null]) {
  assert.ok(!isKnownLabel(bad), `${String(bad)} is NOT a known lifecycle label`);
}

console.log('state-semantics.spec: all assertions passed');
