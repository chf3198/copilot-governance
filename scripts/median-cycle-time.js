#!/usr/bin/env node
'use strict';
// median-cycle-time (#3526, Epic #3517 T-F3 / ADR-020 §D2) — the velocity-relative threshold
// helper for the exempt-review sweep. Pure functions, fixture-tested. Honors the #2983
// anti-calendar critique (#1771): the idle threshold scales with the repo's real child cycle
// time, floored at FLOOR_45D so slow/single-child epics never trip early.

const FLOOR_45D = 45;   // aligns with stale.yml's 45d, but as a REVIEW trigger, never a close
const DEFAULT_K = 3;    // idle_threshold = max(FLOOR_45D, k × median_cycle_time)
const MIN_SAMPLES = 5;  // cold-start guard: below this, fall back to the floor
const MS_PER_DAY = 86400000;

// Cycle time (days) for one closed child: closedAt − first status:in-progress event.
// Returns null for an invalid/degenerate sample (missing timestamps, or closed before start).
function cycleDays(sample) {
  if (!sample) return null;
  const start = Date.parse(sample.inProgressAt);
  const end = Date.parse(sample.closedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return (end - start) / MS_PER_DAY;
}

// Median cycle time (days) over the trailing N closed children. Returns null when there are
// fewer than MIN_SAMPLES valid samples (cold-start) OR the median is degenerate (< 1 day, e.g.
// a burst of same-day closes ⇒ median 0) — both cases signal "use the floor".
function medianCycleTime(samples, { minSamples = MIN_SAMPLES } = {}) {
  const days = (Array.isArray(samples) ? samples : [])
    .map(cycleDays).filter(d => d != null).sort((a, b) => a - b);
  if (days.length < minSamples) return null; // cold-start
  const mid = Math.floor(days.length / 2);
  const median = days.length % 2 ? days[mid] : (days[mid - 1] + days[mid]) / 2;
  if (median < 1) return null; // degenerate-median guard (burst-closed epic never trips early)
  return median;
}

// idle_threshold = max(FLOOR_45D, k × median). A null median (cold-start/degenerate) → the floor.
function idleThresholdDays(medianDays, { k = DEFAULT_K, floorDays = FLOOR_45D } = {}) {
  if (medianDays == null || !Number.isFinite(medianDays)) return floorDays;
  return Math.max(floorDays, k * medianDays);
}

// Convenience: derive the threshold straight from raw samples.
function thresholdFromSamples(samples, opts = {}) {
  return idleThresholdDays(medianCycleTime(samples, opts), opts);
}

module.exports = {
  cycleDays, medianCycleTime, idleThresholdDays, thresholdFromSamples,
  FLOOR_45D, DEFAULT_K, MIN_SAMPLES,
};

if (require.main === module) {
  const samples = JSON.parse(process.argv[2] || '[]');
  console.log(JSON.stringify({
    median: medianCycleTime(samples), threshold: thresholdFromSamples(samples),
  }, null, 2));
}
