// GitHub Sync — reconcile baton/ticket state with GitHub API
// Called during refreshAll() to fix state/label/assignment drift
/* global getTicketLog */

(function() {

function ghStatusFromLabels(labels) {
  const map = {
    'status:in-progress': 'in-progress', 'status:todo': 'todo',
    'status:done': 'done', 'status:backlog': 'backlog',
    'status:blocked': 'blocked', 'status:in-review': 'review',
    'status:review': 'review', 'status:cancelled': 'cancelled',
    'status:ready': 'ready-for-testing',
  };
  for (const l of (labels || [])) { if (map[l]) return map[l]; }
  return null;
}

function ghRoleFromLabels(labels) {
  const map = {
    'role:manager': 'manager', 'role:collaborator': 'collaborator',
    'role:admin': 'admin', 'role:consultant': 'consultant',
  };
  for (const l of (labels || [])) { if (map[l]) return map[l]; }
  return null;
}

/**
 * Sync ticket log and baton state with authoritative GitHub data.
 * @param {Array} ghIssues - issues from /api/github/summary .issues.all
 * @returns {Array} updated ticket log entries
 */
function syncWithGitHub(ghIssues) {
  if (!ghIssues || !ghIssues.length) return [];
  const log = typeof getTicketLog === 'function' ? getTicketLog() : [];
  const logMap = {};
  log.forEach(t => { logMap[String(t.issue)] = t; });
  const synced = [];

  for (const gh of ghIssues) {
    const key = String(gh.number);
    const existing = logMap[key] || {};
    const ghStatus = gh.state === 'closed' ? 'done'
      : ghStatusFromLabels(gh.labels);
    const ghRole = ghRoleFromLabels(gh.labels);
    const fallbackStatus = gh.state === 'open' ? 'backlog' : 'backlog';
    synced.push({
      issue: gh.number,
      title: gh.title || existing.title || '',
      status: ghStatus || existing.status || fallbackStatus,
      activeRole: ghRole || existing.activeRole || null,
      agent: existing.agent || gh.assignee || '',
      model: existing.model || '',
      epic: gh.epic || existing.epic || null,
      labels: gh.labels || [],
      lastComment: gh.lastComment || existing.lastComment || null,
      _updated: Date.now(),
    });
  }
  return synced.sort((a, b) => (b.issue || 0) - (a.issue || 0));
}

function inferRole(status) {
  const map = {
    'backlog': null, 'todo': 'manager', 'in-progress': 'collaborator',
    'ready-for-testing': 'admin', 'review': 'consultant', 'blocked': null,
  };
  return map[status] || null;
}

if (typeof module !== 'undefined') module.exports = { syncWithGitHub, inferRole };
else Object.assign(window, { syncWithGitHub, inferRole });
})();
