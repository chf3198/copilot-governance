#!/usr/bin/env node
'use strict';
// tier: 3
// OpenClaw Chat — OpenAI-compatible dispatch to LiteLLM fleet gateway
// Direct Tailscale HTTP, no SSH tunnel required

const OPENCLAW_BASE = process.env.OPENCLAW_URL || 'http://localhost:4000';
const DEFAULT_MODEL = 'qwen2.5-coder-1.5b';
const CHAT_TIMEOUT_MS = 120000;
const HEALTH_TIMEOUT_MS = 5000;
const DEFAULT_MAX_TOKENS = 256;

/**
 * Send a chat completion request to OpenClaw.
 * @param {string} prompt
 * @param {{ model?: string, maxTokens?: number, temperature?: number }} [opts]
 * @returns {Promise<{ ok: boolean, content?: string, model?: string,
 *   usage?: object, error?: string }>}
 */
async function chatComplete(prompt, opts = {}) {
  const model = opts.model || DEFAULT_MODEL;
  const url = `${OPENCLAW_BASE}/v1/chat/completions`;
  const body = JSON.stringify({
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: opts.maxTokens || DEFAULT_MAX_TOKENS,
    temperature: opts.temperature !== undefined ? opts.temperature : 0.1,
    stream: false
  });
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error('chat timeout')), CHAT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: ac.signal
    });
    clearTimeout(timer);
    if (!res.ok) {
      const err = await res.text().catch(() => `HTTP ${res.status}`);
      return { ok: false, error: `HTTP ${res.status}: ${err.slice(0, 200)}` };
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    return { ok: true, content, model, usage: data.usage || null };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: e.message || 'unknown error' };
  }
}

/**
 * Check gateway health.
 * @returns {Promise<{ ok: boolean, healthyCount?: number, error?: string }>}
 */
async function healthCheck() {
  try {
    // /health/liveliness responds in ~65ms (no model probing)
    const res = await fetch(`${OPENCLAW_BASE}/health/liveliness`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS)
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, healthyCount: 1 };
  } catch (e) {
    const msg = e.name === 'TimeoutError' ? `timeout after ${HEALTH_TIMEOUT_MS}ms` : e.message;
    return { ok: false, error: msg };
  }
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const health = args.includes('--health');
  const prompt = args[args.indexOf('--prompt') + 1] || '';
  const model = args[args.indexOf('--model') + 1] || DEFAULT_MODEL;

  const run = health
    ? healthCheck()
    : (prompt
      ? chatComplete(prompt, { model })
      : Promise.reject(new Error('Usage: openclaw-chat.js --prompt "text" [--model id] [--json] | --health')));

  run.then(result => {
    if (json) { console.log(JSON.stringify(result, null, 2)); return; }
    if (result.ok) {
      console.log(health ? `OpenClaw healthy — ${result.healthyCount} model(s)` : result.content);
    } else {
      console.error(`OpenClaw error: ${result.error}`);
      process.exit(1);
    }
  }).catch(e => { console.error(e.message); process.exit(1); });
}

module.exports = { chatComplete, healthCheck, OPENCLAW_BASE, DEFAULT_MODEL };
