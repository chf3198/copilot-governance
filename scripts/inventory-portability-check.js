#!/usr/bin/env node
'use strict';
// #3171 — fail CI when tracked inventory contains operator-specific Tailscale IPs.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ALLOWED = /\.example\.json$/;
const TAILSCALE_IP = /\b100\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;

function listTrackedInventory(repoRoot = REPO_ROOT) {
  try {
    const out = execFileSync('git', ['ls-files', 'inventory'], { cwd: repoRoot, encoding: 'utf8' });
    return out.split('\n').filter(Boolean)
      .filter((rel) => rel.endsWith('.json') && !ALLOWED.test(path.basename(rel)))
      .map((rel) => path.join(repoRoot, rel));
  } catch {
    return [];
  }
}

function scanFile(filePath) {
  if (!fs.existsSync(filePath)) return { filePath, hits: [] };
  const text = fs.readFileSync(filePath, 'utf8');
  const hits = text.match(new RegExp(TAILSCALE_IP.source, 'g')) || [];
  return { filePath, hits: [...new Set(hits)] };
}

function run(repoRoot = REPO_ROOT) {
  const violations = listTrackedInventory(repoRoot).map(scanFile).filter((row) => row.hits.length);
  return { ok: !violations.length, violations };
}

if (require.main === module) {
  const result = run();
  if (!result.ok) {
    for (const row of result.violations) {
      process.stderr.write(`inventory-portability-check: ${row.filePath} contains Tailscale IP(s): ${row.hits.join(', ')}\n`);
    }
    process.exit(1);
  }
  process.stdout.write('inventory-portability-check: OK\n');
}

module.exports = { run, listTrackedInventory, scanFile };
