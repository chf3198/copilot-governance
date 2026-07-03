'use strict';
// circuit-breaker — Epic-companion to backoff.js (#1279). A pure-state
// circuit breaker for rate-limit / failure handling in fleet dispatchers.
//
// States:
//   closed:    requests flow through. Consecutive failures increment counter.
//              On threshold breach → open.
//   open:      requests fail fast (call site decides what to do). After
//              cool-off elapses → half-open.
//   half-open: allow exactly one trial. Success → closed (counter reset).
//              Failure → open (counter unchanged; cool-off restarts).
//
// Pure functions only — the breaker is a plain object the caller mutates
// via record* helpers. No timers, no I/O. Caller supplies Date.now via opts
// when deterministic timing is needed for tests.

const DEFAULT_THRESHOLD = 5;
const DEFAULT_COOL_OFF_MS = 30 * 1000;
const STATES = Object.freeze({ closed: 'closed', open: 'open', halfOpen: 'half-open' });

function create(opts = {}) {
  return {
    state: STATES.closed,
    consecutiveFailures: 0,
    openedAt: 0,
    threshold: opts.threshold || DEFAULT_THRESHOLD,
    coolOffMs: opts.coolOffMs || DEFAULT_COOL_OFF_MS,
  };
}

function canPass(breaker, nowMs) {
  if (breaker.state === STATES.closed) return true;
  if (breaker.state === STATES.halfOpen) return true;
  if (breaker.state === STATES.open) {
    if (nowMs - breaker.openedAt >= breaker.coolOffMs) {
      breaker.state = STATES.halfOpen;
      return true;
    }
    return false;
  }
  return false;
}

function recordSuccess(breaker) {
  breaker.consecutiveFailures = 0;
  breaker.state = STATES.closed;
  breaker.openedAt = 0;
}

function recordFailure(breaker, nowMs) {
  if (breaker.state === STATES.halfOpen) {
    breaker.state = STATES.open;
    breaker.openedAt = nowMs;
    return;
  }
  breaker.consecutiveFailures++;
  if (breaker.consecutiveFailures >= breaker.threshold) {
    breaker.state = STATES.open;
    breaker.openedAt = nowMs;
  }
}

function status(breaker) {
  return {
    state: breaker.state,
    consecutiveFailures: breaker.consecutiveFailures,
    openedAt: breaker.openedAt,
  };
}

module.exports = {
  create, canPass, recordSuccess, recordFailure, status,
  STATES, DEFAULT_THRESHOLD, DEFAULT_COOL_OFF_MS,
};
