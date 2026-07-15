#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { formatCapabilities, buildPromptInjection, buildMetadata } = require('./authorization-profile-context');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; process.stdout.write(`✓ ${name}\n`); }
  catch (e) { fail++; process.stderr.write(`✗ ${name}: ${e.message}\n`); }
}

const profile = {
  profile: 'restricted',
  source: 'cli',
  precedence: ['cli', 'env', 'config', 'default'],
  capabilities: {
    install: false,
    upgrade: false,
    privileged: false,
    execute_local: true,
    execute_remote: false,
  },
};

test('formatCapabilities includes all capability keys', () => {
  const fmt = formatCapabilities(profile.capabilities);
  assert.ok(fmt.includes('install'));
  assert.ok(fmt.includes('upgrade'));
  assert.ok(fmt.includes('privileged'));
  assert.ok(fmt.includes('execute_local'));
  assert.ok(fmt.includes('execute_remote'));
});
test('formatCapabilities marks disabled capabilities with ❌', () => {
  const fmt = formatCapabilities(profile.capabilities);
  const lines = fmt.split('\n');
  const installLine = lines.find(l => l.includes('install'));
  assert.ok(installLine.includes('❌'), 'install should be marked as blocked');
});
test('formatCapabilities marks enabled capabilities with ✅', () => {
  const fmt = formatCapabilities(profile.capabilities);
  const lines = fmt.split('\n');
  const localLine = lines.find(l => l.includes('execute_local'));
  assert.ok(localLine.includes('✅'), 'execute_local should be marked as enabled');
});
test('buildPromptInjection includes profile name', () => {
  const inj = buildPromptInjection(profile);
  assert.ok(inj.includes('restricted'), 'should mention restricted profile');
});
test('buildPromptInjection includes capability table', () => {
  const inj = buildPromptInjection(profile);
  assert.ok(inj.includes('Capabilities'), 'should have Capabilities section');
  assert.ok(inj.includes('✅'), 'should mark enabled caps');
  assert.ok(inj.includes('❌'), 'should mark disabled caps');
});
test('buildPromptInjection includes override guidance', () => {
  const inj = buildPromptInjection(profile);
  assert.ok(inj.includes('--profile='), 'should mention CLI override');
  assert.ok(inj.includes('MEGINGJORD_AUTH_PROFILE'), 'should mention env override');
});
test('buildMetadata includes timestamp', () => {
  const meta = buildMetadata(profile);
  assert.ok(meta.timestamp, 'timestamp should be present');
  assert.ok(/\d{4}-\d{2}-\d{2}T/.test(meta.timestamp), 'timestamp should be ISO format');
});
test('buildMetadata includes profile and capabilities', () => {
  const meta = buildMetadata(profile);
  assert.strictEqual(meta.profile, 'restricted');
  assert.strictEqual(meta.capabilities.install, false);
  assert.strictEqual(meta.capabilities.execute_local, true);
});

process.stdout.write(`Results: ${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
