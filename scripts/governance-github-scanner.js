#!/usr/bin/env node
'use strict';

const GH_API_VERSION = '2022-11-28';

const VALID_ACTIVE_STATUS_ROLE = {
  'status:in-progress': 'role:collaborator',
  'status:testing': 'role:admin',
  'status:review': 'role:consultant',
};

async function fetchAllIssues(token, owner, repo) {
  const issues = [];
  let page = 1;
  while (true) {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=100&page=${page}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': GH_API_VERSION } }
    );
    if (!res.ok) throw new Error(`GitHub API ${res.status}`);
    const batch = await res.json();
    if (!batch.length) break;
    issues.push(...batch.filter(i => !i.pull_request));
    if (batch.length < 100) break;
    page++;
  }
  return issues;
}

function checkIssue(issue) {
  const labels = issue.labels.map(l => l.name);
  const statusLabels = labels.filter(l => l.startsWith('status:'));
  const roleLabels = labels.filter(l => l.startsWith('role:'));
  const violations = [];

  if (issue.state === 'closed' && roleLabels.length > 0) {
    violations.push({ rule: 'closed+role', driftClass: 'terminal', detail: `role labels on closed: ${roleLabels.join(', ')}` });
  }
  if (statusLabels.includes('status:done') && roleLabels.length > 0) {
    violations.push({ rule: 'done+role', driftClass: 'terminal', detail: `status:done retains role: ${roleLabels.join(', ')}` });
  }
  for (const [status, required] of Object.entries(VALID_ACTIVE_STATUS_ROLE)) {
    if (statusLabels.includes(status) && !roleLabels.includes(required)) {
      violations.push({ rule: `missing-${required}`, driftClass: 'open', detail: `${status} missing ${required}` });
    }
  }
  if (labels.includes('type:epic') && statusLabels.includes('status:ready')) {
    violations.push({ rule: 'epic+ready', driftClass: 'epic', detail: 'epic at status:ready (child-ticket status only)' });
  }
  if (statusLabels.length > 1) {
    violations.push({ rule: 'multi-status', driftClass: 'open', detail: `multiple status labels: ${statusLabels.join(', ')}` });
  }
  return violations;
}

async function scanGitHubLabels(token, owner, repo) {
  const issues = await fetchAllIssues(token, owner, repo);
  const violations = [];
  const counts = { open: 0, terminal: 0, epic: 0 };
  for (const issue of issues) {
    for (const violation of checkIssue(issue)) {
      violations.push({ issueNum: issue.number, title: issue.title, ...violation });
      counts[violation.driftClass]++;
    }
  }
  return { violations, counts };
}

module.exports = { scanGitHubLabels };
