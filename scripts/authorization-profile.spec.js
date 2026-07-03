#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { parseActiveProfile, validateSchema } = require('./authorization-profile');

let pass = 0; let fail = 0;
function test(name, fn) {
  try { fn(); pass++; process.stdout.write(`✓ ${name}\n`); }
  catch (e) { fail++; process.stderr.write(`✗ ${name}: ${e.message}\n`); }
}

const schema = {
  schemaVersion: 1,
  defaultProfile: 'guarded',
  profiles: {
    owner: { install: true, upgrade: true, privileged: true, execute_local: true, execute_remote: true },
    guarded: { install: false, upgrade: true, privileged: false, execute_local: true, execute_remote: true },
    restricted: { install: false, upgrade: false, privileged: false, execute_local: true, execute_remote: false },
  },
};

test('schema validates canonical profiles', () => {
  assert.strictEqual(validateSchema(schema).defaultProfile, 'guarded');
});
test('config default is used without overrides', () => {
  const p = parseActiveProfile({ argv: [], env: {}, schema });
  assert.strictEqual(p.profile, 'guarded');
  assert.strictEqual(p.source, 'config');
});
test('env overrides config', () => {
  const p = parseActiveProfile({ argv: [], env: { MEGINGJORD_AUTH_PROFILE: 'restricted' }, schema });
  assert.strictEqual(p.profile, 'restricted');
  assert.strictEqual(p.source, 'env');
});
test('cli overrides env', () => {
  const p = parseActiveProfile({ argv: ['--profile', 'owner'], env: { MEGINGJORD_AUTH_PROFILE: 'restricted' }, schema });
  assert.strictEqual(p.profile, 'owner');
  assert.strictEqual(p.source, 'cli');
});
test('invalid profile is rejected deterministically', () => {
  assert.throws(() => parseActiveProfile({ argv: ['--profile=invalid'], env: {}, schema }), /unknown authorization profile/);
});
test('missing required capability key fails validation', () => {
  const bad = JSON.parse(JSON.stringify(schema));
  delete bad.profiles.owner.execute_remote;
  assert.throws(() => validateSchema(bad), /missing required capabilities/);
});

process.stdout.write(`Results: ${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
