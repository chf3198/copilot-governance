// tier: 3
// fleet-profile-bench.js — populates fleet-latency-profile.json (#2522)
// Phase-1 AC2 of Epic #2518. Sends canonical prompt to each host/model;
// records p50/p99 from N samples; writes back into profile JSON.
'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const CANONICAL_PROMPT = 'Reply with the word OK only.';
const DEFAULT_SAMPLES = 3;
const DEFAULT_TIMEOUT_MS = 600000;
const DEFAULT_OLLAMA_PORT = 11434;
const PROFILE_PATH = path.resolve(__dirname, '..', '..', 'inventory', 'fleet-latency-profile.json');
const DEVICES_PATH = path.resolve(__dirname, '..', '..', 'inventory', 'devices.json');

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

async function timeOne({ host, model, prompt = CANONICAL_PROMPT, httpImpl = http, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  return new Promise((resolve) => {
    const [hostname, portStr] = host.split(':');
    const body = JSON.stringify({ model, prompt, stream: false });
    const start = Date.now();
    const req = httpImpl.request({
      hostname, port: parseInt(portStr, 10) || DEFAULT_OLLAMA_PORT, path: '/api/generate',
      method: 'POST', headers: { 'content-type': 'application/json' }, timeout: timeoutMs,
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ ok: true, total_s: (Date.now() - start) / 1000 }));
    });
    req.on('error', () => resolve({ ok: false, error: 'network' }));
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.write(body); req.end();
  });
}

async function benchHostModel(host, model, opts = {}) {
  const samples = opts.samples || DEFAULT_SAMPLES;
  const httpImpl = opts.httpImpl || http;
  const durations = [];
  for (let i = 0; i < samples; i++) {
    const result = await timeOne({ host, model, httpImpl, timeoutMs: opts.timeoutMs });
    if (result.ok) durations.push(result.total_s);
  }
  if (durations.length === 0) return null;
  return {
    sample_size: durations.length,
    total_p50_s: percentile(durations, 0.5),
    total_p99_s: percentile(durations, 0.99),
    timeout_recommendation_s: Math.ceil(percentile(durations, 0.99) * 2),
  };
}

function loadJson(p, fsImpl = fs) { return JSON.parse(fsImpl.readFileSync(p, 'utf8')); }

module.exports = { benchHostModel, timeOne, percentile, loadJson,
  CANONICAL_PROMPT, DEFAULT_SAMPLES, PROFILE_PATH, DEVICES_PATH };
