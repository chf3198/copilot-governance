#!/usr/bin/env node
'use strict';
require('./load-local-env').loadLocalEnvOnce(); // hydrate .env before any credential read (canonical shim)
const fs = require('fs');
const path = require('path');

const asJson = process.argv.includes('--json');
const root = path.resolve(__dirname, '..', '..');
const ticketsDir = path.join(root, 'tickets');
const baselineFile = path.join(__dirname, 'ticket-reconcile-baseline.json');

function readLocalTicketIds() {
  if (!fs.existsSync(ticketsDir)) return [];
  return fs.readdirSync(ticketsDir)
    .map(name => name.match(/^(\d+)-.*\.md$/)?.[1])
    .filter(Boolean)
    .map(Number)
    .sort((a, b) => a - b);
}

async function readRemoteIssueIds() {
  const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
  const token = process.env.GITHUB_TOKEN;
  if (!owner || !repo || !token) return new Set();
  const ids = new Set();
  let page = 1;
  while (true) {
    const url = `https://api.github.com/repos/${owner}/${repo}/issues?state=all&per_page=100&page=${page}`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'ticket-reconcile',
      },
    });
    if (!response.ok) throw new Error(`GitHub API error ${response.status}`);
    const items = await response.json();
    if (!items.length) break;
    for (const item of items) {
      if (!item.pull_request) ids.add(item.number);
    }
    page += 1;
  }
  return ids;
}

async function main() {
  const localIds = readLocalTicketIds();
  const remoteIds = await readRemoteIssueIds();
  const baseline = fs.existsSync(baselineFile)
    ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')).missingTickets || []
    : [];
  const baselineSet = new Set(baseline);
  const missing = remoteIds.size
    ? localIds.filter(id => !remoteIds.has(id) && !baselineSet.has(id))
    : [];
  const result = {
    checked: localIds.length,
    missingCount: missing.length,
    missingTickets: missing,
    status: missing.length ? 'fail' : 'pass',
  };
  if (asJson) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`ticket-reconcile: ${result.status.toUpperCase()} (${result.checked} checked)`);
    if (missing.length) console.log(`missing: ${missing.join(', ')}`);
  }
  process.exit(missing.length ? 1 : 0);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
