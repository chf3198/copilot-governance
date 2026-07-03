#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const cli = path.join(root, 'scripts', 'global', 'governance-manifest-validate.js');
const sample = path.join(root, 'inventory', 'governance-manifest.sample.json');
let pass = 0; let fail = 0;
function test(n, f) { try { f(); pass++; console.log(`✓ ${n}`); } catch (e) { fail++; console.error(`✗ ${n}: ${e.message}`); } }
function run(file) { return cp.spawnSync('node', [cli, file], { encoding: 'utf8' }); }

test('valid sample manifest passes', () => {
  const r = run(sample);
  assert.strictEqual(r.status, 0);
  assert.ok(/OK/.test(r.stdout));
});

test('invalid manifest fails with diagnostics', () => {
  const f = path.join(os.tmpdir(), `manifest-bad-${Date.now()}.json`);
  fs.writeFileSync(f, JSON.stringify({ version: 1, units: [{ id: 'x', priority: 'PX' }] }));
  const r = run(f);
  assert.strictEqual(r.status, 1);
  assert.ok(/missing title|priority invalid/.test(r.stderr));
  fs.unlinkSync(f);
});

test('unknown target fails clearly', () => {
  const f = path.join(os.tmpdir(), `manifest-target-${Date.now()}.json`);
  const m = JSON.parse(fs.readFileSync(sample, 'utf8'));
  m.units[0].targets = ['copilot', 'bogus'];
  fs.writeFileSync(f, JSON.stringify(m));
  const r = run(f);
  assert.strictEqual(r.status, 1);
  assert.ok(/targets contains bogus/.test(r.stderr));
  fs.unlinkSync(f);
});

console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
