#!/usr/bin/env node
'use strict';

// Regression spec for state-store-merge-reconciler (#2275, Epic 2261 Phase-1 P1-1). Self-executing;
// exit 1 on any failure. Hermetic: Node built-ins only; injected fs/clock/sink — never touches real
// ~/.copilot state, never sleeps, never calls gh/network. Proves the evidence-gate (refuse without a
// verifiable MERGED merge), the atomic all-or-nothing write (rollback on mid-write failure), the audit
// record shape, and idempotency (AC1-AC5).

const assert = require('node:assert');
const {
  reconcile, reconcileFiles, reconcileState, verifyEvidence, buildAudit, ADMIN_OPS, PATTERN_ID,
} = require('./state-store-merge-reconciler');

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };

const MERGED = { state: 'MERGED', pr: 2275, sha: 'a15fe38', repo: 'chf3198/copilot-governance' };
const NOW = '2026-07-15T00:00:00.000Z';
const blocked = () => ({ admin_ops: { merge: false, commit: false }, flags: { code_touched: true }, roles: { admin: 'pending' } });

// ---- verifyEvidence (AC4) ----
ok('MERGED evidence with pr+sha verifies', () => {
  assert.strictEqual(verifyEvidence(MERGED).verified, true);
});
ok('non-MERGED state is refused', () => {
  assert.strictEqual(verifyEvidence({ ...MERGED, state: 'OPEN' }).verified, false);
  assert.strictEqual(verifyEvidence({ ...MERGED, state: 'CLOSED' }).verified, false);
  assert.strictEqual(verifyEvidence({ ...MERGED, state: 'merged' }).verified, false); // case-sensitive
});
ok('missing / malformed pr or sha is refused', () => {
  assert.strictEqual(verifyEvidence({ state: 'MERGED', sha: 'a15fe38' }).verified, false);
  assert.strictEqual(verifyEvidence({ state: 'MERGED', pr: 0, sha: 'a15fe38' }).verified, false);
  assert.strictEqual(verifyEvidence({ state: 'MERGED', pr: 1, sha: 'nothex!' }).verified, false);
  assert.strictEqual(verifyEvidence(null).verified, false);
  assert.strictEqual(verifyEvidence('MERGED').verified, false);
});
ok('repo pin mismatch is refused', () => {
  const r = verifyEvidence({ ...MERGED, repo: 'other/repo' }, { repo: 'chf3198/copilot-governance' });
  assert.strictEqual(r.verified, false);
});

// ---- reconcileState pure transform (AC1) ----
ok('reconcileState sets every admin op true and clears code_touched, without mutating input', () => {
  const input = blocked();
  const out = reconcileState(input);
  for (const op of ADMIN_OPS) assert.strictEqual(out.admin_ops[op], true, `op ${op}`);
  assert.strictEqual(out.flags.code_touched, false);
  assert.strictEqual(out.roles.admin, 'pending', 'unrelated fields preserved');
  // input untouched (no in-place mutation)
  assert.strictEqual(input.admin_ops.merge, false);
  assert.strictEqual(input.flags.code_touched, true);
});
ok('reconcileState rejects non-object state', () => {
  assert.throws(() => reconcileState(null), TypeError);
  assert.throws(() => reconcileState([]), TypeError);
});

// ---- reconcile: verified evidence clears ALL variants (AC5a) ----
ok('AC5a: verified MERGED evidence clears the gate across all variants', () => {
  const stores = [{ id: 'session', state: blocked() }, { id: '-nosession', state: blocked() }, { id: 'codex', state: blocked() }];
  const res = reconcile(stores, MERGED, { now: NOW });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.reconciled.length, 3);
  for (const r of res.reconciled) {
    assert.strictEqual(r.state.admin_ops.merge, true);
    assert.strictEqual(r.state.flags.code_touched, false);
  }
});

// ---- reconcile: NO evidence => gate stays blocked, nothing reconciled (AC5b) ----
ok('AC5b: same state WITHOUT verifiable evidence stays blocked, nothing reconciled', () => {
  const stores = [{ id: 'session', state: blocked() }];
  const res = reconcile(stores, { state: 'OPEN', pr: 2275, sha: 'a15fe38' }, { now: NOW });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.refused, true);
  assert.deepStrictEqual(res.reconciled, []);
  assert.strictEqual(res.audit, null);
  // original store object is untouched
  assert.strictEqual(stores[0].state.admin_ops.merge, false);
});

// ---- audit record shape (AC3) ----
ok('AC3: audit record carries pattern_id + pr + sha + variants + ts', () => {
  const audit = buildAudit(MERGED, ['session', '-nosession'], NOW);
  assert.strictEqual(audit.pattern_id, PATTERN_ID);
  assert.strictEqual(audit.pattern_id, 'admin-ops-merge-reconciled');
  assert.strictEqual(audit.pr, 2275);
  assert.strictEqual(audit.sha, 'a15fe38');
  assert.deepStrictEqual(audit.variants, ['session', '-nosession']);
  assert.strictEqual(audit.ts, NOW);
});

// ---- reconcileFiles happy path: writes all variants + emits audit ----
ok('reconcileFiles writes every variant and emits exactly one audit record', () => {
  const disk = { '/s/session.json': JSON.stringify(blocked()), '/s/-nosession.json': JSON.stringify(blocked()) };
  const emitted = [];
  const res = reconcileFiles(Object.keys(disk), MERGED, {
    readFile: p => disk[p],
    writeFile: (p, s) => { disk[p] = s; },
    emit: r => emitted.push(r),
    now: NOW,
  });
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(res.written.sort(), ['/s/-nosession.json', '/s/session.json']);
  assert.strictEqual(emitted.length, 1);
  assert.strictEqual(emitted[0].pattern_id, PATTERN_ID);
  for (const p of Object.keys(disk)) {
    assert.strictEqual(JSON.parse(disk[p]).admin_ops.merge, true);
    assert.strictEqual(JSON.parse(disk[p]).flags.code_touched, false);
  }
});

// ---- reconcileFiles refuses without evidence: writes nothing, emits nothing ----
ok('reconcileFiles without evidence writes nothing and emits nothing', () => {
  const original = JSON.stringify(blocked());
  const disk = { '/s/session.json': original };
  const emitted = [];
  const res = reconcileFiles(['/s/session.json'], { state: 'OPEN', pr: 1, sha: 'a15fe38' }, {
    readFile: p => disk[p], writeFile: (p, s) => { disk[p] = s; }, emit: r => emitted.push(r), now: NOW,
  });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.refused, true);
  assert.strictEqual(disk['/s/session.json'], original, 'file unchanged');
  assert.strictEqual(emitted.length, 0);
});

// ---- AC5c: atomicity — a mid-write failure leaves ALL variants unmutated (rollback) ----
ok('AC5c: mid-write failure on one variant rolls back ALL variants', () => {
  const orig = JSON.stringify(blocked());
  const disk = { '/s/a.json': orig, '/s/b.json': orig, '/s/c.json': orig };
  const emitted = [];
  let writes = 0;
  const res = reconcileFiles(['/s/a.json', '/s/b.json', '/s/c.json'], MERGED, {
    readFile: p => disk[p],
    writeFile: (p, s) => {
      writes++;
      // Fail on the 2nd forward write (b.json). Rollback writes must still succeed.
      if (writes === 2 && !s.includes('"code_touched": true')) throw new Error('simulated disk failure');
      disk[p] = s;
    },
    emit: r => emitted.push(r),
    now: NOW,
  });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.rolledBack, true);
  // EVERY variant must read back as the ORIGINAL blocked state — none half-reconciled.
  for (const p of ['/s/a.json', '/s/b.json', '/s/c.json']) {
    assert.strictEqual(JSON.parse(disk[p]).admin_ops.merge, false, `${p} rolled back`);
    assert.strictEqual(JSON.parse(disk[p]).flags.code_touched, true, `${p} rolled back`);
  }
  assert.strictEqual(emitted.length, 0, 'no audit emitted on failed transaction');
});

// ---- AC5d: idempotency — re-run yields no diff ----
ok('AC5d: re-running on already-reconciled state yields identical bytes (no diff)', () => {
  const disk = { '/s/session.json': JSON.stringify(blocked()) };
  const io = { readFile: p => disk[p], writeFile: (p, s) => { disk[p] = s; }, emit: () => {}, now: NOW };
  reconcileFiles(['/s/session.json'], MERGED, io);
  const afterFirst = disk['/s/session.json'];
  reconcileFiles(['/s/session.json'], MERGED, io);
  assert.strictEqual(disk['/s/session.json'], afterFirst, 'second run produced no diff');
});

// ---- malformed variant aborts the whole batch (no partial reconcile) ----
ok('a malformed variant aborts the whole batch (throws, no partial state)', () => {
  const stores = [{ id: 'ok', state: blocked() }, { id: 'bad', state: 42 }];
  assert.throws(() => reconcile(stores, MERGED, { now: NOW }), TypeError);
});

console.log(`\n${passed} checks passed.`);
