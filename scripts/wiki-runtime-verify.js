#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { run } = require('./wiki-parity-check.js');

let parity = null;
try {
  const inventoryPath = path.join(__dirname, '../../inventory/orchestrator-governance-parity.json');
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
  const wikiParity = inventory.wikiDocsParity || {};
  parity = run({ digestManifest: wikiParity.digestManifest, runtimeTiers: wikiParity.runtimeTiers });
} catch (err) {
  console.error(`Runtime wiki verification failed: ${err.message}`);
  process.exit(1);
}

const result = {
  timestamp: new Date().toISOString(),
  status: parity.ok ? 'PASSED' : 'FAILED',
  findings: parity.findings,
  dependencies: parity.dependencies,
  checkedAt: parity.checkedAt,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exit(parity.ok ? 0 : 1);
