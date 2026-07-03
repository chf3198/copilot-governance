#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { emit, targetPath, provenance, frontmatter } = require('./governance-adapter-emit');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`✓ ${name}`); }
  catch (e) { fail++; console.error(`✗ ${name}: ${e.message}`); }
}

const manifest = path.join(__dirname, '..', '..', 'inventory', 'governance-manifest.sample.json');

test('target paths are deterministic', () => {
  const unit = { id: 'operator-identity-context', title: 'Operator Identity Context', priority: 'P1', appliesTo: ['**'], targets: ['copilot', 'cline', 'claude-code', 'continue'], bodyRef: 'instructions/operator-identity-context.instructions.md' };
  assert.ok(targetPath('copilot', unit).includes('.github/instructions/operator-identity-context.instructions.md'));
  assert.ok(targetPath('cline', unit).includes('.clinerules/operator-identity-context.md'));
  assert.ok(targetPath('claude-code', unit).endsWith('CLAUDE.md'));
  assert.ok(targetPath('continue', unit).includes('.continue/rules/operator-identity-context.md'));
});

test('frontmatter maps appliesTo into paths', () => {
  const unit = { id: 'x', title: 'X', priority: 'P1', appliesTo: ['scripts/**', 'instructions/**'], targets: ['copilot'], bodyRef: 'instructions/x.instructions.md' };
  const fm = frontmatter('copilot', unit);
  assert.ok(fm.includes('paths:'));
  assert.ok(fm.includes('scripts/**'));
  assert.ok(fm.includes('instructions/**'));
});

test('emit writes deterministic adapter previews', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gov-adapt-'));
  const orig = process.cwd();
  process.chdir(path.join(__dirname, '..', '..'));
  const outputs = emit(manifest);
  process.chdir(orig);
  assert.ok(outputs.length >= 3);
  for (const file of outputs.slice(0, 3)) {
    assert.ok(fs.existsSync(file), `missing ${file}`);
    const txt = fs.readFileSync(file, 'utf8');
    assert.ok(txt.includes('---'));
    assert.ok(txt.includes('Source:'));
  }
});

console.log(`Results: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
