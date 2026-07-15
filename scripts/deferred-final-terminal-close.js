'use strict';

const CLOSEOUT_HEADER_RE = /(^|\n)\s*(?:\*\*|##\s+)?CONSULTANT_CLOSEOUT(?:_EPIC_CLOSEOUT)?\b/;
const DEFERRED_TOKEN = 'merge-evidence-deferred-final:';
const MARKER = '<!-- deferred-final-terminal-close -->';

function hasCloseoutHeader(text) {
  return CLOSEOUT_HEADER_RE.test(String(text || ''));
}

function buildSearchQuery(owner, repo, issueNumber) {
  return `repo:${owner}/${repo} is:pr is:merged in:body "${DEFERRED_TOKEN} #${issueNumber}"`;
}

function pickMergedPr(items) {
  const pr = (items || []).find((it) => it && it.pull_request);
  if (!pr) return null;
  return { number: pr.number, url: pr.html_url };
}

function buildRemediationComment({ issueNumber, prNumber, prUrl }) {
  return `${MARKER}\n`
    + 'event:goal-failure-escalation\n'
    + 'pattern: merged-deferred-final-open-after-closeout\n\n'
    + `Auto-remediation applied for issue #${issueNumber}: merged deferred-final evidence `
    + `detected from PR #${prNumber} (${prUrl}) after CONSULTANT_CLOSEOUT. `
    + 'Issue was closed to enforce terminal-finalize discipline.';
}

async function reconcile({ github, owner, repo, issueNumber, commentBody }) {
  if (!hasCloseoutHeader(commentBody)) return { action: 'skip-non-closeout' };
  const issue = await github.issues.get({ owner, repo, issue_number: issueNumber });
  if (issue.data.state === 'closed') return { action: 'already-closed' };

  const query = buildSearchQuery(owner, repo, issueNumber);
  const search = await github.search.issuesAndPullRequests({ q: query, per_page: 5 });
  const pr = pickMergedPr(search.data.items || []);
  if (!pr) return { action: 'no-merged-deferred-final' };

  await github.issues.update({
    owner,
    repo,
    issue_number: issueNumber,
    state: 'closed',
    state_reason: 'completed',
  });
  await github.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body: buildRemediationComment({ issueNumber, prNumber: pr.number, prUrl: pr.url }),
  });
  return { action: 'closed-after-closeout', prNumber: pr.number, prUrl: pr.url };
}

module.exports = {
  hasCloseoutHeader,
  buildSearchQuery,
  pickMergedPr,
  buildRemediationComment,
  reconcile,
  CLOSEOUT_HEADER_RE,
  DEFERRED_TOKEN,
  MARKER,
};
