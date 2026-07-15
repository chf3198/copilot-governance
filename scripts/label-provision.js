#!/usr/bin/env node
'use strict';
// label-provision — idempotent canonical label provisioner. Refs #2785.
// Reconciles a target repo to label-manifest.json (creates/updates; never deletes unknown labels).
// Usage: node label-provision.js --repo=<owner/repo> [--dry-run] [--json]

const { execFileSync } = require('child_process');
const path = require('path');
const MANIFEST_PATH = path.join(__dirname, 'label-manifest.json');

function loadManifest(manifestPath = MANIFEST_PATH) {
  return JSON.parse(require('fs').readFileSync(manifestPath, 'utf8'));
}

function provisionOne(repo, label, dryRun) {
  const { name, color, description = '' } = label;
  if (dryRun) return { action: 'dry-run', name };
  try {
    execFileSync('gh', [
      'label', 'create', name,
      '--color', color.replace(/^#/, ''),
      '--description', description,
      '--force',
      '-R', repo,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { action: 'ok', name };
  } catch (e) {
    const msg = (e.stderr || e.message || '').trim();
    return { action: 'error', name, error: msg };
  }
}

async function provision(repo, opts = {}) {
  if (!repo) throw new Error('provision: --repo=<owner/repo> required');
  const manifest = loadManifest(opts.manifestPath);
  const results = manifest.labels.map(l => provisionOne(repo, l, opts.dryRun));
  return {
    repo,
    total: manifest.labels.length,
    ok: results.filter(r => r.action === 'ok').length,
    dryRun: results.filter(r => r.action === 'dry-run').length,
    errors: results.filter(r => r.action === 'error'),
    results,
  };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const repo = (argv.find(a => a.startsWith('--repo=')) || '').replace('--repo=', '');
  const dryRun = argv.includes('--dry-run');
  const asJson = argv.includes('--json');
  if (!repo) { console.error('[label-provision] Usage: --repo=<owner/repo> [--dry-run] [--json]'); process.exit(1); }
  provision(repo, { dryRun }).then(r => {
    if (asJson) { console.log(JSON.stringify(r, null, 2)); return; }
    const count = r.dryRun || r.ok;
    console.log(`[label-provision] ${repo}: ${count}/${r.total} labels ${dryRun ? '(dry-run)' : 'reconciled'}`);
    r.errors.forEach(e => console.error(`  ✗ ${e.name}: ${e.error}`));
    if (r.errors.length) process.exit(1);
  }).catch(e => { console.error(e.message); process.exit(1); });
}

module.exports = { provision, loadManifest, MANIFEST_PATH };
