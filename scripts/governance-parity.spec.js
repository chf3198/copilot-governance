#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { emit } = require('./governance-adapter-emit');

const root = path.resolve(__dirname, '..', '..');
const goldenDir = path.join(root, 'tests', 'fixtures', 'governance', 'golden');
const fixture = path.join(root, 'tests', 'fixtures', 'governance', 'fixture-set.json');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`✓ ${name}`); }
  catch (e) { fail++; console.error(`✗ ${name}: ${e.message}`); }
}
function emitToTemp(mf) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-parity-'));
  emit(mf, tmp); return tmp;
}
function walk(root, cur, out = []) {
  if (!cur) cur = root;
  for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
    const full = path.join(cur, e.name);
    if (e.isDirectory()) walk(root, full, out);
    else out.push([path.relative(root, full), fs.readFileSync(full, 'utf8')]);
  }
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}

test('all 4 targets emit at least one file', () => {
  const tmp = emitToTemp(fixture);
  const files = walk(tmp).map(([f]) => f);
  for (const t of ['copilot', 'cline', 'claude-code', 'continue'])
    assert.ok(files.some(f => f.startsWith(t)), `missing target: ${t}`);
  fs.rmSync(tmp, { recursive: true });
});

test('path-scoped unit does not emit to cline or claude-code', () => {
  const tmp = emitToTemp(fixture);
  const files = walk(tmp).map(([f]) => f);
  assert.ok(!files.some(f => f.includes('cline') && f.includes('path-scoped')),
    'cline should not receive path-scoped unit');
  assert.ok(!files.some(f => f.includes('claude-code') && f.includes('path-scoped')),
    'claude-code should not receive path-scoped unit');
  fs.rmSync(tmp, { recursive: true });
});

test('P2 unit emits correct priority in content', () => {
  const tmp = emitToTemp(fixture);
  const files = walk(tmp).filter(([f]) => f.includes('priority-p2'));
  assert.ok(files.length > 0, 'no P2 unit files emitted');
  for (const [, content] of files)
    assert.ok(content.includes('P2'), 'expected P2 in content');
  fs.rmSync(tmp, { recursive: true });
});

test('golden snapshots match or are created', () => {
  const tmp = emitToTemp(fixture);
  const files = walk(tmp);
  const mismatches = [];
  for (const [rel, content] of files) {
    const gf = path.join(goldenDir, rel);
    if (!fs.existsSync(gf)) {
      fs.mkdirSync(path.dirname(gf), { recursive: true });
      fs.writeFileSync(gf, content, 'utf8');
    } else if (fs.readFileSync(gf, 'utf8') !== content) mismatches.push(rel);
  }
  fs.rmSync(tmp, { recursive: true });
  assert.strictEqual(mismatches.length, 0,
    `golden mismatches: ${mismatches.join(', ')}`);
});

test('emit is structurally consistent across targets', () => {
  const tmp = emitToTemp(fixture);
  const files = walk(tmp);
  for (const [rel, content] of files) {
    assert.ok(content.includes('---'), `missing YAML fence in ${rel}`);
    assert.ok(content.includes('#'), `missing heading in ${rel}`);
  }
  fs.rmSync(tmp, { recursive: true });
});

console.log(`\nParity results: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
