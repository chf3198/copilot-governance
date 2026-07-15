#!/usr/bin/env node
'use strict';
// Exponential backoff with jitter for rate-limit handling.

/**
 * Returns true when an error represents a retryable rate-limit condition.
 * Matches HTTP 429/503 (0x1AD/0x1F7) status codes and common message patterns.
 */
function isRateLimitError(err) {
  if (!err) return false;
  const status = err.status || err.statusCode || (err.response && err.response.status);
  if (status === 0x1AD || status === 0x1F7) return true;
  const msg = (err.message || '').toLowerCase();
  return msg.includes('rate limit') || msg.includes('too many requests');
}

/**
 * Async sleep: waits base*(multiplier^attempt) ms, optionally with jitter,
 * capped at opts.max.
 *
 * @param {number} attempt  Zero-based attempt index (0 = first retry).
 * @param {object} [opts]
 * @param {number} [opts.base=1000]       Base delay in ms.
 * @param {number} [opts.max=60000]       Maximum delay cap in ms.
 * @param {number} [opts.multiplier=2]    Exponential multiplier.
 * @param {boolean} [opts.jitter=true]    Add random jitter up to 20 % of delay.
 */
async function backoff(attempt, opts = {}) {
  const base = opts.base !== undefined ? opts.base : 1000;
  const maxMs = opts.max !== undefined ? opts.max : 60 * 1000;
  const multiplier = opts.multiplier !== undefined ? opts.multiplier : 2;
  const useJitter = opts.jitter !== undefined ? opts.jitter : true;

  const exponential = base * Math.pow(multiplier, attempt);
  const capped = Math.min(exponential, maxMs);
  const delay = useJitter ? capped + Math.random() * capped * 0.2 : capped;

  return new Promise(resolve => setTimeout(resolve, Math.floor(delay)));
}

module.exports = { backoff, isRateLimitError };
