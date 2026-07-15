#!/usr/bin/env node
'use strict';
// validator-dispatch-contract.js — Refs #3456 (Epic #3411 Carve-out 2)
// Makes it impossible for a governance validator to be silently undispatched.
// Exports: loadContract(), discoverValidators(repoRoot), reconcile(contract, discovered).
// CLI: exits non-zero when any orphan exists (zero dispatchedBy surfaces).

const fs = require('node:fs');
const path = require('node:path');

const CONTRACT_PATH = path.join(__dirname, '../../inventory/validator-dispatch-contract.json');

// Files in the megalint dir that are helpers, not dispatchable validators.
// Helpers lack a validate() export and are not expected in the contract.
const HELPER_BASENAMES = new Set([
  'index.js',
  'admin-merge-precondition.js',
  'artifact-field-extract.js',
  'doc-coverage-diff-replay-eval.js',
  'doc-coverage-diff-verify.js',
  'doc-coverage-helpers.js',
  'epic-parent-resolve.js',
  'signer-registry-check.js',
  'work-log-sync-helpers.js',
]);

function loadContract(contractPath) {
  const resolved = contractPath || CONTRACT_PATH;
  if (!fs.existsSync(resolved)) {
    throw new Error(`Contract file not found: ${resolved}`);
  }
  const raw = fs.readFileSync(resolved, 'utf8');
  return JSON.parse(raw);
}

function discoverValidators(repoRoot) {
  const megalintDir = path.join(repoRoot || path.join(__dirname, '../..'), 'scripts/global/megalint');
  if (!fs.existsSync(megalintDir)) {
    throw new Error(`Megalint directory not found: ${megalintDir}`);
  }
  const entries = fs.readdirSync(megalintDir)
    .filter(filename => filename.endsWith('.js') && !HELPER_BASENAMES.has(filename))
    .sort();
  return entries.map(filename => ({
    name: filename.replace(/\.js$/, ''),
    file: path.join('scripts/global/megalint', filename),
  }));
}

function buildContractMap(contract) {
  const contractMap = new Map();
  for (const entry of (contract.validators || [])) {
    contractMap.set(entry.validator, entry.dispatchedBy || []);
  }
  return contractMap;
}

function findOrphans(discovered, contractMap) {
  const orphans = [];
  const matched = new Set();
  for (const validatorInfo of discovered) {
    matched.add(validatorInfo.name);
    const dispatchedBy = contractMap.get(validatorInfo.name);
    if (dispatchedBy === undefined || dispatchedBy.length === 0) {
      const reason = dispatchedBy === undefined ? 'not-in-contract' : 'empty-dispatchedBy';
      orphans.push({ validator: validatorInfo.name, file: validatorInfo.file, reason });
    }
  }
  return { orphans, matched };
}

function findContractOnly(contractMap, matched) {
  const contractOnly = [];
  for (const contractName of contractMap.keys()) {
    if (!matched.has(contractName)) contractOnly.push({ validator: contractName });
  }
  return contractOnly;
}

function reconcile(contract, discovered) {
  const contractMap = buildContractMap(contract);
  const { orphans, matched } = findOrphans(discovered, contractMap);
  const contractOnly = findContractOnly(contractMap, matched);
  return {
    ok: orphans.length === 0,
    orphans,
    contractOnly,
    discoveredCount: discovered.length,
    contractCount: contractMap.size,
  };
}

function loadContractOrExit(contractPath) {
  try {
    return loadContract(contractPath);
  } catch (loadErr) {
    process.stderr.write(`validator-dispatch-contract: ERROR loading contract: ${loadErr.message}\n`);
    process.exit(1);
  }
}

function discoverOrExit(repoRoot) {
  try {
    return discoverValidators(repoRoot);
  } catch (discoverErr) {
    process.stderr.write(`validator-dispatch-contract: ERROR discovering validators: ${discoverErr.message}\n`);
    process.exit(1);
  }
}

function reportOrphans(result) {
  process.stderr.write(`validator-dispatch-contract: FAIL — ${result.orphans.length} orphan(s) with no dispatchedBy surface:\n`);
  for (const orphan of result.orphans) {
    process.stderr.write(`  - ${orphan.validator} (${orphan.file}): ${orphan.reason}\n`);
  }
  process.stderr.write('Fix: add each orphan to inventory/validator-dispatch-contract.json dispatchedBy\n');
  process.stderr.write('     AND wire it to megalint runAll (index.js VALIDATORS) or a CI workflow.\n');
}

function runCli(repoRoot, contractPath) {
  const root = repoRoot || path.join(__dirname, '../..');
  const contract = loadContractOrExit(contractPath);
  const discovered = discoverOrExit(root);
  const result = reconcile(contract, discovered);

  if (result.contractOnly.length > 0) {
    const names = result.contractOnly.map(entry => entry.validator).join(', ');
    process.stderr.write(`validator-dispatch-contract: WARN — contract lists validators not found on disk: ${names}\n`);
  }

  if (!result.ok) {
    reportOrphans(result);
    process.exit(1);
  }

  process.stdout.write(
    `validator-dispatch-contract: OK — ${result.discoveredCount} validators, `
    + `${result.contractCount} in contract, 0 orphans\n`
  );
  process.exit(0);
}

module.exports = { loadContract, discoverValidators, reconcile, CONTRACT_PATH };

if (require.main === module) {
  runCli(process.argv[2] || null, process.argv[3] || null);
}
