'use strict';
// tier: 3
// router-enforcement — deterministic gate: fail governed runs that bypass fleet/HAMR
// without an approved override artifact. Refs Epic #2150 #2205.
// Coordinates API surface with Epic #2192 router-bypass detection.

const FLEET_ELIGIBLE_HINTS = [
  'fleet', 'qwen', 'ollama', 'redteam', 'red-team', 'adversarial', 'dispatchRedTeam',
];

const OVERRIDE_TIERS = ['diagnostic', 'test', 'smoke'];

function isFleetEligible(task) {
  if (!task || typeof task !== 'object') return false;
  const lane = task.lane || '';
  const desc = String(task.description || '').toLowerCase();
  const artifact = String(task.artifactType || '').toLowerCase();
  if (lane.includes('lane:trivial') || lane.includes('lane:config-only')) return false;
  if (artifact.includes('redteam') || artifact.includes('red-team')) return true;
  return FLEET_ELIGIBLE_HINTS.some((hint) => desc.includes(hint));
}

function validateOverride(override) {
  if (!override) return { ok: false, reason: 'no-override' };
  if (typeof override !== 'object') return { ok: false, reason: 'override-not-object' };
  if (!override.tier) return { ok: false, reason: 'override-missing-tier' };
  if (!OVERRIDE_TIERS.includes(override.tier)) {
    return { ok: false, reason: `override-tier-not-allowed: '${override.tier}' (allowed: ${OVERRIDE_TIERS.join(', ')})` };
  }
  if (!override.reason || override.reason.length < 8) {
    return { ok: false, reason: 'override-reason-too-short (min 8 chars)' };
  }
  return { ok: true, tier: override.tier };
}

function enforceRouter({ task, override, usedHamr } = {}) {
  if (!isFleetEligible(task)) {
    return { ok: true, reason: 'not-fleet-eligible' };
  }
  if (usedHamr === true) {
    return { ok: true, reason: 'hamr-used' };
  }
  const overrideCheck = validateOverride(override);
  if (overrideCheck.ok) {
    return { ok: true, reason: `override-approved: ${overrideCheck.tier}` };
  }
  return {
    ok: false,
    reason: `fleet-eligible task bypassed HAMR without approved override: ${overrideCheck.reason}`,
  };
}

module.exports = {
  enforceRouter,
  isFleetEligible,
  validateOverride,
  FLEET_ELIGIBLE_HINTS,
  OVERRIDE_TIERS,
};
