#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { parseActiveProfile, readSchema } = require('./authorization-profile');
const { buildPromptInjection, buildMetadata } = require('./authorization-profile-context');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; process.stdout.write(`✓ ${name}\n`); }
  catch (e) { fail++; process.stderr.write(`✗ ${name}: ${e.message}\n`); }
}

const schema = {
  schemaVersion: 1,
  defaultProfile: 'owner',
  profiles: {
    owner: { install: true, upgrade: true, privileged: true, execute_local: true, execute_remote: true },
    guarded: { install: false, upgrade: true, privileged: false, execute_local: true, execute_remote: true },
    restricted: { install: false, upgrade: false, privileged: false, execute_local: true, execute_remote: false },
  },
};

// ─── Owner profile conformance ────────────────────────────────────────────────
console.log('\n[Owner Profile Conformance]');
test('owner: install permitted', () => {
  const p = parseActiveProfile({ argv: ['--profile', 'owner'], env: {}, schema });
  assert.strictEqual(p.capabilities.install, true);
});
test('owner: upgrade permitted', () => {
  const p = parseActiveProfile({ argv: ['--profile', 'owner'], env: {}, schema });
  assert.strictEqual(p.capabilities.upgrade, true);
});
test('owner: privileged permitted', () => {
  const p = parseActiveProfile({ argv: ['--profile', 'owner'], env: {}, schema });
  assert.strictEqual(p.capabilities.privileged, true);
});
test('owner: execute_local permitted', () => {
  const p = parseActiveProfile({ argv: ['--profile', 'owner'], env: {}, schema });
  assert.strictEqual(p.capabilities.execute_local, true);
});
test('owner: execute_remote permitted', () => {
  const p = parseActiveProfile({ argv: ['--profile', 'owner'], env: {}, schema });
  assert.strictEqual(p.capabilities.execute_remote, true);
});

// ─── Guarded profile conformance ──────────────────────────────────────────────
console.log('\n[Guarded Profile Conformance]');
test('guarded: install blocked', () => {
  const p = parseActiveProfile({ argv: ['--profile', 'guarded'], env: {}, schema });
  assert.strictEqual(p.capabilities.install, false);
});
test('guarded: upgrade permitted', () => {
  const p = parseActiveProfile({ argv: ['--profile', 'guarded'], env: {}, schema });
  assert.strictEqual(p.capabilities.upgrade, true);
});
test('guarded: privileged blocked', () => {
  const p = parseActiveProfile({ argv: ['--profile', 'guarded'], env: {}, schema });
  assert.strictEqual(p.capabilities.privileged, false);
});
test('guarded: execute_local permitted', () => {
  const p = parseActiveProfile({ argv: ['--profile', 'guarded'], env: {}, schema });
  assert.strictEqual(p.capabilities.execute_local, true);
});
test('guarded: execute_remote permitted', () => {
  const p = parseActiveProfile({ argv: ['--profile', 'guarded'], env: {}, schema });
  assert.strictEqual(p.capabilities.execute_remote, true);
});

// ─── Restricted profile conformance ───────────────────────────────────────────
console.log('\n[Restricted Profile Conformance]');
test('restricted: install blocked', () => {
  const p = parseActiveProfile({ argv: ['--profile', 'restricted'], env: {}, schema });
  assert.strictEqual(p.capabilities.install, false);
});
test('restricted: upgrade blocked', () => {
  const p = parseActiveProfile({ argv: ['--profile', 'restricted'], env: {}, schema });
  assert.strictEqual(p.capabilities.upgrade, false);
});
test('restricted: privileged blocked', () => {
  const p = parseActiveProfile({ argv: ['--profile', 'restricted'], env: {}, schema });
  assert.strictEqual(p.capabilities.privileged, false);
});
test('restricted: execute_local permitted', () => {
  const p = parseActiveProfile({ argv: ['--profile', 'restricted'], env: {}, schema });
  assert.strictEqual(p.capabilities.execute_local, true);
});
test('restricted: execute_remote blocked', () => {
  const p = parseActiveProfile({ argv: ['--profile', 'restricted'], env: {}, schema });
  assert.strictEqual(p.capabilities.execute_remote, false);
});

// ─── Default owner startup path regression ────────────────────────────────────
console.log('\n[Default Owner Startup (Regression)]');
test('no overrides: defaults to owner', () => {
  const p = parseActiveProfile({ argv: [], env: {}, schema });
  assert.strictEqual(p.profile, 'owner');
});
test('default owner: all capabilities enabled', () => {
  const p = parseActiveProfile({ argv: [], env: {}, schema });
  assert.ok(p.capabilities.install);
  assert.ok(p.capabilities.upgrade);
  assert.ok(p.capabilities.privileged);
  assert.ok(p.capabilities.execute_local);
  assert.ok(p.capabilities.execute_remote);
});
test('default owner source: config', () => {
  const p = parseActiveProfile({ argv: [], env: {}, schema });
  assert.strictEqual(p.source, 'config');
});

// ─── Telemetry/metadata coverage ──────────────────────────────────────────────
console.log('\n[Telemetry/Metadata Coverage]');
test('metadata includes active profile', () => {
  const p = parseActiveProfile({ argv: ['--profile', 'restricted'], env: {}, schema });
  const meta = buildMetadata(p);
  assert.strictEqual(meta.profile, 'restricted');
});
test('metadata includes timestamp', () => {
  const p = parseActiveProfile({ argv: [], env: {}, schema });
  const meta = buildMetadata(p);
  assert.ok(meta.timestamp, 'timestamp should be present');
  assert.ok(/\d{4}-\d{2}-\d{2}T/.test(meta.timestamp));
});
test('metadata includes source', () => {
  const p = parseActiveProfile({ argv: ['--profile', 'guarded'], env: {}, schema });
  const meta = buildMetadata(p);
  assert.strictEqual(meta.source, 'cli');
});
test('metadata includes capabilities snapshot', () => {
  const p = parseActiveProfile({ argv: [], env: {}, schema });
  const meta = buildMetadata(p);
  assert.ok(meta.capabilities);
  assert.ok('install' in meta.capabilities);
});
test('prompt injection includes active profile name', () => {
  const p = parseActiveProfile({ argv: ['--profile', 'guarded'], env: {}, schema });
  const inj = buildPromptInjection(p);
  assert.ok(inj.includes('guarded'));
});

// ─── Multi-scenario conformance ───────────────────────────────────────────────
console.log('\n[Multi-Scenario Conformance]');
test('cli override beats env', () => {
  const p = parseActiveProfile({
    argv: ['--profile', 'restricted'],
    env: { MEGINGJORD_AUTH_PROFILE: 'guarded' },
    schema,
  });
  assert.strictEqual(p.profile, 'restricted');
  assert.strictEqual(p.source, 'cli');
});
test('env override beats config', () => {
  const p = parseActiveProfile({
    argv: [],
    env: { MEGINGJORD_AUTH_PROFILE: 'restricted' },
    schema,
  });
  assert.strictEqual(p.profile, 'restricted');
  assert.strictEqual(p.source, 'env');
});
test('config default used when no overrides', () => {
  const p = parseActiveProfile({
    argv: [],
    env: {},
    schema,
  });
  assert.strictEqual(p.profile, 'owner');
  assert.strictEqual(p.source, 'config');
});

process.stdout.write(`\nResults: ${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
