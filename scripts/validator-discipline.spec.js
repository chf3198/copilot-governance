#!/usr/bin/env node
// validator-discipline.spec.js — Tier-2 anneal #1893.
// Runner: Node built-in assert (hermetic; no gh/network). Run: node scripts/validator-discipline.spec.js
'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { auditChangedFiles } = require('./validator-discipline');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); passed++; }
  catch (e) { console.error(`  ✗ ${name}\n      ${e.message}`); failed++; }
}

const REG = { validators: [{ name: 'foo-validator', spec: 'scripts/foo-validator.spec.js' }] };
const codes = (r) => r.violations.map((v) => v.code).sort();

// AC6(a): new validator + matching spec + registry entry → passes.
test('AC6a: validator + sibling spec + registry entry → 0 violations', () => {
  const r = auditChangedFiles(['scripts/foo-validator.js', 'scripts/foo-validator.spec.js'], REG);
  assert.deepStrictEqual(r.violations, []);
});

// AC6(b): new validator but missing test → fails (VD1).
test('AC6b: validator with registry entry but NO sibling spec → VD1', () => {
  const r = auditChangedFiles(['scripts/foo-validator.js'], REG);
  assert.deepStrictEqual(codes(r), ['VD1_missing_spec']);
  assert.strictEqual(r.violations[0].file, 'scripts/foo-validator.js');
});

// AC6(c): validator but missing registry entry → fails (VD2).
test('AC6c: validator + spec but NOT in registry → VD2', () => {
  const r = auditChangedFiles(['scripts/bar-validator.js', 'scripts/bar-validator.spec.js'], REG);
  assert.deepStrictEqual(codes(r), ['VD2_missing_registry_entry']);
});

// AC6(b)+(c) compound: validator with neither spec nor registry entry → VD1+VD2.
test('validator with neither spec nor registry entry → VD1+VD2', () => {
  const r = auditChangedFiles(['scripts/baz-validator.js'], REG);
  assert.deepStrictEqual(codes(r), ['VD1_missing_spec', 'VD2_missing_registry_entry']);
});

// AC6(d): modifying an existing validator whose spec is also touched → passes.
test('AC6d: existing validator modified WITH its spec + registry entry → 0 violations', () => {
  const r = auditChangedFiles(['scripts/foo-validator.js', 'scripts/foo-validator.spec.js'], REG);
  assert.deepStrictEqual(r.violations, []);
});

// False-positive avoidance: a spec-only change is not a validator add.
test('spec-only change is not flagged as an unguarded validator', () => {
  const r = auditChangedFiles(['scripts/foo-validator.spec.js'], REG);
  assert.deepStrictEqual(r.violations, []);
});

// False-positive avoidance: allowlisted support modules are exempt.
test('support-allowlist module (schema/builder) is exempt → 0 violations', () => {
  const r = auditChangedFiles(['scripts/baton-artifact-schema.js'], REG);
  assert.deepStrictEqual(r.violations, []);
});

// Nested / non-scripts paths are ignored (only flat scripts/*.js are validators).
test('non-scripts and nested paths are ignored', () => {
  const r = auditChangedFiles(['docs/x.js', 'scripts/global/nested.js', 'README.md'], REG);
  assert.deepStrictEqual(r.violations, []);
});

// Empty / malformed inputs do not throw.
test('empty and malformed inputs are handled safely', () => {
  assert.deepStrictEqual(auditChangedFiles([], REG).violations, []);
  assert.deepStrictEqual(auditChangedFiles(null, null).violations, []);
  assert.deepStrictEqual(auditChangedFiles(['scripts/x-validator.js'], {}).violations.map((v) => v.code),
    ['VD1_missing_spec', 'VD2_missing_registry_entry']);
});

// AC7 (recursive self-test): the real registry lists validator-discipline itself, and every
// registered spec file actually exists on disk.
test('AC7: real registry lists validator-discipline and all specs exist', () => {
  const root = path.resolve(__dirname, '..');
  const reg = JSON.parse(fs.readFileSync(path.join(root, 'inventory', 'harness-self-test-registry.json'), 'utf8'));
  const names = reg.validators.map((v) => v.name);
  assert.ok(names.includes('validator-discipline'), 'registry must list validator-discipline (AC7)');
  for (const v of reg.validators) {
    assert.ok(fs.existsSync(path.join(root, v.spec)), `registered spec missing on disk: ${v.spec}`);
  }
});

// AC7 (dogfood): auditing this ticket's own changeset yields ZERO violations — the deliverable
// passes its own gate.
test('AC7 dogfood: this ticket changeset (validator + spec + registry) → 0 violations', () => {
  const root = path.resolve(__dirname, '..');
  const reg = JSON.parse(fs.readFileSync(path.join(root, 'inventory', 'harness-self-test-registry.json'), 'utf8'));
  const changeset = ['scripts/validator-discipline.js', 'scripts/validator-discipline.spec.js',
    'inventory/harness-self-test-registry.json'];
  assert.deepStrictEqual(auditChangedFiles(changeset, reg).violations, []);
});

console.log(`\nvalidator-discipline.spec: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
