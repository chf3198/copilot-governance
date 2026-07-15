#!/usr/bin/env node
'use strict';
// tier: 1
// chain-derivations (Epic #2709 / #2722): the canonical, single-source derivations
// that convert formerly operator-discretionary governance links into auto-emitted
// ones. The harness repeatedly hand-set `active_ticket` and `admin_ops` state and
// hand-cleared stale advisories; these pure functions derive them from observable
// facts (branch name, git/PR state, issue labels) so no operator memory is required.
// Pure logic (unit-testable); callers inject the live git/gh facts.

const BRANCH_RE = /^(?:feat|fix|hotfix|chore|skill)\/(\d+)(?:-|$)/;
const STALE_CLOSE_WITHOUT_MERGE = 'governance:close-without-merge';

// active_ticket from a ticket branch name; null when the branch is not ticket-shaped.
function activeTicketFromBranch(branch) {
  const match = BRANCH_RE.exec(String(branch || '').trim());
  return match ? Number(match[1]) : null;
}

// admin_ops flags derived from observable git/PR facts (not local cache).
function adminOpsFromFacts(facts = {}) {
  const merged = Boolean(facts.prMerged);
  return {
    commit: Boolean(facts.hasCommit),
    push: Boolean(facts.branchPushed),
    pr_create: Boolean(facts.prNumber),
    ci_green: facts.requiredChecksAllGreen === true,
    merge: merged,
  };
}

// Stale advisory labels that should be auto-cleared given the issue's true state.
// e.g. a closed+merged issue must not carry `governance:close-without-merge`.
function staleAdvisoriesToClear(issue = {}) {
  const labels = issue.labels || [];
  const clear = [];
  if (issue.state === 'closed' && issue.merged && labels.includes(STALE_CLOSE_WITHOUT_MERGE)) {
    clear.push(STALE_CLOSE_WITHOUT_MERGE);
  }
  return clear;
}

module.exports = { activeTicketFromBranch, adminOpsFromFacts, staleAdvisoriesToClear,
  BRANCH_RE, STALE_CLOSE_WITHOUT_MERGE };

if (require.main === module) {
  const branch = process.argv[2] || '';
  console.log(JSON.stringify({ active_ticket: activeTicketFromBranch(branch) }));
}
