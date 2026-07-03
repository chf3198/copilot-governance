#!/usr/bin/env node
'use strict';
require('./load-local-env').loadLocalEnvOnce(); // hydrate .env before any credential read (canonical shim)

const childState = require('./epic-child-state');

const GH_API_VERSION = '2022-11-28';

const GH_HEADERS = token => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': GH_API_VERSION,
});

async function get(url, token) {
  const res = await fetch(url, { headers: GH_HEADERS(token) });
  if (!res.ok) throw new Error(`GitHub API ${res.status} on ${url}`);
  return res.json();
}

async function getOpenEpics(token, owner, repo) {
  const epics = [];
  let page = 1;
  while (true) {
    const batch = await get(
      `https://api.github.com/repos/${owner}/${repo}/issues?labels=type:epic&state=open&per_page=100&page=${page}`,
      token
    );
    if (!batch.length) break;
    epics.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return epics;
}

async function getOpenChildNumbers(token, owner, repo, epicNum) {
  const timeline = await get(
    `https://api.github.com/repos/${owner}/${repo}/issues/${epicNum}/timeline?per_page=100`,
    token
  );
  const childNums = [...new Set(
    timeline
      .filter(e => e.event === 'cross-referenced' && e.source?.issue?.number)
      .map(e => e.source.issue.number)
  )];
  const openChildren = await Promise.all(
    childNums.map(n =>
      get(`https://api.github.com/repos/${owner}/${repo}/issues/${n}`, token)
        .then(i => (i.state === 'open' ? n : null))
        .catch(() => null)
    )
  );
  return openChildren.filter(Boolean);
}

async function getCloseoutBody(token, owner, repo, issueNum) {
  const comments = await get(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNum}/comments?per_page=100`,
    token
  );
  const match = comments.filter(c => /CONSULTANT(_EPIC)?_CLOSEOUT/i.test(c.body || '')).pop();
  return match ? match.body : '';
}

async function validateEpics(token, owner, repo) {
  const epics = await getOpenEpics(token, owner, repo);
  const results = [];
  for (const epic of epics) {
    const statusLabels = epic.labels.map(l => l.name).filter(l => l.startsWith('status:'));
    const blockers = [];
    if (!statusLabels.includes('status:review')) {
      blockers.push(`not at status:review (current: ${statusLabels.join(', ') || 'none'})`);
    }
    const openChildNumbers = await getOpenChildNumbers(token, owner, repo, epic.number);
    if (openChildNumbers.length > 0) blockers.push(`${openChildNumbers.length} open child issue(s) remain`);
    const closeoutBody = await getCloseoutBody(token, owner, repo, epic.number);
    if (!closeoutBody) {
      blockers.push('missing CONSULTANT_CLOSEOUT comment');
    } else {
      // AC2: reconcile the closeout's children-terminal assertion vs live state.
      const reconciliation = childState.reconcileCloseoutAssertion({ closeoutBody, openChildNumbers });
      if (reconciliation.mismatch) {
        const falsely = reconciliation.falselyAssertedClosed.length
          ? ` (falsely asserted terminal: ${reconciliation.falselyAssertedClosed.map(n => `#${n}`).join(', ')})`
          : '';
        blockers.push(`closeout asserts children terminal but ${openChildNumbers.length} remain open${falsely}`);
      }
    }
    results.push({ epicNum: epic.number, title: epic.title, ready: blockers.length === 0, blockers });
  }
  return results;
}

module.exports = { validateEpics, getOpenChildNumbers, getCloseoutBody };

if (require.main === module) {
  const token = process.env.GITHUB_TOKEN;
  const [owner, repo] = (process.env.GITHUB_REPOSITORY || 'chf3198/megingjord-harness').split('/');
  validateEpics(token, owner, repo)
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(e => { console.error(e.message); process.exit(1); });
}
