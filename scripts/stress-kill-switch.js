// stress-kill-switch — Blast-radius guardrail for stress runs. Epic #1398 AC7.
// Tier-aware abort when anneal-event-rate exceeds threshold (default 10/min);
// forces rollback to Tier-A. Aligns with Gremlin-style blast-radius control
// from #1395 Theme 5.
'use strict';

const DEFAULT_RATE_PER_MIN = 10;
const WINDOW_MS = 60_000;
const FALLBACK_TIER = 'A';

function nowMs() { return Date.now(); }

function makeKillSwitch(opts = {}) {
  const threshold = opts.thresholdPerMin || DEFAULT_RATE_PER_MIN;
  const windowMs = opts.windowMs || WINDOW_MS;
  const events = [];
  return {
    record(ts = nowMs()) {
      events.push(ts);
      const cutoff = ts - windowMs;
      while (events.length && events[0] < cutoff) events.shift();
    },
    rate(ts = nowMs()) {
      const cutoff = ts - windowMs;
      const recent = events.filter(t => t >= cutoff);
      return (recent.length / windowMs) * 60_000;
    },
    shouldAbort(ts = nowMs()) {
      return this.rate(ts) > threshold;
    },
    snapshot() {
      return { events: events.length, threshold_per_min: threshold, window_ms: windowMs };
    },
  };
}

function rolloverToFallback(currentTier, reason) {
  return {
    event: 'stress.kill_switch.trip',
    from_tier: currentTier,
    to_tier: FALLBACK_TIER,
    reason,
    ts: new Date().toISOString(),
  };
}

module.exports = {
  makeKillSwitch, rolloverToFallback,
  DEFAULT_RATE_PER_MIN, WINDOW_MS, FALLBACK_TIER,
};
