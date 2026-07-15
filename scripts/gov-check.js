#!/usr/bin/env node
'use strict';
// tier: 1
// gov-check (Epic #2709 / #2725): the shift-left CLI + health reporter for the
// governance-chain invariant. Runs the keystone validator (chain-integrity) against
// the registry and reports per-link health, so an author sees the same verdict CI
// will give BEFORE pushing, and an operator/dashboard can read chain-health JSON.
// Pure-ish: govHealth(registry, opts) is unit-testable; the CLI wraps it.
const fs = require('fs');
const path = require('path');
const chainIntegrity = require('./megalint/chain-integrity.js');

const REGISTRY_PATH = 'config/governance-chains.yml';

// Roll the registry up into a health summary: per-chain link counts + validity.
function govHealth(registry = {}, opts = {}) {
  const chains = registry.chains || {};
  const result = chainIntegrity.validate(registry, opts);
  const links = Object.values(chains).reduce((sum, list) => sum + (list || []).length, 0);
  const discretionary = result.violations.filter((v) => v.rule === 'discretionary-or-invalid-guarantee').length;
  return {
    ok: result.ok,
    chains: Object.keys(chains).length,
    links,
    discretionary_links: discretionary,
    violations: result.violations,
  };
}

function loadRegistry(repoRoot) {
  const yaml = require('js-yaml');
  return yaml.load(fs.readFileSync(path.join(repoRoot, REGISTRY_PATH), 'utf8'));
}

module.exports = { govHealth, loadRegistry, REGISTRY_PATH };

if (require.main === module) {
  const repoRoot = process.cwd();
  const health = govHealth(loadRegistry(repoRoot), { repoRoot });
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(health));
  } else {
    console.log(`gov-check: ${health.chains} chains, ${health.links} links, `
      + `${health.discretionary_links} discretionary (invariant requires 0)`);
    health.violations.forEach((v) => console.error(`  X ${v.rule} - ${v.detail}`));
    console.log(health.ok ? 'gov-check: OK - invariant holds' : 'gov-check: FAIL');
  }
  process.exit(health.ok ? 0 : 1);
}
