'use strict';

// accountable-team-backfill — deterministic, idempotent migration that assigns an
// accountable-team:* label to closed/backlog tickets that lack one, derived from
// the ticket's most recent baton signing block (Epic #2345 AC4; synthesis #2346).
//
// Safe by construction:
//   - dry-run is the DEFAULT; --apply is required before any label is written.
//   - idempotent: a ticket that already carries an accountable-team:* label is skipped.
//   - the derive step is pure (deriveBackfill) and unit-tested; only the apply
//     step shells out to gh.
//   - rollback: the feature is purely additive, so reverting is removing the
//     accountable-team:* labels this run added (printed in the plan).

const { execFileSync } = require('node:child_process');
const {
  ACCOUNTABLE_TEAM_LABEL_PREFIX,
  teamFromLabel,
  resolveAccountableTeam,
} = require('./accountable-team');

const DEFAULT_REPO = 'chf3198/megingjord-harness';

// Pure. Given issues ({ number, labels: [name], comments: [{ body }] }), return
// the planned label additions for those lacking any accountable-team:* label.
function deriveBackfill(issues) {
  const plan = [];
  for (const issue of Array.isArray(issues) ? issues : []) {
    const labels = (issue.labels || []).map((label) => (typeof label === 'string' ? label : label.name));
    const alreadyTagged = labels.some((label) => teamFromLabel(label) !== null);
    if (alreadyTagged) continue;
    const resolved = resolveAccountableTeam(labels, issue.comments || []);
    plan.push({
      number: issue.number,
      addLabel: `${ACCOUNTABLE_TEAM_LABEL_PREFIX}${resolved.team}`,
      source: resolved.source,
    });
  }
  return plan;
}

function fetchIssueList(repo, limit) {
  const raw = execFileSync('gh', [
    'issue', 'list', '--repo', repo, '--state', 'all',
    '--limit', String(limit), '--json', 'number,labels',
  ], { encoding: 'utf8' });
  return JSON.parse(raw).map((issue) => ({
    number: issue.number,
    labels: (issue.labels || []).map((label) => label.name),
    comments: [],
  }));
}

function fetchComments(repo, number) {
  const raw = execFileSync('gh', [
    'issue', 'view', String(number), '--repo', repo, '--json', 'comments',
  ], { encoding: 'utf8' });
  return (JSON.parse(raw).comments || []).map((comment) => ({ body: comment.body }));
}

function applyPlan(repo, plan) {
  for (const item of plan) {
    execFileSync('gh', [
      'issue', 'edit', String(item.number), '--repo', repo, '--add-label', item.addLabel,
    ]);
  }
}

function main(argv) {
  const apply = argv.includes('--apply');
  const repoArg = argv.find((arg) => arg.startsWith('--repo='));
  const limitArg = argv.find((arg) => arg.startsWith('--limit='));
  const repo = repoArg ? repoArg.split('=')[1] : DEFAULT_REPO;
  const limit = limitArg ? Number(limitArg.split('=')[1]) : 500;

  const issues = fetchIssueList(repo, limit);
  // Only enrich the untagged tickets with comments (cost control); tagged ones
  // are skipped by deriveBackfill regardless.
  const enriched = issues.map((issue) => {
    const tagged = issue.labels.some((label) => teamFromLabel(label) !== null);
    return tagged ? issue : { ...issue, comments: fetchComments(repo, issue.number) };
  });
  const plan = deriveBackfill(enriched);

  if (!apply) {
    console.log(`[accountable-team-backfill] DRY-RUN: ${plan.length} ticket(s) would be labeled.`);
    for (const item of plan) console.log(`  #${item.number} -> ${item.addLabel} (${item.source})`);
    console.log('Re-run with --apply to write the labels.');
    return plan;
  }
  applyPlan(repo, plan);
  console.log(`[accountable-team-backfill] APPLIED ${plan.length} label(s).`);
  return plan;
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = { deriveBackfill, fetchIssueList, fetchComments, applyPlan, main };
