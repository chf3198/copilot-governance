#!/usr/bin/env node
// scripts/global/worktree-provision.js — apply the per-artifact provisioning policy
// (config/worktree-provisioning.json) to a git worktree (#3088, Epic #3083). Symlinks the
// `shared-symlink` set (node_modules, .env, ...) from the main checkout so a worktree is not
// blanket-installed and is never missing the secrets a runtime needs (closes the no_key bug).
// `local-ephemeral` and `per-worktree-state` paths are left local. Unclassified gitignored
// paths default to local-ephemeral (G4 fail-safe) and are logged, never auto-shared.
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_MANIFEST = path.join(__dirname, '..', '..', 'config', 'worktree-provisioning.json');

function loadManifest(file = DEFAULT_MANIFEST) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { paths: raw.paths || {}, fallback: raw.default || 'local-ephemeral' };
}

/** Classify a gitignored path against the manifest; unlisted -> fallback (fail-safe). */
function classify(rel, manifest) {
  return manifest.paths[rel] || manifest.fallback;
}

/** Idempotently symlink one shared path from main into the worktree. Returns a status string. */
function linkShared(rel, mainRoot, worktreeRoot, dryRun) {
  const src = path.join(mainRoot, rel);
  const dest = path.join(worktreeRoot, rel);
  if (!fs.existsSync(src)) return 'source-absent';
  // One try covers the dest probe AND the link, so ANY fs failure (ENOTDIR, EACCES, ...)
  // is isolated to this path and never aborts the whole provision run.
  try {
    if (fs.existsSync(dest) || fs.lstatSync(dest, { throwIfNoEntry: false })) return 'already-present';
    if (dryRun) return 'would-link';
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.symlinkSync(src, dest);
    return 'linked';
  } catch (err) {
    return `error:${err.code || err.message}`;
  }
}

/**
 * Provision a worktree per the manifest.
 * @param {{mainRoot:string, worktreeRoot:string, manifestFile?:string, dryRun?:boolean}} opts
 * @returns {{linked:string[], present:string[], localEphemeral:string[], skipped:string[]}}
 */
function provision(opts) {
  const { mainRoot, worktreeRoot, manifestFile, dryRun } = opts;
  const manifest = loadManifest(manifestFile);
  const out = { linked: [], present: [], localEphemeral: [], skipped: [] };
  for (const [rel, cls] of Object.entries(manifest.paths)) {
    if (cls === 'shared-symlink') {
      const status = linkShared(rel, mainRoot, worktreeRoot, dryRun);
      if (status === 'linked' || status === 'would-link') out.linked.push(rel);
      else if (status === 'already-present') out.present.push(rel);
      else out.skipped.push(`${rel} (${status})`);
    } else {
      out.localEphemeral.push(rel); // local-ephemeral + per-worktree-state stay local
    }
  }
  return out;
}

module.exports = { provision, loadManifest, classify, linkShared, DEFAULT_MANIFEST };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const worktreeRoot = process.cwd();
  const mainRoot = (argv.find((a) => a.startsWith('--main=')) || '').replace('--main=', '')
    || path.join(__dirname, '..', '..');
  const res = provision({ mainRoot, worktreeRoot, dryRun });
  console.log(`worktree-provision: linked=[${res.linked.join(', ')}] present=[${res.present.join(', ')}] ` +
    `local=[${res.localEphemeral.join(', ')}] skipped=[${res.skipped.join(', ')}]${dryRun ? ' (dry-run)' : ''}`);
}
