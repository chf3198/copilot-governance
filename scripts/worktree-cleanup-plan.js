#!/usr/bin/env node
'use strict';

const fs = require('fs');
const leaseRegistry = require('./cross-team-lease-registry');
const worktreeInventory = require('./worktree-inventory');

function ticketFrom(branch = '') {
  const hit = branch.match(/(?:feat|fix|chore|docs|refactor|hotfix)\/(\d+)-/);
  return hit ? Number(hit[1]) : null;
}

function leaseFor(entry, leases) {
  const ticket = ticketFrom(entry.branch);
  return leases.find(lease => lease.branch === entry.branch || lease.ticket === ticket) || null;
}

// Five-state taxonomy per #2249 research. Squash-merge detection shipped in #2552; openPr guard #2691/#3356.
function classify(entry, lease) {
  if (lease) return 'preserve';
  if (entry.locked) return 'preserve';
  if ((entry.branch || '').startsWith('sandbox/')) return 'preserve';
  if (entry.branch && entry.branch !== 'main' && !ticketFrom(entry.branch)) return 'needs-review';
  if (entry.dirtyCount > 0 || entry.untrackedCount > 0) return 'quarantine';
  if (!entry.branch) return 'quarantine'; // detached HEAD: no branch to delete
  // merged-with-open-pr is not safe to remove (open-PR guard).
  if (entry.openPr) return 'quarantine';
  if (entry.mergedToMain) return 'remove'; // check before aheadOfMain: squash-merged branches have mainAhead > 0
  const aheadOfMain = entry.mainAhead ?? entry.ahead ?? 0;
  if (aheadOfMain > 0) return 'quarantine';
  if (entry.prunable) return 'prune-metadata';
  return 'needs-review';
}

function reason(entry, state, lease) {
  if (state === 'preserve' && lease) return `active-lease: ticket #${lease.ticket}`;
  if (state === 'preserve' && entry.locked) return 'locked';
  if (state === 'preserve') return 'sandbox/launcher branch';
  if (state === 'quarantine' && (entry.dirtyCount > 0 || entry.untrackedCount > 0))
    return `dirty: ${entry.dirtyCount || 0} modified, ${entry.untrackedCount || 0} untracked`;
  if (state === 'quarantine')
    return `unpushed: ${entry.mainAhead ?? entry.ahead ?? 0} commits ahead of main`;
  if (state === 'remove') return entry.squashMerged
    ? 'merged: squash-detected via gh pr list'
    : 'merged: confirmed ancestor of origin/main';
  if (state === 'prune-metadata') return 'prunable-metadata: no working tree';
  if (!ticketFrom(entry.branch)) return 'missing-ticket: no ticket number in branch name';
  return 'unverified-merge-status: may be squash-merged (pending #2552)';
}

function commands(entry, state) {
  if (state === 'remove') return [`git worktree remove ${entry.path}`, `git branch -d ${entry.branch}`];
  if (state === 'prune-metadata') return ['git worktree prune'];
  if (state === 'quarantine') return [
    `git switch -c rescue/${ticketFrom(entry.branch) || 'unknown'}-preserve`,
    'gh pr create --draft --fill',
  ];
  return [];
}

function plan(input = {}) {
  const inventory = input.inventory || worktreeInventory.inventory(undefined, { runGh: worktreeInventory.gh });
  const registry = input.registry || leaseRegistry.read(input.leaseFile || leaseRegistry.DEFAULT_PATH);
  const leases = leaseRegistry.active(registry);
  const worktrees = inventory.worktrees.map(entry => {
    const lease = leaseFor(entry, leases);
    const state = classify(entry, lease);
    return { ...entry, ticket: ticketFrom(entry.branch), lease: lease?.ticket || null,
      cleanupState: state, reason: reason(entry, state, lease), commands: commands(entry, state) };
  });
  return { generatedAt: new Date().toISOString(), mode: 'plan-only', worktrees };
}

function workspace(report) {
  return {
    folders: report.worktrees.filter(w => w.cleanupState === 'preserve' && w.lease)
      .map(w => ({ name: w.branch || w.path, path: w.path })),
    settings: { 'git.autoRepositoryDetection': 'subFolders' },
  };
}

function run(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const dryRun = argv.includes('--dry-run');
  const workspaceIndex = argv.indexOf('--workspace');
  const workspacePath = workspaceIndex >= 0 ? argv[workspaceIndex + 1] : null;
  const report = plan();
  if (workspacePath) fs.writeFileSync(workspacePath, `${JSON.stringify(workspace(report), null, 2)}\n`);
  if (json || workspacePath || dryRun) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else for (const worktree of report.worktrees) {
    console.log(`${worktree.cleanupState.padEnd(15)} ${worktree.branch || 'DETACHED'} ${worktree.path}`);
  }
  return report;
}

if (require.main === module) run();

module.exports = { classify, commands, plan, ticketFrom, workspace };
