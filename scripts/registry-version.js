'use strict';
// Registry version hash — binds inventory/team-model-signatures.json content into
// sign + validate so signer/validator registry drift FAILS CLOSED (#3029 C1 AC3).
// The hash covers only the signing-relevant surface (registry entries + role
// surnames + default seed); metadata (lastUpdated, notes, autoModeCoverage) is
// excluded so a doc/coverage edit does not self-invalidate signatures.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REGISTRY_PATH = path.join(__dirname, '..', '..', 'inventory', 'team-model-signatures.json');

function canonicalPayload(reg) {
  return JSON.stringify({
    defaultAliasSeed: reg.defaultAliasSeed,
    roleSurnames: reg.roleSurnames,
    registry: reg.registry,
  });
}

function computeRegistryHash(reg) {
  return crypto.createHash('sha256').update(canonicalPayload(reg)).digest('hex').slice(0, 16);
}

function loadRegistry(registryPath) {
  return JSON.parse(fs.readFileSync(registryPath || REGISTRY_PATH, 'utf8'));
}

// Returns { ok, version } on match; { ok:false, reason, expected, stored, hint } on drift.
function verifyRegistryIntegrity(reg, registryPath) {
  const registry = reg || loadRegistry(registryPath);
  const expected = computeRegistryHash(registry);
  const stored = registry.registryVersion;
  if (!stored) return { ok: false, reason: 'missing-registry-version', expected };
  if (stored !== expected) {
    return {
      ok: false,
      reason: 'registry-version-drift',
      expected,
      stored,
      hint: 'Registry signing surface changed without updating registryVersion. Run '
        + '`node scripts/global/registry-version.js --write`, then re-sign affected baton artifacts.',
    };
  }
  return { ok: true, version: stored };
}

function writeRegistryVersion(registryPath) {
  const file = registryPath || REGISTRY_PATH;
  const registry = loadRegistry(file);
  registry.registryVersion = computeRegistryHash(registry);
  fs.writeFileSync(file, JSON.stringify(registry, null, 2) + '\n');
  return registry.registryVersion;
}

if (require.main === module) {
  if (process.argv.includes('--compute')) {
    process.stdout.write(computeRegistryHash(loadRegistry()) + '\n');
  } else if (process.argv.includes('--write')) {
    process.stdout.write('registryVersion=' + writeRegistryVersion() + '\n');
  } else {
    const result = verifyRegistryIntegrity();
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    process.exit(result.ok ? 0 : 1);
  }
}

module.exports = { computeRegistryHash, verifyRegistryIntegrity, writeRegistryVersion, loadRegistry, REGISTRY_PATH };
