// tier: 2
// github-mailbox.js — GitHub-native append-log mailbox replacing HAMR /mailbox. Refs #2750.
require('./load-local-env').loadLocalEnvOnce(); // hydrate .env before any credential read (canonical shim)
'use strict';
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const STATE_PATH = path.join(process.cwd(), '.dashboard', 'mailbox-etag.json');
const LABEL = 'coordination-mailbox';
const HTTP_NOT_MODIFIED = 304; const HTTP_ERROR_MIN = 400;

function getToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  return execSync('gh auth token', { encoding: 'utf8' }).trim();
}

function loadState() {
  if (!fs.existsSync(path.dirname(STATE_PATH))) {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  }
  if (!fs.existsSync(STATE_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch { return {}; }
}

function saveState(s) { fs.writeFileSync(STATE_PATH, JSON.stringify(s)); }

function ghRequest(opts, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, etag: res.headers.etag, body }));
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function findOrCreateIssue(owner, repo, token) {
  const searchRes = await ghRequest({
    hostname: 'api.github.com', method: 'GET',
    path: `/repos/${owner}/${repo}/issues?labels=${LABEL}&state=open`,
    headers: { authorization: `token ${token}`, 'user-agent': 'megingjord-harness' },
  });
  const issues = JSON.parse(searchRes.body);
  if (issues.length > 0) return issues[0].number;
  const payload = JSON.stringify({ title: 'Team Coordination Mailbox', labels: [LABEL] });
  const createRes = await ghRequest({
    hostname: 'api.github.com', method: 'POST',
    path: `/repos/${owner}/${repo}/issues`,
    headers: {
      authorization: `token ${token}`, 'user-agent': 'megingjord-harness',
      'content-type': 'application/json', 'content-length': Buffer.byteLength(payload),
    },
  }, payload);
  return JSON.parse(createRes.body).number;
}

async function writeMessage(owner, repo, body) {
  const token = getToken();
  const state = loadState();
  if (!state.issue_number) {
    state.issue_number = await findOrCreateIssue(owner, repo, token);
    saveState(state);
  }
  const payload = JSON.stringify({ body });
  const res = await ghRequest({
    hostname: 'api.github.com', method: 'POST',
    path: `/repos/${owner}/${repo}/issues/${state.issue_number}/comments`,
    headers: {
      authorization: `token ${token}`, 'user-agent': 'megingjord-harness',
      'content-type': 'application/json', 'content-length': Buffer.byteLength(payload),
    },
  }, payload);
  if (res.status >= HTTP_ERROR_MIN) throw new Error(`mailbox write failed: ${res.status} ${res.body}`);
}

async function readMessages(owner, repo, since) {
  try {
    const token = getToken();
    const state = loadState();
    if (!state.issue_number) return [];
    const headers = {
      authorization: `token ${token}`, 'user-agent': 'megingjord-harness',
    };
    if (state.etag) headers['if-none-match'] = state.etag;
    const res = await ghRequest({
      hostname: 'api.github.com', method: 'GET',
      path: `/repos/${owner}/${repo}/issues/${state.issue_number}/comments`,
      headers,
    });
    if (res.status === HTTP_NOT_MODIFIED) return [];
    const comments = JSON.parse(res.body);
    if (res.etag) { state.etag = res.etag; saveState(state); }
    return since ? comments.filter((c) => c.id > since) : comments;
  } catch { return []; }
}
module.exports = { writeMessage, readMessages };
