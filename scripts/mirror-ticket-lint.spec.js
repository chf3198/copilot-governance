#!/usr/bin/env node
'use strict';

// Regression spec for mirror-ticket-lint (#3805). Self-executing; exit 1 on any failure.
// Hermetic: Node built-ins only; pure-function fixtures + one throwaway mirror-tree for scanMirror().
// Proves the flat-mirror parser (frontmatter + Labels line) and the four advisory invariants
// (MTL1 number-mismatch / MTL2 missing-status / MTL3 malformed-priority / MTL4 placeholder), that a
// well-formed ticket yields no warnings, and that scanMirror is a no-op on a missing mirror dir.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { lint, parseMirrorTicket, scanMirror, MIRROR_TICKETS_REL } = require('./mirror-ticket-lint');

let passed = 0;
const ok = (name, fn) => { fn(); passed++; console.log(`ok - ${name}`); };

// A well-formed flat wiki-mirror ticket body.
const good = (n) => `---
title: "#${n} Some ticket title"
type: work-log
status: OPEN
---
# #${n} — Some ticket title

> **Source**: github:issue/${n} | **state: OPEN** | **Labels**: type:task, status:backlog, priority:P2, area:governance
`;

// ---- parseMirrorTicket(): flat-schema extraction ----
ok('parses number (filename + title), status, labels/priority from the flat schema', () => {
  const r = parseMirrorTicket('2064.md', good(2064));
  assert.strictEqual(r.fileNumber, 2064);
  assert.strictEqual(r.titleNumber, 2064);
  assert.strictEqual(r.status, 'OPEN');
  assert.strictEqual(r.hasStatusField, true);
  assert.strictEqual(r.hasLabelLine, true);
  assert.strictEqual(r.hasValidPriority, true);
  assert.strictEqual(r.hasPlaceholder, false);
});

// ---- lint(): the pure invariants ----
ok('a well-formed ticket yields no warnings', () => {
  const { warnings, checked } = lint([parseMirrorTicket('2064.md', good(2064))]);
  assert.strictEqual(checked, 1);
  assert.deepStrictEqual(warnings, []);
});

ok('MTL1 — title #N disagreeing with filename N', () => {
  const txt = good(2064).replace('title: "#2064', 'title: "#9999');
  const { warnings } = lint([parseMirrorTicket('2064.md', txt)]);
  assert.deepStrictEqual(warnings.map((w) => w.code), ['MTL1_number_mismatch']);
});

ok('MTL1 does NOT fire when the title carries no #N (only one number present)', () => {
  const txt = good(2064).replace('title: "#2064 Some ticket title"', 'title: "Some ticket title"');
  const { warnings } = lint([parseMirrorTicket('2064.md', txt)]);
  assert.strictEqual(warnings.some((w) => w.code === 'MTL1_number_mismatch'), false);
});

ok('MTL2 — no status: frontmatter field', () => {
  const txt = good(2064).replace('status: OPEN\n', '');
  const { warnings } = lint([parseMirrorTicket('2064.md', txt)]);
  assert.deepStrictEqual(warnings.map((w) => w.code), ['MTL2_missing_status']);
});

ok('MTL3 — Labels line present but no valid priority', () => {
  const txt = good(2064).replace(', priority:P2', '');
  const { warnings } = lint([parseMirrorTicket('2064.md', txt)]);
  assert.deepStrictEqual(warnings.map((w) => w.code), ['MTL3_malformed_priority']);
});

ok('MTL3 does NOT fire when there is no Labels line at all', () => {
  const txt = `---\ntitle: "#2064 t"\nstatus: OPEN\n---\n# #2064 — t\n`;
  const { warnings } = lint([parseMirrorTicket('2064.md', txt)]);
  assert.strictEqual(warnings.some((w) => w.code === 'MTL3_malformed_priority'), false);
});

ok('MTL4 — un-backfilled PLACEHOLDER_SIGNATURE', () => {
  const txt = good(2064) + '\nSigned: PLACEHOLDER_SIGNATURE\n';
  const { warnings } = lint([parseMirrorTicket('2064.md', txt)]);
  assert.deepStrictEqual(warnings.map((w) => w.code), ['MTL4_placeholder_signature']);
});

ok('advisory-only: lint never throws / never signals a hard failure shape', () => {
  const out = lint([]);
  assert.deepStrictEqual(out, { warnings: [], checked: 0 });
  assert.deepStrictEqual(lint(null), { warnings: [], checked: 0 });
});

// ---- scanMirror(): FS-backed ----
ok('scanMirror reads a throwaway mirror tree and returns no-op on a missing dir', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mtl-'));
  const dir = path.join(tmp, MIRROR_TICKETS_REL);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '2064.md'), good(2064));
  fs.writeFileSync(path.join(dir, '9999.md'), good(2064).replace('#2064', '#2064').replace('2064.md', '9999.md'));
  const recs = scanMirror(tmp);
  assert.strictEqual(recs.length, 2);
  const { warnings } = lint(recs);
  // 9999.md carries title #2064 → MTL1; 2064.md is clean.
  assert.strictEqual(warnings.some((w) => w.code === 'MTL1_number_mismatch' && w.file === '9999.md'), true);
  fs.rmSync(tmp, { recursive: true, force: true });

  assert.deepStrictEqual(scanMirror(path.join(os.tmpdir(), 'does-not-exist-mtl')), []);
});

console.log(`\n${passed} passed`);
