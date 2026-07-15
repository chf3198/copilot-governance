#!/usr/bin/env node
'use strict';
// worktree-lifecycle-events.js — Emit lifecycle events for worktrees needing attention.
// Observability only; no cleanup execution. Deploy to ~/.copilot/scripts/
// Usage: node worktree-lifecycle-events.js [--json] [--dry-run]

const { inventory } = require('./worktree-inventory');
const { emit } = require('./emit-event');

const ACTIONS = {
  'stale-safe': 'remove-worktree-and-branch',
  'stale-risky': 'rescue-branch-or-push-upstream',
  'stale-warning': 'rebase-or-review',
  'rescue-needed': 'create-draft-pr-or-rescue-branch',
  'abandoned': 'remove-after-review',
};

// States that warrant an event emission
const REPORT_STATES = new Set(Object.keys(ACTIONS));

// Privacy-safe path redaction: remove home directory prefix
function redactPath(p) {
  const home = process.env.HOME || '';
  return home && p.startsWith(home) ? p.replace(home, '~') : p;
}

// Build a privacy-safe event payload for one worktree entry
function buildEvent(entry) {
  const lifecycleState = entry.lifecycleState || 'unknown';
  const proposedAction = ACTIONS[lifecycleState] || 'review';
  const detail = JSON.stringify({
    lifecycleState,
    proposedAction,
    branch: entry.branch || null,
    path: redactPath(entry.path || ''),
    ahead: entry.ahead ?? null,
    behind: entry.behind ?? null,
    dirty: entry.dirty ?? false,
    mergedToMain: entry.mergedToMain ?? false,
    lastActivity: entry.lastActivity || null,
  });
  return {
    type: `worktree:${lifecycleState}`,
    issue: entry.ticket || null,
    title: entry.branch || null,
    detail,
  };
}

function emitLifecycleEvents(opts = {}) {
  const inv = opts.inventory || inventory();
  const results = [];
  for (const entry of inv.worktrees) {
    if (!REPORT_STATES.has(entry.lifecycleState)) continue;
    const payload = buildEvent(entry);
    if (!opts.dryRun) emit(payload);
    results.push(payload);
  }
  return results;
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  const json = process.argv.includes('--json');
  const results = emitLifecycleEvents({ dryRun });
  if (json) process.stdout.write(JSON.stringify(results, null, 2) + '\n');
  else results.forEach(e => console.log(`${e.type} issue=${e.issue || '-'} ${e.title}`));
}

module.exports = { buildEvent, emitLifecycleEvents, redactPath, ACTIONS, REPORT_STATES };
