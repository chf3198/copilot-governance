#!/usr/bin/env node
'use strict';
// #3172 — operator-run git history scrub helper (Admin executes; no auto force-push).
const { execFileSync } = require('node:child_process');

const PATHS = ['inventory/devices.json', 'inventory/ai-models.json', 'inventory/services.json', 'inventory/fleet-latency-profile.json'];
const TAG = 'pre-inventory-scrub-3172';

function verifyNoTailscaleIps(repoRoot = process.cwd()) {
  const hits = [];
  for (const rel of PATHS) {
    try {
      const text = execFileSync('git', ['log', '--all', '-p', '--', rel], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
      if (/\b100\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(text)) hits.push(rel);
    } catch { /* path may not exist in history */ }
  }
  return { ok: !hits.length, hits };
}

function printPlan() {
  process.stdout.write(`inventory-history-scrub plan (#3172)\n`);
  process.stdout.write(`1. git tag ${TAG}\n`);
  process.stdout.write(`2. git filter-repo --path ${' --path '.join(PATHS)}\n`);
  process.stdout.write(`3. node scripts/global/inventory-history-scrub.js --verify\n`);
  process.stdout.write(`4. Admin force-push main after operator approval\n`);
}

if (require.main === module) {
  if (process.argv.includes('--verify')) {
    const result = verifyNoTailscaleIps();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(result.ok ? 0 : 1);
  }
  printPlan();
}

module.exports = { verifyNoTailscaleIps, PATHS, TAG };
