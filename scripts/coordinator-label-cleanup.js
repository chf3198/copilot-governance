#!/usr/bin/env node
'use strict';
// coordinator-label-cleanup (#1830) — orphan-label scanner for
// `coordinator:cross-team-needs-hand-off`. Pure module + CLI.
// Mirrors the cross-team-edit-warn.yml + cross-team-pr-parallel-check.yml
// detection logic so resolution paths match the application paths.

const { execFileSync } = require('node:child_process');

const COORDINATOR_LABEL = 'coordinator:cross-team-needs-hand-off';
const ERROR_MSG_PREVIEW_MAX = 200;
const ROLE_LABELS = new Set(['role:collaborator', 'role:admin', 'role:consultant']);
const EPIC_BODY_RE = /-\s*Epic:\s*#(\d+)/i;

function teamOf(issue) {
  const teamLabel = (issue.labels || []).find(l => (l.name || l).startsWith?.('team:'));
  if (teamLabel) return teamLabel.name || teamLabel;
  return `user:${issue.user?.login || issue.author?.login || 'unknown'}`;
}

function rolesOn(issue) {
  return (issue.labels || []).map(l => l.name || l).filter(n => ROLE_LABELS.has(n));
}

// Pure: given a candidate issue + the full open-issue corpus, determine if
// it's an orphan (carries coordinator label but has NO active sibling-role
// conflict + NO active parallel-PR). Used for both event-driven cleanup
// in workflows and Manager-runnable batch cleanup.
function evaluateOrphan(candidate, allOpenIssues, allOpenPRs) {
  const labelNames = (candidate.labels || []).map(l => l.name || l);
  if (!labelNames.includes(COORDINATOR_LABEL)) return { orphan: false, reason: 'no-coordinator-label' };
  const myRoles = rolesOn(candidate);
  const epicMatch = (candidate.body || '').match(EPIC_BODY_RE);
  if (epicMatch && myRoles.length > 0) {
    const epic = epicMatch[1];
    const myTeam = teamOf(candidate);
    const conflict = allOpenIssues.some(s => s.number !== candidate.number
      && (s.body || '').includes(`Epic: #${epic}`)
      && rolesOn(s).some(r => myRoles.includes(r))
      && teamOf(s) !== myTeam);
    if (conflict) return { orphan: false, reason: 'active-sibling-role-conflict' };
  }
  const parallelPR = (allOpenPRs || []).some(pr => (pr.body || '').includes(`#${candidate.number}`));
  if (parallelPR) return { orphan: false, reason: 'active-parallel-pr-reference' };
  return { orphan: true, reason: 'no-active-conflict-or-parallel-pr' };
}

function findOrphans(allOpenIssues, allOpenPRs) {
  return allOpenIssues
    .filter(i => (i.labels || []).map(l => l.name || l).includes(COORDINATOR_LABEL))
    .map(i => ({ issue: i, eval: evaluateOrphan(i, allOpenIssues, allOpenPRs) }))
    .filter(r => r.eval.orphan);
}

function ghJson(args) {
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }));
}

function removeLabel(issueNumber) {
  try {
    execFileSync('gh', ['issue', 'edit', String(issueNumber), '--remove-label', COORDINATOR_LABEL], { encoding: 'utf8' });
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message.slice(0, ERROR_MSG_PREVIEW_MAX) }; }
}

function runCli({ dryRun = false } = {}) {
  // gh issue list does not support --json body; use gh api for full body + labels.
  const ALL_ISSUES_API = `/repos/{owner}/{repo}/issues?state=open&per_page=100`;
  const issues = ghJson(['api', '--paginate', ALL_ISSUES_API]).filter(i => !i.pull_request)
    .map(i => ({ number: i.number, title: i.title, body: i.body, labels: i.labels, user: i.user }));
  const prs = ghJson(['pr', 'list', '--state', 'open', '--limit', '100', '--json', 'number,body']);
  const orphans = findOrphans(issues, prs);
  const carriers = issues.filter(i => (i.labels||[]).map(l => l.name || l).includes(COORDINATOR_LABEL));
  const result = { found: orphans.length, removed: 0, kept: carriers.length - orphans.length, dryRun, actions: [] };
  for (const orphan of orphans) {
    if (dryRun) { result.actions.push({ issue: orphan.issue.number, action: 'would-remove', reason: orphan.eval.reason }); continue; }
    const removeResult = removeLabel(orphan.issue.number);
    result.actions.push({ issue: orphan.issue.number, action: removeResult.ok ? 'removed' : 'failed', reason: orphan.eval.reason, error: removeResult.error });
    if (removeResult.ok) result.removed++;
  }
  return result;
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  try { console.log(JSON.stringify(runCli({ dryRun }), null, 2)); }
  catch (e) { console.error(e.message); process.exit(1); }
}

module.exports = { evaluateOrphan, findOrphans, runCli, COORDINATOR_LABEL, ROLE_LABELS };
