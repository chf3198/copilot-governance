#!/usr/bin/env node
// header-spillover.js — HAMR Wave 4 child 9 (#927).
// Reads provider rate-limit headers + substrate-health.json to decide spillover.
// Exposes a pure function callers wrap around their provider HTTP responses.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const SUBSTRATE_HEALTH_FILE = path.join(os.homedir(), '.megingjord', 'substrate-health.json');
const PROVIDER_PRIORITY = ['anthropic', 'openai', 'cerebras', 'groq', 'gemini', 'openrouter'];
const HTTP_TOO_MANY_REQUESTS = 429;

function readSubstrateHealth() {
  if (!fs.existsSync(SUBSTRATE_HEALTH_FILE)) return null;
  try { return JSON.parse(fs.readFileSync(SUBSTRATE_HEALTH_FILE, 'utf8')); } catch { return null; }
}

/** Inspect provider response headers for rate-limit signals.
 * Returns {rate_limited, reset_at, retry_after_ms}. Provider-agnostic header parser.
 * @param {Response|{headers: Headers|Map<string,string>|object, status?: number}} resp - Response or response-like object.
 * @returns {{rate_limited: boolean, reset_at: number|null, retry_after_ms: number|null}} Spillover signals.
 */
function readRateLimitHeaders(resp) {
  const status = resp.status ?? 0;
  const headers = resp.headers ?? new Map();
  const get = (k) => {
    if (typeof headers.get === 'function') return headers.get(k);
    return headers[k] ?? headers[k.toLowerCase()] ?? null;
  };
  const retryAfter = get('retry-after') || get('x-ratelimit-reset');
  const remaining = parseInt(get('x-ratelimit-remaining-requests') ?? get('x-ratelimit-remaining') ?? '-1', 10);
  const rateLimited = status === HTTP_TOO_MANY_REQUESTS || (Number.isFinite(remaining) && remaining === 0);
  let resetAt = null;
  let retryAfterMs = null;
  if (retryAfter) {
    const parsed = parseFloat(retryAfter);
    if (Number.isFinite(parsed)) {
      retryAfterMs = parsed > 1e9 ? parsed * 1000 - Date.now() : parsed * 1000;
      resetAt = Date.now() + retryAfterMs;
    }
  }
  return { rate_limited: rateLimited, reset_at: resetAt, retry_after_ms: retryAfterMs };
}

/** Pick the next provider given current provider rate-limited + substrate-health snapshot.
 * @param {string} current - Provider that returned the rate-limit signal.
 * @param {object} [opts] - { substrateHealth, priority }.
 * @returns {{next_provider: string|null, reason: string}} Spillover decision.
 */
function pickSpilloverTarget(current, opts = {}) {
  const health = opts.substrateHealth ?? readSubstrateHealth();
  const priority = opts.priority ?? PROVIDER_PRIORITY;
  for (const candidate of priority) {
    if (candidate === current) continue;
    const state = health?.providers?.[candidate];
    if (state && state.available !== false && !state.rate_limited) {
      return { next_provider: candidate, reason: `spillover_from_${current}_to_${candidate}` };
    }
  }
  return { next_provider: null, reason: 'no_available_alternative' };
}

/** Combined: given a rate-limited response, return next-provider hint or null.
 * @param {string} current - Current provider name.
 * @param {Response|object} resp - Response object.
 * @param {object} [opts] - Forwarded to pickSpilloverTarget.
 * @returns {{spillover_needed: boolean, signals: object, next_provider: string|null, reason: string}} Decision.
 */
function maybeSpillover(current, resp, opts = {}) {
  const signals = readRateLimitHeaders(resp);
  if (!signals.rate_limited) {
    return { spillover_needed: false, signals, next_provider: null, reason: 'no_rate_limit' };
  }
  const pick = pickSpilloverTarget(current, opts);
  return { spillover_needed: true, signals, ...pick };
}

if (require.main === module) {
  const cmd = process.argv[2];
  if (cmd === 'pick') {
    const current = process.argv[3] || 'anthropic';
    console.log(JSON.stringify(pickSpilloverTarget(current), null, 2));
  } else {
    console.log(JSON.stringify({ substrate_health_file: SUBSTRATE_HEALTH_FILE, found: !!readSubstrateHealth(), priority: PROVIDER_PRIORITY }, null, 2));
  }
}

module.exports = { readRateLimitHeaders, pickSpilloverTarget, maybeSpillover, readSubstrateHealth, PROVIDER_PRIORITY };
