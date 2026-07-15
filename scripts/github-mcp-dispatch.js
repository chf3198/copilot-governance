// tier: 2
// github-mcp-dispatch.js — GitHub-native async MCP dispatch via repository_dispatch. Refs #2752.
// HAMR stays default for interactive RPC; this is the async fallback for fire-and-forget.
require('./load-local-env').loadLocalEnvOnce(); // hydrate .env before any credential read (canonical shim)
'use strict';
const https = require('node:https');
const { execSync } = require('node:child_process');

const HTTP_ERROR_MIN = 400;

function getToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  return execSync('gh auth token', { encoding: 'utf8' }).trim();
}

function ghRequest(opts, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function dispatch(owner, repo, eventType, payload = {}) {
  const token = getToken();
  const data = JSON.stringify({ event_type: eventType, client_payload: payload });
  const res = await ghRequest({
    hostname: 'api.github.com', method: 'POST',
    path: `/repos/${owner}/${repo}/dispatches`,
    headers: {
      authorization: `token ${token}`, 'user-agent': 'megingjord-harness',
      'content-type': 'application/json', 'content-length': Buffer.byteLength(data),
      accept: 'application/vnd.github.v3+json',
    },
  }, data);
  if (res.status >= HTTP_ERROR_MIN) throw new Error(`dispatch failed: ${res.status} ${res.body}`);
  return { dispatched: true, event_type: eventType, timestamp: new Date().toISOString() };
}

module.exports = { dispatch };
