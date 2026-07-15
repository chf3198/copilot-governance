'use strict';
// hamr-fleet-direct-block — env-gated enforcement that fails direct fleet curls
// when MEGINGJORD_FLEET_DIRECT_BLOCK=1. Wraps detectBypass (#2220 P1-2).
// Refs Epic #2029 #2219.

const ENV_FLAG = 'MEGINGJORD_FLEET_DIRECT_BLOCK';
const REDIRECT_MSG = 'Direct fleet call blocked. Use scripts/global/fleet-red-team-dispatch.js (Epic #2041 #2175) for HAMR-routed dispatch via tier=fleet-local.';
// #2933 (Epic #2926 C7): review-context anti-bypass for raw cross-family-provider (paid) calls.
const REVIEW_BYPASS_BLOCK_FLAG = 'MEGINGJORD_REVIEW_BYPASS_BLOCK';
const REVIEW_CTX_RE = /\b(review|critique|rubric|red.?team|adversarial|second.?opinion|cross.?family)\b/i;
const REVIEW_REDIRECT_MSG = 'Raw cross-family-provider call in a review context. Use scripts/global/cascade-dispatch.js (Epic #2926 C1) for the $0-default review cascade instead of a raw paid call.';

function isEnabled(env) {
  return (env || process.env)[ENV_FLAG] === '1';
}

function shouldBlock({ detection, env }) {
  if (!isEnabled(env)) return { block: false, reason: 'env-flag-off' };
  if (!detection || !detection.detected) return { block: false, reason: 'no-bypass-detected' };
  if (detection.suppressed) return { block: false, reason: 'override-marker-suppresses' };
  if (detection.severity === 'fleet-bypass') return { block: true, reason: 'fleet-direct-blocked', message: REDIRECT_MSG };
  if (detection.severity === 'paid-bypass') return { block: false, reason: 'paid-bypass-not-fleet-scope' };
  return { block: false, reason: 'unknown-severity' };
}

function blockMessage(detection) {
  const providers = (detection && detection.providers) ? detection.providers.map(function (p) { return p.name; }).join(', ') : 'unknown';
  return `${REDIRECT_MSG} (detected providers: ${providers})`;
}

// #2933 C7: JS twin of hamr_fleet_direct_block.py review-bypass logic (runtime parity, feeds C9).
function isReviewContext(cmdString, env) {
  const e = env || process.env;
  if (e.MEGINGJORD_REVIEW_CONTEXT === '1') return true;
  return REVIEW_CTX_RE.test(String(cmdString || ''));
}

function reviewBypassDecision(detection, cmdString, env) {
  const e = env || process.env;
  if (!detection || !detection.detected || detection.suppressed) {
    return { flag: false, block: false, reason: 'no-bypass-or-suppressed' };
  }
  if (detection.severity !== 'paid-bypass') return { flag: false, block: false, reason: 'not-paid-provider' };
  if (!isReviewContext(cmdString, e)) return { flag: false, block: false, reason: 'not-review-context' };
  const blocking = e[REVIEW_BYPASS_BLOCK_FLAG] === '1';
  return {
    flag: true, block: blocking, advisory: !blocking,
    reason: blocking ? 'review-paid-bypass-blocked' : 'review-paid-bypass-advisory',
    message: REVIEW_REDIRECT_MSG,
    providers: (detection.providers || []).map((p) => (p && p.name) ? p.name : p),
  };
}

module.exports = {
  shouldBlock, isEnabled, blockMessage, ENV_FLAG, REDIRECT_MSG,
  isReviewContext, reviewBypassDecision, REVIEW_BYPASS_BLOCK_FLAG, REVIEW_REDIRECT_MSG,
};
