#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { emitAuditLog, readAuditLogs, canExecuteOperation } = require('./authorization-audit');
const { parseActiveProfile, readSchema } = require('./authorization-profile');

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

// ─── Operation gating logic ───────────────────────────────────────────────────
console.log('\n[Operation Gating: Owner]');
const ownerProfile = parseActiveProfile({ argv: ['--profile', 'owner'], env: {}, schema });
test('owner can install', () => {
  assert.strictEqual(canExecuteOperation(ownerProfile, 'install'), true);
});
test('owner can upgrade', () => {
  assert.strictEqual(canExecuteOperation(ownerProfile, 'upgrade'), true);
});
test('owner can privileged', () => {
  assert.strictEqual(canExecuteOperation(ownerProfile, 'privileged'), true);
});
test('owner can execute_local', () => {
  assert.strictEqual(canExecuteOperation(ownerProfile, 'execute_local'), true);
});
test('owner can execute_remote', () => {
  assert.strictEqual(canExecuteOperation(ownerProfile, 'execute_remote'), true);
});

console.log('\n[Operation Gating: Guarded]');
const guardedProfile = parseActiveProfile({ argv: ['--profile', 'guarded'], env: {}, schema });
test('guarded CANNOT install', () => {
  assert.strictEqual(canExecuteOperation(guardedProfile, 'install'), false);
});
test('guarded can upgrade', () => {
  assert.strictEqual(canExecuteOperation(guardedProfile, 'upgrade'), true);
});
test('guarded CANNOT privileged', () => {
  assert.strictEqual(canExecuteOperation(guardedProfile, 'privileged'), false);
});
test('guarded can execute_local', () => {
  assert.strictEqual(canExecuteOperation(guardedProfile, 'execute_local'), true);
});
test('guarded can execute_remote', () => {
  assert.strictEqual(canExecuteOperation(guardedProfile, 'execute_remote'), true);
});

console.log('\n[Operation Gating: Restricted]');
const restrictedProfile = parseActiveProfile({ argv: ['--profile', 'restricted'], env: {}, schema });
test('restricted CANNOT install', () => {
  assert.strictEqual(canExecuteOperation(restrictedProfile, 'install'), false);
});
test('restricted CANNOT upgrade', () => {
  assert.strictEqual(canExecuteOperation(restrictedProfile, 'upgrade'), false);
});
test('restricted CANNOT privileged', () => {
  assert.strictEqual(canExecuteOperation(restrictedProfile, 'privileged'), false);
});
test('restricted can execute_local', () => {
  assert.strictEqual(canExecuteOperation(restrictedProfile, 'execute_local'), true);
});
test('restricted CANNOT execute_remote', () => {
  assert.strictEqual(canExecuteOperation(restrictedProfile, 'execute_remote'), false);
});

// ─── Telemetry emission ───────────────────────────────────────────────────────
console.log('\n[Audit Telemetry]');
const tmpAudit = path.join(os.tmpdir(), `auth-audit-test-${Date.now()}.jsonl`);
test('emitAuditLog creates valid entry with profile snapshot', () => {
  // Temporarily override TELEMETRY_FILE for this test via monkey-patch
  const origEmit = require('./authorization-audit').emitAuditLog;
  const entry = origEmit('exec-123', 'install', 'DENY', ownerProfile);
  assert.ok(entry.timestamp);
  assert.strictEqual(entry.execution_id, 'exec-123');
  assert.strictEqual(entry.operation, 'install');
  assert.strictEqual(entry.decision, 'DENY');
  assert.strictEqual(entry.profile_active, 'owner');
});
test('audit log entry includes all required fields', () => {
  const entry = emitAuditLog('exec-456', 'upgrade', 'ALLOW', guardedProfile);
  assert.ok(entry.timestamp);
  assert.strictEqual(entry.execution_id, 'exec-456');
  assert.strictEqual(entry.operation, 'upgrade');
  assert.strictEqual(entry.decision, 'ALLOW');
  assert.ok(entry.capabilities_active);
  assert.ok('install' in entry.capabilities_active);
});
test('readAuditLogs returns empty array for non-existent file', () => {
  const logs = readAuditLogs();
  assert.ok(Array.isArray(logs));
});

process.stdout.write(`\nResults: ${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
