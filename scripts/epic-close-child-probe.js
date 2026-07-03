#!/usr/bin/env node
'use strict';
// Local pre-close probe for the Epic parent-close guard (#3350 AC3). Given an
// epic number, reports {isEpic, openChildren} using the SAME parent-assertion
// union as the CI backstop (single-sourced via epic-child-state) so the local
// guard and the Action never disagree. Fail-open: any error prints
// {isEpic:false} so the consuming hook never blocks on an API hiccup (G6).
require('./load-local-env').loadLocalEnvOnce();
const childState = require('./epic-child-state');

const GH_API_VERSION = '2022-11-28';
const headers = token => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': GH_API_VERSION,
});

async function get(url, token) {
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) throw new Error(`GitHub API ${res.status} on ${url}`);
  return res.json();
}

async function probe(token, owner, repo, epicNum) {
  const epic = await get(`https://api.github.com/repos/${owner}/${repo}/issues/${epicNum}`, token);
  const isEpic = (epic.labels || []).some(l => (l.name || l) === 'type:epic');
  if (!isEpic) return { isEpic: false, openChildren: [] };
  const timeline = await get(
    `https://api.github.com/repos/${owner}/${repo}/issues/${epicNum}/timeline?per_page=100`, token);
  const childNums = [...new Set(timeline
    .filter(e => e.event === 'cross-referenced' && e.source?.issue?.number)
    .map(e => e.source.issue.number))];
  const children = await Promise.all(childNums.map(n =>
    get(`https://api.github.com/repos/${owner}/${repo}/issues/${n}`, token)
      .then(i => ({ number: n, state: i.state, body: i.body || '' }))
      .catch(() => null)));
  const open = children.filter(Boolean)
    .filter(c => c.state === 'open' && childState.assertsParent(c.body, epicNum))
    .map(c => c.number);
  return { isEpic: true, openChildren: open };
}

if (require.main === module) {
  const epicNum = Number(process.argv[2]);
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const [owner, repo] = (process.env.GITHUB_REPOSITORY || 'chf3198/megingjord-harness').split('/');
  if (!epicNum || !token) { console.log(JSON.stringify({ isEpic: false, openChildren: [] })); process.exit(0); }
  probe(token, owner, repo, epicNum)
    .then(r => console.log(JSON.stringify(r)))
    .catch(() => console.log(JSON.stringify({ isEpic: false, openChildren: [] })));
}

module.exports = { probe };
