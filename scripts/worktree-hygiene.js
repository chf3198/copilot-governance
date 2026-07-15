#!/usr/bin/env node
'use strict';
// tier: 1
// worktree-hygiene (Epic #2071 C10 #2084 + C13 #2087): advisory session/worktree hygiene.
// - Stash-hygiene: warn when >2 stashes exist or any is older than the age budget.
// - Stale worktree/index: `git worktree prune` + scan ${HOME}/devenv-ops-*/ for dirs not in
//   `git worktree list` (abandoned). All WARN-only (never blocks). Emits schema-v3 advisories
//   to ~/.megingjord/state-isolation.jsonl (the #2091/#2108 audit surface). Consumes #2091.

const os = require('node:os');
const path = require('node:path');
const { emitV3 } = require('./event-schema-v3');

const AUDIT_FILE = path.join(os.homedir(), '.megingjord', 'state-isolation.jsonl');
const MAX_STASHES = 2;
const STASH_AGE_BUDGET_DAYS = 7;
const SECONDS_PER_DAY = 86400;

// stashLines: array of `git stash list --date=unix` lines; nowSec for testability.
function auditStashes(stashLines, nowSec) {
  const advisories = [];
  const lines = (stashLines || []).filter(Boolean);
  if (lines.length > MAX_STASHES) {
    advisories.push(`stash-count ${lines.length} exceeds budget ${MAX_STASHES} — commit-before-context-switch`);
  }
  for (const line of lines) {
    const stamp = Number((line.match(/\b(\d{9,})\b/) || [])[1]);
    if (stamp && nowSec - stamp > STASH_AGE_BUDGET_DAYS * SECONDS_PER_DAY) {
      advisories.push(`stale stash (>${STASH_AGE_BUDGET_DAYS}d): ${line.slice(0, 60)}`);
    }
  }
  return advisories;
}

// worktreeListDirs: dirs from `git worktree list`; homeDirs: ${HOME}/devenv-ops-* entries.
function scanAbandonedWorktrees(worktreeListDirs, homeDirs) {
  const known = new Set((worktreeListDirs || []).map((dir) => path.resolve(dir)));
  return (homeDirs || [])
    .map((dir) => path.resolve(dir))
    .filter((dir) => !known.has(dir))
    .map((dir) => `abandoned worktree dir not in 'git worktree list': ${dir}`);
}

function emitAdvisories(advisories, opts = {}) {
  for (const detail of advisories) {
    emitV3({
      ts: opts.ts || new Date().toISOString(), version: 3, service: 'worktree-hygiene',
      env: process.env.CI ? 'ci' : 'local', event: 'hygiene-advisory', detail,
    }, opts.file || AUDIT_FILE);
  }
  return advisories;
}

module.exports = {
  auditStashes, scanAbandonedWorktrees, emitAdvisories,
  MAX_STASHES, STASH_AGE_BUDGET_DAYS, AUDIT_FILE,
};
