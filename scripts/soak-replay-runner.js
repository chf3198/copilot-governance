'use strict';
// soak-replay-runner (#1771) — Epic #1771 Phase 3.
// Replay closed PRs through the rotation v2 helper and produce compliance metrics.
// Replaces calendar-bound 14-day soak with hours-bound replay validation.

const { execFileSync } = require('node:child_process');
const v2 = require('./baton-team-model-v2.js');

function listClosedPRs(limit = 50) {
  const output = execFileSync('gh', ['pr', 'list', '--state', 'closed', '--limit', String(limit),
    '--json', 'number,title,body,closedAt,mergedAt'], { encoding: 'utf8' });
  return JSON.parse(output);
}

function extractRefsTicket(prBody) {
  const match = (prBody || '').match(/Refs\s+#(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
}

function fetchIssueComments(issueNumber) {
  try {
    const output = execFileSync('gh', ['issue', 'view', String(issueNumber),
      '--json', 'comments'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return JSON.parse(output).comments || [];
  } catch { return []; }
}

function replayPR(pr) {
  const linkedIssue = extractRefsTicket(pr.body);
  if (!linkedIssue) return { pr: pr.number, skipped: 'no-refs' };
  const comments = fetchIssueComments(linkedIssue);
  if (comments.length === 0) return { pr: pr.number, skipped: 'no-comments' };
  const records = v2.extractRecordsFromComments(comments);
  const result = v2.enforceRotationV2({ roles_observed: records, operator_mode: 'advisory-only' });
  return { pr: pr.number, linkedIssue, records, ok: result.ok, violations: result.violations || [] };
}

function aggregateReplay(results) {
  const total = results.length;
  const skipped = results.filter(r => r.skipped).length;
  const evaluated = results.filter(r => !r.skipped);
  const passes = evaluated.filter(r => r.ok).length;
  const violations = evaluated.filter(r => !r.ok);
  const ruleViolations = {};
  for (const v of violations) {
    for (const vio of (v.violations || [])) {
      ruleViolations[vio.rule] = (ruleViolations[vio.rule] || 0) + 1;
    }
  }
  return {
    total, skipped, evaluated: evaluated.length, passes, violations: violations.length,
    compliance_rate: evaluated.length > 0 ? (passes / evaluated.length).toFixed(3) : 'N/A',
    rule_violations: ruleViolations,
    sample_violations: violations.slice(0, 5).map(v => ({ pr: v.pr, rules: v.violations.map(x => x.rule) })),
  };
}

function runReplay(limit = 50) {
  const prs = listClosedPRs(limit);
  const results = prs.map(replayPR);
  return { meta: { run_at: new Date().toISOString(), pr_limit: limit }, summary: aggregateReplay(results), per_pr: results };
}

if (require.main === module) {
  const limit = parseInt(process.argv[2], 10) || 50;
  const out = runReplay(limit);
  process.stdout.write(JSON.stringify(out, null, 2));
}

module.exports = { listClosedPRs, extractRefsTicket, fetchIssueComments, replayPR, aggregateReplay, runReplay };
