'use strict';
// fleet-call-guard.js — bounded-timeout guard for ad-hoc fleet model calls.
// G3: fleet stalls -> paid fallback = G3 violation. This guard prevents it.
// Exports callWithGuard() for programmatic use; CLI via node fleet-call-guard.js.
// Refs #2626.
const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const nodePath = require('node:path');
const { homedir } = require('node:os');

const DEFAULT_TIMEOUT_MS = 45000;
const HTTPS_DEFAULT_PORT = 443;
const DEFAULT_OLLAMA_PORT = 11434;

function appendIncident(host, elapsed_ms) {
  const dir = nodePath.join(homedir(), '.megingjord');
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(nodePath.join(dir, 'incidents.jsonl'),
      JSON.stringify({ pattern_id: 'fleet-call-timeout', host, elapsed_ms,
        timestamp: new Date().toISOString() }) + '\n');
  } catch (_) {}
}

function rawPost(hostUrl, prompt, model) {
  return new Promise((resolve, reject) => {
    const endpoint = new URL('/api/generate', hostUrl);
    const driver = endpoint.protocol === 'https:' ? https : http;
    const body = JSON.stringify({ model, stream: false, prompt });
    const req = driver.request({
      hostname: endpoint.hostname,
      port: endpoint.port || (endpoint.protocol === 'https:' ? HTTPS_DEFAULT_PORT : 80),
      path: endpoint.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let responseBody = '';
      res.on('data', chunk => { responseBody += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(responseBody)); } catch (parseErr) { reject(parseErr); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function makeTimeoutRace(timeout) {
  return new Promise((_, rej) => setTimeout(() => {
    const timeoutErr = new Error('timeout');
    timeoutErr.isTimeout = true;
    rej(timeoutErr);
  }, timeout));
}

async function callWithGuard({
  model = 'qwen2.5-coder:7b', host, prompt = '',
  timeout = DEFAULT_TIMEOUT_MS, maxRetries = 2,
} = {}) {
  if (process.env.FLEET_GUARD_DISABLED === '1') {
    const t0 = Date.now();
    try {
      const res = await rawPost(host, prompt, model);
      return { success: true, response: res.response || '', model, elapsed_ms: Date.now() - t0 };
    } catch (ex) {
      return { success: false, reason: 'error', message: ex.message, fallback_tier: 'free-cloud' };
    }
  }
  const t0 = Date.now();
  let lastErr = null;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const res = await Promise.race([rawPost(host, prompt, model), makeTimeoutRace(timeout)]);
      return { success: true, response: res.response || '', model, elapsed_ms: Date.now() - t0 };
    } catch (err) { lastErr = err; }
  }
  const elapsed_ms = Date.now() - t0;
  if (lastErr && lastErr.isTimeout) {
    appendIncident(host, elapsed_ms);
    return { success: false, reason: 'timeout', elapsed_ms, host, fallback_tier: 'free-cloud' };
  }
  return { success: false, reason: 'retry_exhaustion', attempts: maxRetries, fallback_tier: 'free-cloud' };
}

module.exports = { callWithGuard };

/* istanbul ignore next */
if (require.main === module) {
  const args = process.argv.slice(2);
  const getArg = key => { const idx = args.indexOf(key); return idx >= 0 ? args[idx + 1] : undefined; };
  callWithGuard({
    model: getArg('--model'), host: getArg('--host') || `http://localhost:${DEFAULT_OLLAMA_PORT}`,
    prompt: getArg('--prompt') || '', timeout: Number(getArg('--timeout') || DEFAULT_TIMEOUT_MS),
    maxRetries: Number(getArg('--max-retries') || 2),
  }).then(result => {
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exit(result.success ? 0 : 1);
  }).catch(ex => { process.stderr.write(ex.message + '\n'); process.exit(2); });
}
