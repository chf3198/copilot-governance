#!/usr/bin/env node
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const FILE = path.join(os.homedir(), '.megingjord', 'suppression-registry.json');

function run(args) {
  return spawnSync('node', [path.join(__dirname, 'anneal-review.js'), ...args], { encoding: 'utf8' });
}

function clean() { if (fs.existsSync(FILE)) fs.unlinkSync(FILE); }

function testRejectAndList() {
  clean();
  const rej = run(['reject', '--pattern', 'dup-issue', '--reason', 'duplicate', '--ttl', '3', '--reviewer', 'nova']);
  assert.strictEqual(rej.status, 0);
  const out = JSON.parse(run([]).stdout);
  assert.strictEqual(out.active, 1);
  assert.strictEqual(out.suppressions[0].pattern_id, 'dup-issue');
  assert.strictEqual(out.suppressions[0].reviewer, 'nova');
  clean();
}

testRejectAndList();
process.stdout.write('anneal-review.spec: PASS\n');
