#!/usr/bin/env node
// epic-child-baton-traceability.spec.js — self-anneal Epic #3800.
// Runner: Node built-in assert. Run: node scripts/global/epic-child-baton-traceability.spec.js
'use strict';

const assert = require('assert');
const { auditEpics, epicCloseHint, parseMirrorTicket, isClosed } = require('./epic-child-baton-traceability');

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
// alias — AC3 tests destructure a local `epic` from epicCloseHint()'s result, so the
// factory is referenced as `epic0` inside those tests to avoid a TDZ shadow.
const epic0 = epic;

test('bundling drift: closed child of closed epic missing closeout+evidence → EB1+EB2', () => {
  const { warnings } = auditEpics([
    epic(100, 'CLOSED'),
    child(101, 100, 'CLOSED', { closeout: false, evidence: false }),
  ]);
  const codes = warnings.map((w) => w.code).sort();
  assert.deepStrictEqual(codes, ['EB1_child_missing_closeout', 'EB2_child_missing_evidence']);
  assert.strictEqual(warnings[0].child, 101);
  assert.strictEqual(warnings[0].epic, 100);
});

test('robustly-complete child (own closeout+evidence) → zero warnings', () => {
  const { warnings } = auditEpics([
    epic(200, 'CLOSED'),
    child(201, 200, 'CLOSED'),
    child(202, 200, 'done'),
  ]);
  assert.deepStrictEqual(warnings, []);
});

test('open child of closed epic → EB3', () => {
  const { warnings } = auditEpics([epic(300, 'CLOSED'), child(301, 300, 'OPEN')]);
  assert.strictEqual(warnings.length, 1);
  assert.strictEqual(warnings[0].code, 'EB3_open_child_of_closed_epic');
});

test('open epic is not audited (no premature warnings)', () => {
  const { warnings } = auditEpics([
    epic(400, 'OPEN'),
    child(401, 400, 'CLOSED', { closeout: false, evidence: false }),
  ]);
  assert.deepStrictEqual(warnings, []);
});

test('child of a non-epic parent ref is ignored; only epic parents audited', () => {
  const { warnings } = auditEpics([
    { number: 500, file: '500.md', type: 'task', status: 'CLOSED', refsEpic: null },
    child(501, 500, 'CLOSED', { closeout: false, evidence: false }),
  ]);
  assert.deepStrictEqual(warnings, []);
});

test('isClosed recognizes closed/done/cancelled, rejects open/in-progress', () => {
  assert.ok(isClosed('CLOSED') && isClosed('done') && isClosed('cancelled'));
  assert.ok(!isClosed('OPEN') && !isClosed('in-progress') && !isClosed(''));
});

test('parseMirrorTicket extracts type=epic, status, and Refs Epic parent', () => {
  const epicTxt = ['---', 'status: CLOSED', '---', '# #600 — E',
    '> **Source**: x | **state: CLOSED** | **Labels**: type:epic, priority:P1'].join('\n');
  const childTxt = ['---', 'status: CLOSED', '---', '# #601 — c',
    '> **Source**: x | **state: CLOSED** | **Labels**: type:task',
    'Refs Epic #600', '## CONSULTANT_CLOSEOUT', '## GitHub Evidence Block'].join('\n');
  const e = parseMirrorTicket('600.md', epicTxt);
  const c = parseMirrorTicket('601.md', childTxt);
  assert.strictEqual(e.type, 'epic');
  assert.strictEqual(c.refsEpic, 600);
  assert.ok(c.hasCloseout && c.hasEvidence);
});

test('regression: #2345 family (post-remediation) produces zero bundling warnings', () => {
  // Mirrors the reconciled state: epic + 5 children all closed WITH own closeout+evidence.
  const fam = [epic(2345, 'CLOSED')];
  for (const n of [2346, 2347, 2348, 2349, 2350]) fam.push(child(n, 2345, 'CLOSED'));
  assert.deepStrictEqual(auditEpics(fam).warnings, []);
});

// ── AC3 (#3800 Phase-1): Epic-close-time remediation hint ────────────────────
test('AC3 epicCloseHint: names the un-evidenced children of the closing epic', () => {
  const { epic, blockers, hint } = epicCloseHint([
    epic0(700, 'CLOSED'),
    child(701, 700, 'CLOSED', { closeout: false, evidence: false }),
    child(702, 700, 'CLOSED', { evidence: false }),
    child(703, 700, 'CLOSED'), // fully evidenced → not a blocker
  ], 700);
  assert.strictEqual(epic, 700);
  assert.deepStrictEqual(blockers.map((b) => b.child), [701, 702]);
  assert.deepStrictEqual(blockers[0].codes, ['EB1_child_missing_closeout', 'EB2_child_missing_evidence']);
  assert.deepStrictEqual(blockers[1].codes, ['EB2_child_missing_evidence']);
  assert.ok(/#701/.test(hint) && /#702/.test(hint), 'hint names the blocking children');
  assert.ok(!/#703/.test(hint), 'fully-evidenced child is not named');
  assert.ok(/do not bundle-close/i.test(hint), 'hint is actionable');
});

test('AC3 epicCloseHint: clean epic → null hint, no blockers (low false-positive)', () => {
  const res = epicCloseHint([epic0(710, 'CLOSED'), child(711, 710, 'CLOSED')], 710);
  assert.strictEqual(res.hint, null);
  assert.deepStrictEqual(res.blockers, []);
});

test('AC3 epicCloseHint: open epic / non-epic / unknown id → null hint (never fires prematurely)', () => {
  // open epic (not yet closing)
  assert.strictEqual(epicCloseHint([epic0(720, 'OPEN'), child(721, 720, 'CLOSED', { closeout: false })], 720).hint, null);
  // number belongs to a non-epic
  assert.strictEqual(epicCloseHint([
    { number: 730, file: '730.md', type: 'task', status: 'CLOSED', refsEpic: null },
    child(731, 730, 'CLOSED', { closeout: false }),
  ], 730).hint, null);
  // unknown id
  assert.strictEqual(epicCloseHint([epic0(740, 'CLOSED')], 999).hint, null);
});

test('AC3 epicCloseHint: open-child blocker (EB3) is surfaced in the close-time hint', () => {
  const { blockers, hint } = epicCloseHint([epic0(750, 'CLOSED'), child(751, 750, 'OPEN')], 750);
  assert.deepStrictEqual(blockers.map((b) => b.child), [751]);
  assert.deepStrictEqual(blockers[0].codes, ['EB3_open_child_of_closed_epic']);
  assert.ok(/#751/.test(hint));
});

test('AC3 epicCloseHint: scopes to the requested epic only (ignores other epics\' drift)', () => {
  const res = epicCloseHint([
    epic0(760, 'CLOSED'), child(761, 760, 'CLOSED'), // clean
    epic0(770, 'CLOSED'), child(771, 770, 'CLOSED', { closeout: false }), // dirty, different epic
  ], 760);
  assert.strictEqual(res.hint, null, 'requested epic is clean; another epic\'s drift must not leak in');
});

test('wiring contract: exports the { auditEpics, scanMirror } interface governance-verify.js requires', () => {
  const mod = require('./epic-child-baton-traceability');
  assert.strictEqual(typeof mod.auditEpics, 'function', 'auditEpics must be exported');
  assert.strictEqual(typeof mod.scanMirror, 'function', 'scanMirror must be exported');
  // scanMirror on a non-existent dir returns [] (no throw) — governance-verify relies on this.
  assert.deepStrictEqual(mod.scanMirror('/no/such/dir/xyz'), []);
  // auditEpics on that empty scan is a no-op advisory (never throws, always returns {warnings}).
  assert.deepStrictEqual(mod.auditEpics(mod.scanMirror('/no/such/dir/xyz')), { warnings: [] });
});

console.log(`\nepic-child-baton-traceability.spec: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
