'use strict';
// actuator-transitions (#1113 AC4 strengthening) — velocity-relative
// de-escalation: each actuator de-escalates after N consecutive GHS
// readings above its threshold. No calendar windows (per Epic #1771).

const DEFAULT_CONSECUTIVE_CLEAN = 5;

function applyTransition(prev, isEscalated, now, fields, opts = {}) {
  const threshold = opts.consecutiveCleanThreshold || DEFAULT_CONSECUTIVE_CLEAN;
  const cleanCount = prev.consecutive_clean_count || 0;
  if (isEscalated) {
    return { ...prev, ...fields,
      escalated_at: prev.escalated_at || new Date(now).toISOString(),
      consecutive_clean_count: 0,
      deescalation_eligible_at: null };
  }
  const nextClean = cleanCount + 1;
  if (nextClean >= threshold && prev.escalated_at) {
    return { ...prev, ...fields,
      escalated_at: null,
      consecutive_clean_count: 0,
      deescalation_eligible_at: new Date(now).toISOString() };
  }
  return { ...prev, ...fields,
    consecutive_clean_count: nextClean };
}

module.exports = { applyTransition, DEFAULT_CONSECUTIVE_CLEAN };
