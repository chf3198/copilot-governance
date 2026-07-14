#!/usr/bin/env node
'use strict';

// signer-alias.spec.js — #3799-AC1 (hermetic baton tooling).
// Proves scripts/signer-alias.js resolves its registry from a CLEAN, .git-less archive
// checkout: the in-repo, tracked, secret-free alias subset at
// <repo>/inventory/team-model-signatures.json must be found with NO out-of-repo
// ../inventory present. Also pins the resolution-order precedence (env override >
// in-repo > legacy out-of-repo) and the canonical-alias / enforce behavior.
//
// Deterministic, offline, no network, no clock/random. Node built-in assert only.
// Run:  node scripts/signer-alias.spec.js   (exit 0 = pass, 1 = any failure)

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const sa = require('./signer-alias.js');
const {
  canonicalSignerAlias,
  enforceSignerAlias,
  deriveTeamFromSubstrate,
  loadRegistry,
  registryPath,
  IN_REPO_REGISTRY,
} = sa;

let failures = 0;
function test(name, fn) {
  try { fn(); console.log('  PASS ' + name); }
  catch (e) { failures++; console.error('  FAIL ' + name + ': ' + (e && e.message)); }
}

// --- Hermeticity: the in-repo registry exists and is the default resolution ---------
test('in-repo registry is tracked and present', () => {
  assert.ok(fs.existsSync(IN_REPO_REGISTRY), `missing in-repo registry ${IN_REPO_REGISTRY}`);
});

test('default resolution (no env) points at the in-repo registry', () => {
  const saved = process.env.BATON_SIGNER_REGISTRY;
  delete process.env.BATON_SIGNER_REGISTRY;
  try {
    // On a clean archive there is no <repo>/../inventory, so the in-repo path must win.
    // If a legacy out-of-repo registry happens to exist on a dev machine it is NOT the
    // in-repo path; we only assert the in-repo path is chosen when it is the first that
    // exists — which it always is here because in-repo precedes legacy in the order.
    assert.equal(registryPath(), IN_REPO_REGISTRY);
  } finally {
    if (saved === undefined) delete process.env.BATON_SIGNER_REGISTRY;
    else process.env.BATON_SIGNER_REGISTRY = saved;
  }
});

test('in-repo registry is SECRET-FREE (no cryptoKeys / private key material)', () => {
  const raw = fs.readFileSync(IN_REPO_REGISTRY, 'utf8');
  const reg = JSON.parse(raw);
  assert.ok(!('cryptoKeys' in reg), 'in-repo registry must not carry cryptoKeys');
  assert.ok(!/PRIVATE KEY/i.test(raw), 'in-repo registry must not contain private key material');
});

test('loadRegistry() parses the in-repo subset with required alias fields', () => {
  const reg = loadRegistry();
  assert.ok(reg.defaultAliasSeed, 'defaultAliasSeed');
  assert.ok(reg.roleSurnames && reg.roleSurnames.manager, 'roleSurnames.manager');
  assert.ok(Array.isArray(reg.registry) && reg.registry.length > 0, 'registry[]');
});

// --- Resolution-order precedence: env override wins ---------------------------------
test('BATON_SIGNER_REGISTRY env override takes precedence', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'signer-alias-'));
  const override = path.join(tmp, 'custom.json');
  fs.writeFileSync(override, JSON.stringify({
    defaultAliasSeed: 'Zeta',
    roleSurnames: { manager: 'Zed' },
    substrateTeamMap: {},
    registry: [{ team: '*', modelPattern: '.*', aliasSeed: 'Zeta' }],
  }));
  const saved = process.env.BATON_SIGNER_REGISTRY;
  process.env.BATON_SIGNER_REGISTRY = override;
  try {
    assert.equal(registryPath(), override);
    assert.equal(canonicalSignerAlias('anyteam', 'manager', 'any-model'), 'Zeta Zed');
  } finally {
    if (saved === undefined) delete process.env.BATON_SIGNER_REGISTRY;
    else process.env.BATON_SIGNER_REGISTRY = saved;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('a non-existent env override is skipped, falling back to in-repo', () => {
  const saved = process.env.BATON_SIGNER_REGISTRY;
  process.env.BATON_SIGNER_REGISTRY = '/nonexistent/path/does-not-exist.json';
  try {
    assert.equal(registryPath(), IN_REPO_REGISTRY);
  } finally {
    if (saved === undefined) delete process.env.BATON_SIGNER_REGISTRY;
    else process.env.BATON_SIGNER_REGISTRY = saved;
  }
});

// --- Alias derivation behavior (regression pins against the in-repo subset) ----------
test('substrate-first team derivation', () => {
  const reg = loadRegistry();
  assert.equal(deriveTeamFromSubstrate('github-copilot/penguin-1', reg), 'copilot');
  assert.equal(deriveTeamFromSubstrate('claude-code-cli', reg), 'claude-code');
  assert.equal(deriveTeamFromSubstrate('unknown-substrate', reg), null);
});

test('canonical alias resolves team+model+role deterministically', () => {
  // claude-code + opus + admin -> aliasSeed "Orla" + roleSurname "Reyes"
  assert.equal(canonicalSignerAlias('claude-code', 'admin', 'opus'), 'Orla Reyes');
  // copilot + opus + manager -> "Orion" + "Mason"
  assert.equal(canonicalSignerAlias('copilot', 'manager', 'opus'), 'Orion Mason');
  // substrate overrides teamName: substrate github-copilot -> copilot team
  assert.equal(canonicalSignerAlias('ignored', 'collaborator', 'opus', loadRegistry(), 'github-copilot'), 'Orion Harper');
});

test('enforceSignerAlias match / mismatch / missing', () => {
  const ok = enforceSignerAlias('claude-code', 'admin', 'Orla Reyes', { model: 'opus' });
  assert.equal(ok.ok, true);
  assert.equal(ok.reason, 'match');
  const bad = enforceSignerAlias('claude-code', 'admin', 'Wrong Name', { model: 'opus' });
  assert.equal(bad.ok, false);
  assert.equal(bad.reason, 'mismatch');
  const missing = enforceSignerAlias('claude-code', 'admin', '', { model: 'opus' });
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'missing-signed-by');
});

if (failures) {
  console.error(`signer-alias.spec: ${failures} failure(s)`);
  process.exit(1);
}
console.log('signer-alias.spec: OK');
process.exit(0);
