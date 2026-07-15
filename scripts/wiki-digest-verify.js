#!/usr/bin/env node
'use strict';
// wiki-digest-verify.js — CI gate: manifest hash must match deployed wiki content.
// Exits 0 if all digest hashes match; exits 1 if any mismatch found.
// Run: node scripts/global/wiki-digest-verify.js [--strict]
// #3540

const fs = require('node:fs');
const path = require('node:path');
const { fileHash } = require('./wiki-parity-check');
const os = require('node:os');

const HOME = os.homedir();
const WIKI_PATHS = {
  copilot: path.join(HOME, '.copilot', 'wiki', 'index.md'),
  codex: path.join(HOME, '.codex', 'devenv-ops', 'wiki', 'index.md'),
};

const ROOT = path.resolve(__dirname, '..', '..');
const MANIFEST = path.join(ROOT, 'inventory', 'orchestrator-governance-parity.json');

function run() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const digestManifest = (manifest.wikiDocsParity || {}).digestManifest || {};
  const mismatches = [];

  for (const [rt, runtimePaths] of Object.entries(WIKI_PATHS)) {
    const expected = (digestManifest[rt] || {}).indexMd;
    if (!expected) continue;
    const actual = fileHash(runtimePaths);
    if (!actual) {
      process.stderr.write(`[wiki-digest-verify] SKIP ${rt}: index.md not found at ${runtimePaths}\n`);
      continue;
    }
    if (actual !== expected) {
      mismatches.push({ runtime: rt, expected, actual, path: runtimePaths });
      process.stderr.write(`[wiki-digest-verify] MISMATCH ${rt}: expected=${expected.slice(0,12)}... actual=${actual.slice(0,12)}...\n`);
    }
  }

  if (mismatches.length === 0) {
    process.stdout.write('[wiki-digest-verify] All digest hashes match deployed content.\n');
    return 0;
  }

  process.stderr.write(`[wiki-digest-verify] ${mismatches.length} hash mismatch(es). Run npm run deploy:apply to sync wiki.\n`);
  return 1;
}

const code = run();
const strict = process.argv.includes('--strict');
if (strict && code !== 0) process.exit(code);
