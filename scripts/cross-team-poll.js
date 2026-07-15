'use strict';
// cross-team-poll (#1664) — polling-fallback library for operators without
// webhook-receive capability. Per #1628 G5 contract: mandatory fallback.

const DEFAULT_INTERVAL_S = 60;
const MIN_INTERVAL_S = 5;

function intervalSeconds(env = process.env) {
  const raw = env.MEGINGJORD_POLL_INTERVAL_SECONDS;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) return DEFAULT_INTERVAL_S;
  return Math.max(MIN_INTERVAL_S, parsed);
}

function backoff(currentSeconds, signal) {
  if (signal === 'rate-limit') return Math.min(3600, currentSeconds * 2);
  if (signal === 'ok') return Math.max(MIN_INTERVAL_S, Math.floor(currentSeconds * 0.9));
  return currentSeconds;
}

async function pollOnce(client, queryFn) {
  if (typeof queryFn !== 'function') throw new Error('queryFn required');
  return queryFn(client);
}

async function pollLoop(client, queryFn, options = {}) {
  const { iterations = 1, sleepFn = (ms) => new Promise(r => setTimeout(r, ms)) } = options;
  let interval = intervalSeconds();
  const results = [];
  for (let i = 0; i < iterations; i++) {
    try {
      const result = await pollOnce(client, queryFn);
      results.push({ ok: true, result, interval });
      interval = backoff(interval, 'ok');
    } catch (error) {
      results.push({ ok: false, error: error.message, interval });
      interval = backoff(interval, error.signal || 'rate-limit');
    }
    if (i + 1 < iterations) await sleepFn(interval * 1000);
  }
  return results;
}

module.exports = { intervalSeconds, backoff, pollOnce, pollLoop, DEFAULT_INTERVAL_S, MIN_INTERVAL_S };
