#!/usr/bin/env node
'use strict';
// Worktree discovery completeness + G8 orphaned-after-merge signal. Epic 3352 C4 (ticket 3359).
// Primary discovery is `git worktree list --porcelain` (covers every path convention in one sweep).
// A filesystem fallback flags ONLY detached dirs that carry valid git-worktree metadata and are absent
// from the registry (dry-run report; never removes). Emits a schema-v3 G8 signal counting merged
// worktrees still on disk, reconciled against C2's teardown audit records.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { inventory } = require('./worktree-inventory');
const { emitV3, readEvents } = require('./event-schema-v3');

const AUDIT_FILE = process.env.MEGINGJORD_TEARDOWN_AUDIT
  || path.join(process.env.HOME || '.', 'devenv-ops', 'dashboard', 'events.jsonl');
const TEARDOWN_EVENTS = new Set(['worktree-teardown-removed', 'quarantine-reconciled-removed']);

function defaultRunGit(args) {
  try { return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
  catch { return ''; }
}

// Primary sweep: the registry covers devenv-ops-*, wt-*, worktree-*, .worktrees/*, .claude/worktrees/* etc.
function discoverRegistry(runGit = defaultRunGit) {
  const raw = runGit(['worktree', 'list', '--porcelain']) || '';
  return raw.split('\n\n').filter(Boolean).map((block) => {
    const entry = {};
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) entry.path = line.slice('worktree '.length).trim();
      else if (line.startsWith('branch ')) entry.branch = line.slice('branch '.length).replace('refs/heads/', '').trim();
    }
    return entry;
  }).filter((entry) => entry.path);
}

// A directory is a real detached worktree ONLY if git's own resolver confirms it AND it is absent from
// the registry — so nested independent repos and symlinked paths are never mis-flagged. (AC4.2)
function isDetachedWorktree(dir, registryPaths, runGit = defaultRunGit, exists = fs.existsSync) {
  if (registryPaths.has(dir)) return false;
  if (!exists(path.join(dir, '.git'))) return false;
  if (runGit(['-C', dir, 'rev-parse', '--is-inside-work-tree']) !== 'true') return false;
  const gitFile = path.join(dir, '.git');
  try { return /gitdir:.*\/worktrees\//.test(fs.readFileSync(gitFile, 'utf8')); } catch { return false; }
}

function discoverDetached(opts = {}) {
  const runGit = opts.runGit || defaultRunGit;
  const candidateDirs = opts.candidateDirs || defaultCandidateDirs(opts);
  const registryPaths = new Set(discoverRegistry(runGit).map((entry) => entry.path));
  return candidateDirs.filter((dir) => isDetachedWorktree(dir, registryPaths, runGit, opts.exists || fs.existsSync));
}

function defaultCandidateDirs(opts = {}) {
  const home = opts.home || process.env.HOME || '.';
  const roots = [home, path.join(home, '.worktrees')];
  const found = [];
  for (const root of roots) {
    try {
      for (const name of fs.readdirSync(root)) {
        if (/^(devenv-ops-|worktree-|wt-)/.test(name)) found.push(path.join(root, name));
      }
    } catch { /* root absent — skip */ }
  }
  return found;
}

// G8 signal: merged worktrees still on disk, minus those already torn down per the C2 audit trail. (AC4.3)
function orphanedAfterMerge(opts = {}) {
  const report = opts.inventory || inventory(undefined, { runGh: require('./worktree-inventory').gh });
  const auditEvents = opts.auditEvents || readEvents(opts.auditFile || AUDIT_FILE);
  const removedPaths = new Set(auditEvents
    .filter((event) => TEARDOWN_EVENTS.has(event.event))
    .map((event) => event.worktree_path));
  const lingering = (report.worktrees || []).filter((worktree) =>
    (worktree.mergedToMain === true || worktree.mergedToMainDirty === true)
    && worktree.branch !== 'main' && !removedPaths.has(worktree.path));
  return { count: lingering.length, paths: lingering.map((worktree) => worktree.path) };
}

function emitSignal(opts = {}) {
  const orphaned = orphanedAfterMerge(opts);
  const detached = (opts.detached || discoverDetached(opts)).length;
  const record = {
    version: '3', ts: opts.now ? opts.now() : new Date().toISOString(),
    service: 'worktree-discovery-audit', env: 'local', event: 'worktree-orphaned-after-merge-count',
    orphaned_after_merge: orphaned.count, detached_non_registry: detached,
    _summary: `orphaned-after-merge=${orphaned.count} detached=${detached}`,
  };
  const emit = opts.emit || ((event) => { try { emitV3(event, opts.auditFile || AUDIT_FILE); } catch (_) { /* best-effort */ } });
  emit(record);
  return record;
}

function run(argv = process.argv.slice(2)) {
  const signal = emitSignal({});
  if (argv.includes('--json')) { process.stdout.write(`${JSON.stringify(signal, null, 2)}\n`); return signal; }
  process.stdout.write(`worktree-discovery-audit: registry=${discoverRegistry().length} ` +
    `orphaned-after-merge=${signal.orphaned_after_merge} detached-non-registry=${signal.detached_non_registry}\n`);
  return signal;
}

if (require.main === module) run();

module.exports = { discoverRegistry, discoverDetached, isDetachedWorktree, orphanedAfterMerge, emitSignal, defaultCandidateDirs, AUDIT_FILE };
