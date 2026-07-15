#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(__dirname, '..', '..');
const generate = path.join(root, 'scripts', 'global', 'governance-generate.js');
const syncCheck = path.join(root, 'scripts', 'global', 'governance-sync-check.js');
const trackedRoot = path.join(root, 'generated', 'governance-adapters');
let pass = 0; let fail = 0;
function test(name, fn) { try { fn(); pass++; console.log(`✓ ${name}`); } catch (e) { fail++; console.error(`✗ ${name}: ${e.message}`); } }
function run(script) { return cp.spawnSync('node', [script], { cwd: root, encoding: 'utf8' }); }

function firstFile(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = firstFile(full);
      if (nested) return nested;
    } else return full;
  }
  return null;
}

function snapshot(dir) {
  const out = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else out.push([path.relative(dir, full), fs.readFileSync(full, 'utf8')]);
    }
  };
  walk(dir);
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}

test('governance generate succeeds', () => {
  const r = run(generate);
  assert.strictEqual(r.status, 0);
  assert.ok(/wrote/.test(r.stdout));
});

test('sync-check succeeds after generate', () => {
  run(generate);
  const r = run(syncCheck);
  assert.strictEqual(r.status, 0);
  assert.ok(/clean/.test(r.stdout));
});

test('sync-check fails when tracked generated files drift', () => {
  run(generate);
  const driftFile = firstFile(trackedRoot);
  const original = fs.readFileSync(driftFile, 'utf8');
  fs.writeFileSync(driftFile, `${original}\nDRIFT\n`);
  const r = run(syncCheck);
  fs.writeFileSync(driftFile, original);
  assert.strictEqual(r.status, 1);
  assert.ok(/stale generated artifacts/.test(r.stderr));
});

test('generate is idempotent', () => {
  run(generate);
  const before = snapshot(trackedRoot);
  run(generate);
  const after = snapshot(trackedRoot);
  assert.deepStrictEqual(after, before);
});

console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
