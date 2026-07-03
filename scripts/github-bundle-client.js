// tier: 2
// github-bundle-client.js — GitHub-native bundle distribution via Releases API. Refs #2751.
require('./load-local-env').loadLocalEnvOnce(); // hydrate .env before any credential read (canonical shim)
'use strict';
const https = require('node:https');
const { execSync } = require('node:child_process');

const HTTP_OK = 200;
const HTTP_ERROR_MIN = 400;
const TAG_NAME = 'bundles';
const UA = { 'user-agent': 'megingjord-harness' };

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

async function ensureRelease(owner, repo, token) {
  const headers = { authorization: `token ${token}`, ...UA };
  const relRes = await ghRequest({ hostname: 'api.github.com', method: 'GET',
    path: `/repos/${owner}/${repo}/releases/tags/${TAG_NAME}`, headers });
  if (relRes.status === HTTP_OK) return JSON.parse(relRes.body).id;
  const createBody = JSON.stringify({ tag_name: TAG_NAME, name: 'Governance Bundles', draft: false, prerelease: true });
  const cr = await ghRequest({ hostname: 'api.github.com', method: 'POST',
    path: `/repos/${owner}/${repo}/releases`,
    headers: { ...headers, 'content-type': 'application/json', 'content-length': Buffer.byteLength(createBody) },
  }, createBody);
  if (cr.status >= HTTP_ERROR_MIN) throw new Error(`release create failed: ${cr.status}`);
  return JSON.parse(cr.body).id;
}

async function publishBundle(owner, repo, name, payload) {
  const token = getToken();
  const releaseId = await ensureRelease(owner, repo, token);
  const data = Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload));
  const uploadRes = await ghRequest({ hostname: 'uploads.github.com', method: 'POST',
    path: `/repos/${owner}/${repo}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`,
    headers: { authorization: `token ${token}`, ...UA, 'content-type': 'application/octet-stream', 'content-length': data.length },
  }, data);
  if (uploadRes.status >= HTTP_ERROR_MIN) throw new Error(`bundle upload failed: ${uploadRes.status}`);
  return JSON.parse(uploadRes.body);
}

async function fetchBundle(owner, repo, name) {
  const token = getToken();
  const headers = { authorization: `token ${token}`, ...UA };
  const relRes = await ghRequest({ hostname: 'api.github.com', method: 'GET',
    path: `/repos/${owner}/${repo}/releases/tags/${TAG_NAME}`, headers });
  if (relRes.status !== HTTP_OK) return null;
  const asset = JSON.parse(relRes.body).assets.find((a) => a.name === name);
  if (!asset) return null;
  const dlRes = await ghRequest({ hostname: 'api.github.com', method: 'GET',
    path: `/repos/${owner}/${repo}/releases/assets/${asset.id}`,
    headers: { ...headers, accept: 'application/octet-stream' } });
  return dlRes.body;
}

module.exports = { publishBundle, fetchBundle };
