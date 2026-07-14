#!/usr/bin/env node
'use strict';

// Regression spec for mirror-admin-completion (#3799 AC3). Self-executing; exit 1 on any failure.
// Hermetic: Node built-ins only; builds throwaway mirror-tree fixtures. Proves the deterministic
// Admin-completion contract (C1 receipt / C2 mirror-ref / C3 consultant closeout), that non-terminal
// and Epic tickets are exempt, and that a sibling ticket-<N>/consultant-closeout satisfies C3.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { verify, parseMirrorTicket, scanMirror } = require('./mirror-admin-completion');

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };

const rec = (over = {}) => ({
  file: '9000.md', number: 9000, status: 'DONE', isEpic: false,
  hasReceipt: true, hasMirrorRef: true, hasInlineCloseout: true, hasCloseoutFile: false, ...over,
});

// ---- verify(): the pure contract ----
ok('a fully Admin-complete DONE ticket yields no warnings', () => {
  const { warnings, checked } = verify([rec()]);
  assert.strictEqual(checked, 1);
  assert.deepStrictEqual(warnings, []);
});

ok('missing receipt → MC1', () => {
  const { warnings } = verify([rec({ hasReceipt: false })]);
  assert.deepStrictEqual(warnings.map(w => w.code), ['MC1_missing_receipt']);
});

ok('missing mirror-ref → MC2', () => {
  const { warnings } = verify([rec({ hasMirrorRef: false })]);
  assert.deepStrictEqual(warnings.map(w => w.code), ['MC2_missing_mirror_ref']);
});

ok('no inline closeout AND no sibling file → MC3', () => {
  const { warnings } = verify([rec({ hasInlineCloseout: false, hasCloseoutFile: false })]);
  assert.deepStrictEqual(warnings.map(w => w.code), ['MC3_missing_closeout']);
});

ok('sibling closeout file alone satisfies C3 (no MC3)', () => {
  const { warnings } = verify([rec({ hasInlineCloseout: false, hasCloseoutFile: true })]);
  assert.strictEqual(warnings.length, 0);
});

ok('all three missing → MC1+MC2+MC3', () => {
  const { warnings } = verify([rec({ hasReceipt: false, hasMirrorRef: false, hasInlineCloseout: false })]);
  assert.deepStrictEqual(warnings.map(w => w.code).sort(),
    ['MC1_missing_receipt', 'MC2_missing_mirror_ref', 'MC3_missing_closeout']);
});

ok('non-terminal (OPEN) ticket is exempt', () => {
  const { warnings, checked } = verify([rec({ status: 'OPEN', hasReceipt: false, hasMirrorRef: false, hasInlineCloseout: false })]);
  assert.strictEqual(checked, 0);
  assert.strictEqual(warnings.length, 0);
});

ok('Epic ticket is exempt even when terminal + bare', () => {
  const { warnings, checked } = verify([rec({ isEpic: true, hasReceipt: false, hasMirrorRef: false, hasInlineCloseout: false })]);
  assert.strictEqual(checked, 0);
  assert.strictEqual(warnings.length, 0);
});

// ---- parseMirrorTicket(): field extraction ----
ok('parseMirrorTicket extracts status, number, receipt, mirror-ref, epic', () => {
  const epic = parseMirrorTicket('3200-epic.md', 'title: "Epic X"\nstatus: DONE\n# Epic X\n');
  assert.strictEqual(epic.isEpic, true);
  const t = parseMirrorTicket('42.md', 'status: DONE\nreceipt abc\nPR #7\n');
  assert.strictEqual(t.number, 42);
  assert.strictEqual(t.status, 'DONE');
  assert.strictEqual(t.hasReceipt, true);
  assert.strictEqual(t.hasMirrorRef, true);
  const hex = parseMirrorTicket('43.md', 'status: DONE\nabcdef0123456789 is a receipt hash\nmirror-mode\n');
  assert.strictEqual(hex.hasReceipt, true, '16-hex token counts as a receipt');
});

// ---- scanMirror(): FS-backed sibling-closeout resolution over a throwaway tree ----
ok('scanMirror resolves sibling consultant-closeout for C3', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-fixture-'));
  try {
    const tdir = path.join(root, 'wiki', 'work-log', 'tickets');
    fs.mkdirSync(tdir, { recursive: true });
    // #100: DONE, receipt + PR, closeout ONLY in sibling dir → should PASS.
    fs.writeFileSync(path.join(tdir, '100.md'), 'status: DONE\nreceipt deadbeefdeadbeef\nPR #1\n');
    const bdir = path.join(root, 'wiki', 'work-log', 'ticket-100');
    fs.mkdirSync(bdir, { recursive: true });
    fs.writeFileSync(path.join(bdir, 'ac1-consultant-closeout.md'), '# closeout\n');
    // #101: DONE, receipt + PR, NO closeout anywhere → should trip MC3.
    fs.writeFileSync(path.join(tdir, '101.md'), 'status: DONE\nreceipt cafecafecafecafe\npull/2\n');

    const records = scanMirror(root);
    const byNum = Object.fromEntries(records.map(r => [r.number, r]));
    assert.strictEqual(byNum[100].hasCloseoutFile, true);
    assert.strictEqual(byNum[101].hasCloseoutFile, false);
    const { warnings } = verify(records);
    assert.deepStrictEqual(warnings.map(w => `${w.number}:${w.code}`), ['101:MC3_missing_closeout']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

ok('scanMirror on a missing mirror dir returns [] (no throw)', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-empty-'));
  try {
    assert.deepStrictEqual(scanMirror(root), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

console.log(`\n${passed} checks passed.`);
