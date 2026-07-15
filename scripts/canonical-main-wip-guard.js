#!/usr/bin/env node
'use strict';
// tier: 1
// canonical-main-wip-guard (Epic #2658 / #2663): runtime-AGNOSTIC detection + quarantine of
// stranded tracked WIP in the canonical main checkout. The #2091 C6 enforcer only catches
// Claude Code's tool writes; this reads git WORKING-TREE state, so it catches residue from ANY
// runtime (Copilot/Codex/etc.). Scope: canonical main only (invariant: zero tracked WIP, #2107).
// Advisory by default; enforce (auto-quarantine) on MEGINGJORD_CANONICAL_MAIN_ENFORCE=1.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { detectRuntime } = require('./detect-runtime');
const { attributeForeignWriter } = require('./runtime-session-registry');

const GIT_OP_MARKERS = ['index.lock', 'MERGE_HEAD', 'REBASE_HEAD', 'CHERRY_PICK_HEAD'];

function isGitOpInProgress(gitDir) {
  return GIT_OP_MARKERS.some((marker) => fs.existsSync(path.join(gitDir, marker)));
}

// Parse `git status --porcelain` → tracked-modified + untracked paths.
function detectStrandedWip(porcelain) {
  const modified = [];
  const untracked = [];
  for (const line of String(porcelain || '').split('\n')) {
    if (!line.trim()) continue;
    const code = line.slice(0, 2);
    const file = line.slice(3);
    if (code === '??') untracked.push(file);
    else modified.push(file);
  }
  return { modified, untracked };
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function quarantineWip(cwd, wip, opts = {}) {
  const stamp = opts.stamp || new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(os.homedir(), '.megingjord');
  fs.mkdirSync(dir, { recursive: true });
  const patch = path.join(dir, `canonical-main-wip-${stamp}.patch`);
  const tgz = path.join(dir, `canonical-main-untracked-${stamp}.tgz`);
  fs.writeFileSync(patch, git(cwd, ['diff']), 'utf8');
  if (wip.untracked.length) execFileSync('tar', ['czf', tgz, ...wip.untracked], { cwd });
  if (opts.enforce) {
    if (wip.modified.length) git(cwd, ['checkout', '--', ...wip.modified]);
    for (const file of wip.untracked) fs.rmSync(path.join(cwd, file), { force: true });
  }
  const manifest = {
    ts: stamp, writer: opts.writer || 'undetermined',
    modified: wip.modified, untracked: wip.untracked, enforced: Boolean(opts.enforce),
    recover: `git worktree add ~/devenv-ops-recover -b recover/canonical-main-wip; git -C ~/devenv-ops-recover apply ${patch}; tar xzf ${tgz} -C ~/devenv-ops-recover`,
  };
  const manifestPath = path.join(dir, `canonical-main-quarantine-${stamp}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  return { patch, tgz, manifestPath, manifest };
}

// Returns {action, ...}. action: 'skip-not-main' | 'skip-git-op' | 'clean' | 'advisory' | 'quarantined'.
function guard(cwd, opts = {}) {
  const isMain = (opts.branch || git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']).trim()) === 'main';
  if (!isMain) return { action: 'skip-not-main' };
  if (isGitOpInProgress(opts.gitDir || path.join(cwd, '.git'))) return { action: 'skip-git-op' };
  const porcelain = opts.porcelain !== undefined ? opts.porcelain : git(cwd, ['status', '--porcelain']);
  const wip = detectStrandedWip(porcelain);
  if (!wip.modified.length && !wip.untracked.length) return { action: 'clean' };
  const enforce = opts.enforce ?? process.env.MEGINGJORD_CANONICAL_MAIN_ENFORCE === '1';
  const writer = opts.writer !== undefined ? opts.writer
    : attributeForeignWriter(detectRuntime().runtime, {});
  const backup = quarantineWip(cwd, wip, { ...opts, enforce, writer });
  return { action: enforce ? 'quarantined' : 'advisory', wip, writer, backup };
}

if (require.main === module) {
  const target = process.argv[2] || path.join(os.homedir(), 'devenv-ops');
  try {
    const result = guard(target, {});
    if (result.action === 'advisory') {
      console.warn(`[canonical-main-wip-guard] stranded WIP in canonical main from runtime '${result.writer}' `
        + `(${result.wip.modified.length} modified, ${result.wip.untracked.length} untracked) — `
        + `backed up: ${result.backup.manifestPath}. Set MEGINGJORD_CANONICAL_MAIN_ENFORCE=1 to auto-quarantine.`);
    } else if (result.action === 'quarantined') {
      console.warn(`[canonical-main-wip-guard] quarantined stranded WIP; main restored. Recovery: ${result.backup.manifestPath}`);
    }
  } catch (err) { console.error(`[canonical-main-wip-guard] skipped: ${err.message}`); }
}

module.exports = { guard, detectStrandedWip, isGitOpInProgress, quarantineWip, GIT_OP_MARKERS };
