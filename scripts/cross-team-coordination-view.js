#!/usr/bin/env node
'use strict';

const fs = require('fs');
const leaseRegistry = require('./cross-team-lease-registry');
const cleanup = require('./worktree-cleanup-plan');
const HOUR_MS = 60 * 60 * 1000;

function hoursBetween(start, end) {
  return Math.max(0, Math.round((new Date(end) - new Date(start)) / HOUR_MS));
}

const github = (repo, kind, value) => value ? `https://github.com/${repo}/${kind}/${value}` : null;
const issueLink = (ticket, repo = 'chf3198/megingjord-harness') => github(repo, 'issues', ticket);
const prLink = (pr, repo = 'chf3198/megingjord-harness') => github(repo, 'pull', pr);
const branchLink = (branch, repo = 'chf3198/megingjord-harness') =>
  github(repo, 'tree', branch && encodeURIComponent(branch));

function conflictKey(lease) {
  return [lease.paths || [], lease.ports || []].flat().join('|');
}

function conflictTickets(lease, leases) {
  return leases.filter(other => other.ticket !== lease.ticket &&
    conflictKey(other) && conflictKey(lease) && conflictKey(other) === conflictKey(lease))
    .map(other => other.ticket);
}

function leaseRows(registry, at, repo) {
  const active = leaseRegistry.active(registry, at);
  return active.map(lease => ({
    team: lease.team, ticket: lease.ticket, branch: lease.branch,
    paths: lease.paths || [], ports: lease.ports || [],
    age_hours: hoursBetween(lease.created_at, at),
    expires_hours: hoursBetween(at, lease.expires_at),
    conflicts: conflictTickets(lease, active),
    links: { issue: issueLink(lease.ticket, repo), branch: branchLink(lease.branch, repo),
      worktree: lease.worktree || null },
  }));
}

function cleanupRows(plan, repo) {
  return plan.worktrees.filter(w => w.cleanupState !== 'active-lease')
    .filter(w => ['merged-clean', 'prune-metadata', 'preserve-dirty', 'stale-open-pr'].includes(w.cleanupState))
    .map(w => ({
      state: w.cleanupState, ticket: w.ticket, branch: w.branch || null,
      path: w.path, commands: w.commands || [],
      links: { issue: issueLink(w.ticket, repo), branch: branchLink(w.branch, repo),
        pr: prLink(w.openPr, repo), worktree: w.path },
    }));
}

function summarize(input = {}) {
  const at = input.at || new Date().toISOString();
  const repo = input.repo || 'chf3198/megingjord-harness';
  const registry = input.registry || leaseRegistry.read(input.leaseFile);
  const plan = input.plan || cleanup.plan({
    inventory: input.inventory, registry, leaseFile: input.leaseFile,
  });
  const active = leaseRows(registry, at, repo);
  return {
    generatedAt: at,
    mode: 'read-only',
    active,
    byTeam: active.reduce((out, row) => {
      out[row.team] = [...(out[row.team] || []), row];
      return out;
    }, {}),
    stale: active.filter(row => row.expires_hours <= 2),
    conflicts: active.filter(row => row.conflicts.length > 0),
    cleanup: cleanupRows(plan, repo),
  };
}

function text(report) {
  const lines = [`active leases: ${report.active.length}`,
    `conflicts: ${report.conflicts.length}`, `cleanup candidates: ${report.cleanup.length}`];
  for (const row of report.active) {
    lines.push(`${row.team.padEnd(10)} #${row.ticket} ${row.branch} age=${row.age_hours}h`);
  }
  for (const row of report.cleanup) lines.push(`cleanup ${row.state} ${row.branch || row.path}`);
  return `${lines.join('\n')}\n`;
}

function run(argv = process.argv.slice(2)) {
  const outIndex = argv.indexOf('--out');
  const report = summarize();
  if (outIndex >= 0) fs.writeFileSync(argv[outIndex + 1], `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(argv.includes('--json') ? `${JSON.stringify(report, null, 2)}\n` : text(report));
  return report;
}

if (require.main === module) run();

module.exports = { branchLink, cleanupRows, conflictTickets, summarize, text };
