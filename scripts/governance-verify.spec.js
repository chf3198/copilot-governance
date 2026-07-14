#!/usr/bin/env node
'use strict';

// Regression spec for governance-verify (#3803). Self-executing; exit 1 on any failure.
// Hermetic: Node built-ins only; builds throwaway fixture roots. Guards the flat-layout fix — an
// absent legacy workflow (lint.yml / branch-name.yml) must NOT be a failure, while a present workflow
// missing its `merge_group:` trigger still is. Also proves ticket-lint still enforces where tickets exist.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { verify } = require('./governance-verify');

let passed = 0;
const ok = (name, fn) => {
  fn();
  passed++;
  console.log(`ok - ${name}`);
};

function mkRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gv-fixture-'));
}
function write(root, rel, body) {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
}
function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

// (c) — the #3803 regression: absent legacy workflows must NOT fail. This is the exact flat-main
// scenario that previously exited 1 with two "missing workflow file" issues.
ok('absent legacy workflows are not a failure (flat-main regression)', () => {
  const root = mkRoot();
  try {
    write(root, '.github/workflows/validate-pr.yml', 'on:\n  pull_request:\n');
    const res = verify(root);
    assert.strictEqual(res.status, 'pass', `expected pass, got: ${JSON.stringify(res.issues)}`);
    assert.deepStrictEqual(res.issues, []);
    assert.ok(!res.issues.some(i => /lint\.yml|branch-name\.yml/.test(i)));
  } finally {
    cleanup(root);
  }
});

// (a) — a PRESENT merge-queue workflow missing its trigger is still flagged (intent preserved).
ok('present workflow missing merge_group trigger is flagged', () => {
  const root = mkRoot();
  try {
    write(root, '.github/workflows/lint.yml', 'on:\n  pull_request:\n'); // no merge_group
    const res = verify(root);
    assert.strictEqual(res.status, 'fail');
    assert.ok(
      res.issues.includes('.github/workflows/lint.yml: missing merge_group trigger'),
      `issues=${JSON.stringify(res.issues)}`
    );
  } finally {
    cleanup(root);
  }
});

// (b) — a PRESENT merge-queue workflow WITH the trigger is clean.
ok('present workflow with merge_group trigger is clean', () => {
  const root = mkRoot();
  try {
    write(root, '.github/workflows/lint.yml', 'on:\n  pull_request:\n  merge_group:\n');
    const res = verify(root);
    assert.deepStrictEqual(res.issues, []);
    assert.strictEqual(res.status, 'pass');
  } finally {
    cleanup(root);
  }
});

// (d) — ticket-lint still enforces where nested-layout tickets exist.
ok('ticket with missing Priority is still flagged', () => {
  const root = mkRoot();
  try {
    write(
      root,
      'tickets/0005.md',
      '# Ticket 5 — sample\nType: Task\nStatus: In Progress\n\nBody without a Priority line.\n'
    );
    const res = verify(root);
    assert.strictEqual(res.checkedTickets, 1);
    assert.ok(
      res.issues.some(i => /0005\.md: missing\/invalid Priority/.test(i)),
      `issues=${JSON.stringify(res.issues)}`
    );
  } finally {
    cleanup(root);
  }
});

// (d2) — a well-formed ticket produces no ticket issues (guards over-flagging).
ok('well-formed non-terminal ticket produces no issues', () => {
  const root = mkRoot();
  try {
    write(root, 'tickets/0006.md', '# Ticket 6 — ok\nType: Task\nStatus: In Progress\nPriority: P2\n');
    const res = verify(root);
    assert.strictEqual(res.checkedTickets, 1);
    assert.deepStrictEqual(res.issues, []);
    assert.strictEqual(res.status, 'pass');
  } finally {
    cleanup(root);
  }
});

// Structural: advisory arrays are always present and verify never throws on an empty root.
ok('empty root: no throw, advisory arrays present, pass', () => {
  const root = mkRoot();
  try {
    const res = verify(root);
    assert.strictEqual(res.status, 'pass');
    assert.ok(Array.isArray(res.accountableTeamAdvisories));
    assert.ok(Array.isArray(res.epicChildBatonAdvisories));
    assert.strictEqual(res.checkedTickets, 0);
  } finally {
    cleanup(root);
  }
});

// Real flat repo: verifying this repo's own root must PASS (was FAIL before #3803 due to the stale
// hard-coded workflow existence check).
ok('this repo root verifies as pass (flat-layout)', () => {
  const res = verify(path.resolve(__dirname, '..'));
  assert.strictEqual(res.status, 'pass', `expected pass, got: ${JSON.stringify(res.issues)}`);
});

console.log(`\n# governance-verify.spec: ${passed} assertions passed`);
