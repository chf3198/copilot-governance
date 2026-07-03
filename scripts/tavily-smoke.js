#!/usr/bin/env node
'use strict';

const { loadLocalEnvOnce } = require('./load-local-env');

const HTTP_AUTH_UNAUTHORIZED = 401;
const HTTP_AUTH_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_RATE_LIMITED = 429;
const HTTP_SERVER_ERROR_MIN = 500;
const REQUEST_TIMEOUT_MS = 12000;
const TOOL_CASES = [
  { tool: 'search', path: '/search', body: { query: 'Tavily smoke search', max_results: 1 } },
  { tool: 'extract', path: '/extract', body: { urls: ['https://example.com'], include_images: false } },
  { tool: 'map', path: '/map', body: { url: 'https://example.com', max_depth: 1 } },
  { tool: 'crawl', path: '/crawl', body: { url: 'https://example.com', max_depth: 1, limit: 1 } },
];

function classifyFailure(status) {
  if (status === HTTP_AUTH_UNAUTHORIZED || status === HTTP_AUTH_FORBIDDEN) return { code: 'auth-failed', remediation: 'set TAVILY_API_KEY or refresh key' };
  if (status === HTTP_NOT_FOUND) return { code: 'tool-unreachable', remediation: 'verify Tavily endpoint path and provider availability' };
  if (status === HTTP_RATE_LIMITED) return { code: 'rate-limited', remediation: 'retry with backoff or reduce smoke frequency' };
  if (status >= HTTP_SERVER_ERROR_MIN) return { code: 'provider-error', remediation: 'retry later; if persistent, fail over to free lane' };
  return { code: 'unexpected-response', remediation: 'inspect response body and request payload' };
}

async function probeTool(tc, apiKey, fetchImpl) {
  const url = `https://api.tavily.com${tc.path}`;
  try {
    const res = await fetchImpl(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...tc.body, api_key: apiKey }), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.ok) return { tool: tc.tool, ok: true, status: res.status };
    const fail = classifyFailure(res.status);
    return { tool: tc.tool, ok: false, status: res.status, error: fail.code, remediation: fail.remediation };
  } catch (error) {
    return { tool: tc.tool, ok: false, status: null, error: 'network-error', remediation: 'check egress/network and retry', detail: error.message };
  }
}

async function runSmoke(input = {}) {
  const live = input.live === true;
  const apiKey = String(input.apiKey || process.env.TAVILY_API_KEY || '').trim();
  const fetchImpl = input.fetchImpl || global.fetch;
  if (!live) return { ok: true, mode: 'dry-run', tools: TOOL_CASES.map((tc) => ({ tool: tc.tool, ok: true, reason: 'dry-run' })) };
  if (!apiKey) return { ok: false, mode: 'live', error: 'missing-api-key', remediation: 'export TAVILY_API_KEY and rerun with --live' };
  if (typeof fetchImpl !== 'function') return { ok: false, mode: 'live', error: 'missing-fetch', remediation: 'use Node 18+ or provide fetch implementation' };
  const tools = [];
  for (const tc of TOOL_CASES) tools.push(await probeTool(tc, apiKey, fetchImpl));
  return { ok: tools.every((toolResult) => toolResult.ok), mode: 'live', tools };
}

async function main() {
  loadLocalEnvOnce();
  const out = await runSmoke({ live: process.argv.includes('--live') });
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  process.exit(out.ok ? 0 : 1);
}

if (require.main === module) main().catch((e) => { process.stderr.write(`${e.message}\n`); process.exit(1); });

module.exports = { runSmoke, TOOL_CASES, classifyFailure };
